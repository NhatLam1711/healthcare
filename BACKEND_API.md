# Backend API — Tài liệu kỹ thuật

Ghi lại những gì đã được thêm vào trong bước dựng backend, để biết hiện trạng
khi cần sửa hoặc mở rộng sau này. Xem thêm [OUTPUT_FORMAT.md](OUTPUT_FORMAT.md)
cho ý nghĩa gốc của các tensor trong file `.pk`.

## 1. Vị trí làm việc hiện tại

- **Không có bước training/inference nào chạy ở đây.** API chỉ đọc lại các
  file `generated_outputs_nsample100.pk` đã có sẵn trong
  `Checkpoint_PE_CSDI/save/<folder>/` — đây là kết quả tác giả đã chạy
  `evaluate()` với trọng số pretrained trên tập test thật.
- Cả 3 dataset đã **active**: `pm25` (82×36×36), `physio` (799×48×35, tên
  feature thật: DiasABP, HR, Na, ...), `electricity` (7×192×370). Xem mục 6.

## 2. Cấu trúc file đã tạo

```
backend/
├── __init__.py       # đánh dấu package, rỗng
├── datasets.py        # registry: tên dataset -> đường dẫn file .pk + tiền tố tên feature
├── loader.py           # đọc pickle, denormalize, tính quantile, build JSON cho từng endpoint
├── schemas.py          # Pydantic models (response schema, hiện trên /docs)
└── main.py             # FastAPI app + định nghĩa route
```

Ngoài ra:
- `requirements.txt`: đã thêm `fastapi`, `uvicorn[standard]`.
- `.venv`: đã cài fastapi 0.142.2, uvicorn 0.54.0.

## 3. Vấn đề kỹ thuật đã xử lý: lỗi load pickle trên máy không có GPU

Các file `.pk` được tác giả lưu khi tensor còn nằm trên CUDA. Khi
`pickle.load()`/`torch.load()` chạy trên máy CPU-only (môi trường hiện tại),
PyTorch ném `RuntimeError: Attempting to deserialize object on a CUDA device`
— kể cả khi gọi `torch.load(path, map_location="cpu")`, vì format pickle cũ
(`_legacy_load`) lồng một lệnh `torch.load` nội bộ **không** truyền
`map_location` xuống.

**Cách xử lý** (trong `backend/loader.py`, hàm `_patch_torch_cpu_load`):
ghi đè `torch.storage._load_from_bytes` để nó luôn gọi `torch.load(...,
map_location="cpu")`. Hàm này tự chạy 1 lần duy nhất khi có request load dữ
liệu đầu tiên (`lru_cache`).

> Nếu sau này đổi sang chạy trên máy có GPU, đoạn patch này vẫn an toàn (chỉ
> ép tensor xuống CPU để phục vụ an toàn cho API, không ảnh hưởng gì khác).

## 4. Luồng xử lý dữ liệu

File `.pk` chứa 7 tensor theo đúng thứ tự (xem OUTPUT_FORMAT.md mục 3):

| Biến | Shape | Ý nghĩa |
|---|---|---|
| `samples` | (N, 100, L, K) | 100 dự đoán cho mỗi điểm, **đã chuẩn hoá (normalized)** |
| `all_target` | (N, L, K) | giá trị thật, đã chuẩn hoá |
| `all_evalpoint` | (N, L, K) | mask: 1 = điểm bị giấu khỏi model, cần dự đoán |
| `all_observed` | (N, L, K) | mask: 1 = có ground truth (given + evalpoint) |
| `scaler`, `mean_scaler` | (K,) | std/mean per-feature để denormalize |

Trong đó `all_given = all_observed - all_evalpoint` (điểm model được nhìn thấy).

`loader.py` thực hiện:
1. `load_raw_output(dataset)` — đọc pickle 1 lần, cache lại (`lru_cache`), trả
   về dict chứa các tensor trên.
2. `get_meta(dataset)` — đọc shape để trả `num_samples/num_timesteps/
   num_features`, sinh tên feature giả định `"{prefix}_{i+1}"` (vì file output
   không lưu tên trạm quan trắc gốc, chỉ có index).
3. `get_real_series(dataset, sample_id, feature_id)` — denormalize
   `all_target`, với từng timestep: nếu `observed==1` → giá trị thật, ngược
   lại → `null` (`type: "missing"`).
4. `get_comparison_series(dataset, sample_id, feature_id)` — denormalize
   `samples`, tính `torch.quantile` theo chiều nsample (dim=1 sau khi đã chọn
   1 feature) để ra `median, lower_90, upper_90, lower_50, upper_50`. Với mỗi
   timestep:
   - `given==1` → `type: "observed"`, `value` = giá trị thật, không có
     `confidence`.
   - `evalpoint==1` → `type: "imputed"`, `value` = median dự đoán,
     `ground_truth` = giá trị thật (để FE so sánh/tính sai số nếu muốn),
     `confidence` = 5 quantile ở trên.
   - còn lại → `type: "missing"`, `value: null` (thật sự không có dữ liệu).

