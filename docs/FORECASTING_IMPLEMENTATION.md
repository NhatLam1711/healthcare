# Triển khai tính năng Forecasting — Tài liệu kỹ thuật

> Ghi lại toàn bộ quyết định kiến trúc, file liên quan, và hành vi đã được kiểm thử của tính năng Forecasting.
> Ngày triển khai: 2026-10-06. Đọc cùng [`MULTI_TASK_ARCHITECTURE.md`](MULTI_TASK_ARCHITECTURE.md) (nền tảng multi-task) và tài liệu BE cung cấp [`FRONTEND_INTEGRATION_SPEC.md`](FRONTEND_INTEGRATION_SPEC.md) (hợp đồng API nguồn).
> **Đã kiểm thử end-to-end với backend thật** (`http://localhost:8000`, FastAPI v3.0.0) bằng Playwright — xem mục 8.

## 1. Quyết định kiến trúc đã chốt

Hai quyết định sản phẩm được thống nhất trước khi code (xem lịch sử trao đổi), quyết định toàn bộ thiết kế bên dưới:

1. **Lấy dữ liệu qua SSE streaming** (không dùng REST), để giữ đúng "chất" dashboard real-time như Anomaly Detection — dùng `/stream/historical` và `/stream/forecast-comparison`.
2. **1 chart hợp nhất** cho 192 điểm (96 quá khứ + 96 dự báo) trên cùng 1 trục thời gian, có vạch chia mốc "Forecast starts" — không tách 2 panel song song như AD.

Hệ quả trực tiếp: 2 SSE stream **không độc lập** như `stream`/`evaluate` của AD — chúng được phát **tuần tự**: `historical` chạy xong (96 điểm × 300ms ≈ 28.8s) → tự động kích hoạt `forecast-comparison` (thêm ≈ 28.8s nữa) → tổng ≈ 58s/lượt "Start Streaming". Đã xác nhận hành vi chuyển pha tự động hoạt động đúng khi test (mục 8.3).

## 2. Danh sách file

### Mới

| File | Vai trò |
| :--- | :--- |
| `.env.example` | Khai báo 2 biến môi trường base URL (xem mục 3) |
| `src/api/forecastApi.js` | Lớp gọi API Forecasting: `fetchForecastDatasets`, `fetchForecastMetadata`, `createHistoricalStream`, `createForecastComparisonStream` |
| `src/hooks/useForecastController.js` | Toàn bộ state + lifecycle của Forecasting (danh sách dataset, dataset/target đang chọn, metadata, replay 2 pha historical→forecast) — xem mục 4 |
| `src/components/TargetSelector/` | Dropdown chọn cột `target`, có ô search khi > 12 cột (phục vụ `electricity`/`traffic` có 321/862 cột) |
| `src/components/ForecastToolbar/` | Toolbar cho Forecasting — thay vị trí "model select" của AD bằng `TargetSelector`; tái dùng `DatasetToolbar.css` |
| `src/components/ForecastChart/` | EChart 1-chart-hợp-nhất: 3 series (Historical Actual, Actual Comparison, Forecast) + `markLine` chia mốc. Expose `resetZoom()` qua `ref` (không dùng `window[...]` hack như `EChart.jsx` cũ) |
| `src/components/ForecastChartPanel/` | Khung panel (header/status/points/reset) — tái dùng `ChartPanel.css` nguyên bản |
| `src/components/ForecastingView/` | Orchestrator chính của task Forecasting, ráp `ForecastToolbar` + `ForecastChartPanel` |
| `docs/FORECASTING_IMPLEMENTATION.md` | Chính là tài liệu này |

### Đã sửa

