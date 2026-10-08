# TSAD Monitor Frontend — Tổng hợp chức năng

> Tài liệu này tổng hợp các chức năng/tính năng hiện có của frontend trong thư mục `frontend/`, dựa trên mã nguồn thực tế tại thời điểm viết (2026-10-05).

## 1. Tổng quan

- **Tên ứng dụng**: TSAD Monitor (Time Series Anomaly Detection Monitor)
- **Mục đích**: Giao diện trực quan hoá dữ liệu chuỗi thời gian (sensor/telemetry) theo thời gian thực, phát hiện bất thường (anomaly detection), và đánh giá kết quả dự đoán của các mô hình ML.
- **Stack công nghệ**:
  - React 18.3 (function components + hooks, không dùng state management library ngoài)
  - Vite 5 (dev server/build tool)
  - ECharts 5.5 (`echarts`) để vẽ biểu đồ
  - Thuần CSS theo từng component (BEM-like naming), có `tokens.css` và `global.css` dùng chung
  - Không có router — chỉ là single-view app
  - Không có test suite, không có TypeScript (JS/JSX thuần)

## 2. Cấu trúc thư mục

```
src/
├── api/
│   └── datasetApi.js        # Lớp giao tiếp với backend (REST + SSE)
├── components/
│   ├── Sidebar/              # Danh sách dataset, chọn dataset active
│   ├── WelcomeScreen/        # Màn hình chào khi chưa chọn dataset
│   ├── DatasetToolbar/       # Thanh công cụ: chọn model, start/stop/clear, filter feature
│   ├── MetadataGrid/         # Hiển thị metadata của dataset (shape, dtype, anomaly %...)
│   ├── FeatureFilterDropdown/# Dropdown chọn hiển thị/ẩn từng feature trên biểu đồ
│   ├── ChartPanel/           # Khung chứa 1 biểu đồ (header + status + chart)
│   └── EChart/                # Wrapper ECharts, vẽ line chart streaming
├── utils/
│   └── colors.js             # Sinh màu HSL riêng biệt cho từng feature
├── styles/
│   ├── global.css
│   └── tokens.css
├── App.jsx                   # Component gốc, quản lý toàn bộ state ứng dụng
└── main.jsx                  # Entry point React
```

## 3. Chức năng chính

### 3.1. Chọn Dataset (Sidebar)
- Danh sách dataset cố định (hard-code): `2Dgesture`, `MSL`.
- Click để chọn dataset làm "active dataset".
- Hiển thị **chấm nhấp nháy (streaming dot)** bên cạnh dataset đang có stream/evaluate chạy ngầm, kể cả khi không phải dataset đang active — cho biết dataset đó vẫn đang chạy nền.
- Dataset đang chọn có icon check và highlight.

### 3.2. Màn hình chào (WelcomeScreen)
- Hiển thị khi chưa chọn dataset nào, hướng dẫn người dùng chọn dataset từ sidebar.

### 3.3. Lấy metadata dataset (MetadataGrid + API)
- Khi chọn 1 dataset, tự động gọi API `GET /api/v1/dataset/{name}/info` để lấy metadata.
- Hiển thị: Datapath, Shape, DType, Length, Dimension, **Anomaly %** (nếu backend trả về).
- Có nút **"Refresh Metadata"** để gọi lại info bất kỳ lúc nào.
- Xử lý lỗi kết nối backend, hiển thị thông báo lỗi riêng cho từng dataset.

### 3.4. Streaming dữ liệu thời gian thực (API 2 — "Live Telemetry")
- Dùng **Server-Sent Events (SSE)** qua `EventSource` tới `GET /api/v1/dataset/{name}/stream`.
- Nhận từng điểm dữ liệu (`point` event) gồm: index, values (nhiều chiều/feature), accuracy (optional).
- Cập nhật biểu đồ theo thời gian thực (throttle update UI mỗi 15 điểm để tối ưu hiệu năng, nhưng chart tự refresh mỗi 100ms qua `requestAnimationFrame`).
- Xử lý sự kiện `complete` (kết thúc luồng) và `onerror` (lỗi/mất kết nối).
- Đếm số điểm dữ liệu đã nhận (points).

### 3.5. Đánh giá mô hình dự đoán (API 3 — "Anomaly Detection")
- Dùng SSE tới `GET /api/v1/dataset/{name}/evaluate?model={model}`.
- Cho phép chọn model trước khi chạy: `isolation-forest-v1`, `autoencoder`, `lstm` (danh sách hard-code trong `datasetApi.js`).
- Tương tự stream: nhận điểm dữ liệu + accuracy theo thời gian thực, vẽ biểu đồ riêng.
- Dropdown chọn model bị disable khi đang evaluate.

