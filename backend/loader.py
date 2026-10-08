"""Loads pre-generated CSDI inference output (.pk files) and serves
per-series values, with no model forward pass involved.

Tensor shapes inside each .pk file (see OUTPUT_FORMAT.md):
    samples          (N, nsample, L, K)  - probabilistic predictions
    all_target       (N, L, K)           - ground truth, normalized
    all_evalpoint    (N, L, K)           - mask: 1 = point hidden from model, needs prediction
    all_observed     (N, L, K)           - mask: 1 = ground truth exists (given + evalpoint)
    scaler, mean_scaler                  - per-feature denormalization (K,)
"""
import io
import pickle
from functools import lru_cache

import torch

from .datasets import DATASET_REGISTRY

_patched = False


def _patch_torch_cpu_load():
    """The checkpoints were saved from a CUDA machine; this process may be
    CPU-only, so torch's nested storage deserialization must be forced to
    'cpu' or pickle.load raises RuntimeError."""
    global _patched
    if _patched:
        return
    torch.storage._load_from_bytes = lambda b: torch.load(
        io.BytesIO(b), map_location="cpu", weights_only=False
    )
    _patched = True


@lru_cache(maxsize=None)
def load_raw_output(dataset: str):
    if dataset not in DATASET_REGISTRY:
        raise KeyError(f"Unknown dataset '{dataset}'. Available: {list(DATASET_REGISTRY)}")

    _patch_torch_cpu_load()
    path = DATASET_REGISTRY[dataset]["output_pk"]
    with open(path, "rb") as f:
        samples, all_target, all_evalpoint, all_observed, all_observed_time, scaler, mean_scaler = pickle.load(f)

    return {
        "samples": samples,
        "target": all_target,
        "evalpoint": all_evalpoint,
        "observed": all_observed,
        "observed_time": all_observed_time,
        "scaler": scaler,
        "mean_scaler": mean_scaler,
    }


@lru_cache(maxsize=None)
def get_meta(dataset: str):
    data = load_raw_output(dataset)
    n, nsample, l, k = data["samples"].shape
    entry = DATASET_REGISTRY[dataset]
    if "feature_names" in entry:
        feature_names = entry["feature_names"]
    else:
        feature_names = [f"{entry['feature_prefix']}_{i + 1}" for i in range(k)]
    return {
        "dataset": dataset,
        "num_samples": n,
        "num_timesteps": l,
        "num_features": k,
        "nsample_per_point": nsample,
        "feature_names": feature_names,
    }


def _denormalize(values, scaler, mean_scaler):
    return values * scaler + mean_scaler


def _feature_scaler(data: dict, feature_id: int):
    """scaler/mean_scaler are per-feature tensors for pm25/electricity, but
    plain scalars (1, 0) for physio (see OUTPUT_FORMAT.md mục 6)."""
    scaler = data["scaler"]
    mean_scaler = data["mean_scaler"]
    if hasattr(scaler, "__getitem__"):
        scaler = scaler[feature_id]
    if hasattr(mean_scaler, "__getitem__"):
        mean_scaler = mean_scaler[feature_id]
    return scaler, mean_scaler


def _validate_index(dataset: str, sample_id: int, feature_id: int):
    meta = get_meta(dataset)
    if not (0 <= sample_id < meta["num_samples"]):
        raise IndexError(f"sample_id out of range [0, {meta['num_samples']})")
    if not (0 <= feature_id < meta["num_features"]):
        raise IndexError(f"feature_id out of range [0, {meta['num_features']})")


def get_real_series(dataset: str, sample_id: int, feature_id: int):
    """Ground-truth-only series: value is present wherever the real sensor
    reading exists (observed==1), null otherwise (true missing, no label)."""
    _validate_index(dataset, sample_id, feature_id)
    data = load_raw_output(dataset)
    scaler, mean_scaler = _feature_scaler(data, feature_id)

    target = _denormalize(data["target"][sample_id, :, feature_id], scaler, mean_scaler)
    observed = data["observed"][sample_id, :, feature_id]

    points = []
    for t in range(target.shape[0]):
        if observed[t] == 1:
            points.append({"t": t, "value": round(target[t].item(), 4), "type": "observed"})
        else:
            points.append({"t": t, "value": None, "type": "missing"})
    return points


def get_comparison_series(dataset: str, sample_id: int, feature_id: int):
    """Merged series for charting: real value where the model was allowed to
    see it, predicted median + confidence band where the point was held out
    for evaluation (evalpoint==1), null for true missing points."""
    _validate_index(dataset, sample_id, feature_id)
    data = load_raw_output(dataset)
    scaler, mean_scaler = _feature_scaler(data, feature_id)

    target = _denormalize(data["target"][sample_id, :, feature_id], scaler, mean_scaler)
    observed = data["observed"][sample_id, :, feature_id]
    evalpoint = data["evalpoint"][sample_id, :, feature_id]
    given = observed - evalpoint

    samples_feature = data["samples"][sample_id, :, :, feature_id]  # (nsample, L)
    samples_denorm = _denormalize(samples_feature, scaler, mean_scaler)

    median = torch.quantile(samples_denorm, 0.5, dim=0)
    lower_90 = torch.quantile(samples_denorm, 0.05, dim=0)
    upper_90 = torch.quantile(samples_denorm, 0.95, dim=0)
    lower_50 = torch.quantile(samples_denorm, 0.25, dim=0)
    upper_50 = torch.quantile(samples_denorm, 0.75, dim=0)

    points = []
    for t in range(target.shape[0]):
        if given[t] == 1:
            points.append({
                "t": t,
                "value": round(target[t].item(), 4),
                "type": "observed",
                "ground_truth": None,
                "confidence": None,
            })
        elif evalpoint[t] == 1:
            points.append({
                "t": t,
                "value": round(median[t].item(), 4),
                "type": "imputed",
                "ground_truth": round(target[t].item(), 4),
                "confidence": {
                    "lower_90": round(lower_90[t].item(), 4),
                    "lower_50": round(lower_50[t].item(), 4),
                    "median": round(median[t].item(), 4),
                    "upper_50": round(upper_50[t].item(), 4),
                    "upper_90": round(upper_90[t].item(), 4),
                },
            })
        else:
            points.append({
                "t": t,
                "value": None,
                "type": "missing",
                "ground_truth": None,
                "confidence": None,
            })
    return points
