# Kiến trúc Multi-Task (Anomaly Detection / Forecasting / Imputation)

> Tài liệu kỹ thuật — ghi lại thay đổi mở rộng kiến trúc frontend từ ứng dụng đơn bài toán (Anomaly Detection) sang ứng dụng đa bài toán cho dữ liệu time-series.
> Ngày thực hiện: 2026-10-05. Đọc cùng với [`FEATURES.md`](../FEATURES.md) (mô tả chức năng hiện có trước khi mở rộng).

## 1. Bối cảnh & Mục tiêu

Trước thay đổi này, frontend chỉ phục vụ **một** bài toán: Anomaly Detection (phát hiện bất thường), với 2 luồng SSE streaming song song (API 2 — Live Telemetry, API 3 — Anomaly Detection evaluate).

Định hướng mới của sản phẩm: hỗ trợ tổng cộng **3 bài toán lớn** trên dữ liệu time-series:

1. **Anomaly Detection** — đã có backend, đang hoạt động đầy đủ.
2. **Forecasting** — dự báo giá trị tương lai. **Chưa có backend endpoint.**
3. **Imputation** — điền giá trị bị thiếu. **Chưa có backend endpoint.**

Yêu cầu khi thực hiện: chuẩn bị UI sẵn sàng cho cả 3 bài toán, **giữ nguyên bố cục/UI-UX hiện có** (sidebar bên trái + main content bên phải), và không giả lập dữ liệu giả cho 2 bài toán chưa có API — thay vào đó hiển thị trạng thái "Coming soon" rõ ràng.

## 2. Thay đổi kiến trúc tổng quan

Đã thêm một **lớp điều hướng theo "task" (bài toán)** nằm phía trên lớp "dataset" đã có sẵn:

```
Trước:  Sidebar(datasets) → main(dataset-view: toolbar + 2 chart panel)

Sau:    Sidebar(TaskSwitcher → datasets theo task) → main(
            task chưa available → ComingSoonScreen
            task available, chưa chọn dataset → WelcomeScreen
            task available, đã chọn dataset → dataset-view (như cũ, không đổi)
        )
```

Toàn bộ logic streaming/evaluate/chart hiện có của Anomaly Detection **giữ nguyên 100%** — chỉ bọc thêm một điều kiện render ở cấp cao nhất trong `App.jsx`.

## 3. File mới

### 3.1. `src/config/tasks.js`
Nguồn khai báo duy nhất (single source of truth) cho danh sách bài toán. Mỗi task gồm:

```js
{
  id: 'anomaly-detection' | 'forecasting' | 'imputation',
  label: string,        // tên đầy đủ, hiển thị ở ComingSoonScreen, tooltip
  shortLabel: string,   // tên rút gọn, hiển thị trên tab TaskSwitcher
  description: string,  // mô tả ngắn, dùng cho tooltip + ComingSoonScreen
  available: boolean,   // cờ bật/tắt — true khi backend đã sẵn sàng
}
```

`DEFAULT_TASK_ID` = task đầu tiên trong mảng (`anomaly-detection`) — dùng làm giá trị khởi tạo `activeTaskId` trong `App.jsx`.

**Đây là điểm bật/tắt duy nhất khi một bài toán mới có backend** (xem mục 6).

### 3.2. `src/components/TaskSwitcher/`
Component thuần hiển thị (presentational), không chứa state riêng. Nhận `tasks`, `activeTaskId`, `onSelectTask` từ `Sidebar` (truyền xuyên từ `App.jsx`). Render 3 tab dạng segmented control, mỗi tab:
- Có `data-task={task.id}` để CSS style theo màu accent riêng từng task (xanh dương = anomaly, tím = forecasting, xanh lá = imputation).
- Hiện badge **"Soon"** nếu `task.available === false`.
- `title={task.description}` làm tooltip.

Đặt trong `Sidebar`, ngay dưới header, phía trên danh sách dataset — không thêm thanh điều hướng mới ở cấp layout để giữ nguyên bố cục 2 cột hiện có.

### 3.3. `src/components/ComingSoonScreen/`
Component hiển thị thay thế `WelcomeScreen`/`dataset-view` khi `activeTask.available === false`. Nhận prop `task` (object từ `tasks.js`), hiển thị icon đồng hồ, badge "Coming soon", `task.label`, `task.description`, và dòng ghi chú "This module will be enabled once its backend API is available."

Không gọi API, không có state — là "dead end" an toàn, tránh người dùng thao tác vào luồng chưa tồn tại.

## 4. File đã sửa

### 4.1. `src/App.jsx`
- Thêm state `activeTaskId` (khởi tạo bằng `DEFAULT_TASK_ID`).
- Thêm `activeTask = TASKS.find(t => t.id === activeTaskId)`.
- Thêm handler `selectTask(taskId)`: set `activeTaskId` + đóng dropdown filter feature đang mở (nếu có).
- Render `<Sidebar>` với 3 prop mới: `tasks`, `activeTaskId`, `onSelectTask`.
- Điều kiện render trong `<main>` đổi từ:
  ```jsx
  {!activeDataset ? <WelcomeScreen /> : (...)}
  ```
  thành:
  ```jsx
  {!activeTask.available ? <ComingSoonScreen task={activeTask} />
    : !activeDataset ? <WelcomeScreen />
    : (...)}
  ```

**Quan trọng — hành vi state khi chuyển task:** `activeDataset`, `infos`, `errors`, và đặc biệt `datasetsStateRef` (chứa toàn bộ dữ liệu stream/evaluate đang chạy) **không bị reset** khi đổi `activeTaskId`. Nghĩa là nếu người dùng đang stream dataset ở Anomaly Detection rồi bấm sang tab Forecasting (Coming Soon) rồi quay lại, stream vẫn tiếp tục chạy nền và dữ liệu không mất — đúng theo hành vi đa-dataset đã có từ trước (xem `FEATURES.md` mục 3.1).

