# 🚀 Hướng Dẫn Phân Tích & Khai Thác Dự Án BiHyPE Time-Series Forecasting

Tài liệu này tổng hợp toàn bộ phân tích về kho mã nguồn **`bihype-tsf-autoformer-informer-reformer-main`**. Tài liệu được thiết kế nhằm giúp bạn hiểu rõ bản chất dự án, cách tổ chức mã nguồn, tư tưởng cốt lõi của mô hình **BiHyPE**, và lộ trình từng bước để bắt đầu thử nghiệm cũng như ứng dụng vào bài toán thực tế.

---

## 📌 1. Tổng Quan Về Dự Án

Dự án này là mã nguồn nghiên cứu và triển khai dự báo chuỗi thời gian (Time-Series Forecasting - TSF) bằng các mô hình học sâu họ **Transformer**, kết hợp với phương pháp mã hóa vị trí mới có tên là **BiHyPE (Binary-based Hybrid Positional Encoding)**.

### Các Mô Hình Cơ Sở (Baselines) Được Hỗ Trợ:
1. **Autoformer**: Mô hình Transformer giải mã phân rã chuỗi (Series Decomposition) và cơ chế Auto-Correlation giúp nắm bắt tính chu kỳ dài hạn.
2. **Informer**: Mô hình Transformer tối ưu độ phức tạp tính toán nhờ ProbSparse Attention và cơ chế chắt lọc (Distillation).
3. **Reformer**: Mô hình Transformer tiết kiệm bộ nhớ với Locality-Sensitive Hashing (LSH) Attention.
4. **Vanilla Transformer**: Mô hình Transformer tiêu chuẩn cho bài toán chuỗi thời gian.

---

## 💡 2. Điểm Đột Phá Cốt Lõi: BiHyPE là gì và giúp ích gì?

Trong bài toán chuỗi thời gian dài (Long-term TSF), các phương pháp mã hóa vị trí truyền thống (Sinusoidal Positional Encoding) thường không tối ưu khi chuỗi thời gian kéo dài hoặc có cấu trúc phức tạp. **BiHyPE** giải quyết vấn đề này bằng cách kết hợp 2 loại thông tin vị trí:

1. **Absolute Binary Encoding (Mã hóa vị trí tuyệt đối dạng nhị phân)**:
   - Chuyển đổi chỉ số thứ tự của bước thời gian (position index) thành chuỗi bit nhị phân (`01001...`).
   - Sử dụng lớp tuyến tính (`absolute_compression`) để nén các bit này về không gian embedding.
2. **Relative Distance Matrix (Ma trận khoảng cách tương đối)**:
   - Tính toán khoảng cách thời gian giữa mọi cặp thời điểm trong cửa sổ quan sát và chuẩn hóa về dải `[-1, 1]`.
   - Sử dụng mạng nơ-ron tuyến tính (`relative_compression`) để học đặc trưng quan hệ tương đối giữa các bước thời gian.
3. **Learnable Gating Mechanism (Cơ chế cổng tự học)**:
   - Sử dụng tham số cổng có thể huấn luyện (`gating`) để tự động cân bằng trọng số giữa mã hóa tuyệt đối và mã hóa tương đối.

