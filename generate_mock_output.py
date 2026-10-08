"""
Script tao du lieu gia lap (mock) dung format output cua model CSDI.
Chay xong se tao file pickle giong het output that cua evaluate().
Khong can GPU, khong can data that.
"""

import pickle
import torch
import numpy as np
import os
import json

# ============================================================
# CAU HINH - thay doi o day neu muon
# ============================================================

# PhysioNet: 35 features lam sang
PHYSIO_FEATURES = [
    'DiasABP', 'HR', 'Na', 'Lactate', 'NIDiasABP', 'PaO2', 'WBC', 'pH',
    'Albumin', 'ALT', 'Glucose', 'SaO2', 'Temp', 'AST', 'Bilirubin', 'HCO3',
    'BUN', 'RespRate', 'Mg', 'HCT', 'SysABP', 'FiO2', 'K', 'GCS',
    'Cholesterol', 'NISysABP', 'TroponinT', 'MAP', 'TroponinI', 'PaCO2',
    'Platelets', 'Urine', 'NIMAP', 'Creatinine', 'ALP'
]

# PM2.5: 36 tram quan trac
PM25_FEATURES = [f'Station_{i+1}' for i in range(36)]

DATASETS = {
    'physio': {
        'N': 20,          # so luong samples trong test set
        'L': 48,          # so time steps (48 gio)
        'K': 35,          # so features
        'nsample': 100,   # so lan model sinh du doan
        'missing_ratio': 0.3,  # ty le diem bi duc lo
        'true_missing_ratio': 0.15,  # ty le diem that su missing (khong co ground truth)
        'features': PHYSIO_FEATURES,
        'scaler': 1.0,
        'mean_scaler': 0.0,
    },
    'pm25': {
        'N': 15,
        'L': 36,
        'K': 36,
        'nsample': 100,
        'missing_ratio': 0.25,
        'true_missing_ratio': 0.1,
        'features': PM25_FEATURES,
        'scaler': None,      # se tao random
        'mean_scaler': None,
    },
}


def generate_mock_data(config):
    N, L, K = config['N'], config['L'], config['K']
    nsample = config['nsample']
    missing_ratio = config['missing_ratio']
    true_missing_ratio = config['true_missing_ratio']

    np.random.seed(42)
    torch.manual_seed(42)

    # --- 1. Tao du lieu thoi gian gia lap ---
    # Moi feature co 1 duong sin + nhieu + trend
    all_target = np.zeros((N, L, K))
    for n in range(N):
        for k in range(K):
            freq = 0.1 + np.random.rand() * 0.3
            phase = np.random.rand() * 2 * np.pi
            amplitude = 1.0 + np.random.rand() * 2.0
            trend = np.random.randn() * 0.02
            noise = np.random.randn(L) * 0.3

            t = np.arange(L)
            all_target[n, :, k] = amplitude * np.sin(freq * t + phase) + trend * t + noise

    all_target = torch.tensor(all_target, dtype=torch.float32)

    # --- 2. Tao masks ---
    # observed = 1 nghia la co du lieu
    all_observed = torch.ones(N, L, K)

    # Tao true missing (khong co ground truth)
    true_missing_mask = torch.rand(N, L, K) < true_missing_ratio
    all_observed[true_missing_mask] = 0

    # evalpoint = 1 nghia la diem bi duc lo (model can doan, co ground truth de so sanh)
    all_evalpoint = torch.zeros(N, L, K)
    for n in range(N):
        for k in range(K):
            observed_indices = (all_observed[n, :, k] == 1).nonzero(as_tuple=True)[0]
            num_eval = int(len(observed_indices) * missing_ratio)
            if num_eval > 0:
                perm = torch.randperm(len(observed_indices))[:num_eval]
                eval_indices = observed_indices[perm]
                all_evalpoint[n, eval_indices, k] = 1

    # --- 3. Tao du doan cua model (100 samples) ---
    # Model du doan = gia tri that + nhieu nho (gia lap model tot)
    samples = torch.zeros(N, nsample, L, K)
    for i in range(nsample):
        noise = torch.randn_like(all_target) * 0.2
        samples[:, i, :, :] = all_target + noise

    # --- 4. Time points ---
    all_observed_time = torch.arange(L).unsqueeze(0).expand(N, -1).float()

    # --- 5. Scaler ---
    if config['scaler'] is not None:
        scaler = config['scaler']
        mean_scaler = config['mean_scaler']
    else:
        scaler = torch.abs(torch.randn(K)) + 0.5
        mean_scaler = torch.randn(K) * 10

    return samples, all_target, all_evalpoint, all_observed, all_observed_time, scaler, mean_scaler


