# API Specification — Backend (Spring Boot)

Base URL: `http://localhost:8080`

Backend gồm **3 endpoint**, tất cả dưới `/api/v1/dataset`. API 1 là REST thường (JSON). API 2 và API 3 là **Server-Sent Events (SSE)** — kết nối mở liên tục, server tự đẩy dữ liệu về theo thời gian thực cho đến khi xong.

| API | Method | Endpoint | Kiểu | Trả về |
| --- | --- | --- | --- | --- |
| 1 | GET | `/api/v1/dataset/{name}/info` | REST | Thông tin dataset (dimension, length, %anomaly) |
| 2 | GET | `/api/v1/dataset/{name}/stream` | SSE | Dữ liệu thô: `index`, `values` |
| 3 | GET | `/api/v1/dataset/{name}/evaluate?model={modelId}` | SSE | Dữ liệu + so sánh với model: `index`, `values`, `accuracy` |

---

## API 1 — Thông tin dataset

```
GET /api/v1/dataset/{name}/info
```

### Path params

| Tên | Kiểu | Mô tả |
| --- | --- | --- |
| `name` | string | Tên dataset (vd `MSL`, `2DGesture`) |

### Query params

| Tên | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `refresh` | boolean | `false` | Bỏ qua cache, tải lại dữ liệu từ nguồn (Google Drive) |

### Response `200 OK`

```json
{
  "datapath": "MSL",
  "shape": [73729, 55],
  "dtype": "<f8",
  "length": 73729,
  "dimension": 55,
  "anomalyPercent": 10.53
}
```

| Field | Kiểu | Mô tả |
| --- | --- | --- |
| `datapath` | string | Tên dataset (echo lại `name`) |
| `shape` | number\[\] | Shape gốc của mảng dữ liệu |
| `dtype` | string | Kiểu dữ liệu gốc (vd `<f8`) |
| `length` | number | Số điểm dữ liệu (rows) |
| `dimension` | number | Số chiều mỗi điểm (vd 55 cho MSL, N chiều bất kỳ) |
| `anomalyPercent` | number \| null | % nhãn bất thường trong file label (`Sum(label==1) / (Sum(==1)+Sum(==0)) * 100`, tính từ cột cuối file label). `null` nếu dataset chưa có label |

### Lỗi

| Status | Khi nào |
| --- | --- |
| `404` | Không tìm thấy cấu hình dataset với tên đó, hoặc dataset chưa cấu hình `data-url` |
| `502` | Không tải được file từ nguồn dữ liệu (Google Drive) |

---

## API 2 — Stream dữ liệu thô

```
GET /api/v1/dataset/{name}/stream
```

Chỉ phát dữ liệu, **không so sánh với model**.

### Path params

| Tên | Kiểu | Mô tả |
| --- | --- | --- |
| `name` | string | Tên dataset |

### Query params

| Tên | Kiểu | Mặc định | Mô tả |
| --- | --- | --- | --- |
| `intervalMs` | number | `20` | Khoảng cách (ms) giữa các điểm phát ra |
| `maxDurationMs` | number | `20000` | Giới hạn tổng thời lượng stream — dataset dài sẽ tự downsample (bỏ bớt điểm) để vừa khoảng thời gian này |
| `refresh` | boolean | `false` | Bỏ qua cache, tải lại dữ liệu từ nguồn |

### Các event SSE

**`point`** — 1 điểm dữ liệu:

```
event: point
id: 0
data: {"index":0,"values":[196.37467,394.45875]}
```

| Field | Kiểu | Mô tả |
| --- | --- | --- |
| `index` | number | Vị trí điểm trong dataset gốc |
| `values` | number\[\] | Tọa độ/giá trị tại điểm đó, tổng quát N chiều |

**`complete`** — báo hết dữ liệu, đóng kết nối:

```
event: complete
data: {}
```

⚠️ **Bắt buộc lắng nghe event `complete`** rồi tự gọi `eventSource.close()`. Nếu không, `EventSource` sẽ tự động reconnect vô hạn khi server đóng kết nối.

### Lỗi

| Status | Khi nào |
| --- | --- |
| `404` | Không tìm thấy dataset, hoặc dataset chưa cấu hình `data-url` |
| `502` | Không tải được file dữ liệu từ nguồn |

---

## API 3 — Stream + so sánh với model AI

```
GET /api/v1/dataset/{name}/evaluate?model={modelId}
```

Giống hệt API 2 nhưng có thêm kết quả so sánh với **1 model AI cụ thể**.