### 3.6. Điều khiển Start/Stop/Clear đồng thời cho cả 2 luồng
- **Start Streaming**: xoá dữ liệu cũ và khởi chạy đồng thời cả stream (API 2) và evaluate (API 3).
- **Stop Streaming**: dừng cả 2 EventSource đang chạy (đóng kết nối SSE).
- **Clear Data**: xoá dữ liệu đã nhận (labels, values, accuracies) của cả 2 loại, reset trạng thái.
- Trạng thái streaming được lưu theo **từng dataset riêng biệt** (qua `useRef` dạng map `{ [datasetName]: {...} }`), nên có thể chuyển qua lại giữa các dataset mà không mất dữ liệu/trạng thái đang stream của dataset khác (stream chạy nền kể cả khi không active).

### 3.7. Biểu đồ trực quan (ChartPanel + EChart)
- Mỗi dataset có 2 panel biểu đồ: "Anomaly Detection (API 3)" và "Live Telemetry (API 2)".
- Mỗi panel hiển thị:
  - Tiêu đề + trạng thái hiện tại (status text, có animation pulse khi đang streaming, màu đỏ khi lỗi).
  - Số điểm dữ liệu đã nhận (Pts).
  - Nút **Reset Zoom** để đưa biểu đồ về zoom mặc định (0–100%).
- Biểu đồ dùng ECharts line chart:
  - Mỗi feature là 1 đường line với màu riêng biệt (sinh tự động qua golden-angle HSL — `utils/colors.js`).
  - Tooltip tuỳ chỉnh: trục theo "axis", sắp xếp giá trị theo độ lớn tuyệt đối giảm dần, làm mờ giá trị = 0.
  - Trục X: category theo index/thời gian; trục Y: giá trị cảm biến.
  - Hỗ trợ **zoom/pan** (dataZoom: inside + slider).
  - **Accuracy Bands**: tô nền vùng biểu đồ (markArea) theo mã màu dựa trên giá trị accuracy từng đoạn (0 = trong suốt, 1 = xanh dương, 2 = vàng, 3 = đỏ) — dùng để biểu diễn trực quan độ chính xác dự đoán/nhãn theo thời gian.
  - Resize tự động theo kích thước container (ResizeObserver).
  - Cập nhật realtime không animation (animation: false) để tránh giật khi dữ liệu đổ về liên tục.

### 3.8. Lọc hiển thị Feature (FeatureFilterDropdown)
- Dropdown cho phép bật/tắt hiển thị từng feature (cột dữ liệu) trên biểu đồ.
- Nút "All" / "None" để chọn tất cả/bỏ chọn tất cả.
- Mỗi feature có chấm màu tương ứng với màu trên biểu đồ.
- Mặc định khi chọn dataset: tự động hiện tối đa 5 feature đầu tiên (nếu dataset có nhiều hơn 5 chiều).
- Trạng thái filter được lưu riêng theo từng dataset.

## 4. Giao tiếp Backend (API Layer — `src/api/datasetApi.js`)

| Hành động | Phương thức | Endpoint |
|---|---|---|
| Lấy metadata dataset | REST `GET` | `/api/v1/dataset/{name}/info` |
| Stream dữ liệu thô | SSE | `/api/v1/dataset/{name}/stream` |
| Stream kết quả đánh giá mô hình | SSE | `/api/v1/dataset/{name}/evaluate?model={model}` |

- `API_BASE_URL` hard-code: `http://localhost:8080/api/v1/dataset` (chưa dùng biến môi trường `.env`).
- Danh sách model và danh sách dataset đều hard-code phía frontend (không gọi API để lấy động).

## 5. Những điểm còn hạn chế / chưa có (nhận xét khách quan)

- Không có file `.env`/biến môi trường cho `API_BASE_URL` → khó deploy production.
- Danh sách dataset (`2Dgesture`, `MSL`) và model (`isolation-forest-v1`, `autoencoder`, `lstm`) đang hard-code, không lấy động từ backend.
- Không có xử lý reconnect tự động khi SSE bị rớt kết nối (chỉ set status "Connection Error").
- Không có unit test / e2e test.
- Không có TypeScript, không có ESLint/Prettier config thấy trong thư mục (cần kiểm tra thêm nếu có).
- Không có routing — chỉ 1 view duy nhất, phù hợp cho POC/demo.
- `window[resetEChartZoom_${type}]` gán hàm global trên `window` — cách làm chưa tối ưu (có thể thay bằng ref/callback), nhưng hoạt động được cho mục đích hiện tại.

## 6. Scripts

```bash
npm run dev       # Chạy dev server (Vite)
npm run build     # Build production
npm run preview   # Preview bản build
```

## 7. Dependencies chính

- `react` ^18.3.1, `react-dom` ^18.3.1
- `echarts` ^5.5.0
- Dev: `vite` ^5.4.8, `@vitejs/plugin-react` ^4.3.1
