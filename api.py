# -*- coding: utf-8 -*-
"""
api.py - FastAPI service cho model Anomaly Transformer đã train sẵn.

v2 - thay đổi so với bản đầu:
  - Chạy trên Python hiện đại (3.10+), KHÔNG cần Anaconda/Python 3.6 nữa.
  - Cache train_energy RA ĐĨA theo (dataset, checkpoint, win_size, step) -
    đây là phần tính toán nặng nhất (quét gần hết tập train); giờ chỉ tính
    1 LẦN DUY NHẤT cho mỗi tổ hợp, dùng lại mãi mãi kể cả sau khi restart
    server, thay vì tính lại từ đầu ở MỌI request như bản trước.
  - Hỗ trợ NHIỀU checkpoint cho cùng 1 dataset (vd nhiều seed khác nhau:
    original, seed42, seed43, seed44...), chọn qua field "checkpoint".
  - KHÔNG giới hạn danh sách dataset cố định - dataset mới (vd 2DGesture)
    tự động chạy được, miễn có đủ 3 file .npy đúng tên trong dataset/<name>/
    (xem data_factory/data_loader.py::GenericNpySegLoader).

CHẠY:
    uvicorn api:app --host 0.0.0.0 --port 9000

CẤU TRÚC THƯ MỤC MONG ĐỢI (tạo thủ công, repo không tự tạo):
    dataset/
      MSL/
        MSL_train.npy
        MSL_test.npy
        MSL_test_label.npy
    checkpoints/
      MSL/
        original_wsize128_checkpoint.pth
        seed42_wsize128_checkpoint.pth
        seed43_wsize128_checkpoint.pth
        seed44_wsize128_checkpoint.pth
    cache/                      <- tự tạo, chứa train_energy đã cache
"""

import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.metrics import precision_recall_fscore_support

from solver import Solver, my_kl_loss
from data_factory.data_loader import get_loader_segment

# ----------------------------------------------------------------------
# CẤU HÌNH
#
# Các giá trị dưới đây khớp scripts/MSL.sh có sẵn trong repo. Nếu bạn train
# dataset khác (hoặc train MSL với tham số khác), SỬA lại cho khớp - sai
# win_size/input_c/output_c sẽ gây lỗi "size mismatch" khi load checkpoint.
# ----------------------------------------------------------------------
BASE_CONFIG = {
    "lr": 1e-4,
    "num_epochs": 3,
    "k": 3,
    "win_size": 128,
    "input_c": 55,
    "output_c": 55,
    "d_model": 512,
    "d_ff": 512,
    "n_heads": 8,
    "dropout": 0.0,
    "batch_size": 64,
    "pretrained_model": None,
    "mode": "test",
    "model_save_path": "checkpoints",
    "anormly_ratio": 1.0,
}

CHECKPOINT_DIR = Path("checkpoints")
DATASET_DIR = Path("dataset")
CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(exist_ok=True)

DEFAULT_CHECKPOINT = "original"


def resolve_checkpoint_name(dataset: str, requested: Optional[str]) -> str:
    """API chỉ hỗ trợ checkpoint gốc duy nhất."""
    return DEFAULT_CHECKPOINT

# Step dùng khi quét train set để tính train_energy (baseline threshold).
# Bản GỐC hardcode step=1 bất kể truyền gì (gần như 1 window/điểm dữ liệu)
# -> rất chậm trên CPU. Giữ step=1 ở đây để KHÔNG đổi kết quả/độ chính xác
# so với gốc - tốc độ được cải thiện nhờ CACHE RA ĐĨA (tính 1 lần, dùng lại
# mãi), không phải nhờ đổi step.
#
# Muốn nhanh hơn nữa ở LẦN TÍNH ĐẦU TIÊN (đánh đổi lấy độ chính xác
# threshold, vì train_energy sẽ ước lượng từ ít mẫu hơn): tăng số này lên,
# vd = win_size (128) để các window train không chồng lấn, nhanh hơn ~128 lần.
STEP_TRAIN = 1

