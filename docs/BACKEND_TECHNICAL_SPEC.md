# 📘 BACKEND TECHNICAL SPECIFICATION (V3.0)
## API Service Dự Báo Chuỗi Thời Gian - Realtime SSE & RESTful Architecture

Tài liệu này tổng hợp toàn bộ chi tiết kỹ thuật cho các nhóm API Backend, bao gồm giao thức truyền tải, định dạng dữ liệu JSON, cơ chế phát dữ liệu thời gian thực **SSE (Server-Sent Events)** và hướng dẫn lập trình kết nối cho Frontend.

> **🆕 V3.0 (2026-10-03): Mở rộng Đa Dataset (Multi-Dataset Support).**
> Trước đây Backend chỉ hard-code 1 dataset duy nhất (ETTm1). Từ bản này, mọi API đều nhận
> thêm tham số `dataset` để chọn 1 trong 5 bộ dữ liệu, mỗi bộ có checkpoint + kiến trúc model
> riêng. Xem mục **[0. Thay Đổi Lớn Ở V3.0]** ngay dưới đây để hiểu rõ lý do và rủi ro kỹ thuật
> trước khi tích hợp Frontend.

---

## 0. 🆕 Thay Đổi Lớn Ở V3.0: Hỗ Trợ Đa Dataset

### Bối cảnh & vấn đề

Bản V2.0 hard-code 1 checkpoint Autoformer duy nhất (`ETTm1_96_24_...`) và 1 đường dẫn CSV
duy nhất (`./dataset/ETT-small/ETTm1.csv`) ở cấp module. Không thể tái sử dụng checkpoint này
cho dataset khác vì **mỗi dataset có số chiều feature (`enc_in`/`dec_in`/`c_out`) và `d_model`
khác nhau** — dùng sai sẽ lỗi `size mismatch` khi `load_state_dict()`.

### Giải pháp: `DATASET_CONFIGS` (registry cấu hình theo dataset)

`main_api.py` giờ định nghĩa một dict `DATASET_CONFIGS` ánh xạ `dataset_key -> cấu hình đầy đủ`
(đường dẫn CSV, đường dẫn checkpoint, `enc_in`, `d_model`, các tham số freq...). Phần kiến trúc
giống nhau giữa mọi dataset (vì cùng checkpoint dạng `*_96_96_Autoformer_*`, không bị override
trong script train) được tách riêng vào `SHARED_ARCH_CONFIG`: `seq_len=96, label_len=48,
pred_len=96, n_heads=8, e_layers=2, d_layers=1, d_ff=2048, moving_avg=25, factor=3,
dropout=0.05, embed='timeF', activation='gelu'`.

Model & args được **cache theo dataset** (`_model_cache`, `_args_cache` — dict khóa bằng
`dataset_key`), nạp 1 lần khi server khởi động qua `preload_all_models()` trong `lifespan()`.

### Bảng cấu hình 5 dataset đã xác minh thực tế (quét `checkpoints_PE/` + `dataset/`)

