import os
import time
import json
import asyncio
import torch
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from sklearn.preprocessing import StandardScaler

# Import mô hình Autoformer & helper timefeatures từ kho mã nguồn
from models.Autoformer import Model as AutoformerModel
from utils.timefeatures import time_features

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# HẰNG SỐ CẤU HÌNH THỜI GIAN PHÁT STREAM REALTIME (CỐ ĐỊNH Ở BACKEND: 300ms / điểm)
STREAM_INTERVAL_SEC = 0.05  # 300ms

# --- 1. CẤU HÌNH KIẾN TRÚC DÙNG CHUNG CHO MỌI DATASET (Autoformer, checkpoint *_96_96_*) ---
# Các trường này giống nhau ở TẤT CẢ checkpoint *_96_96_Autoformer_*, vì không bị override
# trong các script huấn luyện (xem run.py để đối chiếu giá trị default).
SHARED_ARCH_CONFIG = dict(
    seq_len=96,
    label_len=48,
    pred_len=96,
    n_heads=8,
    e_layers=2,
    d_layers=1,
    d_ff=2048,
    moving_avg=25,
    factor=3,
    dropout=0.05,
    embed='timeF',
    activation='gelu',
    output_attention=False,
)

# --- 2. CẤU HÌNH RIÊNG CHO TỪNG DATASET ---
# ⚠️ GHI CHÚ QUAN TRỌNG VỀ "model_freq" vs "sampling_delta":
#   - "model_freq": chuỗi freq dùng làm KEY tra cứu kích thước lớp TimeFeatureEmbedding
#     (xem freq_map trong layers/Embed.py: {'h': 4, 't': 5, ...}). Phải khớp 100% với script
#     train, nếu không sẽ lỗi "size mismatch" khi load state_dict / forward.
#     -> Chỉ ETTm1 train với freq='t' (15 phút). 4 dataset còn lại (ECL, Exchange, Traffic,
#        Weather) đều KHÔNG truyền --freq khi train nên dùng default của run.py là freq='h',
#        bất kể tần suất lấy mẫu thực tế trong file CSV của chúng.
#   - "time_features_freq": chuỗi freq hợp lệ với pandas.tseries.frequencies.to_offset(), dùng
#     để GỌI utils.timefeatures.time_features(). Pandas >= 2.2 không còn chấp nhận alias 't'
#     viết tắt (KeyError/ValueError), nên với ETTm1 phải dùng "15min" thay vì "t" — miễn là nó
#     vẫn rơi vào cùng nhóm offset (Minute) để ra đúng số chiều feature (5) khớp model_freq='t'.
#   - "sampling_delta": khoảng cách thời gian THỰC TẾ giữa 2 dòng dữ liệu liên tiếp trong CSV,
#     dùng để tính mốc timestamp tương lai hiển thị cho Frontend. Đây độc lập với 2 field trên.
DATASET_CONFIGS = {
    "ETTm1": {
        "display_name": "ETTm1 - Electricity Transformer Temperature (15 phút/điểm)",
        "csv_path": "./dataset/ETT-small/ETTm1.csv",
        "checkpoint_dir": "./checkpoints_PE/ETTm1_96_96_Autoformer_ETTm1_ftM_sl96_ll48_pl96_dm512_nh8_el2_dl1_df2048_fc3_ebtimeF_dtTrue_Exp_0",
        "enc_in": 7,
        "d_model": 512,
        "model_freq": "t",
        "time_features_freq": "15min",
        "sampling_delta": pd.Timedelta(minutes=15),
        "granularity_label": "15min",
        "default_target": "OT",
    },
    "electricity": {
        "display_name": "Electricity Consuming Load - ECL (1 giờ/điểm)",
        "csv_path": "./dataset/electricity/electricity.csv",
        "checkpoint_dir": "./checkpoints_PE/ECL_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm512_nh8_el2_dl1_df2048_fc3_ebtimeF_dtTrue_Exp_0",
        "enc_in": 321,
        "d_model": 512,
        "model_freq": "h",
        "time_features_freq": "h",
        "sampling_delta": pd.Timedelta(hours=1),
        "granularity_label": "1h",
        "default_target": "OT",
    },
    "exchange_rate": {
        "display_name": "Exchange Rate - Tỷ giá hối đoái (1 ngày/điểm)",
        "csv_path": "./dataset/exchange_rate/exchange_rate.csv",
        "checkpoint_dir": "./checkpoints_PE/Exchange_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm16_nh8_el2_dl1_df2048_fc3_ebtimeF_dtTrue_Exp_0",
        "enc_in": 8,
        "d_model": 16,
        "model_freq": "h",
        "time_features_freq": "h",
        "sampling_delta": pd.Timedelta(days=1),
        "granularity_label": "1d",
        "default_target": "OT",
    },
    "traffic": {
        "display_name": "Traffic - Tỷ lệ chiếm dụng đường (1 giờ/điểm)",
        "csv_path": "./dataset/traffic/traffic.csv",
        "checkpoint_dir": "./checkpoints_PE/traffic_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm1024_nh8_el2_dl1_df2048_fc3_ebtimeF_dtTrue_Exp_0",
        "enc_in": 862,
        "d_model": 1024,
        "model_freq": "h",
        "time_features_freq": "h",
        "sampling_delta": pd.Timedelta(hours=1),
        "granularity_label": "1h",
        "default_target": "OT",
    },
    "weather": {
        "display_name": "Weather - Trạm thời tiết Max Planck Institute (10 phút/điểm)",
        "csv_path": "./dataset/weather/weather.csv",
        "checkpoint_dir": "./checkpoints_PE/weather_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm16_nh8_el2_dl1_df2048_fc3_ebtimeF_dtTrue_Exp_0",
        "enc_in": 21,
        "d_model": 16,
        "model_freq": "h",
        "time_features_freq": "h",
        "sampling_delta": pd.Timedelta(minutes=10),
        "granularity_label": "10min",
        "default_target": "OT",
    },
}

