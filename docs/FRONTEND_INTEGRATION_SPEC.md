# 🔌 FRONTEND INTEGRATION SPEC — BiHyPE Time-Series Forecasting API

**Phiên bản Backend:** v3.0.0 (`main_api.py`) · **Ngày viết:** 2026-10-05
**Mục đích tài liệu này:** cung cấp đủ thông tin để FE dev tích hợp đúng với Backend hiện có — KHÔNG
cần đọc code Python. Nếu có khác biệt giữa tài liệu này và response thực tế, **response thực tế
là nguồn chân lý** (báo lại cho Backend dev để cập nhật tài liệu).

> ℹ️ Backend này **CHỈ làm 1 việc duy nhất: Forecasting** (dự báo giá trị tương lai bằng model
> Autoformer + BiHyPE Positional Encoding). Nó **KHÔNG làm Anomaly Detection, KHÔNG làm
> Imputation** — nếu UI của bạn có khái niệm "chọn model" (isolation-forest/autoencoder/lstm),
> "Anomaly %", hay "điền khuyết dữ liệu", những phần đó phải gọi sang backend khác, không phải
> backend này.

---

## 1. Thông Tin Chung

| | |
| :--- | :--- |
| Base URL (local dev) | `http://localhost:8000` |
| Giao thức | REST (`application/json`) + SSE (`text/event-stream`) |
| CORS | Mở toàn bộ (`allow_origins=["*"]`) — gọi thẳng từ browser không bị chặn |
| Swagger UI (tự test, tự sinh schema) | `http://localhost:8000/docs` |
| Model AI | Autoformer (kiến trúc Transformer, có BiHyPE Positional Encoding) |
| Tác vụ | Forecasting — dự báo 96 bước tiếp theo dựa trên 96 bước lịch sử |

---

## 2. Quy Trình Tích Hợp Đề Xuất Cho FE

1. Gọi **`GET /api/v1/datasets`** ngay khi load trang → build dropdown "Dataset" từ field
   `dataset`, build dropdown "Target" (phụ thuộc dataset đã chọn) từ `available_targets`.
   **Không hard-code danh sách dataset/target ở FE** — vì `electricity`/`traffic` có tới
   321/862 cột, danh sách này chỉ nên lấy động từ API.
2. Khi user chọn dataset + target → gọi `GET /api/v1/historical` để vẽ phần dữ liệu quá khứ.
3. Gọi `GET /api/v1/forecast-comparison` để vẽ phần so sánh Actual vs Forecast.
4. (Tuỳ chọn) Gọi `GET /api/v1/metadata` để hiển thị panel thông số model / MAE / MSE.
5. Nếu cần hiệu ứng "phát dữ liệu theo thời gian thực" (giống demo), dùng 2 endpoint SSE
   (`/api/v1/stream/...`) thay vì REST — xem mục 5.

---

## 3. Bảng Dataset Đầy Đủ

Gọi `GET /api/v1/datasets` để lấy bảng này **động** (khuyến nghị), nội dung hiện tại như sau:

| `dataset` (key — case-sensitive) | Số features (`num_features`) | `time_granularity` | Ghi chú |
| :--- | :--- | :--- | :--- |
| `ETTm1` | 7 | `15min` | Nhiệt độ máy biến áp điện |
| `electricity` | 321 | `1h` | Tải tiêu thụ điện (ECL) |
| `exchange_rate` | 8 | `1d` | Tỷ giá hối đoái |
| `traffic` | 862 | `1h` | Tỷ lệ chiếm dụng đường |
| `weather` | 21 | `10min` | Trạm thời tiết Max Planck Institute |

**Mọi dataset đều dùng chung:** `seq_len = 96` (số điểm lịch sử input) và `pred_len = 96` (số
điểm dự báo output) — cố định, không đổi theo dataset.

### Danh sách `target` (cột) đầy đủ theo từng dataset

- **`ETTm1`** (7 cột): `HUFL`, `HULL`, `MUFL`, `MULL`, `LUFL`, `LULL`, `OT`
- **`exchange_rate`** (8 cột): `0`, `1`, `2`, `3`, `4`, `5`, `6`, `OT` *(tên cột là số dạng
  chuỗi, không phải tên quốc gia)*