| `dataset` (key) | CSV | `enc_in=dec_in=c_out` | `d_model` | Checkpoint đang dùng (pred_len=96) | Tần suất lấy mẫu thực tế |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ETTm1` | `dataset/ETT-small/ETTm1.csv` | 7 | 512 | `ETTm1_96_96_Autoformer_ETTm1_ftM_sl96_ll48_pl96_dm512_..._ebtimeF_dtTrue_Exp_0` | 15 phút |
| `electricity` | `dataset/electricity/electricity.csv` | 321 | 512 | `ECL_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm512_..._ebtimeF_dtTrue_Exp_0` | 1 giờ |
| `exchange_rate` | `dataset/exchange_rate/exchange_rate.csv` | 8 | 16 | `Exchange_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm16_..._ebtimeF_dtTrue_Exp_0` | 1 ngày |
| `traffic` | `dataset/traffic/traffic.csv` | 862 | 1024 | `traffic_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm1024_..._ebtimeF_dtTrue_Exp_0` | 1 giờ |
| `weather` | `dataset/weather/weather.csv` | 21 | 16 | `weather_96_96_Autoformer_custom_ftM_sl96_ll48_pl96_dm16_..._ebtimeF_dtTrue_Exp_0` | 10 phút |

**Vì sao chọn checkpoint `pred_len=96` (`sl96_pl96`) cho mọi dataset?** Đây là **giá trị
`pred_len` DUY NHẤT có checkpoint Autoformer tồn tại ở cả 5 dataset** (một số dataset có thêm
`pl192/pl336`, riêng ETTm1 còn có `pl24/pl48/pl288/pl336` nhưng không đồng nhất giữa các bộ).
Chọn `pl96` cho cả 5 giúp hành vi API (số điểm trả về ở `forecast-comparison`) nhất quán giữa
các dataset.

> ⚠️ **Lưu ý hành vi thay đổi so với V2.0**: Dataset `ETTm1` trước đây dùng checkpoint
> `pl24` (horizon dự báo 24 điểm × 15 phút = 6 giờ). Từ V3.0, `ETTm1` dùng checkpoint `pl96`
> (horizon 96 điểm × 15 phút = 24 giờ) để đồng nhất với 4 dataset khác. Nếu Frontend đang
> hard-code `total_steps = 24` cho ETTm1 thì cần cập nhật thành 96.

### ⚠️ Cạm bẫy kỹ thuật đã gặp phải & cách xử lý (QUAN TRỌNG — đọc trước khi sửa code)

1. **`model_freq` (kích thước embedding) ≠ `time_features_freq` (tham số gọi hàm sinh đặc
   trưng thời gian).** Lớp `TimeFeatureEmbedding` (`layers/Embed.py`) tra `freq_map = {'h': 4,
   't': 5, ...}` để quyết định số chiều input — giá trị này **cố định theo lúc train**, không
   liên quan gì đến tần suất lấy mẫu thật của CSV:
   - Chỉ **ETTm1** được train với `--freq 't'` (script `scripts/ETT_script/Autoformer_ETTm1.sh`).
   - **4 dataset còn lại (ECL, Exchange, Traffic, Weather) đều KHÔNG truyền `--freq` khi train**
     → dùng default của `run.py` là `freq='h'` — **bất kể tần suất thật của CSV** (ví dụ
     `exchange_rate` là dữ liệu NGÀY, `weather` là 10 PHÚT, nhưng embedding vẫn được train như
     thể là dữ liệu GIỜ). Đây là hành vi gốc từ code upstream Autoformer, backend chỉ replicate
     lại đúng, không tự "sửa" theo tần suất thật — nếu dùng sai sẽ lỗi `size mismatch`.
2. **`pandas >= 2.2` (dự án hiện dùng pandas 3.0.6) không còn chấp nhận alias `'t'`** khi gọi
   `pandas.tseries.frequencies.to_offset()` (lỗi `ValueError: Invalid frequency: t`). Vì
   `utils/timefeatures.py::time_features()` gọi `to_offset()` nội bộ, **không thể** truyền
   thẳng `model_freq='t'` vào đó. Giải pháp: tách riêng field `time_features_freq` trong
   `DATASET_CONFIGS` — với ETTm1 là `"15min"` (rơi vào cùng nhóm offset `Minute` như `'t'`, nên
   vẫn ra đúng 5 chiều đặc trưng khớp `freq_map['t']=5`), còn 4 dataset khác là `"h"`.
3. **`sampling_delta`**: khoảng cách thời gian thật giữa 2 dòng CSV liên tiếp (15min / 1h / 1d /
   10min), dùng để tính các mốc `timestamp` tương lai trả về cho Frontend — **độc lập hoàn
   toàn** với 2 field freq ở trên (chỉ dùng cho hiển thị, không ảnh hưởng tới input model).

Tổng kết 3 field freq/thời gian trong mỗi entry của `DATASET_CONFIGS`:

| Field | Mục đích | Ảnh hưởng nếu sai |
| :--- | :--- | :--- |
| `model_freq` | Key tra `freq_map` để build `TimeFeatureEmbedding` đúng số chiều | `RuntimeError` size mismatch khi forward |
| `time_features_freq` | Chuỗi hợp lệ với pandas `to_offset()`, dùng gọi `time_features()` | `ValueError`/`KeyError` khi gọi, hoặc sai số chiều nếu rơi nhóm offset khác |
| `sampling_delta` | `pd.Timedelta` thật giữa 2 điểm dữ liệu, dùng tính timestamp tương lai | Timestamp hiển thị sai (không ảnh hưởng độ chính xác dự báo) |

### Đã kiểm thử (2026-10-03)

Đã load thực tế cả 5 checkpoint (`AutoformerModel.load_state_dict()` không lỗi shape), chạy
inference end-to-end qua HTTP cho từng dataset (`/api/v1/historical`, `/api/v1/forecast-
comparison`, `/api/v1/metadata`, `/api/v1/datasets`), và test case dataset không hợp lệ trả về
đúng `400 Bad Request` kèm danh sách dataset khả dụng.

---

## 1. 🏗️ Tổng Quan Giao Thức & Kiến Trúc API

Hệ thống cung cấp 2 phương thức giao tiếp linh hoạt cho ứng dụng Web:

| Nhóm API | Giao thức (Protocol) | Content-Type | Mô tả ứng dụng |
| :--- | :--- | :--- | :--- |
| **REST API** | HTTP GET | `application/json` | Nạp nhanh toàn bộ mảng dữ liệu 1 lần duy nhất. |
| **SSE Stream** | HTTP GET (EventStream) | `text/event-stream` | Mô phỏng phát sóng dữ liệu Realtime từng điểm về Frontend (Cố định 300ms/điểm ở Backend). |

---

## 2. 📋 Danh Sách Các API Backend

### 0️⃣ API MỚI: Danh Sách Dataset Khả Dụng (`GET /api/v1/datasets`)

* **Mục đích**: Cho Frontend biết có những dataset nào, mỗi dataset có cột (`target`) nào để
  build dropdown chọn Dataset + Target trước khi gọi các API khác. **Nên gọi API này đầu tiên.**
* **Params**: không có.
* **Format Response (`application/json`)**:
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
    },
    {
      "dataset": "weather",
      "display_name": "Weather - Trạm thời tiết Max Planck Institute (10 phút/điểm)",
      "num_features": 21,
      "available_targets": ["p (mbar)", "T (degC)", "...", "OT"],
      "default_target": "OT",
      "seq_len": 96,
      "pred_len": 96,
      "time_granularity": "10min"
    }
  ]
}
```
* **Lưu ý cho Frontend**: `dataset` là giá trị chính xác cần truyền vào tham số `dataset` của
  mọi API dưới đây (phân biệt hoa/thường, dùng đúng key: `ETTm1`, `electricity`,
  `exchange_rate`, `traffic`, `weather`). `available_targets` là danh sách hợp lệ duy nhất cho
  tham số `target` tương ứng với dataset đó — một số tên cột (ví dụ dataset `weather`) có chứa
  dấu cách/ký tự đặc biệt như `"T (degC)"` nên **phải URL-encode** khi gắn vào query string.

