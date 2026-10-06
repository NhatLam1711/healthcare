# BiHyPE: Binary-based Hybrid Positional Encoding for Time-series Analysis - [Baseline: Anomaly Transformer]

[![Python 3.6 (Legacy)](https://img.shields.io/badge/Python-3.6-yellow?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch >=1.4.0](https://img.shields.io/badge/PyTorch-%3E%3D1.4.0%2C_%3C%3D1.10.2-red?style=flat&logo=pytorch&logoColor=white)](https://pytorch.org/)

## Description
This repository provides an implementation/reproduction of the baseline **[Anomaly Transformer]**, based on the original paper "Anomaly Transformer: Time Series Anomaly Detection with Association Discrepancy" (Xu, Jiehui, et al). It serves as a benchmark Transformer-based baseline for evaluating our proposed method **BiHyPE**, on the Time-series Anomaly Detection (TSAD) task.
* **Paper:**  [https://arxiv.org/abs/2110.02642]
* **Original Source code:** [https://github.com/thuml/Anomaly-Transformer]
* **Role in Research:** Benchmark baseline compared against the BiHyPE-integrated version of the same model, without modifying core architecture of original model.

## Dataset Information
Five benchmark anomaly-detection datasets are used, all pre-processed by the original Anomaly Transformer authors (for MSL, PSM, SMAP and SMD), where SWaT come from the original DcDetector authors:

| Dataset | Description |
| :--- | :--- |
| **MSL** | Mars Science Laboratory rover telemetry |
| **PSM** | Pooled Server Metrics |
| **SMAP** | Soil Moisture Active Passive satellite telemetry |
| **SWaT** | Secure Water Treatment testbed |
| **SMD** | Server Machine Dataset |

- **Download:** [Google Drive](https://drive.google.com/drive/folders/1PKHJIi2--liygyXCXiGmgj_RBbDtz6DD?usp=sharing)
- **Directory layout:** after downloading, place each dataset under `dataset/<NAME>`, e.g. `dataset/MSL`, `dataset/PSM`, `dataset/SMAP`, `dataset/SWaT`, `dataset/SMD`.

## Code Information

- **Baseline model code:** implementation of the Anomaly Transformer architecture (association-discrepancy-based anomaly detection).
- **Experiment scripts:** located under `./scripts/`, one per dataset (`MSL.sh`, `PSM.sh`, `SMAP.sh`, `SWaT.sh`, `SMD.sh`), plus `Start.sh` to run all datasets sequentially.
- **Checkpoints:** two checkpoint types are provided —
  1. **Original** Anomaly Transformer checkpoints.
  2. **BiHyPE** version checkpoints, trained on three random seeds.
  
  Available at: [AnomalyTransformer_Checkpoints](https://drive.google.com/drive/folders/1U-ChjeNYKalNk6nODQ2eDtd_KPLba1F0?usp=drive_link)

---

## Usage Instruction
1. Install Python 3.6, PyTorch >= 1.4.0. 
2. **Download the datasets** from the link in [Dataset Information](#dataset-information) and place them under `dataset/<NAME>` as described.
3. **(Optional) Download checkpoints** from the link in [Code Information](#code-information) if you want to evaluate without retraining.
4. Train and evaluate. We provide the experiment scripts of all benchmarks under the folder `./scripts`. You can reproduce the experiment results as follows:
```bash
bash ./scripts/SMD.sh
bash ./scripts/MSL.sh
bash ./scripts/SMAP.sh
bash ./scripts/PSM.sh
bash ./scripts/SWaT.sh
```

Especially, you can reproduce across all datasets as follows:
```bash
bash ./scripts/Start.sh
```

## Requirements

- Python 3.6
- PyTorch >= 1.4.0, <= 1.10.2
- NumPy, Pandas
- scikit-learn

Install dependencies with:

```bash
pip install -r requirements.txt
```