- **`weather`** (21 cột): `p (mbar)`, `T (degC)`, `Tpot (K)`, `Tdew (degC)`, `rh (%)`,
  `VPmax (mbar)`, `VPact (mbar)`, `VPdef (mbar)`, `sh (g/kg)`, `H2OC (mmol/mol)`,
  `rho (g/m**3)`, `wv (m/s)`, `max. wv (m/s)`, `wd (deg)`, `rain (mm)`, `raining (s)`,
  `SWDR (W/m�)`, `PAR (�mol/m�/s)`, `max. PAR (�mol/m�/s)`, `Tlog (degC)`, `OT`
  > ⚠️ **3 tên cột cuối chứa ký tự lỗi encode `�` (U+FFFD) NGAY TRONG FILE DATASET GỐC** — đây
  > không phải lỗi hiển thị, verify bằng cách đọc raw byte của file thấy `\xef\xbf\xbd` (UTF-8
  > của U+FFFD) thay vì `²`/`µ`. **Không được tự gõ tay** tên 3 cột này — phải copy chính xác
  > chuỗi `available_targets` trả về từ `GET /api/v1/datasets`, nếu không sẽ bị lỗi `400`
  > "cột không tồn tại". Khi hiển thị lên UI cho user xem, có thể tự thay `�` bằng `²`/`µ` ở
  > phía FE cho đẹp (không ảnh hưởng gì khi gửi ngược request — server so khớp theo chuỗi gốc).
- **`electricity`** (321 cột): tên cột là chuỗi số `"0"` → `"319"` (320 cột số), cộng thêm `"OT"`.
- **`traffic`** (862 cột): tên cột là chuỗi số `"0"` → `"860"` (861 cột số), cộng thêm `"OT"`.

> Với `electricity`/`traffic`, **không nên** render dropdown 321/862 item cứng nhắc — nên có ô
> search/autocomplete, hoặc mặc định chỉ hiển thị `OT` + cho phép gõ số.

---

## 4. Format Lỗi Chuẩn (áp dụng cho MỌI endpoint bên dưới)

Khi `dataset` hoặc `target` không hợp lệ, server trả **HTTP 400**, body dạng FastAPI mặc định:

```json
{
  "detail": "Dataset 'xyz' khong ton tai. Cac dataset kha dung: ['ETTm1', 'electricity', 'exchange_rate', 'traffic', 'weather']"
}
```

hoặc (target sai):

```json
{
  "detail": "Cot 'xyz' khong ton tai trong dataset 'ETTm1'. Cac cot kha dung: ['date', 'HUFL', 'HULL', 'MUFL', 'MULL', 'LUFL', 'LULL', 'OT']"
}
```

* Field lỗi luôn là `detail` (string), **không có field `status`/`data`** trong response lỗi —
  khác cấu trúc với response thành công (luôn có `status: "success"`). FE nên check theo HTTP
  status code trước, không nên dựa vào field `status` để phân biệt thành công/lỗi.
* Dataset path không tìm thấy file CSV trên server → `404` (hiếm xảy ra, chỉ khi lỗi cấu hình).

---

## 5. Chi Tiết Từng Endpoint

### 5.0 `GET /api/v1/datasets` — Danh sách dataset & target khả dụng

**Params:** không có.

**Response 200:**
```json
{
  "status": "success",
  "datasets": [
    {
      "dataset": "ETTm1",
      "display_name": "ETTm1 - Electricity Transformer Temperature (15 phút/điểm)",
      "num_features": 7,
      "available_targets": ["HUFL", "HULL", "MUFL", "MULL", "LUFL", "LULL", "OT"],
      "default_target": "OT",
      "seq_len": 96,
      "pred_len": 96,
      "time_granularity": "15min"
    }
    // ... 4 dataset còn lại
  ]
}
```

| Field | Kiểu | Ghi chú |
| :--- | :--- | :--- |
| `dataset` | `string` | Key chính xác để truyền vào param `dataset` của các endpoint khác |
| `display_name` | `string` | Tên hiển thị tiếng Việt, có thể chứa dấu — dùng để show UI |
| `num_features` | `int` | Tổng số cột feature (không tính cột `date`) |
| `available_targets` | `string[]` | Danh sách **đầy đủ** tên cột hợp lệ cho param `target` |
| `default_target` | `string` | Luôn là `"OT"` ở mọi dataset hiện tại |
| `seq_len` / `pred_len` | `int` | Luôn `96`/`96` ở mọi dataset hiện tại |
| `time_granularity` | `string` | Nhãn hiển thị khoảng cách thời gian giữa 2 điểm (`"15min"`, `"1h"`, `"1d"`, `"10min"`) |

---

### 5.1 `GET /api/v1/historical` — Dữ liệu lịch sử thực tế (API 1, REST)

**Params:**
| Param | Type | Default | Bắt buộc |
| :--- | :--- | :--- | :--- |
| `dataset` | string | `"ETTm1"` | Không (nhưng nên luôn truyền tường minh) |
| `target` | string | `"OT"` | Không |