## 5. API Endpoints

Chạy server (mặc định port **8800** — đổi từ 8000 vì trùng port với service
khác trên máy; đổi lại bằng env var `CSDI_API_PORT` nếu cần):
```powershell
.\.venv\Scripts\python.exe -m backend.main
```
Sau đó mở `http://127.0.0.1:8800/docs` để test trực tiếp trên trình duyệt
(Swagger UI do FastAPI tự sinh) — lưu ý Swagger không render được SSE stream,
chỉ dùng để xem schema/tham số; muốn xem stream thật thì dùng `curl -N` hoặc
`EventSource` trong browser (ví dụ ở cuối mục này).

### `GET /api/{dataset}/meta`
Trả thông tin tổng quan để FE biết phạm vi `sample_id`/`feature_id` hợp lệ.
Đây là endpoint JSON thường (không phải SSE).

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

### `GET /api/{dataset}/series/{sample_id}/{feature_id}/real` — SSE
API 1 (giá trị thật) — stream từng điểm ground truth qua
`text/event-stream`, dùng để vẽ đường "giá trị thực tế".

Query param: `interval_ms` (mặc định `200`) — độ trễ giữa 2 điểm, dùng để giả
lập tốc độ đổ dữ liệu "realtime" (data gốc vẫn là tĩnh, đã có sẵn từ trước;
đây chỉ là cách phát lại tuần tự qua SSE, không phải dữ liệu đang được đo
trực tiếp).

Mỗi điểm là 1 event `point`, kết thúc bằng 1 event `done`:
```
event: point
data: {"t": 0, "value": 55.0, "type": "observed"}

event: point
data: {"t": 2, "value": null, "type": "missing"}

event: done
data: {"total": 36}

```

### `GET /api/{dataset}/series/{sample_id}/{feature_id}/full` — SSE
API 2 (giá trị thật + dự đoán) — cùng cơ chế SSE như trên, dùng để FE vẽ chart
so sánh. Cùng query param `interval_ms`.

```
event: point
data: {"t": 0, "value": 55.0, "type": "observed", "ground_truth": null, "confidence": null}

event: point
data: {"t": 12, "value": 14.6246, "type": "imputed", "ground_truth": 10.0, "confidence": {"lower_90": 9.8302, "lower_50": 12.0146, "median": 14.6246, "upper_50": 17.1313, "upper_90": 21.2467}}

event: done
data: {"total": 36}

```

Gợi ý vẽ FE: đường liền cho `observed`, đường nét đứt/điểm khác màu cho
`imputed`, vùng mờ (`lower_90`–`upper_90` hoặc `lower_50`–`upper_50`) cho
khoảng tin cậy, bỏ trống khi `type: "missing"`. Mỗi lần nhận event `point` thì
append vào chart; nhận `done` thì đóng kết nối (`EventSource.close()`).

Ví dụ FE (browser `EventSource`, chỉ hỗ trợ GET, không cần header đặc biệt):
```js
const es = new EventSource("/api/pm25/series/0/0/full?interval_ms=150");
es.addEventListener("point", (e) => {
  const point = JSON.parse(e.data);
  chart.appendPoint(point);
});
es.addEventListener("done", () => es.close());
```

### Lỗi
- Dataset không có trong registry → `404` (JSON thường, lỗi được raise
  **trước khi** stream SSE bắt đầu vì dữ liệu được load xong rồi mới mở
  `StreamingResponse`).
- `sample_id`/`feature_id` ngoài phạm vi → `400`, cùng lý do như trên.
- Client đóng kết nối giữa stream (đóng tab, mất mạng) → server tự dừng gửi
  nhờ `request.is_disconnected()` được check trước mỗi điểm, không bị leak
  loop chạy vô ích.

### Lưu ý khi đổi `response_model`
Hai route `/real` và `/full` không còn dùng Pydantic `response_model` nữa
(SSE không phải JSON body đơn, FastAPI/OpenAPI không mô tả được). `schemas.py`
(`RealPoint`, `ComparisonPoint`) vẫn giữ lại chỉ để làm tài liệu tham khảo cho
đúng shape của phần `data:` trong mỗi event `point`.

## 6. Dataset registry (`backend/datasets.py`)

Cả 3 dataset đều đã đăng ký trong `DATASET_REGISTRY`, route tham số hoá theo
`{dataset}` nên không cần sửa `loader.py`/`main.py` khi thêm dataset mới —
chỉ cần thêm 1 entry mới (output_pk + feature_prefix hoặc feature_names).

| dataset | num_samples | num_timesteps | num_features | tên feature |
|---|---|---|---|---|
| `pm25` | 82 | 36 | 36 | generic `Station_1..36` (file output không lưu tên trạm gốc) |
| `physio` | 799 | 48 | 35 | tên thật (`feature_names` trong registry): DiasABP, HR, Na, Lactate, NIDiasABP, PaO2, WBC, pH, Albumin, ALT, Glucose, SaO2, Temp, AST, Bilirubin, HCO3, BUN, RespRate, Mg, HCT, SysABP, FiO2, K, GCS, Cholesterol, NISysABP, TroponinT, MAP, TroponinI, PaCO2, Platelets, Urine, NIMAP, Creatinine, ALP |
| `electricity` | 7 | 192 | 370 | generic `Client_1..370` (dataset gốc ẩn danh, không có tên thật) |