| File | Thay đổi |
| :--- | :--- |
| `src/api/datasetApi.js` | `API_BASE_URL` đọc từ `import.meta.env.VITE_ANOMALY_API_BASE_URL`, fallback về giá trị cũ — **không hardcode nữa**, áp dụng đồng bộ với Forecasting |
| `src/components/MetadataGrid/MetadataGrid.jsx` | Tổng quát hoá: nhận thẳng `items` (mảng `{label, value}`) + `loading` thay vì tự tính từ `info` theo shape của AD — để dùng chung được cho cả 2 task |
| `src/components/DatasetToolbar/DatasetToolbar.jsx` | Chuyển phần tính `items` (trước đây nằm trong `MetadataGrid`) sang đây, giữ nguyên hành vi hiển thị cho AD |
| `src/components/ChartPanel/ChartPanel.css` | Thêm `.charts-grid--single` (1 hàng) cho layout 1-chart của Forecasting, không đổi `.charts-grid` gốc (2 hàng, AD vẫn dùng nguyên) |
| `src/components/Sidebar/Sidebar.jsx` + `.css` | Thêm nhánh render dataset **động** khi `activeTaskId === 'forecasting'` (loading/error/list theo `display_name`), giữ nguyên nhánh AD cũ |
| `src/config/tasks.js` | `forecasting.available: false → true` |
| `src/App.jsx` | Gọi `useForecastController()`, thêm nhánh render `ForecastingView` theo `activeTaskId`, lazy-load danh sách dataset khi vào tab Forecasting lần đầu |

**Không đổi** (chủ động không đụng để tránh rủi ro hồi quy cho AD đang chạy ổn định): `EChart.jsx`, `ChartPanel.jsx`, `FeatureFilterDropdown`, toàn bộ logic AD trong `App.jsx`.

## 3. Cấu hình môi trường (không hardcode endpoint)

```bash
# .env.example — copy thành .env hoặc .env.local, Vite tự đọc biến prefix VITE_
VITE_ANOMALY_API_BASE_URL=http://localhost:8080/api/v1/dataset
VITE_FORECAST_API_BASE_URL=http://localhost:8000/api/v1
```

Cả `datasetApi.js` và `forecastApi.js` đều đọc qua `import.meta.env.VITE_*` kèm fallback đúng giá trị dev hiện tại — **không cần tạo file `.env` để chạy local**, nhưng khi endpoint đổi (staging/production, đổi port...) chỉ cần set biến môi trường, **không phải sửa code**.

## 4. `useForecastController` — mô hình state

```
replayStateRef.current[`${dataset}::${target}`] = {
  phase: 'idle' | 'historical' | 'forecast' | 'done',
  status: string,                 // label hiển thị trực tiếp lên UI
  historical: { labels, actual, points, eventSource },
  forecast:   { labels, actual, forecast, errorDiff, points, eventSource },
}
```

Điểm khác biệt quan trọng so với `datasetsStateRef` của AD trong `App.jsx`:

- **Key = `dataset::target`** (không chỉ `dataset`) — vì đổi `target` thực chất là đổi "chuỗi dữ liệu đang xem", y hệt đổi dataset, cần state riêng. Điều này **chủ động áp dụng namespacing** mà `MULTI_TASK_ARCHITECTURE.md` mục 6.4 đã cảnh báo cho AD (dù AD hiện tại chưa cần vì dataset name hiện không trùng giữa 2 task).
- **`isDatasetStreaming(datasetKey)`** quét toàn bộ key có prefix `datasetKey::` để biết có target nào của dataset đó đang stream — phục vụ chấm xanh trên Sidebar. Đã test: chấm xanh giữ nguyên khi chuyển sang dataset khác trong lúc đang stream (xem mục 8.4) — **đúng chủ đích**: giống hành vi AD, chuyển dataset KHÔNG dừng stream nền.
- **Không dùng `window[...]`** để expose hàm reset zoom như `EChart.jsx` cũ — `ForecastChart` dùng `forwardRef` + `useImperativeHandle`, `ForecastChartPanel` giữ `chartRef` và gọi `chartRef.current.resetZoom()` trực tiếp.

### Lifecycle `startReplay()`

1. Guard: cần cả `activeDataset` + `activeTarget`; không start nếu đang `historical`/`forecast`.
2. Reset state key về rỗng (giống `clearBoth()` trước `startBoth()` của AD).
3. Mở `createHistoricalStream(dataset, target)`, lắng nghe:
   - `source.onmessage` (⚠️ **event mặc định, không phải `addEventListener('point', ...)`** như AD — đây là khác biệt convention quan trọng nhất giữa 2 backend, đã nêu trong spec mục 6 và xác nhận đúng khi test).
   - `source.addEventListener('complete', ...)` → đóng historical stream, **tự gọi `runForecastPhase()`** để mở `createForecastComparisonStream`.
   - `source.onerror` → đóng stream, `phase = 'done'`, status báo lỗi kết nối.
