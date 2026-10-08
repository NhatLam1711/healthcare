# Khái niệm: Luồng từ Dataset → Dự đoán → API → Frontend

Tài liệu này giải thích **bản chất bài toán Time-Series Imputation** trong
project — cụ thể là phân biệt 2 khái niệm hay bị nhầm lẫn:
1. "Toàn bộ dataset nhiều sample" dùng để làm gì,
2. "Giá trị dự đoán trung bình" là trung bình của cái gì.

Dùng tài liệu này khi cần giải thích lại cho người khác (FE dev, stakeholder,
người mới vào project) về cách hệ thống tạo ra số liệu hiển thị trên chart.

---

## 1. Câu hỏi thường gặp

> "Dự đoán những điểm đục lỗ để biểu diễn chart trên 1 sample, nhưng để ra
> được giá trị dự đoán thì đầu vào phải là toàn bộ dataset (nhiều sample) để
> ra được giá trị dự đoán trung bình đó — đúng không?"

**Trả lời: Không đúng**, và đây là lý do.

Có **2 khái niệm "trung bình"/"toàn bộ dataset" khác nhau**, dễ bị lẫn vào
nhau:

| | Cần "toàn bộ dataset nhiều sample"? | "Trung bình" là trung bình của cái gì? |
|---|---|---|
| **Training** (học model) | ✅ Cần — học từ nhiều sample để nắm pattern chung | không áp dụng ở bước này |
| **Inference cho 1 điểm bị thiếu** | ❌ Không cần — chỉ cần dữ liệu của **chính sample đó** | trung bình (median) của **100 lần model tự sinh dự đoán cho CÙNG 1 điểm của CÙNG 1 sample** — không phải trung bình giữa các sample khác nhau |

Training là bước xảy ra **1 lần, từ trước, offline** — không liên quan gì
đến việc BE trả dữ liệu lúc FE gọi API. Lúc suy luận (hoặc lúc BE đọc lại kết
quả đã suy luận sẵn), **mỗi sample được xử lý độc lập hoàn toàn**.

---

## 2. Luồng đầy đủ: Dataset → Dự đoán → API → Frontend