**Response 200:**
```json
{
  "status": "success",
  "dataset": "ETTm1",
  "metric_target": "OT",
  "historical_count": 96,
  "data": [
    { "timestamp": "2018-06-25 20:00:00", "actual": 9.989 },
    { "timestamp": "2018-06-25 20:15:00", "actual": 9.989 }
  ]
}
```

`data` luôn có đúng **96 phần tử** (= `seq_len`), sắp xếp theo thời gian tăng dần, là 96 điểm
dữ liệu **gần nhất** trong file CSV của dataset đó.

> ⚠️ **`timestamp` ở endpoint này LẤY NGUYÊN VĂN chuỗi ngày-giờ từ file CSV gốc, KHÔNG chuẩn
> hoá format** — nên **định dạng khác nhau giữa các dataset**:
> - `ETTm1`, `electricity`, `traffic`, `weather`: dạng ISO `"YYYY-MM-DD HH:MM:SS"` (parse được
>   bằng `new Date(str)` trên JS, hoặc dùng thư viện `dayjs`/`date-fns` mặc định).
> - `exchange_rate`: dạng **`"YYYY/M/D H:MM"`** (dấu `/`, KHÔNG zero-pad tháng/ngày/giờ, KHÔNG
>   có giây) — ví dụ `"1990/7/6 0:00"`. `new Date()` của JS parse được chuỗi này nhưng **không
>   đáng tin cậy 100% tuỳ trình duyệt** (định dạng `YYYY/M/D` không phải ISO chuẩn). **Khuyến
>   nghị FE dùng thư viện parse ngày tường minh** (ví dụ `dayjs(str, "YYYY/M/D H:mm")`) riêng
>   cho dataset `exchange_rate` thay vì `new Date()` trực tiếp.

---

### 5.2 `GET /api/v1/stream/historical` — SSE bản streaming của API 1

Cùng params, cùng dữ liệu với 5.1, nhưng phát từng điểm một qua Server-Sent Events thay vì trả
1 mảng JSON. Xem mục 6 (SSE) để biết format event.

---

### 5.3 `GET /api/v1/forecast-comparison` — So sánh Thực tế vs Dự báo (API 2, REST)

⚠️ Endpoint này **chạy inference AI thật** (không phải đọc file tĩnh) → chậm hơn API 1, thời
gian phản hồi dao động theo kích thước dataset (ETTm1/weather/exchange_rate: ~30-70ms,
electricity/traffic: ~150-700ms do số feature lớn, lần gọi đầu tiên sau khi server khởi động có
thể chậm hơn do PyTorch warm-up).

**Params:** giống hệt 5.1 (`dataset`, `target`).

**Response 200:**
```json
{
  "status": "success",
  "dataset": "ETTm1",
  "metric_target": "OT",
  "forecast_count": 96,
  "data": [
    {
      "timestamp": "2018-06-29 20:15:00",
      "actual": 9.989,
      "forecast": 9.6739,
      "error_diff": 0.3151
    }
  ]
}
```

`data` luôn có đúng **96 phần tử** (= `pred_len`). Khác với mục 5.1, `timestamp` ở đây **LUÔN
chuẩn hoá** theo format `"YYYY-MM-DD HH:MM:SS"` cho **mọi** dataset (kể cả `exchange_rate`) —
vì được tính toán lại bằng `strftime()` ở backend, không lấy trực tiếp từ CSV.

| Field | Kiểu | Ý nghĩa |
| :--- | :--- | :--- |
| `actual` | `float` (4 chữ số thập phân) | Giá trị thật lấy từ dataset tại mốc đó |
| `forecast` | `float` (4 chữ số thập phân) | Giá trị model Autoformer dự báo |
| `error_diff` | `float` (4 chữ số thập phân) | `abs(actual - forecast)` |

---

### 5.4 `GET /api/v1/stream/forecast-comparison` — SSE bản streaming của API 2

Cùng params/dữ liệu với 5.3, phát từng điểm qua SSE. Xem mục 6.

---

### 5.5 `GET /api/v1/metadata` — Thông số model & độ chính xác (API 3, REST)

**Params:** giống hệt 5.1 (`dataset`, `target`). Cũng chạy inference thật (cùng chi phí như 5.3).

**Response 200:**
```json
{
  "status": "success",
  "model_info": {
    "model_architecture": "Autoformer",
    "positional_encoding": "BiHyPE (Binary-based Hybrid Positional Encoding)",
    "dataset_name": "ETTm1 - Electricity Transformer Temperature (15 phút/điểm)",
    "target_feature": "OT",
    "device_used": "CPU"
  },
  "sequence_config": {
    "historical_input_window": 96,
    "prediction_horizon": 96,
    "time_granularity": "15min"
  },
  "performance_metrics": {
    "inference_duration_ms": 38.25,
    "eval_mae": 0.2104,
    "eval_mse": 0.0845
  },
  "server_timestamp": "2026-10-05 10:22:00"
}
```