4. `runForecastPhase()` lặp lại đúng pattern trên cho stream thứ 2, kết thúc bằng `phase = 'done'`.

## 5. `ForecastChart` — vẽ 192 điểm trên 1 trục thời gian

- Trục X là **`category`** (giống `EChart.jsx` của AD), dữ liệu là **chuỗi `timestamp` thô từ server, không parse thành `Date`**. Đây là quyết định kỹ thuật chủ động để né toàn bộ vấn đề "timestamp không đồng nhất format giữa các dataset" mà spec BE cảnh báo ở mục 5.1 (đặc biệt `exchange_rate` dùng format `"YYYY/M/D H:mm"` không chuẩn ISO) — vì trục `category` chỉ cần chuỗi làm nhãn, không cần parse ngày giờ, nên **không cần thêm thư viện `dayjs`/`date-fns`**.
- 3 series, dùng `padSeries()` để chèn `null` vào phần không thuộc về mình (`Historical` chỉ có giá trị ở 96 điểm đầu, `Actual (Comparison)`/`Forecast` chỉ có giá trị ở 96 điểm sau) — ECharts tự ngắt line tại `null`, tạo đúng hiệu ứng "nửa trái là quá khứ, nửa phải là so sánh dự báo".
- `markLine` gắn vào series cuối cùng, neo tại `historicalLabels[historicalLabels.length - 1]` (giá trị category chính xác, không dùng index) — label "Forecast starts".
- Màu cố định (không dùng `utils/colors.js` theo index như AD vì chỉ có 3 series cố định ý nghĩa, không phải N feature động): xanh dương `#2563eb` (lịch sử, đồng bộ màu AD), xám `#1f2937` (ground truth), tím `#7e22ce` (dự báo — đồng bộ màu accent của tab Forecasting trong `TaskSwitcher`).

## 6. `TargetSelector` — khác `FeatureFilterDropdown` ở bản chất

Đã phân tích kỹ trước khi code (xem lịch sử trao đổi): `FeatureFilterDropdown` của AD là **filter client-side** (ẩn/hiện series đã có sẵn trong bộ nhớ, multi-select, không gọi lại API). `TargetSelector` tái dùng *hình dạng UI* (overlay + panel + list cuộn) nhưng bản chất là **tham số server-side** (single-select, đổi target = đổi `replayStateRef` key = phải Start lại từ đầu).

- Chỉ hiện ô search khi `targets.length > 12` — đủ dùng cho `ETTm1`(7)/`exchange_rate`(8)/`weather`(21), kích hoạt tự động cho `electricity`(321)/`traffic`(862) đúng khuyến nghị spec mục 3.
- Việc build URL dùng `URLSearchParams` (trong `forecastApi.js`) **tự động percent-encode** giá trị `target` — thỏa đúng yêu cầu checklist của spec ("luôn `encodeURIComponent()` trước khi gắn vào query string") mà **không cần gọi `encodeURIComponent()` thủ công ở từng nơi gọi**, giảm rủi ro quên encode khi có thêm endpoint mới sau này.

## 7. ⚠️ Lỗi CSS phát hiện khi test (chưa sửa — cần quyết định)

Khi test bằng Playwright (mục 8), phát hiện: overlay đóng dropdown (`position: fixed; inset: 0`) của **cả `TargetSelector` lẫn `FeatureFilterDropdown` (AD, có từ trước)** không che được vùng `Sidebar` khi click tại toạ độ nằm trong Sidebar — `document.elementFromPoint()` trả về phần tử trong Sidebar thay vì overlay.

**Nguyên nhân**: `.main-content` (`App.css`) có `position: relative; z-index: 10`, tạo **stacking context riêng**. Overlay `position:fixed` là con cháu của `.main-content` nên bị giới hạn stacking context trong đó, không "thoát" ra để đè lên `.sidebar` (`.sidebar` có `z-index:20` nhưng **không có `position`** nên z-index đó vô hiệu — thứ tự vẽ giữa 2 khối do stacking context của `.main-content` quyết định, không theo z-index số lớn hơn thắng như kỳ vọng).