### 4.2. `src/components/Sidebar/Sidebar.jsx` + `.css`
- Nhận thêm prop `tasks`, `activeTaskId`, `onSelectTask`, truyền xuống `TaskSwitcher`.
- Thêm section "Task" (chứa `TaskSwitcher`) giữa header và "Select Dataset".
- Danh sách dataset (`DATASETS` — vẫn hard-code `['2Dgesture', 'MSL']`) chỉ render khi `activeTask.available === true`. Khi task chưa available, thay bằng đoạn placeholder: *"{task.label} datasets will appear here once the backend API is ready."*
- CSS mới: `.sidebar__section-title--spaced`, `.sidebar__placeholder`.

## 5. Quy ước thiết kế (design conventions)

- **Màu accent theo task** (chỉ áp dụng cho tab active trong `TaskSwitcher`, dùng token sẵn có trong `tokens.css`):
  - Anomaly Detection → `--color-blue-*`
  - Forecasting → `--color-purple-*`
  - Imputation → `--color-green-*` (riêng nền badge dùng `rgba(34, 197, 94, 0.12)` vì chưa có token `--color-green-50`)
- **Badge "Soon"** là tín hiệu UI duy nhất cho biết task chưa khả dụng — áp dụng nhất quán ở cả `TaskSwitcher` (tab) và `ComingSoonScreen` (trang chính).
- Không thêm route/URL riêng cho từng task (ứng dụng vẫn là single-view, chuyển task chỉ là state trong React, không có React Router).

## 6. Hướng dẫn: bật một bài toán mới khi có backend thật

Khi backend cung cấp API cho **Forecasting** hoặc **Imputation**, thực hiện theo thứ tự:

1. **`src/config/tasks.js`** — đổi `available: false` → `true` cho task tương ứng. (Nếu chưa làm các bước dưới, UI sẽ render ra `dataset-view` cũ với nội dung sai — nên làm bước này **sau cùng**, không phải đầu tiên.)

2. **Tầng API** — tạo file API riêng theo mẫu `src/api/datasetApi.js` (ví dụ `src/api/forecastApi.js`), vì endpoint/tham số chắc chắn khác (ví dụ cần thêm `horizon` cho forecasting, `maskRatio` cho imputation). **Không dùng chung `datasetApi.js`** để tránh một file API gánh nhiều domain không liên quan.

3. **Danh sách dataset theo task** — hiện `DATASETS` trong `Sidebar.jsx` là mảng phẳng dùng chung cho mọi task. Khi có task thứ 2 với dataset thật, cần tách thành map theo task, ví dụ:
   ```js
   const DATASETS_BY_TASK = {
     'anomaly-detection': ['2Dgesture', 'MSL'],
     'forecasting': [...],
   };
   ```
   rồi `Sidebar` đọc `DATASETS_BY_TASK[activeTaskId]` thay vì hằng số cũ.

4. **⚠️ Cảnh báo key trùng trong `datasetsStateRef`** — state streaming hiện được lưu theo **key = tên dataset**, không kèm `taskId` (`datasetsStateRef.current[datasetName]`). Nếu Forecasting/Imputation dùng lại tên dataset trùng với Anomaly Detection (rất có khả năng, vì cùng nguồn dữ liệu `MSL`, `2Dgesture`...), state của 2 task sẽ **ghi đè lẫn nhau**. Trước khi bật task thứ 2, phải đổi key thành dạng tổ hợp, ví dụ `` `${activeTaskId}:${datasetName}` ``, trong toàn bộ `App.jsx` (`initDatasetState`, `fetchInfo`, `selectDataset`, `startStream`, `startEvaluate`, `stopStreamType`, `clearData`) và chỗ đọc `isStreaming` trong `Sidebar.jsx`.

5. **UI chart/toolbar riêng cho task mới** — `DatasetToolbar` và `ChartPanel` hiện đang gắn cứng với khái niệm Anomaly Detection (label "API 3 Model", tiêu đề panel "Anomaly Detection (API 3)" / "Live Telemetry (API 2)", danh sách model `availableModels`). Forecasting/Imputation nhiều khả năng cần bố cục chart khác (ví dụ 1 chart với vùng dự báo tô màu, thay vì 2 chart song song). Hướng khuyến nghị: tạo component `dataset-view` riêng cho từng task (ví dụ `ForecastingView.jsx`) thay vì cố tổng quát hoá `DatasetToolbar`/`ChartPanel` hiện tại — tránh làm phức tạp component đang chạy ổn định cho Anomaly Detection. Trong `App.jsx`, nhánh render theo `activeTaskId` để chọn đúng view.

## 7. Giới hạn hiện tại (chưa xử lý trong lần thay đổi này)

- `DATASETS` trong `Sidebar.jsx` vẫn dùng chung cho mọi task (xem mục 6.3) — chấp nhận được vì 2 task còn lại đang ở trạng thái Coming Soon, không hiển thị danh sách này.
- Chưa có cơ chế lưu `activeDataset` **riêng theo từng task** (ví dụ nhớ dataset cuối cùng đã chọn ở mỗi task) — hiện `activeDataset` là state dùng chung, nhưng không gây lỗi vì chỉ Anomaly Detection có dataset-view thật.
- Chưa có test (unit/e2e) cho `TaskSwitcher`/`ComingSoonScreen` — dự án hiện không có test suite nói chung (xem `FEATURES.md` mục 5).
