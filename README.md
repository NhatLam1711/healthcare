# BiHyPE: Binary-based Hybrid Positional Encoding for Time-series Analysis - [Baseline: Autoformer, Reformer, Informer]

[![Python 3.6 (Legacy)](https://img.shields.io/badge/Python-3.6-yellow?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch 1.9.0](https://img.shields.io/badge/PyTorch-1.9.0-red?style=flat&logo=pytorch&logoColor=white)](https://pytorch.org/)

## Description
 
This repository provides an implementation/reproduction of three Transformer-based forecasting baselines — **Autoformer**, **Informer**, and **Reformer** — based on their original papers:
 
- *Autoformer: Decomposition Transformers with Auto-Correlation for Long-Term Series Forecasting* — [https://arxiv.org/abs/2106.13008](https://arxiv.org/abs/2106.13008) | [https://github.com/thuml/autoformer](https://github.com/thuml/autoformer)
- *Informer: Beyond Efficient Transformer for Long Sequence Time-Series Forecasting* — [https://arxiv.org/abs/2012.07436](https://arxiv.org/abs/2012.07436) | [https://github.com/zhouhaoyi/Informer2020](https://github.com/zhouhaoyi/Informer2020)
- *Reformer: The Efficient Transformer* — [https://arxiv.org/abs/2001.04451](https://arxiv.org/abs/2001.04451) | [https://github.com/lucidrains/reformer-pytorch](https://github.com/lucidrains/reformer-pytorch)

They serve as benchmark Transformer-based baselines for evaluating our proposed method, **BiHyPE**, on the Time-series Forecasting (TSF) task.
 
---

## Dataset Information
 
Five benchmark forecasting datasets are used, all pre-processed by the original Autoformer authors:
 
| Dataset | Description |
| :--- | :--- |
| **ETTm1** | Electricity Transformer Temperature (15-min interval) |
| **ECL** | Electricity Consuming Load |
| **Exchange** | Exchange rate data |
| **Traffic** | Road occupancy rates |
| **Weather** | Local climatological weather data |
 
- **Download:** [Google Drive - TSF Datasets](https://drive.google.com/drive/folders/19A8iSs74MszDLCXE7d9dDVp-Ih5PULj7?usp=sharing)
- **Directory layout:** after downloading, place each dataset under `dataset/<NAME>`, e.g. `dataset/ETT-small`, `dataset/electricity`, `dataset/exchange_rate`, `dataset/traffic`, `dataset/weather`.
---

## Code Information
 
- **Baseline model code:** implementations of the Autoformer, Informer, and Reformer architectures.
- **Experiment scripts:** located under `./scripts/`, organized by dataset, with one script per baseline model:
  - `ETT_script/`, `ECL_script/`, `Exchange_script/`, `Traffic_script/`, `Weather_script/`
  - Each folder contains `Autoformer.sh`, `Informer.sh`, and `Reformer.sh` (or dataset-specific variants, e.g. `Autoformer_ETTm1.sh`). You can run all with `Start.sh`.
- **Checkpoints:** two checkpoint types are provided —
  1. **Original** baseline checkpoints.
  2. **BiHyPE** version checkpoints, trained on three random seeds.
  
  Available at: [TSF_Checkpoints](https://drive.google.com/drive/folders/12nnUJBOPXoL8yrM6vVeEqPl2Ed29j_9Z?usp=drive_link)
---

## Usage Instructions

1. **Install dependencies** (see [Requirements](#requirements) below).
2. **Download the datasets** from the link in [Dataset Information](#dataset-information) and place them under `dataset/<NAME>` as described.
3. **(Optional) Download checkpoints** from the link in [Code Information](#code-information) if you want to evaluate without retraining.
4. **Train and evaluate** using the provided scripts, one per dataset/model combination:

```bash
bash ./scripts/ETT_script/Autoformer_ETTm1.sh
bash ./scripts/ECL_script/Autoformer.sh
bash ./scripts/Exchange_script/Autoformer.sh
bash ./scripts/Traffic_script/Autoformer.sh
bash ./scripts/Weather_script/Autoformer.sh

bash ./scripts/ETT_script/Informer.sh
bash ./scripts/ECL_script/Informer.sh
bash ./scripts/Exchange_script/Informer.sh
bash ./scripts/Traffic_script/Informer.sh
bash ./scripts/Weather_script/Informer.sh

bash ./scripts/ETT_script/Reformer.sh
bash ./scripts/ECL_script/Reformer.sh
bash ./scripts/Exchange_script/Reformer.sh
bash ./scripts/Traffic_script/Reformer.sh
bash ./scripts/Weather_script/Reformer.sh
```

## Requirements
 
- Python 3.6
- PyTorch >= 1.9.0
- NumPy, Pandas
- scikit-learn
Install dependencies with:
 
```bash
pip install -r requirements.txt
```