**Lưu ý kỹ thuật phát sinh khi enable physio:** `scaler`/`mean_scaler` của
physio là **scalar** (`1`, `0`), không phải tensor per-feature như pm25/
electricity (physio không cần denormalize). `loader.py` xử lý qua helper
`_feature_scaler()` — tự nhận biết scalar vs tensor bằng `hasattr(x,
"__getitem__")` trước khi index theo `feature_id`. Nếu thêm dataset mới có
cùng kiểu scalar scaler, không cần sửa gì thêm, helper này tự handle.

Lưu ý thêm: physio/electricity có N hoặc K lớn hơn pm25 nhiều (electricity:
370 feature, physio: 799 sample) — payload JSON/SSE sẽ dài hơn, nên cân nhắc
phân trang nếu FE load chậm.

## 7. Việc chưa làm (cố ý bỏ qua ở bước này)

- Chưa có tên feature thật cho pm25 (trạm cụ thể) và electricity (khách hàng
  cụ thể) — pm25 dùng tên generic `Station_N` vì file output không lưu tên
  cột gốc từ CSV; electricity dùng `Client_N` vì dataset gốc vốn ẩn danh.
  physio thì đã có tên thật (xem mục 6).
- Chưa có endpoint liệt kê nhiều feature/sample cùng lúc (so sánh nhiều
  trạm) — hiện chỉ lấy 1 sample + 1 feature mỗi lần gọi theo đúng phạm vi
  yêu cầu ban đầu.
- CORS hiện mở `allow_origins=["*"]` (xem mục 9) — đủ dùng cho dev local, nên
  siết lại thành domain thật của FE trước khi deploy công khai.

## 8. Test bằng Postman

Thư mục `postman/` chứa:
- `CSDI_Imputation_API.postman_collection.json` — 11 request, chia theo
  folder `Meta`, `pm25`, `physio`, `electricity`, `Errors`.
- `CSDI_Local.postman_environment.json` — biến `baseUrl =
  http://127.0.0.1:8800`.

**Import:** Postman → File → Import → chọn cả 2 file (hoặc kéo-thả vào cửa
sổ Postman) → chọn environment "CSDI Local" ở dropdown trên-phải trước khi
gửi request.

**Trước khi test:** phải chạy server trước (`.venv\Scripts\python.exe -m
backend.main`), nếu đổi port (env var `CSDI_API_PORT`) thì sửa lại giá trị
`baseUrl` trong environment cho khớp.

**Lưu ý khi test 2 endpoint SSE (`/real`, `/full`):** Postman không stream
hiển thị từng event theo thời gian thực (gửi request bình thường), nhưng vì
stream có kết thúc (kết bằng event `done`) nên Postman vẫn nhận đủ và hiển
thị toàn bộ nội dung `event: point / data: {...}` nối tiếp nhau trong phần
Response Body — đủ để kiểm tra dữ liệu đúng hay không, chỉ là không thấy hiệu
ứng "chạy dần" như trên browser `EventSource`. Các request mẫu đã set
`interval_ms` nhỏ (20–50ms) để không phải chờ lâu khi test.

Mỗi request trong collection đã ghi sẵn ý nghĩa `sample_id`/`feature_id`
dùng (ví dụ physio dùng `feature_id=1` = HR) trong phần "description" — xem ở
tab Description khi mở request trong Postman.

## 9. Port & CORS

- **Port mặc định đã đổi từ 8000 → 8800** (`backend/main.py`, hằng
  `DEFAULT_PORT`) vì 8000 trùng với 1 service khác đang chạy trên máy dev.
  Override bằng biến môi trường `CSDI_API_PORT` nếu 8800 cũng bị trùng, ví
  dụ PowerShell: `$env:CSDI_API_PORT=9000; .\.venv\Scripts\python.exe -m
  backend.main`. Biến này chỉ có tác dụng khi chạy qua `python -m
  backend.main`; nếu chạy bằng `uvicorn backend.main:app --port <n>` thì
  `--port` của uvicorn mới là cái quyết định, `DEFAULT_PORT` bị bỏ qua.
- **CORS đã bật** (`CORSMiddleware` trong `backend/main.py`) với
  `allow_origins=["*"]`, `allow_credentials=False`, `allow_methods=["GET"]`
  (API hiện chỉ có GET). Đủ cho FE dev ở bất kỳ origin/port nào gọi thẳng
  trong môi trường local, không cần proxy. Trước khi deploy ra ngoài thật,
  nên đổi `allow_origins=["*"]` thành domain cụ thể của FE để tránh mọi
  origin bất kỳ gọi được API.