DEFAULT_DATASET = "ETTm1"


class DatasetArgs:
    """Đối tượng cấu hình (giống argparse.Namespace) truyền vào Model Autoformer."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def build_args(dataset_key: str) -> DatasetArgs:
    cfg = DATASET_CONFIGS[dataset_key]
    return DatasetArgs(
        **SHARED_ARCH_CONFIG,
        enc_in=cfg["enc_in"],
        dec_in=cfg["enc_in"],
        c_out=cfg["enc_in"],
        d_model=cfg["d_model"],
        freq=cfg["model_freq"],
    )


# --- 3. CACHE MODEL & ARGS THEO DATASET (LAZY LOAD - CHỈ NẠP KHI CÓ REQUEST ĐẦU TIÊN) ---
_model_cache = {}
_args_cache = {}


def validate_dataset(dataset: str) -> dict:
    if dataset not in DATASET_CONFIGS:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset '{dataset}' khong ton tai. Cac dataset kha dung: {list(DATASET_CONFIGS.keys())}"
        )
    return DATASET_CONFIGS[dataset]


def get_args(dataset_key: str) -> DatasetArgs:
    if dataset_key not in _args_cache:
        _args_cache[dataset_key] = build_args(dataset_key)
    return _args_cache[dataset_key]


def get_model(dataset_key: str) -> AutoformerModel:
    if dataset_key in _model_cache:
        return _model_cache[dataset_key]

    cfg = DATASET_CONFIGS[dataset_key]
    args = get_args(dataset_key)
    checkpoint_file = os.path.join(cfg["checkpoint_dir"], "checkpoint.pth")

    print(f"[Model Engine] Dang khoi tao mo hinh AI cho dataset '{dataset_key}' tren thiet bi: {device}")
    model = AutoformerModel(args).to(device)
    if os.path.exists(checkpoint_file):
        model.load_state_dict(torch.load(checkpoint_file, map_location=device))
        print(f"[Success] Da nap thanh cong Weight Checkpoint tu:\n   {checkpoint_file}")
    else:
        print(f"[Warning] Chua tim thay checkpoint tai {checkpoint_file}.")
    model.eval()

    _model_cache[dataset_key] = model
    return model


def preload_all_models():
    """Nạp trước toàn bộ model của mọi dataset khi Backend khởi động (tránh request đầu tiên bị chậm)."""
    for dataset_key in DATASET_CONFIGS:
        get_model(dataset_key)


# --- 4. LIFESPAN: LOAD TOÀN BỘ MODEL 1 LẦN KHI STARTUP ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    preload_all_models()
    print("=" * 60)
    yield
    print("[Backend Shutdown] Dang dung Server...")

app = FastAPI(
    title="BiHyPE Time-Series Forecasting API Service",
    description="API cung cấp kết quả dự báo chuỗi thời gian hỗ trợ REST và SSE Realtime Streaming, đa dataset.",
    version="3.0.0",
    lifespan=lifespan
)

# --- 5. CẤU HÌNH CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 6. HÀM XỬ LÝ DỰ BÁO (INFERENCE PIPELINE) ---
def run_model_inference(df_input: pd.DataFrame, dataset_key: str):
    model = get_model(dataset_key)
    args = get_args(dataset_key)
    cfg = DATASET_CONFIGS[dataset_key]

    start_time = time.time()
    scaler = StandardScaler()
    feature_cols = [c for c in df_input.columns if c != 'date']

    # Fit & Transform chuẩn hóa dữ liệu
    scaled_data = scaler.fit_transform(df_input[feature_cols].values)

    batch_x = torch.tensor(scaled_data, dtype=torch.float32).unsqueeze(0).to(device)

    dec_inp = torch.zeros((1, args.pred_len, scaled_data.shape[-1]), dtype=torch.float32).to(device)
    label_part = batch_x[:, -args.label_len:, :]
    dec_inp = torch.cat([label_part, dec_inp], dim=1).to(device)

    # Tính toán mã hóa thời gian (future timestamps dùng sampling_delta THỰC TẾ của dataset)
    df_stamp = pd.DataFrame({'date': pd.to_datetime(df_input['date'])})
    last_dt = df_stamp['date'].iloc[-1]
    sampling_delta = cfg["sampling_delta"]
    future_dts = [last_dt + sampling_delta * (i + 1) for i in range(args.pred_len)]
    df_future_stamp = pd.DataFrame({'date': future_dts})

    df_all_stamp = pd.concat([df_stamp, df_future_stamp], ignore_index=True)
    # time_features_freq phải rơi vào cùng NHÓM OFFSET (Minute/Hour/...) với model_freq lúc
    # train để ra đúng số chiều feature khớp TimeFeatureEmbedding (xem ghi chú ở DATASET_CONFIGS)
    data_stamp = time_features(pd.to_datetime(df_all_stamp['date'].values), freq=cfg["time_features_freq"]).transpose(1, 0)

    x_mark_enc = data_stamp[:args.seq_len]
    x_mark_dec = data_stamp[args.seq_len - args.label_len:]

    batch_x_mark = torch.tensor(x_mark_enc, dtype=torch.float32).unsqueeze(0).to(device)
    batch_y_mark = torch.tensor(x_mark_dec, dtype=torch.float32).unsqueeze(0).to(device)

    # Chạy dự báo
    with torch.no_grad():
        outputs = model(batch_x, batch_x_mark, dec_inp, batch_y_mark)
        pred_scaled = outputs.squeeze(0).cpu().numpy()

    # Inverse transform về giá trị thực
    pred_real = scaler.inverse_transform(pred_scaled)
    execution_time_ms = round((time.time() - start_time) * 1000, 2)

    return pred_real, future_dts, execution_time_ms

# Helper đọc dữ liệu thô
def get_dataset_data(dataset_key: str, target: str) -> pd.DataFrame:
    cfg = validate_dataset(dataset_key)
    csv_path = cfg["csv_path"]
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail=f"Khong tim thay file du lieu tai {csv_path}")
    df_full = pd.read_csv(csv_path)
    if target not in df_full.columns:
        raise HTTPException(status_code=400, detail=f"Cot '{target}' khong ton tai trong dataset '{dataset_key}'. Cac cot kha dung: {list(df_full.columns)}")
    return df_full

# --- 7. ENDPOINTS BẢO TRÌ & THÔNG TIN ROOT ---
@app.get("/")
def read_root():
    return {
        "message": "Welcome to BiHyPE Time-Series Forecasting Backend API (v3.0 - Multi-Dataset)",
        "docs_url": "/docs",
        "status": "online"
    }

# =====================================================================
# API DATASETS: DANH SÁCH DATASET & CỘT KHẢ DỤNG
# =====================================================================
@app.get("/api/v1/datasets")
def get_datasets():
    """REST API: Trả về danh sách dataset hỗ trợ, cùng các cột (target) khả dụng của mỗi dataset."""
    result = []
    for key, cfg in DATASET_CONFIGS.items():
        columns = []
        if os.path.exists(cfg["csv_path"]):
            columns = [c for c in pd.read_csv(cfg["csv_path"], nrows=0).columns if c != 'date']
        result.append({
            "dataset": key,
            "display_name": cfg["display_name"],
            "num_features": cfg["enc_in"],
            "available_targets": columns,
            "default_target": cfg["default_target"],
            "seq_len": SHARED_ARCH_CONFIG["seq_len"],
            "pred_len": SHARED_ARCH_CONFIG["pred_len"],
            "time_granularity": cfg["granularity_label"],
        })
    return {"status": "success", "datasets": result}

# =====================================================================
# API 1: LỊCH SỬ QUÁ KHỨ (HISTORICAL DATA)
# =====================================================================
@app.get("/api/v1/historical")
def get_historical_rest(
    dataset: str = Query(DEFAULT_DATASET, description="Mã dataset (xem GET /api/v1/datasets)"),
    target: str = Query("OT", description="Cột thuộc tính cần truy xuất")
):
    """REST API: Trả về 1 mảng JSON đầy đủ các mốc lịch sử thực tế của dataset được chọn"""
    validate_dataset(dataset)
    args = get_args(dataset)
    df_full = get_dataset_data(dataset, target)
    df_seq = df_full.tail(args.seq_len).copy()

    history_list = [
        {"timestamp": str(row['date']), "actual": round(float(row[target]), 4)}
        for _, row in df_seq.iterrows()
    ]
    return {
        "status": "success",
        "dataset": dataset,
        "metric_target": target,
        "historical_count": len(history_list),
        "data": history_list
    }

@app.get("/api/v1/stream/historical")
async def get_historical_sse(
    dataset: str = Query(DEFAULT_DATASET, description="Mã dataset (xem GET /api/v1/datasets)"),
    target: str = Query("OT", description="Cột thuộc tính cần truy xuất")
):
    """SSE Stream: Phát realtime từng điểm dữ liệu quá khứ về cho Frontend (Cố định 300ms/điểm ở Backend)"""
    validate_dataset(dataset)
    args = get_args(dataset)
    df_full = get_dataset_data(dataset, target)
    df_seq = df_full.tail(args.seq_len).copy()

    async def sse_event_generator():
        total_items = len(df_seq)

        for idx, (_, row) in enumerate(df_seq.iterrows(), start=1):
            payload = {
                "index": idx,
                "total": total_items,
                "timestamp": str(row['date']),
                "actual": round(float(row[target]), 4)
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(STREAM_INTERVAL_SEC)

        yield f"event: complete\ndata: {json.dumps({'status': 'finished'})}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")

# =====================================================================
# API 2: SO SÁNH THỰC TẾ VS DỰ BÁO (FORECAST COMPARISON)
# =====================================================================
@app.get("/api/v1/forecast-comparison")
def get_forecast_comparison_rest(
    dataset: str = Query(DEFAULT_DATASET, description="Mã dataset (xem GET /api/v1/datasets)"),
    target: str = Query("OT", description="Cột thuộc tính dự báo")
):
    """REST API: Trả về mảng JSON các mốc so sánh Thực tế (Actual) vs Dự báo (Forecast)"""
    validate_dataset(dataset)
    args = get_args(dataset)
    df_full = get_dataset_data(dataset, target)

    df_seq = df_full.iloc[-args.seq_len - args.pred_len: -args.pred_len].copy()
    df_future_actual = df_full.tail(args.pred_len).copy()

    pred_values, future_dts, _ = run_model_inference(df_seq, dataset)
    target_idx = df_seq.columns.get_loc(target) - 1

    comparison_list = []
    actual_array = df_future_actual[target].values

    for i in range(args.pred_len):
        act_val = round(float(actual_array[i]), 4)
        pred_val = round(float(pred_values[i, target_idx]), 4)
        diff = round(abs(act_val - pred_val), 4)

        comparison_list.append({
            "timestamp": future_dts[i].strftime("%Y-%m-%d %H:%M:%S"),
            "actual": act_val,
            "forecast": pred_val,
            "error_diff": diff
        })

    return {
        "status": "success",
        "dataset": dataset,
        "metric_target": target,
        "forecast_count": len(comparison_list),
        "data": comparison_list
    }

@app.get("/api/v1/stream/forecast-comparison")
async def get_forecast_comparison_sse(
    dataset: str = Query(DEFAULT_DATASET, description="Mã dataset (xem GET /api/v1/datasets)"),
    target: str = Query("OT", description="Cột thuộc tính dự báo")
):
    """SSE Stream: Phát realtime từng mốc so sánh Thực tế vs Dự báo về cho Frontend (Cố định 300ms/mốc ở Backend)"""
    validate_dataset(dataset)
    args = get_args(dataset)
    df_full = get_dataset_data(dataset, target)

    df_seq = df_full.iloc[-args.seq_len - args.pred_len: -args.pred_len].copy()
    df_future_actual = df_full.tail(args.pred_len).copy()

    pred_values, future_dts, _ = run_model_inference(df_seq, dataset)
    target_idx = df_seq.columns.get_loc(target) - 1
    actual_array = df_future_actual[target].values

    async def sse_event_generator():
        for i in range(args.pred_len):
            act_val = round(float(actual_array[i]), 4)
            pred_val = round(float(pred_values[i, target_idx]), 4)
            diff = round(abs(act_val - pred_val), 4)

            payload = {
                "step": i + 1,
                "total_steps": args.pred_len,
                "timestamp": future_dts[i].strftime("%Y-%m-%d %H:%M:%S"),
                "actual": act_val,
                "forecast": pred_val,
                "error_diff": diff
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(STREAM_INTERVAL_SEC)

        yield f"event: complete\ndata: {json.dumps({'status': 'finished'})}\n\n"

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")

# =====================================================================
# API 3: METADATA CỦA QUÁ TRÌNH INFERENCE (METRICS & MODEL SPECS)
# =====================================================================
@app.get("/api/v1/metadata")
def get_metadata(
    dataset: str = Query(DEFAULT_DATASET, description="Mã dataset (xem GET /api/v1/datasets)"),
    target: str = Query("OT", description="Cột thuộc tính kiểm tra")
):
    """REST API: Trả về thông số mô hình, thiết bị, thời gian chạy và các chỉ số sai số MAE/MSE"""
    cfg = validate_dataset(dataset)
    args = get_args(dataset)
    df_full = get_dataset_data(dataset, target)

    df_seq = df_full.iloc[-args.seq_len - args.pred_len: -args.pred_len].copy()
    df_future_actual = df_full.tail(args.pred_len).copy()

    pred_values, _, exec_time_ms = run_model_inference(df_seq, dataset)
    target_idx = df_seq.columns.get_loc(target) - 1
    actual_array = df_future_actual[target].values
    forecast_array = pred_values[:, target_idx]

    mae = round(float(np.mean(np.abs(actual_array - forecast_array))), 4)
    mse = round(float(np.mean((actual_array - forecast_array) ** 2)), 4)

    return {
        "status": "success",
        "model_info": {
            "model_architecture": "Autoformer",
            "positional_encoding": "BiHyPE (Binary-based Hybrid Positional Encoding)",
            "dataset_name": cfg["display_name"],
            "target_feature": target,
            "device_used": str(device).upper()
        },
        "sequence_config": {
            "historical_input_window": args.seq_len,
            "prediction_horizon": args.pred_len,
            "time_granularity": cfg["granularity_label"],
        },
        "performance_metrics": {
            "inference_duration_ms": exec_time_ms,
            "eval_mae": mae,
            "eval_mse": mse
        },
        "server_timestamp": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_api:app", host="0.0.0.0", port=8000, reload=True)