### 1️⃣ API 1: Dữ Liệu Lịch Sử Quá Khứ (Historical Data)

#### 🔹 REST API: `GET /api/v1/historical`
* **Mục đích**: Lấy 96 mốc thời gian quá khứ dưới dạng mảng JSON hoàn chỉnh.
* **Params**:
  * `dataset` (mặc định: `"ETTm1"`) — key dataset, xem `GET /api/v1/datasets`.
  * `target` (mặc định: `"OT"`) — phải thuộc `available_targets` của dataset đã chọn.
* **Lỗi**: `400 Bad Request` nếu `dataset` không tồn tại, hoặc `target` không có trong dataset đó.
* **Format Response (`application/json`)**:
```json
{
  "status": "success",
  "dataset": "ETTm1",
  "metric_target": "OT",
  "historical_count": 96,
  "data": [
    {
      "timestamp": "2026-10-02 20:00:00",
      "actual": 38.2145
    },
    {
      "timestamp": "2026-10-02 20:15:00",
      "actual": 39.0123
    }
  ]
}
```

#### 🔹 SSE Realtime Stream: `GET /api/v1/stream/historical`
* **Mục đích**: Phát từng mốc dữ liệu quá khứ theo dạng Stream thời gian thực.
* **Params**: `dataset` (mặc định: `"ETTm1"`), `target` (mặc định: `"OT"`) — như API REST ở trên.
* **Header Response**: `Content-Type: text/event-stream`
* **Tần suất gửi**: Cố định `STREAM_INTERVAL_SEC = 0.3` (300ms) ở Backend gửi 1 JSON event.
* **Format SSE Event Payload** (payload từng event KHÔNG đổi so với V2.0, dataset chỉ ảnh hưởng
  query string lúc mở kết nối):
