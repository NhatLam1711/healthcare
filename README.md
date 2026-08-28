# Dataset API — Healthcare AI Project

Project gồm 3 endpoint, đọc dữ liệu `.npy` trực tiếp từ Google Drive (qua link
chia sẻ), dùng tên dataset làm định danh.

| API | Method | Endpoint | Chức năng |
|---|---|---|---|
| 1 | GET | `/api/v1/dataset/{name}/info` | Thông tin dataset: dimension, length, %anomaly |
| 2 | GET | `/api/v1/dataset/{name}/stream` | Stream dữ liệu thô (SSE): `index`, `values` |
| 3 | GET | `/api/v1/dataset/{name}/evaluate?model={modelId}` | Giống API 2 nhưng có thêm so sánh với model đã chọn: `index`, `values`, `accuracy` |

## Cấu trúc code

```
backend/src/main/java/com/healthai/anomaly/
├── AnomalyDetectionApiApplication.java   # entry point
├── config/
│   ├── DatasetSourceProperties.java      # mapping tên dataset -> link Drive
│   └── RestTemplateConfig.java           # RestTemplate dùng để tải file từ Drive
├── controller/
│   └── DatasetController.java            # 2 API: /info và /stream
├── dto/
│   ├── DatasetInfoDto.java               # response của API 1
│   └── NpyPointDto.java                  # 1 điểm trong response API 2
├── npy/
│   ├── NpyArray.java                     # kết quả parse .npy
│   └── NpyReader.java                    # tự parse .npy bằng Java thuần
└── service/
    ├── GoogleDriveDownloader.java        # tải file từ link chia sẻ Google Drive
    └── RemoteDatasetService.java         # resolve tên dataset -> tải + parse + cache
```

## Cấu hình bắt buộc trước khi chạy

Sửa `backend/src/main/resources/application.yml`:

```yaml
app:
  dataset:
    sources:
      "2Dgesture":
        data-url: "https://drive.google.com/file/d/<FILE_ID_DATA>/view?usp=sharing"
        label-url: "https://drive.google.com/file/d/<FILE_ID_LABEL>/view?usp=sharing"
      "MSL":
        label-url: "https://drive.google.com/file/d/<FILE_ID_MSL_LABEL>/view?usp=sharing"
```

**Bắt buộc:** mỗi file trên Google Drive phải để chế độ chia sẻ
**"Anyone with the link"** — nếu để private, server trả lỗi 502 kèm thông báo rõ ràng.

`label-url` là optional — dataset không có label vẫn dùng được `/info`
(`anomalyPercent` sẽ là `null`) và `/stream` bình thường.

## Chạy project

```bash
cd backend
mvn spring-boot:run
```
Server chạy ở `http://localhost:8080`.

## API 1: GET /api/v1/dataset/{name}/info

Ví dụ: `GET http://localhost:8080/api/v1/dataset/2Dgesture/info`

Response:
```json
{
  "datapath": "2Dgesture",
  "shape": [2800, 2],
  "dtype": "<f8",
  "length": 2800,
  "dimension": 2,
  "anomalyPercent": 26.04
}
```

- `length` = số điểm (rows) trong file test
- `dimension` = số chiều mỗi điểm (2 cho x,y; N cho N chiều bất kỳ)
- `anomalyPercent`: lấy **cột cuối cùng của file label**, tính
  `Sum(giá trị == 1) / (Sum(==1) + Sum(==0)) * 100`

Query param optional: `?refresh=true` — bỏ qua cache, tải lại từ Drive.

## API 2: GET /api/v1/dataset/{name}/stream

Stream dữ liệu thô, **không so sánh model**.

Ví dụ: `GET http://localhost:8080/api/v1/dataset/2Dgesture/stream?intervalMs=20`

- `intervalMs`: khoảng cách giữa các điểm (mặc định 20ms)
- `refresh=true`: bỏ qua cache, tải lại data từ Drive trước khi chạy
- `maxDurationMs`: giới hạn thời lượng stream (mặc định 20000ms) — nếu dataset
  dài, dữ liệu sẽ được downsample (bỏ bớt điểm) để vừa khoảng thời gian này