def save_and_print_info(dataset_name, config):
    print(f"\n{'='*60}")
    print(f"  Dataset: {dataset_name.upper()}")
    print(f"{'='*60}")

    samples, all_target, all_evalpoint, all_observed, all_observed_time, scaler, mean_scaler = \
        generate_mock_data(config)

    all_given = all_observed - all_evalpoint

    print(f"\n--- SHAPE ---")
    print(f"  samples (du doan):    {list(samples.shape)}  → (N={config['N']}, nsample=100, L={config['L']}, K={config['K']})")
    print(f"  all_target (gia tri): {list(all_target.shape)}  → (N, L, K)")
    print(f"  all_evalpoint (mask): {list(all_evalpoint.shape)}  → 1 = diem bi duc lo")
    print(f"  all_observed (mask):  {list(all_observed.shape)}  → 1 = co du lieu")
    print(f"  all_observed_time:    {list(all_observed_time.shape)}  → chi so thoi gian")

    print(f"\n--- FEATURES ({config['K']} features) ---")
    for i, name in enumerate(config['features']):
        print(f"  [{i:2d}] {name}")

    print(f"\n--- THONG KE ---")
    total_points = all_observed.numel()
    observed_points = all_observed.sum().item()
    eval_points = all_evalpoint.sum().item()
    given_points = all_given.sum().item()
    true_missing = total_points - observed_points

    print(f"  Tong so diem du lieu:      {int(total_points)}")
    print(f"  Diem observed (co data):   {int(observed_points)} ({observed_points/total_points*100:.1f}%)")
    print(f"  Diem given (model thay):   {int(given_points)} ({given_points/total_points*100:.1f}%)")
    print(f"  Diem evalpoint (duc lo):   {int(eval_points)} ({eval_points/total_points*100:.1f}%)")
    print(f"  Diem truly missing:        {int(true_missing)} ({true_missing/total_points*100:.1f}%)")

    # --- Xem 1 sample cu the ---
    print(f"\n--- VU DU: Sample 0, Feature 0 ({config['features'][0]}) ---")
    print(f"  {'Time':>4}  {'Value':>8}  {'Type':>10}")
    print(f"  {'----':>4}  {'-----':>8}  {'----':>10}")

    target_0 = all_target[0, :, 0].numpy()
    eval_0 = all_evalpoint[0, :, 0].numpy()
    given_0 = all_given[0, :, 0].numpy()
    median_0 = torch.quantile(samples[:, :, :, 0], 0.5, dim=1)[0].numpy()

    for t in range(min(config['L'], 20)):  # chi in 20 dong dau
        if given_0[t] == 1:
            print(f"  {t:4d}  {target_0[t]:8.3f}  {'observed':>10}")
        elif eval_0[t] == 1:
            print(f"  {t:4d}  {median_0[t]:8.3f}  {'imputed':>10}  (truth={target_0[t]:.3f})")
        else:
            print(f"  {t:4d}  {'---':>8}  {'missing':>10}")

    if config['L'] > 20:
        print(f"  ... (con {config['L'] - 20} dong nua)")

    # --- Luu file pickle ---
    os.makedirs('./save/mock_output/', exist_ok=True)
    pkl_path = f'./save/mock_output/generated_outputs_{dataset_name}_nsample100.pk'
    with open(pkl_path, 'wb') as f:
        pickle.dump([
            samples, all_target, all_evalpoint, all_observed,
            all_observed_time, scaler, mean_scaler
        ], f)
    print(f"\n  File saved: {pkl_path}")

    # --- Luu feature list ---
    meta_path = f'./save/mock_output/metadata_{dataset_name}.json'
    with open(meta_path, 'w') as f:
        json.dump({
            'dataset': dataset_name,
            'N': config['N'],
            'L': config['L'],
            'K': config['K'],
            'features': config['features'],
        }, f, indent=2)
    print(f"  Metadata:   {meta_path}")

    return samples, all_target, all_evalpoint, all_observed


if __name__ == '__main__':
    for name, cfg in DATASETS.items():
        save_and_print_info(name, cfg)

    print(f"\n{'='*60}")
    print(f"  DONE! Kiem tra folder ./save/mock_output/")
    print(f"{'='*60}")