### 📍 Vị trí mã nguồn cốt lõi của BiHyPE:
- File: [`layers/Embed.py`](file:///c:/Users/kayng/Downloads/bihype-tsf-autoformer-informer-reformer-main%20%282%29/bihype-tsf-autoformer-informer-reformer-main/layers/Embed.py)
- Lớp: `PositionalEmbedding` (dòng 48 - 95) & `DataEmbedding_PE` (dòng 188 - 201).

---

## 📂 3. Cấu Trúc Mã Nguồn (Directory Structure)

```text
bihype-tsf-autoformer-informer-reformer-main/
├── models/                     # Chứa định nghĩa các kiến trúc mô hình (PyTorch)
│   ├── Autoformer.py           # Mô hình Autoformer
│   ├── Informer.py             # Mô hình Informer
│   ├── Reformer.py             # Mô hình Reformer
│   └── Transformer.py          # Standard Transformer
├── layers/                     # Các module/lớp phụ trợ tính toán
│   ├── Embed.py                # Mã hóa dữ liệu & BiHyPE Positional Embedding
│   ├── AutoCorrelation.py      # Cơ chế Auto-Correlation của Autoformer
│   ├── SelfAttention_Family.py # Các loại Attention (ProbSparse, FullAttention, v.v.)
│   └── Autoformer_EncDec.py    # Encoder/Decoder cho Autoformer
├── data_provider/              # Xử lý và nạp dữ liệu (Data Pipeline)
│   ├── data_loader.py          # Dataset classes cho ETT, Custom CSV, Weather, Traffic...
│   └── data_factory.py         # Hàm tạo DataLoader theo tham số truyền vào
├── exp/                        # Quản lý luồng chạy thực nghiệm
│   ├── exp_basic.py            # Lớp cơ sở (Base Class)
│   └── exp_main.py             # Luồng Train, Validation, Test, Save Checkpoint & Predict
├── scripts/                    # Các shell script chạy thực nghiệm tự động theo bộ dữ liệu
│   ├── ETT_script/
│   ├── ECL_script/
│   ├── Exchange_script/
│   ├── Traffic_script/
│   └── Weather_script/
├── run.py                      # Entry point chính của dự án (CLI parser & khởi tạo Exp)
├── predict.ipynb               # Notebook mẫu hỗ trợ load mô hình đã train & vẽ đồ thị dự báo
├── requirements.txt            # Danh sách thư viện cần thiết
└── README.md                   # Tài liệu hướng dẫn gốc từ tác giả
```

---

## 🛠️ 4. Hướng Dẫn Bắt Đầu (Quick Start)

### Bước 1: Cài đặt môi trường

Yêu cầu môi trường: **Python >= 3.6**, **PyTorch >= 1.9.0**, `numpy`, `pandas`, `scikit-learn`.

Cài đặt các gói phụ thuộc:
```bash
pip install -r requirements.txt
```

### Bước 2: Chuẩn bị dữ liệu

Dự án hỗ trợ 5 bộ dữ liệu benchmark phổ biến:
1. **ETTm1 / ETTh1**: Nhiệt độ máy biến áp điện (khoảng thời gian 15 phút hoặc 1 giờ).
2. **ECL**: Tải tiêu thụ điện năng.
3. **Exchange**: Tỷ giá hối đoái.
4. **Traffic**: Tốc độ/mật độ giao thông.
5. **Weather**: Dữ liệu khí tượng thủy văn.

Tạo thư mục `dataset/` ở gốc dự án và giải nén các file CSV vào tương ứng, ví dụ:
```text
dataset/
├── ETT-small/
│   ├── ETTm1.csv
│   └── ETTh1.csv
└── weather/
    └── weather.csv
```

---

## 🏃 5. Cách Huấn Luyện & Đánh Giá Mô Hình

### 1. Chạy nhanh bằng File Script có sẵn

Bạn có thể chạy các script thực nghiệm trong thư mục `./scripts/`:

```bash
# Huấn luyện Autoformer trên tập dữ liệu ETTm1 với chuỗi đầu vào 96 bước, dự báo 96 bước
bash ./scripts/ETT_script/Autoformer_ETTm1.sh
```

### 2. Chạy trực tiếp từ dòng lệnh (`run.py`)

Ví dụ chạy huấn luyện mô hình **Autoformer** tích hợp **BiHyPE**:

```bash
python run.py \
  --is_training 1 \
  --model_id ETTm1_96_96 \
  --model Autoformer \
  --data ETTm1 \
  --root_path ./dataset/ETT-small/ \
  --data_path ETTm1.csv \
  --features M \
  --seq_len 96 \
  --label_len 48 \
  --pred_len 96 \
  --e_layers 2 \
  --d_layers 1 \
  --factor 3 \
  --enc_in 7 \
  --dec_in 7 \
  --c_out 7 \
  --des 'Exp' \
  --itr 1
```

Các tham số quan trọng:
- `--features`: 
  - `M`: Multivariate Predict Multivariate (Nhiều chuỗi dự báo nhiều chuỗi).
  - `S`: Univariate Predict Univariate (Một chuỗi dự báo chính nó).
  - `MS`: Multivariate Predict Univariate (Nhiều chuỗi dự báo 1 chuỗi đích).
- `--seq_len`: Độ dài cửa sổ quá khứ (Input sequence length).
- `--pred_len`: Độ dài cửa sổ cần dự báo trong tương lai (Prediction horizon).

---

## 🎯 6. Hướng Dẫn Khai Thác Dự Án Cho Bài Toán Của Riêng Bạn

Nếu bạn muốn áp dụng dự án này vào dữ liệu chuỗi thời gian của riêng mình (ví dụ: giá chứng khoán, lưu lượng người dùng, doanh số bán hàng, cảm biến IoT):

### Bước 1: Chuẩn bị file dữ liệu CSV của bạn
File CSV cần có cấu trúc:
- Cột đầu tiên là mốc thời gian dạng `date` (ví dụ: `2023-01-01 00:00:00`).
- Các cột tiếp theo là các thuộc tính dạng số (features).

### Bước 2: Huấn luyện với cấu hình Custom Data
Chạy lệnh `run.py` với cấu hình `--data custom`:

```bash
python run.py \
  --is_training 1 \
  --model_id my_custom_exp \
  --model Autoformer \
  --data custom \
  --root_path ./data/my_folder/ \
  --data_path my_data.csv \
  --features M \
  --target target_column_name \
  --seq_len 96 \
  --label_len 48 \
  --pred_len 24 \
  --enc_in 5 \
  --dec_in 5 \
  --c_out 5
```

### Bước 3: Xem kết quả dự báo và Trực quan hóa
- Đồ thị và kết quả đánh giá (MSE, MAE) được lưu tự động trong thư mục `./results/` và `./checkpoints_PE/`.
- Sử dụng file [`predict.ipynb`](file:///c:/Users/kayng/Downloads/bihype-tsf-autoformer-informer-reformer-main%20%282%29/bihype-tsf-autoformer-informer-reformer-main/predict.ipynb) để load weight mô hình đã huấn luyện và vẽ biểu đồ so sánh giữa giá trị thực tế (Ground Truth) và giá trị dự báo (Prediction).

---

## 📊 7. Tóm Tắt Giá Trị Khai Thác (Key Takeaways)

| Mục tiêu sử dụng | Cách khai thác từ dự án này |
| :--- | :--- |
| **Nghiên cứu / Làm báo cáo** | Sử dụng làm baseline so sánh hiệu năng giữa Autoformer, Informer, Reformer khi có và không có BiHyPE Positional Encoding. |
| **Học tập thuật toán** | Đọc hiểu cách triển khai Auto-Correlation, ProbSparse Attention và kĩ thuật mã hóa vị trí nhị phân kết hợp tương đối (`Embed.py`). |
| **Ứng dụng thực tế** | Sử dụng khung huấn luyện `run.py` + `data_provider` để xây dựng hệ thống dự báo chuỗi thời gian cho dữ liệu doanh nghiệp/dự án thực tế. |

---
*Tài liệu được khởi tạo tự động bởi Antigravity AI Assistant.*
