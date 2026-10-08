# Triển khai tính năng Imputation — Tài liệu kỹ thuật

> Ghi lại quyết định kiến trúc, file liên quan, và hành vi đã kiểm thử của tính năng Imputation.
> Ngày triển khai: 2026-10-07. Đọc cùng [`MULTI_TASK_ARCHITECTURE.md`](MULTI_TASK_ARCHITECTURE.md), [`FORECASTING_IMPLEMENTATION.md`](FORECASTING_IMPLEMENTATION.md) (pattern nền tảng), và tài liệu BE gốc [`FE_INTEGRATION_GUIDE.md`](FE_INTEGRATION_GUIDE.md).
> **Đã kiểm thử end-to-end với backend thật** (`http://127.0.0.1:8800`, CORS đã bật) bằng Playwright — xem mục 7.

## 1. Quyết định kiến trúc đã chốt

Trước khi code đã thống nhất 2 điểm (xem lịch sử trao đổi):

1. **Chỉ dùng API 2 (`/full`)**, không gọi thêm `/real` — dựng cả 2 đường "Reconstructed" và "Ground Truth overlay" từ duy nhất field `value`/`ground_truth` có sẵn trong mỗi điểm `/full`. 1 kết nối SSE duy nhất/lượt chạy, **đơn giản hơn Forecasting** (không cần nối tiếp 2 pha như historical→forecast).
2. **`sample_id` chọn qua list có search** (tái dùng `TargetSelector`), không dùng ô nhập số — nhất quán UI với cách chọn `feature_id`.

## 2. Khác biệt cấu trúc so với 2 bài toán trước

| | AD | Forecasting | Imputation |
|---|---|---|---|
| Cấp chọn | 1 (dataset) | 2 (dataset → target) | **3 (dataset → sample_id → feature_id)** |
| Dataset list | hardcode | động (`GET /datasets`) | **hardcode bắt buộc** — API không có endpoint liệt kê dataset, chỉ có `/api/{dataset}/meta` (cần biết tên trước) |
| SSE event cuối | `complete` | `complete` (nhưng event dữ liệu lại mặc định, không named) | **`done`** (tên khác cả 2 cái trước) |
| Lỗi | status code only | `{"detail": "..."}` | `{"detail": "..."}` (giống Forecasting, tái dùng được `parseErrorDetail`) |

→ Đã xác nhận: **3 backend, 3 convention SSE khác nhau** (`point`/`complete` vs mặc định/`complete` vs `point`/`done`). Không có cách viết 1 lớp SSE dùng chung cho cả 3 — mỗi `xxxApi.js` phải tự wire riêng, đúng như dự đoán trong `FORECASTING_IMPLEMENTATION.md`.

## 3. Danh sách file

### Mới