`device_used` sẽ là `"CPU"` hoặc `"CUDA"` tuỳ máy chạy server (không cố định). `eval_mae`/
`eval_mse` tính trên đúng 96 điểm dự báo của lần gọi này (không phải benchmark cố định toàn
tập test) — **nếu gọi lại nhiều lần, giá trị MAE/MSE không đổi** vì luôn lấy cùng 96 điểm cuối
của file CSV (backend không có random sampling).

---

## 6. SSE (Server-Sent Events) — Chi Tiết Kỹ Thuật

Áp dụng cho `GET /api/v1/stream/historical` và `GET /api/v1/stream/forecast-comparison`.

* **Content-Type:** `text/event-stream`
* **Tốc độ phát:** cố định **300ms/điểm** ở phía server (không cấu hình được qua param) → 1
  lần gọi mất đúng **96 × 300ms ≈ 28.8 giây** để phát hết.
* **Event cuối cùng luôn là** `event: complete` với `data: {"status": "finished"}` — FE phải
  lắng nghe event này để biết dừng/đóng kết nối (gọi `eventSource.close()`), SSE không tự đóng.
* Không có cơ chế resume/reconnect từ giữa chừng — nếu mất kết nối phải gọi lại từ đầu.

**Payload từng `data:` event của `/stream/historical`:**
```json
{"index": 1, "total": 96, "timestamp": "2018-06-25 20:00:00", "actual": 9.989}
```

**Payload từng `data:` event của `/stream/forecast-comparison`:**
```json
{"step": 1, "total_steps": 96, "timestamp": "2018-06-29 20:15:00", "actual": 9.989, "forecast": 9.6739, "error_diff": 0.3151}
```

**Mẫu code JS (`EventSource`):**
```javascript
const url = `http://localhost:8000/api/v1/stream/forecast-comparison?dataset=${encodeURIComponent(dataset)}&target=${encodeURIComponent(target)}`;
const es = new EventSource(url);

es.onmessage = (event) => {
  const point = JSON.parse(event.data);
  // point = { step, total_steps, timestamp, actual, forecast, error_diff }
};

es.addEventListener('complete', () => {
  es.close();
});

es.onerror = (err) => {
  console.error('SSE error', err);
  es.close();
};
```

---

## 7. Lưu Ý Tổng Hợp Cho FE Dev (checklist)

- [ ] Luôn `encodeURIComponent()` giá trị `target` trước khi gắn vào query string — nhiều tên
      cột chứa dấu cách/ngoặc đơn (`"T (degC)"`) hoặc ký tự `�` (dataset `weather`).
- [ ] Không hard-code `available_targets` — lấy động từ `GET /api/v1/datasets`.
- [ ] `dataset` phân biệt hoa/thường, đúng chính xác 1 trong 5 giá trị:
      `ETTm1`, `electricity`, `exchange_rate`, `traffic`, `weather`.
- [ ] `pred_len` = 96 cho **mọi** dataset (không phải 24) — nếu UI cũ hard-code 24 bước, cần sửa.
- [ ] Phân biệt lỗi theo **HTTP status code** (400/404), không dựa field `status` trong body vì
      response lỗi không có field đó.
- [ ] `timestamp` ở API Historical (5.1/5.2) **không đồng nhất format** giữa các dataset — xử lý
      riêng cho `exchange_rate`. `timestamp` ở API Forecast Comparison/Metadata (5.3-5.5) luôn
      đồng nhất ISO, không cần xử lý đặc biệt.
- [ ] 2 endpoint REST chạy inference (`forecast-comparison`, `metadata`) chậm hơn `historical` —
      nên có loading state riêng, đặc biệt với `electricity`/`traffic` (nhiều feature).
- [ ] SSE luôn mất ~29s/lần gọi (cố định ở backend) — không có param nào để tăng tốc hiển thị.

---

## 8. Danh Sách Thay Đổi (Changelog)

- **2026-10-05**: Khởi tạo tài liệu, tổng hợp từ `main_api.py` v3.0.0 (bản hỗ trợ đa dataset).
  Phát hiện & ghi nhận 2 vấn đề cần FE xử lý: (1) ký tự `�` baked-in trong 3 tên cột dataset
  `weather`, (2) `timestamp` không đồng nhất format ở API Historical cho dataset `exchange_rate`.

*Tài liệu dành cho Frontend Dev — xem thêm [BACKEND_TECHNICAL_SPEC.md](BACKEND_TECHNICAL_SPEC.md)
nếu cần chi tiết triển khai nội bộ Backend (checkpoint, kiến trúc model...).*