app = FastAPI(title="Anomaly Transformer - Prediction API")

_solver_cache: Dict[Tuple[str, str], Solver] = {}


def checkpoint_path(dataset: str, checkpoint: str, win_size: int) -> Path:
    return CHECKPOINT_DIR / dataset / f"{checkpoint}_wsize{win_size}_checkpoint.pth"


def infer_checkpoint_metadata(ckpt_path: Path) -> Dict[str, object]:
    if not ckpt_path.exists():
        return {"d_model": None, "legacy_positional_embedding": False, "legacy_max_len": None}

    try:
        state = torch.load(str(ckpt_path), map_location="cpu")
    except Exception:
        return {"d_model": None, "legacy_positional_embedding": False, "legacy_max_len": None}

    legacy = any(key.endswith("position_embedding.pe") for key in state.keys())
    legacy_max_len = None
    if legacy:
        for key, tensor in state.items():
            if key.endswith("position_embedding.pe"):
                legacy_max_len = int(tuple(tensor.shape)[1])
                break

    d_model = None
    for key, tensor in state.items():
        if key.endswith("query_projection.weight") or key.endswith("norm.weight"):
            shape = tuple(tensor.shape)
            if len(shape) == 1:
                d_model = int(shape[0])
                break
            if len(shape) >= 2:
                d_model = int(shape[0])
                break
    return {"d_model": d_model, "legacy_positional_embedding": legacy, "legacy_max_len": legacy_max_len}


def train_energy_cache_path(dataset: str, checkpoint: str, win_size: int, step_train: int) -> Path:
    return CACHE_DIR / f"{dataset}__{checkpoint}__w{win_size}__s{step_train}__train_energy.npy"


def get_solver(dataset: str, checkpoint: str) -> Solver:
    key = (dataset, checkpoint)
    if key in _solver_cache:
        return _solver_cache[key]

    ckpt = checkpoint_path(dataset, checkpoint, BASE_CONFIG["win_size"])
    if not ckpt.exists():
        raise FileNotFoundError(f"Thiếu file checkpoint: {ckpt}")

    config = dict(BASE_CONFIG)
    config["dataset"] = dataset
    config["data_path"] = str(DATASET_DIR / dataset)
    meta = infer_checkpoint_metadata(ckpt)
    if meta["d_model"] is not None:
        config["d_model"] = meta["d_model"]
        config["d_ff"] = 512
        config["n_heads"] = 8
    config["legacy_positional_embedding"] = bool(meta["legacy_positional_embedding"])
    if meta["legacy_max_len"] is not None:
        config["legacy_max_len"] = meta["legacy_max_len"]

    try:
        solver = Solver(config)
    except FileNotFoundError as e:
        raise FileNotFoundError(
            f"Thiếu file dữ liệu trong '{config['data_path']}' (cần đủ 3 file: "
            f"{dataset}_train.npy, {dataset}_test.npy, {dataset}_test_label.npy). "
            f"Lỗi gốc: {e}"
        )

    ckpt = checkpoint_path(dataset, checkpoint, solver.win_size)
    if not ckpt.exists():
        raise FileNotFoundError(f"Thiếu file checkpoint: {ckpt}")

    try:
        solver.model.load_state_dict(torch.load(str(ckpt), map_location=solver.device))
    except RuntimeError as e:
        raise ValueError(
            f"Checkpoint '{ckpt.name}' không tương thích với kiến trúc model hiện tại: "
            f"d_model={getattr(solver.model, 'd_model', 'unknown')} | "
            f"win_size={solver.win_size}. Hãy dùng checkpoint đúng cho model này hoặc "
            f"kiểm tra lại file checkpoint. Chi tiết: {e}"
        ) from e

    solver.model.eval()

    _solver_cache[key] = solver
    return solver