**Ảnh hưởng thực tế**: nhỏ — người dùng chỉ gặp nếu click đúng vùng Sidebar trong khi dropdown đang mở (phần lớn thao tác click ra ngoài đều rơi vào `.main-content`, đóng dropdown bình thường — đã xác nhận qua test mục 8.2/8.3). Không phải lỗi tôi gây ra mới cho Forecasting, mà là lỗi **có sẵn trong pattern overlay của AD**, Forecasting chỉ kế thừa.

**Chưa sửa vì**: nằm ngoài phạm vi "code tính năng Forecasting" được giao, và sửa đúng cách (bỏ `z-index` khỏi `.sidebar` hoặc đổi cách tạo stacking context của `.main-content`) cần test lại toàn bộ tương tác click-outside của cả `FeatureFilterDropdown` lẫn `TargetSelector` để chắc không hồi quy. Đề xuất xử lý trong một lần sửa riêng, có thể gộp cả 2 dropdown.

## 8. Kết quả kiểm thử thực tế (Playwright, chạy với backend thật `localhost:8000`)

Đã chạy `npm run build` (qua) + khởi động `npm run dev`, dùng Playwright (Chromium headless) điều khiển trình duyệt thật, **không mock dữ liệu** — backend Forecasting đã chạy sẵn ở `localhost:8000` tại thời điểm test.

| # | Kịch bản | Kết quả |
| :-: | :--- | :--- |
| 8.1 | Load app → tab Forecast → `GET /datasets` | Danh sách 5 dataset tải đúng `display_name` tiếng Việt từ spec (`ETTm1 - Electricity Transformer Temperature (15 phút/điểm)`...). 0 console error. |
| 8.2 | Chọn dataset `ETTm1` → mở `TargetSelector` | 7 cột đúng spec (`HUFL`...`OT`), `OT` được highlight làm mặc định. `GET /metadata` trả đúng field (`Autoformer`, `BiHyPE`, `CPU`, `MAE 0.4836`, `MSE 0.3149`...). |
| 8.3 | Bấm "Start Streaming", đợi 7s | Status `"Streaming historical data..."`, `Pts: 15/192`, chart vẽ đúng đường xanh dương theo timestamp thật (`2018-06-25 20:00:00`...). |
| 8.3 | Đợi tiếp tới giây 32 | **Tự động chuyển pha**: status `"Streaming forecast comparison..."`, `Pts: 96/192`, `markLine "Forecast starts"` xuất hiện đúng mốc, 2 đường mới (xám + tím nét đứt) nối tiếp đường xanh. |
| 8.4 | Đang stream `ETTm1`, chuyển sang dataset `Exchange Rate` | Chấm xanh streaming vẫn hiện ở `ETTm1` trong Sidebar dù không còn active — xác nhận stream nền không bị huỷ khi đổi dataset, đúng thiết kế. |
| 8.5 | Quay lại `ETTm1`, bấm "Stop Streaming" | Status → `"Stopped manually"`. |
| 8.6 | Bấm "Clear Data" | `Pts: 0/192`, chart rỗng trở lại. |

**Console error trong toàn bộ 6 kịch bản trên: 0.**

## 9. Hướng mở rộng tiếp theo

- **Imputation**: lặp lại đúng pattern đã dùng ở đây (`api/imputationApi.js`, `hooks/useImputationController.js`, `components/Imputation*`) khi có spec BE tương ứng — xem khung sẵn trong `MULTI_TASK_ARCHITECTURE.md` mục 6.
- **Lỗi z-index overlay** (mục 7) nên được xử lý trong 1 lần sửa riêng, dùng chung cho cả `FeatureFilterDropdown` và `TargetSelector`.
- **Đa target cùng lúc** (overlay nhiều đường dự báo): spec hiện chỉ nhận 1 `target`/lần gọi — muốn hỗ trợ sẽ cần nhiều `EventSource` song song, không nằm trong phạm vi hiện tại, cân nhắc nếu có nhu cầu thực tế.
- **`metadataStatus === 'idle'`** ban đầu chưa có loading rõ ràng trước lần chọn dataset đầu tiên — chấp nhận được vì `MetadataGrid` đã tự hiện "Loading..." khi `items === null`.