```
event: point
id: 0
data: {"index":0,"values":[196.37467,394.45875]}
```

Kết thúc, server gửi 1 event `complete` duy nhất — frontend **bắt buộc lắng
nghe event này** để tự đóng `EventSource` (nếu không, `EventSource` sẽ tự
động reconnect vô hạn khi server đóng kết nối).

## API 3: GET /api/v1/dataset/{name}/evaluate?model={modelId}

Giống hệt API 2 nhưng có thêm so sánh với **1 model AI cụ thể** — bắt buộc
chọn model qua tham số `model` (hệ thống có thể có nhiều model khác nhau).
Thiếu tham số này sẽ trả lỗi `400 Bad Request`.

Ví dụ: `GET http://localhost:8080/api/v1/dataset/2Dgesture/evaluate?model=isolation-forest-v1&intervalMs=20`

- `model` (**bắt buộc**): id của model cần so sánh. API 4 (service model AI
  thật) hiện **CHƯA có** — đang dùng `MockPredictionService` sinh kết quả
  ngẫu nhiên tạm thời, chưa phân biệt hành vi theo từng `model` (mọi model
  đều random như nhau). Xem `service/PredictionService.java` — khi có API 4
  thật, chỉ cần viết class implement interface này (dispatch theo `modelId`
  hoặc gọi sang từng service riêng), không cần sửa `DatasetController`.
- `intervalMs`, `refresh`, `maxDurationMs`: giống API 2

```
event: point
id: 0
data: {"index":0,"values":[196.37467,394.45875],"accuracy":1}
```

- `accuracy`: so sánh nhãn thật (label) với kết quả dự đoán từ model đã
  chọn. "Không đoán" được coi như dự đoán = 0:
  - `null` = dataset chưa có label (không so sánh được), hoặc độ dài label
    không khớp độ dài data
  - `0` = label=0, predicted=0 (đúng — bình thường)
  - `1` = label=1, predicted=1 (đúng — phát hiện đúng bất thường)
  - `2` = label=1, predicted=0 (sai — bỏ sót bất thường)
  - `3` = label=0, predicted=1 (sai — báo động giả)

Kết thúc, server gửi 1 event `complete` duy nhất, giống API 2.

## Cache

Data/label sau khi tải từ Drive lần đầu được cache trong RAM (theo tên dataset),
tránh tải lại mỗi request. Dùng `?refresh=true` khi cần lấy bản mới nhất.

**Giới hạn:** cache in-memory, mất khi restart server; không chia sẻ được
giữa nhiều instance nếu scale ngang.

## Test thử

### PowerShell
```powershell
Invoke-RestMethod -Uri "http://localhost:8080/api/v1/dataset/2Dgesture/info"
```

### Trình duyệt
Dán thẳng URL vào thanh địa chỉ (cả 2 đều là GET):
- `http://localhost:8080/api/v1/dataset/2Dgesture/info`
- `http://localhost:8080/api/v1/dataset/2Dgesture/stream`

### Postman
- API 1: GET request bình thường, xem JSON.
- API 2: GET request — Postman bản mới (v10+) tự nhận diện SSE, hiển thị
  từng event đổ về theo thời gian thực.

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| 404 "chưa cấu hình" | Tên dataset không có trong `application.yml` | Kiểm tra đúng tên (phân biệt hoa/thường) trong `sources` |
| 502 "trả về HTML" | File Drive chưa public / link sai | Đổi quyền chia sẻ file thành "Anyone with the link" |
| Stream đứng im lâu | `intervalMs` lớn hoặc dataset dài | Giảm `intervalMs`, hoặc đợi — không phải lỗi |

## Việc cần làm tiếp (gợi ý)
- [ ] Thêm TTL cho cache (hiện cache vĩnh viễn đến khi restart hoặc `refresh=true`)
- [ ] Thêm CORS nếu frontend chạy domain/port khác
- [ ] Retry/backoff khi Google Drive rate-limit hoặc timeout
- [ ] Nếu chuyển sang dữ liệu bệnh nhân thật: **không nên** để file public dạng
      "anyone with the link" — cần Service Account/OAuth để kiểm soát quyền truy cập.