```
┌─────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 1 — TRAINING (đã xong, 1 lần, offline)                  │
│                                                                   │
│  Input:  TOÀN BỘ sample trong tập TRAIN (vd pm25: ~các tháng      │
│          1,2,4,5,7,8,10,11 trừ validindex)                        │
│  Việc model học: tương quan giữa feature với feature,            │
│          tương quan theo thời gian, cách khử nhiễu diffusion      │
│  Output: trọng số model → model.pth (đã có sẵn trong               │
│          Checkpoint_PE_CSDI/save/<folder>/)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (chỉ dùng trọng số, KHÔNG train lại)
┌─────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 2 — INFERENCE / EVALUATE (đã xong, 1 lần, do tác giả     │
│                chạy sẵn, dùng tập TEST)                             │
│                                                                   │
│  Với MỖI sample test, XỬ LÝ ĐỘC LẬP (sample này không cần biết     │
│  gì về sample khác):                                              │
│                                                                   │
│    Input của 1 sample = (observed_data, mask) CỦA RIÊNG nó         │
│          → qua model (đã học) → reverse diffusion 50 bước          │
│          → lặp lại 100 lần (nsample=100, mỗi lần nhiễu khởi tạo    │
│            random khác nhau)                                      │
│          → 100 giá trị dự đoán khả dĩ CHO CÙNG 1 điểm              │
│                                                                   │
│  Làm vậy cho MỌI sample, MỌI timestep, MỌI feature                 │
│  → lưu hết vào 1 file: generated_outputs_nsample100.pk              │
│    shape samples = (N, 100, L, K)                                  │
│    N = số sample, 100 = số lần sinh, L = timestep, K = feature     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼  (backend KHÔNG đụng tới bước 1&2, chỉ đọc file có sẵn)
┌─────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 3 — BACKEND xử lý khi có request (nhanh, không cần GPU)   │
│                                                                   │
│  FE gọi API với 1 sample_id + 1 feature_id cụ thể                  │
│  Backend lấy ra: samples[sample_id, :, :, feature_id]               │
│                  → shape (100, L)  ← chỉ 100 giá trị của RIÊNG     │
│                     sample/feature này, không liên quan sample khác│
│  Tính quantile theo chiều 100 (KHÔNG theo chiều N):                 │
│      median    = torch.quantile(..., 0.5, dim=nsample)             │
│      lower_90  = torch.quantile(..., 0.05, dim=nsample)            │
│      upper_90  = torch.quantile(..., 0.95, dim=nsample)            │
│  → ra 1 giá trị dự đoán đại diện + khoảng tin cậy CHO TỪNG          │
│    timestep của sample đó                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 4 — TRẢ VỀ QUA API → FE                                  │
│                                                                   │
│  Với mỗi t trong sample đó:                                        │
│    given=1      → type="observed", value=giá trị thật              │
│    evalpoint=1  → type="imputed",  value=median, confidence={...}  │
│    còn lại      → type="missing",  value=null                      │
│  Stream qua SSE, FE nhận từng điểm → vẽ chart                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Vì sao phải chọn `sample` sau khi chọn `dataset`?

Mỗi dataset không phải là "1 chuỗi thời gian dài duy nhất" mà là **tập hợp
nhiều chuỗi thời gian độc lập ngắn** — cách tổ chức dữ liệu chuẩn cho bài
toán Time-Series Imputation benchmark (tensor shape `(N, L, K)`: N chuỗi độc
lập, mỗi chuỗi dài L timestep, K biến/feature).

| Dataset | 1 "sample" tương ứng với gì trong thực tế |
|---|---|
| `physio` | **1 bệnh nhân ICU** — mỗi sample là hồ sơ 48 giờ của 1 người. Bệnh nhân A và B có pattern missing và giá trị sinh lý hoàn toàn khác nhau → không thể gộp chung. |
| `pm25` | **1 cửa sổ 36 giờ liên tiếp** trong 1 tháng test cụ thể (3,6,9,12). 82 sample vì dữ liệu tháng test được cắt thành nhiều đoạn 36 giờ không chồng lặp. |
| `electricity` | **1 mốc thời điểm bắt đầu dự báo** (forecast origin) — 7 sample là 7 lần "giả lập" chạy dự báo 192 bước tại 7 thời điểm khác nhau để backtest. |

→ `sample_id` = "muốn xem **chuỗi/bệnh nhân/cửa sổ thời gian nào**".
→ `feature_id` = "trong chuỗi đó, muốn xem **biến/trạm/khách hàng nào**".

Hai trục này độc lập nhau — không có khái niệm "giá trị chung cho cả
dataset", vì mỗi sample có dữ liệu, pattern missing, và kết quả dự đoán hoàn
toàn riêng. Đây cũng là lý do RMSE/MAE/CRPS trong `result_nsample100.pk` là
số liệu **trung bình trên toàn bộ N sample** (để đánh giá model tổng thể),
còn khi vẽ chart cho FE thì luôn phải chọn đúng **1 sample cụ thể** để có 1
chuỗi giá trị theo thời gian.

---

## 4. Tóm tắt nhanh (dùng để giải thích lại cho người khác)

| Nhận định | Đúng/Sai | Vì sao |
|---|---|---|
| "Để train được model cần toàn bộ dataset nhiều sample" | ✅ Đúng | nhưng đây là bước train, **đã làm xong từ trước**, không liên quan đến lúc gọi API |
| "Để ra giá trị dự đoán cho 1 điểm cần đầu vào là toàn bộ dataset nhiều sample" | ❌ Sai | Chỉ cần dữ liệu của **chính sample đó**. Model (đã học xong) xử lý từng sample độc lập |
| "Giá trị dự đoán là giá trị trung bình" | ✅ Đúng, nhưng | là median của **100 lần sinh xác suất cho cùng 1 điểm của cùng 1 sample** (chiều `nsample`), **không phải** trung bình giữa các sample khác nhau trong dataset |
| "Phải chọn sample rồi mới xem được chart" | ✅ Đúng | vì dataset = nhiều chuỗi độc lập (nhiều bệnh nhân/cửa sổ thời gian/mốc dự báo), không phải 1 chuỗi duy nhất |

Xem thêm:
- [OUTPUT_FORMAT.md](OUTPUT_FORMAT.md) — ý nghĩa chi tiết từng tensor trong file `.pk`.
- [BACKEND_API.md](BACKEND_API.md) — cách backend đọc lại và xử lý các tensor này.
- [FE_INTEGRATION_GUIDE.md](FE_INTEGRATION_GUIDE.md) — hợp đồng API cho FE.
