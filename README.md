# BiHyPE: Binary-based Hybrid Positional Encoding for Time-series Analysis - [Baseline: CSDI]

[![Python 3.6 (Legacy)](https://img.shields.io/badge/Python-3.6-yellow?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![PyTorch >=1.4.0](https://img.shields.io/badge/PyTorch-%3E%3D1.4.0%2C_%3C%3D1.10.2-red?style=flat&logo=pytorch&logoColor=white)](https://pytorch.org/)

## Description
This repository provides an implementation/reproduction of the baseline **[CSDI]**, based on the original paper "CSDI: Conditional Score-based Diffusion Models for Probabilistic Time Series Imputation" (Tashiro, Yusuke, et al). It serves as a benchmark Transformer-based baseline for evaluating our proposed method **BiHyPE**, on the Time-series Imputation (TSI) task.
* **Paper:**  [https://arxiv.org/abs/2107.03502]
* **Original Source code:** [https://github.com/ermongroup/CSDI]
* **Role in Research:** Benchmark baseline compared against the BiHyPE-integrated version of the same model, without modifying core architecture of original model.

## Dataset Information
 
Three benchmark imputation datasets are used, all pre-processed by the original CSDI authors:
 
| Dataset | Description |
| :--- | :--- |
| **PhysioNet 2012** | Clinical time-series data used for the `exe_physio.py` experiment |
| **PM25** | Air quality (particulate matter) time-series data used for the `exe_pm25.py` experiment |
| **Electricity** | Electricity consumption time-series data used for the `exe_forecasting.py` experiment |
 
- **Download:** [Google Drive - TSI Datasets](https://drive.google.com/drive/folders/1fHAQ3iM61IFEkoW1b_aL82qmmN7oldhj?usp=sharing)
- **Directory layout:** after downloading, place the data in the root folder, e.g. `../data/`.
---

## Code Information
 
- **Baseline model code:** implementation of the CSDI architecture (conditional score-based diffusion model for probabilistic imputation).
- **Entry-point scripts:** `exe_physio.py`, `exe_pm25.py`, `exe_forecasting.py` — one per dataset/task.
- **Positional/time embedding:** located in `main_model.py`.
  - **Original version:** uncomment the original `time_embedding` module and use `time_embed = self.time_embedding(observed_tp, self.emb_time_dim)`.
  - **BiHyPE version:** use `time_embed = self.time_embedding(observed_tp)`.
- **Checkpoints:** two checkpoint types are provided
  1. **Original** CSDI checkpoints.
  2. **BiHyPE** version checkpoints.
  
  Available at: [CSDI_Checkpoints](https://drive.google.com/drive/folders/1MK9cdNVHgC0xWsYd4D4RY7WBkGWTifSy?usp=sharing)
---

## Usage Instructions

1. **Install dependencies:**
```bash
   pip install -r requirements.txt
```

2. **Download the datasets** from the link in [Dataset Information](#dataset-information) and place them under `../data/` as described.
3. **(Optional) Download checkpoints** from the link in [Code Information](#code-information) if you want to evaluate without retraining.
4. **Select the version to run** by configuring the time embedding in `main_model.py`:
   - Original version → uncomment the original `time_embedding` module and use `time_embed = self.time_embedding(observed_tp, self.emb_time_dim)`.
   - BiHyPE version → use `time_embed = self.time_embedding(observed_tp)`.
5. Train and evaluate. You can reproduce the experiment results for three datasets as follows:
  ```py
  python exe_physio.py --nsample 100
  python exe_pm25.py --nsample 100
  python exe_forecasting.py --datatype electricity --nsample 100
  ```
---

## Requirements
 
- Python 3.6
- PyTorch >= 1.4.0, <= 1.10.2
- NumPy, Pandas
- scikit-learn
Install dependencies with:
 
```bash
pip install -r requirements.txt
```
