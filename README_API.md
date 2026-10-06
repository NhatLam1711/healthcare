# API cho model Anomaly Transformer (v2)

Tách biệt với `README.md` gốc của repo (hướng dẫn train/benchmark) - file
này chỉ nói về phần API (`api.py`) dùng để serve model cho backend Java.

## Thay đổi so với bản v1

| | v1 | v2 (bản này) |
|---|---|---|
| Python | 3.6 bắt buộc, phải dùng Anaconda | **3.10/3.11, venv thường là đủ** |
| Dataset hỗ trợ | Chỉ 5 dataset hardcode (SMD/MSL/SMAP/PSM/SWaT) | **Bất kỳ dataset nào** có đủ 3 file `.npy` đúng tên |
| Checkpoint | 1 checkpoint / dataset | **Nhiều checkpoint/seed** cho cùng 1 dataset |
| Tốc độ | Tính lại `train_energy` (phần nặng nhất) ở MỖI request | **Cache ra đĩa**, tính 1 lần, dùng lại mãi mãi |
| `tensorflow`, `Pillow` | Có trong requirements (không cần thiết) | **Đã bỏ** |

## Cài đặt

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Không cần Anaconda nữa - `pip` + venv chuẩn của Python 3.10/3.11 là đủ.

## Cấu trúc thư mục bắt buộc

```
bihype-tsad-anomaly-transformer-main/
├── api.py
├── requirements.txt
├── dataset/
│   └── MSL/
│       ├── MSL_train.npy
│       ├── MSL_test.npy
│       └── MSL_test_label.npy
├── checkpoints/
│   └── MSL/
│       ├── original_wsize128_checkpoint.pth
│       ├── seed42_wsize128_checkpoint.pth
│       ├── seed43_wsize128_checkpoint.pth
│       └── seed44_wsize128_checkpoint.pth
└── cache/                       <- tự tạo khi chạy, chứa train_energy đã cache
```

⚠️ **Bạn cần tự tạo `dataset/MSL/` và `checkpoints/MSL/` rồi copy các file
bạn đang có vào đúng chỗ** (file zip này không kèm sẵn vì không có quyền
truy cập file của bạn). Xem checklist cuối file.

## Thêm dataset MỚI (vd 2DGesture) - không cần sửa code

1. Tạo `dataset/2DGesture/` chứa `2DGesture_train.npy`, `2DGesture_test.npy`, `2DGesture_test_label.npy`
2. Tạo `checkpoints/2DGesture/` chứa `original_wsize<N>_checkpoint.pth` (N = win_size lúc train)
3. Gọi `/predict` với `{"dataset": "2DGesture"}` - **tự động chạy được**, không cần đụng tới `data_factory/data_loader.py` hay `api.py`.

(Lưu ý: nếu `input_c`/`output_c`/`win_size` khác 55/55/128 như MSL, sửa lại
`BASE_CONFIG` trong `api.py`, hoặc báo lại để mình thêm field cho phép
truyền qua request thay vì hardcode.)

## API

### `GET /health`
Kiểm tra server sống.

### `GET /models/{dataset}`
Liệt kê các checkpoint hiện có cho 1 dataset (đọc trực tiếp từ thư mục
`checkpoints/{dataset}/`) - tiện kiểm tra đã đặt đúng file chưa trước khi gọi `/predict`.

```bash
curl http://localhost:9000/models/MSL
# {"dataset": "MSL", "checkpoints": ["original", "seed42", "seed43", "seed44"]}
```

### `POST /predict`

Request:
```json
{
  "dataset": "MSL",
  "checkpoint": "seed42",
  "force_recompute_train_energy": false
}
```
- `checkpoint`: mặc định `"original"` nếu không truyền
- `force_recompute_train_energy`: `true` để bỏ qua cache, tính lại từ đầu
  (dùng khi bạn thay checkpoint mới cho cùng tên, hoặc nghi ngờ cache sai)

Response - mảng `{index, value, accuracy}` theo đúng format đã thống nhất
với backend Java:
```json
[
  {"index": 0, "value": 0, "accuracy": 0},
  {"index": 1, "value": 1, "accuracy": 2},
  ...
]
```

## Về tốc độ

**Lần gọi ĐẦU TIÊN cho mỗi `(dataset, checkpoint)`** vẫn chậm (có thể vài
chục giây đến vài phút tùy CPU) - đây là lúc tính `train_energy`, phần việc
nặng nhất (quét gần hết tập train, thuật toán gốc vậy). Sau đó **mọi lần
gọi sau với cùng dataset+checkpoint sẽ nhanh hơn rất nhiều** (vài giây) vì
đọc thẳng từ cache trong thư mục `cache/`, kể cả sau khi restart server.

Nếu vẫn cần nhanh hơn nữa ở lần tính đầu tiên, có 1 hằng số `STEP_TRAIN`
trong `api.py` - đổi từ `1` lên vd `128` (= `win_size`) sẽ nhanh hơn ~128
lần, đánh đổi lấy threshold được ước lượng từ ít mẫu train hơn (có thể hơi
kém chính xác hơn). Mặc định để `1` để giữ đúng độ chính xác như thuật
toán gốc.

## Checklist trước khi chạy
- [ ] Đã tạo `dataset/MSL/` với đủ 3 file `.npy`
- [ ] Đã tạo `checkpoints/MSL/` với ít nhất 1 file checkpoint (`original_wsize128_checkpoint.pth`)
- [ ] Đã cài `requirements.txt` bằng Python 3.10/3.11 (không phải Anaconda Python 3.6 cũ)
- [ ] `uvicorn api:app --host 0.0.0.0 --port 9000` chạy không lỗi
- [ ] `curl http://localhost:9000/health` trả về `{"status":"ok"}`
- [ ] `curl http://localhost:9000/models/MSL` thấy đúng các checkpoint đã đặt vào
