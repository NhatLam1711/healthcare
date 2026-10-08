# FE Integration Guide — CSDI Imputation API

Tài liệu này dành cho **FE dev** tích hợp với backend time-series imputation
(BE gửi dữ liệu đã merge giá trị thật + giá trị dự đoán, FE vẽ chart). Không
cần đọc code backend — mọi thứ cần để code FE đều ở đây.

> Chi tiết triển khai nội bộ (vì sao phải patch CUDA→CPU, luồng xử lý
> pickle...) nằm ở `BACKEND_API.md`, không cần đọc để tích hợp FE.
> Collection Postman để tự test tay: `postman/CSDI_Imputation_API.postman_collection.json`.

---

## 1. Tổng quan

- Backend đọc kết quả **đã được tính sẵn** từ 1 model imputation
  (CSDI/BiHyPE) — không có tính toán AI nào chạy lúc request, chỉ đọc data
  có sẵn và trả về. Do đó **tốc độ phản hồi nhanh**, không cần lo timeout.
- Có **3 dataset** độc lập, chọn qua path param `{dataset}`: `pm25`,
  `physio`, `electricity` (chi tiết số chiều ở mục 2).
- Có **2 loại endpoint chính**:
  - **API 1 — "real"**: chỉ trả giá trị thật (ground truth).
  - **API 2 — "full"**: trả giá trị thật **+** giá trị dự đoán (kèm độ tin
    cậy) — dùng cái này để vẽ chart so sánh.
- Cả 2 endpoint trên trả dữ liệu qua **SSE (Server-Sent Events)**, không
  phải 1 JSON array thường — xem mục 4 để biết cách consume.
- **Base URL (dev local):** `http://127.0.0.1:8800` (port 8800, không phải
  8000 — đã đổi vì trùng port với service khác trên máy BE dev).
- ✅ **CORS đã mở** (`allow_origins=["*"]`), FE chạy ở origin/port nào cũng
  gọi thẳng được, không cần proxy. Sẽ siết lại domain cụ thể trước khi lên
  production, lúc đó FE cần báo trước domain thật để BE whitelist.

---

## 2. Dataset & số chiều

| `dataset` | `sample_id` hợp lệ | số timestep (`t`) | số feature (`feature_id`) | tên feature |
|---|---|---|---|---|
| `pm25` | `0 .. 81` (82 samples) | `0 .. 35` (36 mốc giờ) | `0 .. 35` (36 trạm) | generic: `Station_1 .. Station_36` |
| `physio` | `0 .. 798` (799 samples) | `0 .. 47` (48 giờ) | `0 .. 34` (35 chỉ số) | **tên thật**, xem danh sách dưới |
| `electricity` | `0 .. 6` (7 samples) | `0 .. 191` (192 mốc) | `0 .. 369` (370 khách hàng) | generic: `Client_1 .. Client_370` |

**Tên 35 feature của `physio`** (theo đúng thứ tự `feature_id` 0→34):
```
0 DiasABP     7  pH         14 Bilirubin  21 FiO2       28 TroponinI
1 HR          8  Albumin    15 HCO3       22 K          29 PaCO2
2 Na          9  ALT        16 BUN        23 GCS        30 Platelets
3 Lactate     10 Glucose    17 RespRate   24 Cholesterol 31 Urine
4 NIDiasABP   11 SaO2       18 Mg         25 NISysABP   32 NIMAP
5 PaO2        12 Temp       19 HCT        26 TroponinT  33 Creatinine
6 WBC         13 AST        20 SysABP     27 MAP        34 ALP
```

**Cách lấy danh sách này bằng API** (không cần hard-code phía FE): gọi
`GET /api/{dataset}/meta`, field `feature_names` là array theo đúng thứ tự
index — `feature_names[feature_id]` luôn ra tên đúng cho mọi dataset.

> ⚠️ **`t` không phải ngày/giờ thật.** Đây chỉ là vị trí thứ tự (0-indexed)
> trong cửa sổ thời gian của sample đó (vd. pm25: t=0..35 là 36 giờ liên tiếp
> trong 1 tháng cụ thể, nhưng API không trả ngày thật kèm theo). Nếu FE cần
> hiển thị mốc thời gian thật, cần báo lại BE để bổ sung field đó.

---

## 3. Endpoints

### 3.1. `GET /api/{dataset}/meta`
JSON thường (không phải SSE). Dùng để FE biết giới hạn hợp lệ của
`sample_id`/`feature_id`/`feature_names` trước khi gọi 2 endpoint còn lại —
nên gọi cái này trước, lưu vào state, dùng để build dropdown chọn
sample/feature.

