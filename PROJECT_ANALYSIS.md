# BiHyPE-TSI-CSDI: Phân tích tổng quan dự án

## 1. Dự án này là gì?

Đây là repo implement **baseline CSDI** (Conditional Score-based Diffusion Models for Probabilistic Time Series Imputation) được sử dụng để so sánh/đánh giá với phương pháp đề xuất **BiHyPE** (Binary-based Hybrid Positional Encoding).

- **Bài báo gốc CSDI:** [arXiv:2107.03502](https://arxiv.org/abs/2107.03502)
- **Source gốc CSDI:** [github.com/ermongroup/CSDI](https://github.com/ermongroup/CSDI)
- **Mục đích:** Đánh giá hiệu quả của BiHyPE khi tích hợp vào kiến trúc CSDI cho bài toán **Time-Series Imputation** (điền giá trị thiếu trong chuỗi thời gian).

---

## 2. Bài toán Time-Series Imputation

**Time-Series Imputation** = điền/khôi phục các giá trị bị thiếu (missing values) trong dữ liệu chuỗi thời gian.

Ví dụ thực tế:
- Cảm biến y tế đo nhịp tim bệnh nhân mỗi giờ nhưng một số giờ bị mất dữ liệu
- Trạm đo chất lượng không khí PM2.5 có lúc bị lỗi, không ghi nhận được
- Đồng hồ đo điện tiêu thụ bị gián đoạn

Mô hình cần **dự đoán chính xác** các giá trị bị thiếu đó dựa trên các giá trị đã quan sát được.

---

## 3. Kiến trúc mô hình (Pipeline)

```
Input Time Series (có missing values)
        │
        ▼
┌─────────────────────────────────────────────┐
│           CSDI_base (main_model.py)         │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐    │
│  │  Time Embed  │    │  Feature Embed   │    │
│  │  (BiHyPE /   │    │  (nn.Embedding)  │    │
│  │   Sinusoidal)│    │  16-dim per      │    │
│  │  128-dim     │    │  feature         │    │
│  └──────┬───────┘    └───────┬──────────┘    │
│         └──────────┬─────────┘               │
│                    ▼                         │
│           Side Information                   │
│         (time + feature + mask)              │
│                    │                         │
│                    ▼                         │
│  ┌─────────────────────────────────────┐     │
│  │      diff_CSDI (diff_models.py)     │     │
│  │                                     │     │
│  │  Diffusion Embedding (50 steps)     │     │
│  │         │                           │     │
│  │         ▼                           │     │
│  │  ResidualBlock x 4 layers           │     │
│  │  ┌───────────────────────────┐      │     │
│  │  │ Time Transformer (8 heads)│      │     │
│  │  │         │                 │      │     │
│  │  │ Feature Transformer      │      │     │
│  │  │         │                 │      │     │
│  │  │ Gated Activation          │      │     │
│  │  │ (sigmoid * tanh)          │      │     │
│  │  └───────────────────────────┘      │     │
│  │         │                           │     │
│  │  Output Projection → noise dự đoán  │     │
│  └─────────────────────────────────────┘     │
│                    │                         │
│                    ▼                         │
│        Reverse Diffusion (50 steps)          │
│        → Imputed Time Series                 │
└─────────────────────────────────────────────┘
```

### 3.1. Diffusion Process (Quá trình khuếch tán)

Mô hình dựa trên **Score-based Diffusion** (tương tự DDPM):

1. **Forward process:** Thêm nhiễu Gaussian dần dần vào dữ liệu thật qua 50 bước (quadratic schedule, beta: 0.0001 → 0.5)
2. **Reverse process:** Học cách khử nhiễu từng bước để khôi phục dữ liệu gốc
3. **Conditional:** Chỉ impute tại các vị trí bị thiếu, giữ nguyên các giá trị đã quan sát

### 3.2. Dual Transformer Architecture

Mỗi `ResidualBlock` chứa **2 Transformer** riêng biệt:
- **Time Transformer:** Attention theo chiều thời gian (các time step attend lẫn nhau)
- **Feature Transformer:** Attention theo chiều feature (các biến/sensor attend lẫn nhau)

Điều này cho phép mô hình nắm bắt cả **temporal dependencies** và **cross-feature correlations**.

---

## 4. Đóng góp chính: BiHyPE (Positional Encoding mới)

### 4.1. Positional Encoding gốc (CSDI Original) - Sinusoidal

```python
# Đang bị comment out trong main_model.py (dòng 102-110)
pe[:, :, 0::2] = sin(pos / 10000^(2i/d))
pe[:, :, 1::2] = cos(pos / 10000^(2i/d))
```
Đây là PE chuẩn từ paper "Attention is All You Need", chỉ mã hóa **vị trí tuyệt đối**.

### 4.2. BiHyPE (Binary-based Hybrid Positional Encoding) - Đang active

Nằm trong class `PositionalEmbedding` (main_model.py, dòng 7-56). Kết hợp **2 thành phần**:

#### a) Absolute Component (Binary-based)
```
Vị trí 0 → [0, 0, 0]
Vị trí 1 → [0, 0, 1]
Vị trí 2 → [0, 1, 0]
Vị trí 5 → [1, 0, 1]
...
```
- Biểu diễn vị trí bằng **mã nhị phân** (binary encoding)
- Qua `absolute_compression` (Linear layer) để tinh chỉnh
- Kích thước: `log2(max_len)` chiều (ví dụ: max_len=128 → 7 chiều)

#### b) Relative Component (Distance-based)
```
dist[i][j] = (j - i) / (max_len - 1)  (bỏ vị trí i=j)
```
- Tính **khoảng cách tương đối** giữa mọi cặp vị trí
- Normalize về [-1, 1]
- Qua `relative_compression` (Linear + ReLU) để nén: `(max_len-1) → (d_model - log2(max_len))`

#### c) Learnable Gating
```python
gate = sigmoid(self.gating)  # gating khởi tạo = 0.0 → gate ≈ 0.5
pe = concat[(1 - gate) * relative_out, gate * absolute_out]
```
- Một **tham số học được** quyết định tỷ lệ kết hợp giữa absolute và relative
- Mô hình tự học xem nên thiên về absolute hay relative encoding

### 4.3. Ưu điểm của BiHyPE so với Sinusoidal

| Đặc điểm | Sinusoidal | BiHyPE |
|:---|:---|:---|
| Absolute position | Sin/Cos (fixed) | Binary (learnable projection) |
| Relative position | Không có | Có (distance-based, learnable) |
| Thích ứng | Cố định | Learnable gating |
| Kích thước | d_model chiều đều cho absolute | Phân bổ tối ưu giữa absolute + relative |

---

## 5. Cấu trúc file chi tiết

```
bihype-tsi-csdi-main/
│
├── main_model.py          # ⭐ FILE QUAN TRỌNG NHẤT
│   ├── PositionalEmbedding    # BiHyPE implementation
│   ├── CSDI_base              # Base model (diffusion + imputation logic)
│   ├── CSDI_Physio            # Adapter cho PhysioNet dataset
│   ├── CSDI_PM25              # Adapter cho PM2.5 dataset
│   └── CSDI_Forecasting       # Adapter cho Electricity forecasting
│
├── diff_models.py         # ⭐ Diffusion backbone
│   ├── DiffusionEmbedding    # Embedding cho diffusion timestep
│   ├── diff_CSDI             # Main diffusion network
│   └── ResidualBlock          # Core block: Time Transformer + Feature Transformer
│
├── utils.py               # Training loop + Evaluation metrics
│   ├── train()                # Training với Adam, MultiStepLR scheduler
│   ├── evaluate()             # Evaluation: RMSE, MAE, CRPS
│   ├── calc_quantile_CRPS()   # Metric: Continuous Ranked Probability Score
│   └── calc_quantile_CRPS_sum()
│
├── exe_physio.py           # Entry point: PhysioNet experiment
├── exe_pm25.py             # Entry point: PM2.5 experiment
├── exe_forecasting.py      # Entry point: Electricity forecasting experiment
│
├── dataset_physio.py       # DataLoader cho PhysioNet 2012
├── dataset_pm25.py         # DataLoader cho PM2.5
├── dataset_forecasting.py  # DataLoader cho Electricity
│
├── download.py             # Script tải dataset gốc
├── check_pkl.py            # Tiện ích kiểm tra file pickle
├── visualize_examples.ipynb # Notebook trực quan hóa kết quả
│
├── config/
│   ├── base.yaml              # Config cho PhysioNet + PM2.5
│   └── base_forecasting.yaml  # Config cho Electricity
│
└── requirements.txt        # Dependencies
```

---

## 6. Datasets

### 6.1. PhysioNet 2012 (Clinical)
- **Nguồn:** PhysioNet Challenge 2012
- **Nội dung:** Dữ liệu lâm sàng ICU, 35 thuộc tính (HR, Blood Pressure, pH, Glucose...)
- **Cấu trúc:** 48 time steps (giờ) × 35 features per bệnh nhân
- **Missing pattern:** Random masking (default 10%)
- **Evaluation:** 5-fold cross-validation

### 6.2. PM2.5 (Air Quality)
- **Nguồn:** Microsoft Research STMVL dataset
- **Nội dung:** Nồng độ bụi PM2.5 từ 36 trạm quan trắc
- **Cấu trúc:** 36 time steps × 36 features (stations)
- **Missing pattern:** Historical masking (real missing patterns)
- **Train/Test split:** Theo tháng (train: 1,2,4,5,7,8,10,11; test: 3,6,9,12)

### 6.3. Electricity (Forecasting)
- **Nội dung:** Lượng điện tiêu thụ của 370 khách hàng
- **Cấu trúc:** 192 time steps (168 history + 24 prediction)
- **Task:** Forecasting (dự đoán 24 bước tiếp theo)
- **Linear Attention:** Sử dụng `LinearAttentionTransformer` thay vì standard attention (do sequence dài hơn)

---

## 7. Hyperparameters chính

| Parameter | PhysioNet / PM2.5 | Electricity |
|:---|:---|:---|
| Epochs | 200 | 100 |
| Batch size | 16 | 8 |
| Learning rate | 1e-3 | 1e-3 |
| Diffusion steps | 50 | 50 |
| Beta schedule | Quadratic | Quadratic |
| Channels | 64 | 64 |
| Attention heads | 8 | 8 |
| Residual layers | 4 | 4 |
| Time embedding dim | 128 | 128 |
| Feature embedding dim | 16 | 16 |
| Attention type | Standard | Linear |
| LR scheduler | MultiStepLR (75%, 90% → ×0.1) | MultiStepLR |

---

## 8. Metrics đánh giá

- **RMSE** (Root Mean Squared Error): Đo sai số bình phương trung bình
- **MAE** (Mean Absolute Error): Đo sai số tuyệt đối trung bình
- **CRPS** (Continuous Ranked Probability Score): Đánh giá chất lượng **phân phối xác suất** dự đoán (quantile 0.05 → 0.95), không chỉ point estimate
- **CRPS_sum**: Phiên bản sum-aggregated của CRPS

CRPS là metric quan trọng nhất vì CSDI là mô hình **probabilistic** — nó sinh ra nhiều samples (mặc định 100) cho mỗi giá trị thiếu, tạo thành phân phối dự đoán.

---

## 9. Cách chạy thực nghiệm

### Bước 1: Cài đặt
```bash
pip install -r requirements.txt
```

### Bước 2: Tải dataset
Tải từ [Google Drive](https://drive.google.com/drive/folders/1fHAQ3iM61IFEkoW1b_aL82qmmN7oldhj) và đặt vào `./data/`

Hoặc tải dataset gốc:
```bash
python download.py physio
python download.py pm25
```

### Bước 3: Chọn version PE trong `main_model.py`
- **BiHyPE (mặc định, đang active):** Giữ nguyên code hiện tại
- **Original Sinusoidal:** Uncomment dòng 102-110 và comment dòng 112-114

### Bước 4: Train + Evaluate
```bash
# PhysioNet (imputation)
python exe_physio.py --nsample 100

# PM2.5 (imputation)
python exe_pm25.py --nsample 100

# Electricity (forecasting)
python exe_forecasting.py --datatype electricity --nsample 100
```

### Bước 5: Load checkpoint (bỏ qua training)
```bash
python exe_physio.py --modelfolder <tên_folder_trong_save> --nsample 100
```

Checkpoints có sẵn tại: [Google Drive](https://drive.google.com/drive/folders/1MK9cdNVHgC0xWsYd4D4RY7WBkGWTifSy)

---

## 10. Các điểm khai thác cho nghiên cứu

### 10.1. Nếu bạn muốn hiểu sâu mô hình
- Đọc kỹ `main_model.py` (class `PositionalEmbedding` và `CSDI_base`)
- Đọc `diff_models.py` (class `ResidualBlock`) để hiểu dual-transformer
- So sánh BiHyPE vs Sinusoidal PE bằng cách toggle comment trong `main_model.py`

### 10.2. Nếu bạn muốn thử nghiệm/cải tiến
- **Thay đổi PE:** Sửa class `PositionalEmbedding` trong `main_model.py`
- **Thay đổi diffusion:** Sửa config trong `config/base.yaml` (num_steps, beta range, schedule)
- **Thêm dataset mới:** Tạo file `dataset_xxx.py` theo mẫu `dataset_physio.py`, tạo class model mới kế thừa `CSDI_base`
- **Thay đổi Transformer:** Sửa `diff_models.py` (thay attention mechanism, thêm layers)

### 10.3. Nếu bạn muốn reproduce kết quả
1. Tải dataset + checkpoints từ Google Drive links
2. Chạy evaluation với `--modelfolder` để dùng pretrained weights
3. So sánh RMSE/MAE/CRPS giữa BiHyPE và Original

### 10.4. Nếu bạn muốn mở rộng nghiên cứu
- Áp dụng BiHyPE cho các mô hình time-series khác (không chỉ CSDI)
- Thử trên các dataset khác (ETTh, Weather, Traffic...)
- Kết hợp BiHyPE với các loại attention khác (Flash Attention, Sparse Attention)
- Phân tích gating parameter để hiểu mô hình "thích" absolute hay relative hơn

---

## 11. Lưu ý kỹ thuật

- **Python 3.6 + PyTorch <= 1.10.2:** Repo sử dụng phiên bản cũ, có thể cần tạo virtual environment riêng
- **GPU khuyến nghị:** Training cần CUDA GPU (default `cuda:0`), có thể dùng `--device cpu` nhưng rất chậm
- **nsample=100:** Mỗi giá trị thiếu được sinh 100 mẫu — tăng chất lượng CRPS nhưng tốn thời gian inference
- **Output:** Kết quả lưu trong `./save/<experiment_folder>/` gồm model weights (`model.pth`) và metrics (`result_nsample*.pk`)