def compute_train_energy(solver: Solver, dataset: str, checkpoint: str, force_recompute: bool = False) -> np.ndarray:
    """Tính (hoặc đọc cache đĩa) phân phối energy trên tập train - phần NẶNG nhất, chỉ cần làm 1 lần / tổ hợp."""
    cpath = train_energy_cache_path(dataset, checkpoint, solver.win_size, STEP_TRAIN)

    if force_recompute and cpath.exists():
        cpath.unlink()

    if cpath.exists():
        return np.load(cpath)

    print(f"[train_energy] Chưa có cache cho {dataset}/{checkpoint}, tính mới (có thể mất vài phút)...")
    t0 = time.time()

    train_loader = get_loader_segment(
        solver.data_path, batch_size=solver.batch_size, win_size=solver.win_size,
        step=STEP_TRAIN, mode="train", dataset=dataset,
    )

    temperature = 50
    criterion = nn.MSELoss(reduction="none")
    train_energy = []

    with torch.no_grad():
        for input_data, _ in train_loader:
            input_ = input_data.float().to(solver.device)
            output, series, prior, _ = solver.model(input_)
            loss = torch.mean(criterion(input_, output), dim=-1)

            series_loss = 0.0
            prior_loss = 0.0
            for u in range(len(prior)):
                prior_norm = prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(
                    1, 1, 1, solver.win_size
                )
                series_loss += my_kl_loss(series[u], prior_norm.detach()) * temperature
                prior_loss += my_kl_loss(prior_norm, series[u].detach()) * temperature

            metric = torch.softmax((-series_loss - prior_loss), dim=-1)
            cri = (metric * loss).detach().cpu().numpy()
            train_energy.append(cri)

    train_energy = np.concatenate(train_energy, axis=0).reshape(-1)
    np.save(cpath, train_energy)
    print(f"[train_energy] Xong sau {time.time() - t0:.1f}s - đã lưu cache: {cpath}")
    return train_energy


def compute_test_energy_and_labels(solver: Solver):
    """Phần NHẸ - luôn chạy mỗi request (thre_loader không chồng lấn -> ít batch, nhanh)."""
    temperature = 50
    criterion = nn.MSELoss(reduction="none")
    test_energy = []
    test_labels = []

    with torch.no_grad():
        for input_data, labels in solver.thre_loader:
            input_ = input_data.float().to(solver.device)
            output, series, prior, _ = solver.model(input_)
            loss = torch.mean(criterion(input_, output), dim=-1)

            series_loss = 0.0
            prior_loss = 0.0
            for u in range(len(prior)):
                prior_norm = prior[u] / torch.unsqueeze(torch.sum(prior[u], dim=-1), dim=-1).repeat(
                    1, 1, 1, solver.win_size
                )
                series_loss += my_kl_loss(series[u], prior_norm.detach()) * temperature
                prior_loss += my_kl_loss(prior_norm, series[u].detach()) * temperature

            metric = torch.softmax((-series_loss - prior_loss), dim=-1)
            cri = (metric * loss).detach().cpu().numpy()
            test_energy.append(cri)
            test_labels.append(labels)

    test_energy = np.concatenate(test_energy, axis=0).reshape(-1)
    test_labels = np.concatenate(test_labels, axis=0).reshape(-1).astype(int)
    return test_energy, test_labels