| File | Vai trò |
| :--- | :--- |
| `src/api/apiErrors.js` | Tách `parseErrorDetail` dùng chung (trước đó định nghĩa riêng trong `forecastApi.js`) — tránh trùng lặp vì Imputation dùng đúng format lỗi `{detail}` giống Forecasting |
| `src/api/imputationApi.js` | `IMPUTATION_DATASETS` (hardcode 3 key + label hiển thị), `fetchImputationMeta`, `createFullStream` |
| `src/hooks/useImputationController.js` | State + lifecycle: dataset/sample/feature đang chọn, `/meta`, replay 1-pha (khác Forecasting's 2-pha) |
| `src/components/ImputationToolbar/` | 2× `TargetSelector` (Sample, Feature) + Start/Stop/Clear; tái dùng `DatasetToolbar.css` |
| `src/components/ImputationChart/` | EChart 7-series: Observed (liền) + Imputed median (nét đứt) + Ground Truth masked (chấm) + dải tin cậy 90%/50% (stacked area) |
| `src/components/ImputationChartPanel/` | Khung panel, tái dùng `ChartPanel.css` |
| `src/components/ImputationView/` | Orchestrator chính |
| `docs/IMPUTATION_IMPLEMENTATION.md` | Chính là tài liệu này |

### Đã sửa

| File | Thay đổi |
| :--- | :--- |
| `src/api/forecastApi.js` | Import `parseErrorDetail` từ `apiErrors.js` thay vì định nghĩa cục bộ |
| `src/components/TargetSelector/TargetSelector.jsx` | Thêm prop `label` (mặc định `'Target:'`) — để tái dùng với nhãn `"Sample:"`/`"Feature:"` mà không cần tạo component mới |
| `src/components/Sidebar/Sidebar.jsx` | Thêm nhánh render dataset tĩnh cho `activeTaskId === 'imputation'` (danh sách 3 dataset cố định, có chấm streaming) |
| `src/config/tasks.js` | `imputation.available: false → true` |
| `src/App.jsx` | Gọi `useImputationController()`, thêm nhánh render `ImputationView` |

**Không đổi**: toàn bộ code AD và Forecasting.

## 4. `.env` — base URL Imputation

```bash
VITE_IMPUTATION_API_BASE_URL=http://127.0.0.1:8800/api
```

Lưu ý: port đã đổi từ `8000` (trong tài liệu gốc BE) sang **`8800`** trong thực tế chạy — xác nhận trực tiếp qua `curl http://127.0.0.1:8800/api/pm25/meta` khi test, không còn trùng cổng với backend Forecasting (`:8000`) nữa.

## 5. Mô hình state — đơn giản hơn Forecasting

```
replayStateRef.current[`${dataset}::${sampleId}::${featureId}`] = {
  phase: 'idle' | 'streaming' | 'done',
  status, points,
  labels: [],            // String(t), category axis
  observed: [],          // value khi type=observed, null khi khác
  imputedMedian: [],     // value khi type=imputed, null khi khác
  groundTruth: [],       // ground_truth khi type=imputed, null khi khác
  lower90/upper90/lower50/upper50: [],  // confidence khi type=imputed, null khi khác
}
```

Chỉ **1 SSE stream** (`/full`), không có lifecycle nối-tiếp-2-pha như Forecasting — mỗi điểm nhận về được phân vào đúng mảng theo `type`, giữ `null` ở các mảng không áp dụng để ECharts tự ngắt đoạn đúng chỗ. Key vẫn namespace theo `dataset::sampleId::featureId` (3 cấp) để đổi sample hoặc feature đều tính là "chuỗi dữ liệu khác", nhất quán với cách Forecasting namespace theo `dataset::target`.

## 6. `ImputationChart` — kỹ thuật dải tin cậy (confidence band)

Đây là kỹ thuật vẽ **hoàn toàn mới**, không tái dùng được `markArea` của AD (vốn tô nền theo khoảng thời gian với nhãn rời rạc 0-3, không phải dải giá trị liên tục).

Pattern chuẩn ECharts cho confidence band — 2 series ẩn xếp chồng (`stack`):
```js
{ name: '__band90_base', type: 'line', stack: 'band90', lineStyle: { opacity: 0 }, data: lower90 },
{ name: 'Confidence 90%', type: 'line', stack: 'band90', lineStyle: { opacity: 0 }, areaStyle: {...}, data: upper90 - lower90 },
```
Series ẩn (`__band90_base`, `__band50_base`) bị loại khỏi `legend.data` (allowlist tường minh) và khỏi tooltip (filter theo prefix `__` trong formatter) — tránh lộ series kỹ thuật ra UI.

Dải 50% vẽ **sau** dải 90% trong mảng `series` (thứ tự sau = z-order cao hơn trong ECharts) → nằm chồng lên, tạo hiệu ứng "dải đậm nằm trong dải nhạt" đúng ý nghĩa thống kê (khoảng tin cậy hẹp hơn luôn nằm trong khoảng rộng hơn).

**Đã xác nhận bằng test thực tế** (mục 7.3): với đoạn có nhiều điểm `imputed` liên tiếp, dải 90% hiện rõ dạng "ngọn núi" mờ bao quanh đường nét đứt tím, dải 50% đậm hơn nằm lồng bên trong — đúng thiết kế.

## 7. Kết quả kiểm thử thực tế (Playwright, backend thật `127.0.0.1:8800`)

| # | Kịch bản | Kết quả |
| :-: | :--- | :--- |
| 7.1 | Tab Imputation → chọn `PM2.5` | Toolbar hiện đúng `Sample: 0`, `Feature: Station_1` (mặc định), metadata (`Samples 82`, `Timesteps 36`, `Features 36`, `Predictions/point 100`). |
| 7.2 | `pm25/series/0/0` — Start Streaming | 36/36 điểm, `"Replay complete"` sau ~2s (36 × 50ms interval_ms mặc định). Toàn bộ 36 điểm đều `observed` (dataset thật, không phải mock) → chart vẽ 1 đường liền, đúng. |
| 7.3 | `pm25/series/5/0` (xác nhận qua `curl` có 17 observed + 18 imputed + 1 missing) | Chart vẽ đúng: đoạn đầu/cuối liền nét xanh dương, đoạn giữa đứt đoạn tím + dải tin cậy 90%/50% lồng nhau rõ ràng + các chấm xám rải rác là Ground Truth tại điểm bị che. |
| 7.4 | Bấm "Clear Data" | `Pts: 0/36`, chart rỗng. |
| 7.5 | Chuyển dataset `Electricity` (370 feature) → mở Feature selector | Ô search xuất hiện đúng ngưỡng (>12 items), gõ `"42"` → lọc đúng, chọn ra `Client_42`. |

**Console error trong toàn bộ 5 kịch bản: 0.**

Một phát hiện phụ khi khảo sát dữ liệu thật qua `curl` (không phải bug, chỉ là đặc tính dataset): `physio/series/0/0` trả về **48/48 điểm đều `missing`** — tức chart sẽ hoàn toàn trống với tổ hợp sample/feature đó. Hành vi hiện tại (không vẽ gì) là đúng theo spec, nhưng UI chưa có thông báo kiểu "không có dữ liệu để hiển thị" cho trường hợp này — xem mục 8.

## 8. Hướng cải thiện tiếp theo (chưa làm, ngoài phạm vi lần này)

- Thêm trạng thái rỗng rõ ràng khi mọi điểm đều `missing` (hiện tại chỉ là chart trống, không có thông báo).
- `interval_ms` đang cố định `50` trong `imputationApi.js` (`DEFAULT_INTERVAL_MS`), không có UI điều chỉnh — tương tự khoảng trống `intervalMs`/`maxDurationMs` đã ghi nhận cho AD, có thể gộp chung 1 lần làm UI điều khiển tốc độ phát cho cả 3 backend nếu cần.
- Lỗi z-index overlay đã ghi ở `FORECASTING_IMPLEMENTATION.md` mục 7 (ảnh hưởng `FeatureFilterDropdown` + `TargetSelector`) cũng ảnh hưởng 2 `TargetSelector` mới dùng trong `ImputationToolbar` — chưa sửa, cùng lý do đã nêu.