```text
data: {"index": 1, "total": 96, "timestamp": "2026-10-02 20:00:00", "actual": 38.2145}

data: {"index": 2, "total": 96, "timestamp": "2026-10-02 20:15:00", "actual": 39.0123}

...

event: complete
data: {"status": "finished"}
```

---

### 2️⃣ API 2: So Sánh Thực Tế vs Dự Báo (Forecast Comparison)

#### 🔹 REST API: `GET /api/v1/forecast-comparison`
* **Mục đích**: Lấy mảng 96 mốc dự báo (⚠️ đã đổi từ 24 → 96, xem mục 0 ở trên), mỗi mốc chứa
  giá trị Thực Tế (Ground Truth) từ Dataset và Giá Trị Dự Báo (AI Model) để FE vẽ biểu đồ so
  sánh song song. Đây là API chạy inference AI thật (nặng hơn API 1), có cache model theo dataset.
* **Params**:
  * `dataset` (mặc định: `"ETTm1"`) — key dataset, xem `GET /api/v1/datasets`.
  * `target` (mặc định: `"OT"`) — phải thuộc `available_targets` của dataset đã chọn.
* **Lỗi**: `400 Bad Request` nếu `dataset`/`target` không hợp lệ.
* **Format Response (`application/json`)**:
```json
{
  "status": "success",
  "dataset": "ETTm1",
  "metric_target": "OT",
  "forecast_count": 96,
  "data": [
    {
      "timestamp": "2026-10-03 00:15:00",
      "actual": 43.5000,
      "forecast": 43.1204,
      "error_diff": 0.3796
    },
    {
      "timestamp": "2026-10-03 00:30:00",
      "actual": 44.1000,
      "forecast": 44.0511,
      "error_diff": 0.0489
    }
  ]
}
```

#### 🔹 SSE Realtime Stream: `GET /api/v1/stream/forecast-comparison`
* **Mục đích**: Phát từng mốc so sánh Thực tế vs Dự báo theo dạng Stream từng điểm một về cho Frontend.
* **Params**: `dataset` (mặc định: `"ETTm1"`), `target` (mặc định: `"OT"`) — như API REST ở trên.
* **Tần suất gửi**: Cố định `300ms` ở Backend cho mỗi điểm.
* **Format SSE Event Payload** (`total_steps` nay là 96 cho mọi dataset):
```text
data: {"step": 1, "total_steps": 96, "timestamp": "2026-10-03 00:15:00", "actual": 43.5, "forecast": 43.1204, "error_diff": 0.3796}

data: {"step": 2, "total_steps": 96, "timestamp": "2026-10-03 00:30:00", "actual": 44.1, "forecast": 44.0511, "error_diff": 0.0489}

...

event: complete
data: {"status": "finished"}
```

---

### 3️⃣ API 3: Thông Tin Metadata & Hiệu Năng (`GET /api/v1/metadata`)

* **Mục đích**: Cung cấp thông số kỹ thuật mô hình, thời gian chạy Inference, thiết bị phần cứng và các chỉ số đánh giá sai số (MAE, MSE).
* **Params**:
  * `dataset` (mặc định: `"ETTm1"`) — key dataset, xem `GET /api/v1/datasets`.
  * `target` (mặc định: `"OT"`) — phải thuộc `available_targets` của dataset đã chọn.
