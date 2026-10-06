# Anomaly Detection API Contract

Base URL:

```text
http://localhost:9000
```

## 1) POST /predict

Endpoint trả về danh sách từng điểm theo index sau khi chạy inference trên dataset.

### Request body

```json
{
  "dataset": "MSL",
  "force_recompute_train_energy": false
}
```

### Request fields

- `dataset`: tên dataset cần infer. Hiện tại chỉ hỗ trợ `MSL`.
- `force_recompute_train_energy`: nếu `true`, sẽ tính lại train energy thay vì đọc cache.

### Response

```json
[
  {
    "index": 0,
    "value": 0,
    "accuracy": 0
  },
  {
    "index": 1,
    "value": 0,
    "accuracy": 0
  },
  {
    "index": 2,
    "value": 1,
    "accuracy": 1
  }
]
```

### Response field nghĩa

- `index`: vị trí điểm trong chuỗi dữ liệu
- `value`: 0/1, điểm đó có phải anomaly không
- `accuracy`: phân loại theo mapping logic hiện tại
  - `0`: bình thường - bình thường
  - `1`: anomaly - anomaly
  - `2`: anomaly bị bỏ sót
  - `3`: cảnh báo giả

### Curl example

```bash
curl -X POST http://localhost:9000/predict \
  -H "Content-Type: application/json" \
  -d '{"dataset":"MSL","force_recompute_train_energy":false}'
```

### JavaScript example

```javascript
const res = await fetch("http://localhost:9000/predict", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dataset: "MSL",
    force_recompute_train_energy: false
  })
});

const data = await res.json();
console.log(data);
```

---

## 2) POST /predict/meta

Endpoint trả về metadata sau khi thực hiện inference, phục vụ monitoring / dashboard / backend tracking.

### Request body

```json
{
  "dataset": "MSL",
  "force_recompute_train_energy": false
}
```

### Response example

```json
{
  "dataset": "MSL",
  "checkpoint": "original",
  "total_points": 73728,
  "anomaly_points": 7287,
  "inference_time_ms": 14068.652153015137,
  "train_energy_time_ms": 35.028934478759766,
  "threshold_ratio": 1.0,
  "input_dim": 55,
  "win_size": 128
}
```

### Response field nghĩa

- `dataset`: tên dataset
- `checkpoint`: checkpoint đang dùng (`original` hiện tại)
- `total_points`: tổng số điểm được đánh giá
- `anomaly_points`: số điểm phát hiện bất thường
- `inference_time_ms`: tổng thời gian run inference
- `train_energy_time_ms`: thời gian tính train energy
- `threshold_ratio`: tỷ lệ ngưỡng hiện tại
- `input_dim`: số chiều đầu vào của model
- `win_size`: kích thước window của model

### Curl example

```bash
curl -X POST http://localhost:9000/predict/meta \
  -H "Content-Type: application/json" \
  -d '{"dataset":"MSL","force_recompute_train_energy":false}'
```

### JavaScript example

```javascript
const res = await fetch("http://localhost:9000/predict/meta", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    dataset: "MSL",
    force_recompute_train_energy: false
  })
});

const meta = await res.json();
console.log(meta);
```

---

## 3) Health check

### GET /health

```bash
curl http://localhost:9000/health
```

### Response

```json
{
  "status": "ok"
}
```

---

## 4) Notes

- Hiện tại API chỉ hỗ trợ dataset `MSL` và checkpoint `original`.
- Nếu `force_recompute_train_energy` là `true`, train energy sẽ tính lại và ghi lại cache mới.
- Dữ liệu trả về đang ở dạng full list không stream SSE.