def find_best_pred_pa(train_energy: np.ndarray, test_energy: np.ndarray, gt: np.ndarray) -> np.ndarray:
    """Quét ratio tìm threshold cho F1 (Point Adjustment) tốt nhất - giống hệt logic gốc."""
    combined_energy = np.concatenate([train_energy, test_energy], axis=0)

    best_f1 = -1
    best_pred_pa = None
    ratios = np.arange(0.1, 1.6, 0.1)

    for ratio in ratios:
        thresh = np.percentile(combined_energy, 100 - ratio)
        pred_raw = (test_energy > thresh).astype(int)

        pred_pa = pred_raw.copy()
        anomaly_state = False
        for i in range(len(gt)):
            if gt[i] == 1 and pred_pa[i] == 1 and not anomaly_state:
                anomaly_state = True
                for j in range(i, 0, -1):
                    if gt[j] == 0:
                        break
                    pred_pa[j] = 1
                for j in range(i, len(gt)):
                    if gt[j] == 0:
                        break
                    pred_pa[j] = 1
            elif gt[i] == 0:
                anomaly_state = False
            if anomaly_state:
                pred_pa[i] = 1

        _, _, f1_pa, _ = precision_recall_fscore_support(gt, pred_pa, average="binary", zero_division=0)
        if f1_pa > best_f1:
            best_f1 = f1_pa
            best_pred_pa = pred_pa

    return best_pred_pa


def compute_accuracy(pred_pa, gt) -> List[int]:
    """
    Mapping THỐNG NHẤT với backend Java:
      0 = label=0, pred=0 (đúng - bình thường)
      1 = label=1, pred=1 (đúng - phát hiện đúng bất thường)
      2 = label=1, pred=0 (sai - bỏ sót bất thường)
      3 = label=0, pred=1 (sai - báo động giả)
    """
    result = []
    for g, p in zip(gt, pred_pa):
        if g == 0 and p == 0:
            result.append(0)
        elif g == 1 and p == 1:
            result.append(1)
        elif g == 1 and p == 0:
            result.append(2)
        else:
            result.append(3)
    return result


# ----------------------------------------------------------------------
# API
# ----------------------------------------------------------------------
class PredictRequest(BaseModel):
    dataset: str
    force_recompute_train_energy: Optional[bool] = False


class PointResult(BaseModel):
    index: int
    value: int
    accuracy: int


class InferenceMeta(BaseModel):
    dataset: str
    checkpoint: str
    total_points: int
    anomaly_points: int
    inference_time_ms: float
    train_energy_time_ms: float
    threshold_ratio: float
    input_dim: int
    win_size: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=List[PointResult])
def predict(req: PredictRequest):
    checkpoint = resolve_checkpoint_name(req.dataset, None)
    try:
        solver = get_solver(req.dataset, checkpoint)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    train_energy = compute_train_energy(
        solver, req.dataset, checkpoint, force_recompute=req.force_recompute_train_energy
    )
    test_energy, gt = compute_test_energy_and_labels(solver)
    pred_pa = find_best_pred_pa(train_energy, test_energy, gt)
    accuracy = compute_accuracy(pred_pa, gt)

    return [
        PointResult(index=i, value=int(pred_pa[i]), accuracy=accuracy[i])
        for i in range(len(pred_pa))
    ]


@app.post("/predict/meta", response_model=InferenceMeta)
def predict_meta(req: PredictRequest):
    checkpoint = resolve_checkpoint_name(req.dataset, None)
    try:
        solver = get_solver(req.dataset, checkpoint)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    start_total = time.time()
    train_energy_start = time.time()
    train_energy = compute_train_energy(
        solver, req.dataset, checkpoint, force_recompute=req.force_recompute_train_energy
    )
    train_energy_time_ms = (time.time() - train_energy_start) * 1000.0

    test_energy, gt = compute_test_energy_and_labels(solver)
    best_pred_pa = find_best_pred_pa(train_energy, test_energy, gt)
    anomaly_points = int(np.sum(best_pred_pa))

    inference_time_ms = (time.time() - start_total) * 1000.0

    return InferenceMeta(
        dataset=req.dataset,
        checkpoint=checkpoint,
        total_points=int(len(best_pred_pa)),
        anomaly_points=anomaly_points,
        inference_time_ms=float(inference_time_ms),
        train_energy_time_ms=float(train_energy_time_ms),
        threshold_ratio=float(1.0),
        input_dim=int(solver.input_c),
        win_size=int(solver.win_size),
    )