### Path params

| Tên | Kiểu | Mô tả |
| --- | --- | --- |
| `name` | string | Tên dataset |

### Query params

| Tên | Kiểu | Bắt buộc | Mặc định | Mô tả |
| --- | --- | --- | --- | --- |
| `model` | string | **Có** | — | ID model cần so sánh (phải khớp 1 key trong `app.models.sources` ở backend). Thiếu tham số này → lỗi `400` |
| `intervalMs` | number | Không | `20` | Khoảng cách (ms) giữa các điểm |
| `maxDurationMs` | number | Không | `20000` | Giới hạn tổng thời lượng stream |
| `refresh` | boolean | Không | `false` | Bỏ qua cache |

### Các event SSE

**`point`** — 1 điểm dữ liệu + kết quả so sánh:

```
event: point
id: 0
data: {"index":0,"values":[196.37467,394.45875],"accuracy":1}
```

| Field | Kiểu | Mô tả |
| --- | --- | --- |
| `index` | number | Vị trí điểm trong dataset gốc |
| `values` | number\[\] | Tọa độ/giá trị tại điểm đó |
| `accuracy` | number \| null | Kết quả so sánh label thật với model đã chọn (xem bảng dưới) |

**Ý nghĩa `accuracy`** (dạng confusion-matrix):

| Giá trị | label thật | model đoán | Ý nghĩa |
| --- | --- | --- | --- |
| `null` | — | — | Dataset chưa có label, hoặc độ dài label không khớp độ dài data → không so sánh được |
| `0` | 0 | 0 | Đúng — bình thường |
| `1` | 1 | 1 | Đúng — phát hiện đúng bất thường |
| `2` | 1 | 0 | Sai — bỏ sót bất thường |
| `3` | 0 | 1 | Sai — báo động giả |

**`complete`** — báo hết dữ liệu, đóng kết nối (giống API 2):

```
event: complete
data: {}
```

⚠️ Cũng bắt buộc lắng nghe event này để đóng `EventSource` đúng cách.

### Lỗi

| Status | Khi nào |
| --- | --- |
| `400` | Thiếu tham số `model` |
| `404` | Không tìm thấy dataset (chưa cấu hình `data-url`), hoặc `model` chưa được cấu hình URL trong `application.yml` |
| `502` | Không tải được file từ nguồn, hoặc gọi sang model thất bại / model trả sai định dạng kết quả |

⚠️ **Độ trễ:** model AI thật có thể cần thời gian xử lý trước khi trả kết quả (đặc biệt lần gọi đầu tiên cho mỗi dataset). Backend đã cấu hình timeout riêng cho việc gọi model (`app.models.timeout-seconds`, mặc định 60s) — tăng giá trị này nếu model của bạn chạy lâu hơn.

---

## Ví dụ code frontend (JavaScript — EventSource)

```javascript
const BASE_URL = "http://localhost:8080";

// API 1 - REST thường
async function getDatasetInfo(name) {
  const res = await fetch(`${BASE_URL}/api/v1/dataset/${name}/info`);
  return res.json();
}

// API 2 - chỉ dữ liệu thô
function streamDataset(name, { intervalMs = 20 } = {}) {
  const params = new URLSearchParams({ intervalMs });
  const es = new EventSource(`${BASE_URL}/api/v1/dataset/${name}/stream?${params}`);

  es.addEventListener("point", (e) => {
    const point = JSON.parse(e.data);
    console.log(point.index, point.values);
  });
  es.addEventListener("complete", () => es.close()); // BẮT BUỘC
  es.onerror = () => es.close();

  return es;
}

// API 3 - dữ liệu + so sánh với model
function evaluateDataset(name, model, { intervalMs = 20 } = {}) {
  const params = new URLSearchParams({ model, intervalMs });
  const es = new EventSource(`${BASE_URL}/api/v1/dataset/${name}/evaluate?${params}`);

  es.addEventListener("point", (e) => {
    const point = JSON.parse(e.data);
    console.log(point.index, point.values, point.accuracy);
  });
  es.addEventListener("complete", () => es.close()); // BẮT BUỘC
  es.onerror = () => es.close();

  return es;
}
```

## Dataset đã cấu hình sẵn ở backend

- `MSL` — có cả data + label
- `2DGesture` — có cả data + label (nếu đã cấu hình `data-url`/`label-url`)

(Danh sách này phụ thuộc `app.dataset.sources` trong `application.yml` — cập nhật lại phần này nếu bạn thêm/đổi dataset.)