**Response:**
```json
{
  "dataset": "pm25",
  "num_samples": 82,
  "num_timesteps": 36,
  "num_features": 36,
  "nsample_per_point": 100,
  "feature_names": ["Station_1", "Station_2", "..."]
}
```
| field | type | ý nghĩa |
|---|---|---|
| `num_samples` | int | số sample hợp lệ cho `sample_id` (0 → num_samples-1) |
| `num_timesteps` | int | số điểm `t` trong mỗi series trả về |
| `num_features` | int | số feature hợp lệ cho `feature_id` (0 → num_features-1) |
| `nsample_per_point` | int | số lượng dự đoán model sinh ra cho mỗi điểm (dùng để tính median/confidence ở BE, FE không cần dùng trực tiếp) |
| `feature_names` | string[] | tên hiển thị cho từng `feature_id`, theo đúng thứ tự index |

---

### 3.2. `GET /api/{dataset}/series/{sample_id}/{feature_id}/real` — **API 1**
Trả **chỉ giá trị thật**, qua SSE. Dùng vẽ đường "giá trị thực tế".

**Query param:** `interval_ms` (optional, default `200`, số nguyên ≥0) —
độ trễ (ms) giữa 2 điểm khi phát qua SSE, mô phỏng cảm giác "đang đổ dữ liệu
realtime" (data gốc là tĩnh, có sẵn từ trước — đây chỉ là tốc độ phát lại).
Set `0` để nhận gần như ngay lập tức (vẫn là nhiều event, không gộp lại
thành 1 JSON).

**Mỗi điểm = 1 SSE event `point`.** Stream kết bằng 1 event `done`.

```
event: point
data: {"t": 0, "value": 55.0, "type": "observed"}

event: point
data: {"t": 2, "value": null, "type": "missing"}

...

event: done
data: {"total": 36}
```

**Field của mỗi `point`:**
| field | type | ý nghĩa |
|---|---|---|
| `t` | int | vị trí timestep (xem cảnh báo ở mục 2) |
| `value` | float \| null | giá trị thật đã denormalize (đơn vị gốc, FE không cần tính toán thêm); `null` nếu điểm này thật sự không có dữ liệu |
| `type` | `"observed"` \| `"missing"` | `observed` = có giá trị thật để vẽ; `missing` = không có gì để vẽ tại điểm này |

---

### 3.3. `GET /api/{dataset}/series/{sample_id}/{feature_id}/full` — **API 2**
Trả **giá trị thật + giá trị dự đoán**, qua SSE — endpoint chính để vẽ chart
so sánh. Cùng query param `interval_ms` như trên.

```
event: point
data: {"t": 0, "value": 55.0, "type": "observed", "ground_truth": null, "confidence": null}

event: point
data: {"t": 12, "value": 14.6246, "type": "imputed", "ground_truth": 10.0,
       "confidence": {"lower_90": 9.8302, "lower_50": 12.0146, "median": 14.6246,
                       "upper_50": 17.1313, "upper_90": 21.2467}}

event: point
data: {"t": 20, "value": null, "type": "missing", "ground_truth": null, "confidence": null}

...

event: done
data: {"total": 36}
```

**Field của mỗi `point`:**
| field | type | ý nghĩa |
|---|---|---|
| `t` | int | vị trí timestep |
| `value` | float \| null | **giá trị để vẽ lên đường chính của chart** — là giá trị thật nếu `type="observed"`, là **median dự đoán** nếu `type="imputed"`, `null` nếu `type="missing"` |
| `type` | `"observed"` \| `"imputed"` \| `"missing"` | xem bảng dưới |
| `ground_truth` | float \| null | chỉ có giá trị khi `type="imputed"` — là giá trị thật tại điểm đó (dùng để FE hiện tooltip so sánh "model đoán X, thực tế Y", không bắt buộc phải vẽ) |
| `confidence` | object \| null | chỉ có giá trị khi `type="imputed"`, xem cấu trúc dưới |

**Ý nghĩa `type`:**
| `type` | Giải thích | Gợi ý vẽ FE |
|---|---|---|
| `observed` | Model được nhìn thấy giá trị này (giá trị thật) | đường liền |
| `imputed` | Điểm bị che/thiếu, model dự đoán ra | đường nét đứt hoặc màu khác + vùng mờ confidence |
| `missing` | Thật sự không có dữ liệu, không ai biết | để trống (không vẽ điểm, có thể để đứt đoạn trên chart) |