* **Format Response (`application/json`)**:
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
  "server_timestamp": "2026-10-03 02:22:00"
}
```

---

## 💻 3. Hướng Dẫn Kết Nối Cho Frontend (Frontend Integration Guide)

### 🅰️ Bước 0 (mới): Lấy danh sách Dataset trước khi vẽ UI chọn lựa

```javascript
const res = await fetch('http://localhost:8000/api/v1/datasets');
const { datasets } = await res.json();
// datasets[i] = { dataset, display_name, num_features, available_targets, default_target, seq_len, pred_len, time_granularity }
// -> Dùng để build 2 dropdown lồng nhau: chọn Dataset trước, rồi chọn Target trong available_targets của dataset đó.
```

### 🅱️ Kết Nối SSE Realtime Stream Bằng Javascript (`EventSource`):

```javascript
// 1. Kết nối với API Stream Realtime — nhớ truyền cả dataset & target, và URL-encode target
// nếu tên cột có dấu cách/ký tự đặc biệt (ví dụ dataset weather: "T (degC)")
const dataset = 'ETTm1';
const target = 'OT';
const url = `http://localhost:8000/api/v1/stream/forecast-comparison?dataset=${encodeURIComponent(dataset)}&target=${encodeURIComponent(target)}`;
const eventSource = new EventSource(url);

// 2. Lắng nghe từng điểm dữ liệu được đẩy từ Backend về (cách nhau 300ms)
eventSource.onmessage = (event) => {
  const item = JSON.parse(event.data);
  console.log(`[Step ${item.step}/${item.total_steps}] Timestamp: ${item.timestamp}`);
  console.log(`Thực tế: ${item.actual} | Dự báo AI: ${item.forecast}`);
  
  // Cập nhật điểm dữ liệu mới vào biểu đồ Frontend (Chart.js / ECharts)
  myChart.appendDataPoint({
    x: item.timestamp,
    yActual: item.actual,
    yForecast: item.forecast
  });
};

// 3. Lắng nghe sự kiện hoàn tất Stream
eventSource.addEventListener('complete', (event) => {
  console.log("✅ Đã nhận đủ toàn bộ chuỗi dự báo Realtime!");
  eventSource.close(); // Đóng kết nối SSE
});

// 4. Xử lý lỗi kết nối
eventSource.onerror = (error) => {
  console.error("Lỗi kết nối SSE Stream:", error);
  eventSource.close();
};
```

---

## 🚀 4. Lệnh Khởi Chạy Server

Khởi chạy ứng dụng Backend với Uvicorn:

```bash
python -m uvicorn main_api:app --reload --port 8000
```

* Swagger UI Test API: 👉 `http://localhost:8000/docs`

---

## 🧪 5. Test Nhanh Bằng Postman

Repo có sẵn Postman Collection + Environment tại [postman/](postman/) để import và test ngay,
không cần tự gõ URL:

* [postman/BiHyPE_API.postman_collection.json](postman/BiHyPE_API.postman_collection.json) —
  đủ request cho cả 7 endpoint (root, datasets, historical REST+SSE, forecast-comparison
  REST+SSE, metadata), nhóm theo folder, có sẵn test script (`pm.test`) kiểm tra status code &
  cấu trúc response, cộng thêm folder "4. Multi-Dataset Examples" test cứng cả 5 dataset (gồm
  case `weather` với target chứa dấu cách `"T (degC)"`) và folder "5. Error Cases" test dataset/
  target không hợp lệ phải trả `400`.
* [postman/BiHyPE_Local.postman_environment.json](postman/BiHyPE_Local.postman_environment.json) —
  biến môi trường `base_url` / `dataset` / `target` để đổi dataset/target mà không cần sửa từng
  request.

**Cách dùng**: Postman → *Import* → kéo cả 2 file trên vào → chọn Environment "BiHyPE Local" ở
dropdown góc trên phải → chạy từng request, hoặc bấm nút "Run collection" (Collection Runner) để
chạy tự động toàn bộ + xem kết quả `pm.test`. Đổi dataset/target: sửa 2 biến `dataset`/`target`
trong tab Environment (Postman tự URL-encode nếu target có dấu cách, không cần tự encode như
curl/PowerShell). Với 2 request SSE (`*_Stream`), Postman bản mới (v10+) hiển thị từng event
realtime trong tab Response; stream chạy đủ ~29s (300ms × 96 điểm) nên không cần lo "treo".

> Đã verify toàn bộ collection bằng `newman run` (CLI chạy Postman collection) trên server thật:
> 30/30 assertion pass, bao gồm cả 5 dataset và các case lỗi.

---
*Tài liệu được cập nhật tự động bởi Claude Code (V3.0 - 2026-10-03: mở rộng đa dataset + Postman collection).*