**Cấu trúc `confidence`** (chỉ xuất hiện khi `type="imputed"`):
```json
{
  "lower_90": 9.8302,
  "lower_50": 12.0146,
  "median": 14.6246,
  "upper_50": 17.1313,
  "upper_90": 21.2467
}
```
- `median` = giá trị dự đoán chính (trùng với field `value` ở ngoài).
- `lower_90` / `upper_90` = khoảng tin cậy 90% (vẽ vùng mờ rộng).
- `lower_50` / `upper_50` = khoảng tin cậy 50% (vẽ vùng mờ hẹp hơn, đậm hơn,
  nằm trong vùng 90%).

---

## 4. Cách consume SSE phía FE

SSE khác JSON thường — không `fetch().then(r => r.json())` được. Dùng
`EventSource` (hỗ trợ sẵn trên mọi browser hiện đại, chỉ hỗ trợ GET, không
cần set header gì thêm):

```js
const es = new EventSource(
  "http://127.0.0.1:8800/api/pm25/series/0/0/full?interval_ms=150"
);

es.addEventListener("point", (e) => {
  const point = JSON.parse(e.data);
  chart.appendPoint(point); // tuỳ chart lib FE đang dùng
});

es.addEventListener("done", (e) => {
  const { total } = JSON.parse(e.data);
  console.log(`Đã nhận đủ ${total} điểm`);
  es.close(); // nên đóng khi xong, EventSource không tự đóng
});

es.onerror = (err) => {
  console.error("SSE lỗi hoặc mất kết nối:", err);
  es.close();
};
```

Nếu FE dùng framework có SSR/không có `EventSource` native (React Native,
Node...), cần dùng polyfill (`eventsource` npm package) hoặc đổi sang
`fetch` + đọc `ReadableStream` thủ công — báo lại nếu cần BE hỗ trợ thêm
cách khác (vd. WebSocket hoặc JSON array thường) cho môi trường đó.

---

## 5. Lỗi (error responses)

Cả 3 endpoint dùng chung quy ước lỗi — trả JSON thường (không phải SSE) kèm
status code:

| Status | Khi nào xảy ra | Body mẫu |
|---|---|---|
| `404` | `{dataset}` không tồn tại (chỉ có `pm25`/`physio`/`electricity`) | `{"detail": "Unknown dataset 'xxx'. Available: ['pm25', 'physio', 'electricity']"}` |
| `400` | `sample_id` hoặc `feature_id` ngoài phạm vi hợp lệ (xem mục 2) | `{"detail": "sample_id out of range [0, 82)"}` |

FE nên luôn gọi `/meta` trước để lấy `num_samples`/`num_features` và validate
input ở phía FE trước khi gọi 2 endpoint series, tránh phải xử lý lỗi 400
không cần thiết.

---

## 6. Ví dụ nhanh để thử tay

```bash
# Xem giới hạn hợp lệ của pm25
curl http://127.0.0.1:8800/api/pm25/meta

# Lấy chart so sánh cho sample 0, trạm đầu tiên, phát nhanh (10ms/điểm)
curl -N "http://127.0.0.1:8800/api/pm25/series/0/0/full?interval_ms=10"

# physio feature_id=1 là HR (xem bảng mục 2 hoặc gọi /meta để tra)
curl -N "http://127.0.0.1:8800/api/physio/series/0/1/full?interval_ms=10"
```

Hoặc import `postman/CSDI_Imputation_API.postman_collection.json` +
`postman/CSDI_Local.postman_environment.json` vào Postman để bấm thử trực
tiếp, có sẵn ví dụ cho cả 3 dataset.

---

## 7. Checklist khi FE tích hợp

- [ ] Gọi `/meta` cho dataset cần dùng, lưu `num_samples`/`num_features`/
      `feature_names` vào state để build UI chọn sample/feature.
- [ ] Dùng `EventSource` (không dùng `fetch().json()`) cho 2 endpoint
      `/real` và `/full`.
- [ ] Phân biệt 3 `type` (`observed`/`imputed`/`missing`) để chọn style vẽ
      khác nhau (đường liền / nét đứt + vùng mờ / để trống).
- [ ] Khi `type="imputed"`, dùng `confidence.lower_90`/`upper_90` (và/hoặc
      `lower_50`/`upper_50`) để vẽ vùng mờ quanh đường dự đoán.
- [ ] Gọi `es.close()` khi nhận event `done` hoặc khi component unmount,
      tránh leak connection.
- [ ] CORS đã mở sẵn cho mọi origin ở môi trường dev — không cần làm gì
      thêm; chỉ cần lưu ý trước khi lên production BE sẽ siết lại domain cụ
      thể (xem mục 1), lúc đó phải báo domain FE thật cho BE whitelist.
