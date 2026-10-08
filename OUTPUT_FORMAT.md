# Đọc hiểu Output của Model Imputation

## 1. File output ở đâu?

Sau khi chạy `evaluate()`, kết quả lưu tại:
```
./save/<experiment_folder>/generated_outputs_nsample100.pk
```

## 2. Đọc file pickle

```python
import pickle
import torch

path = './save/<folder>/generated_outputs_nsample100.pk'
with open(path, 'rb') as f:
    samples, all_target, all_evalpoint, all_observed, all_observed_time, scaler, mean_scaler = pickle.load(f)
```

## 3. Ý nghĩa từng biến

```
samples           — Tensor (N, 100, L, K)  — 100 mẫu dự đoán cho mỗi điểm missing
all_target        — Tensor (N, L, K)       — giá trị thật (đã normalize)
all_evalpoint     — Tensor (N, L, K)       — mask: 1 = điểm bị đục lỗ (cần impute)
all_observed      — Tensor (N, L, K)       — mask: 1 = điểm có dữ liệu (observed + eval)
all_observed_time — Tensor (N, L)          — chỉ số thời gian (0, 1, 2, ..., L-1)
scaler            — giá trị std dùng để denormalize
mean_scaler       — giá trị mean dùng để denormalize
```

Trong đó:
- **N** = số lượng samples trong test set
- **L** = số time steps (ví dụ: 48 cho PhysioNet, 36 cho PM2.5)
- **K** = số features/sensors (ví dụ: 35 cho PhysioNet, 36 cho PM2.5)

## 4. Quan hệ giữa các mask

```
all_observed  = all_given + all_evalpoint

Cụ thể:
  all_given = all_observed - all_evalpoint
```

| Mask | = 1 nghĩa là | Vai trò |
|:---|:---|:---|
| `all_observed` | Điểm có giá trị thật (bất kể có bị đục lỗ hay không) | Toàn bộ dữ liệu "biết" |
| `all_evalpoint` | Điểm bị đục lỗ (model cần đoán) | Target để đánh giá |
| `all_given` (tính từ 2 cái trên) | Điểm được cho model nhìn thấy | Dữ liệu "đã biết" |

### Minh họa trực quan (1 time series, 1 feature):

```
Time step:    0   1   2   3   4   5   6   7   8   9
Giá trị thật: 2.1 3.4 1.8 4.2 2.9 3.1 5.0 2.3 4.1 3.7

all_observed: [1   1   0   1   1   1   0   1   1   1 ]
all_evalpoint:[0   0   0   1   0   1   0   0   1   0 ]
all_given:    [1   1   0   0   1   0   0   1   0   1 ]
                                                      
Ý nghĩa:      ✓   ✓   ?   🎯  ✓   🎯  ?   ✓   🎯  ✓
              cho  cho NaN đoán cho đoán NaN cho đoán cho
```

- ✓ (given=1): Model được nhìn thấy giá trị này
- 🎯 (evalpoint=1): Model cần đoán giá trị này, ta có ground truth để so sánh
- ? (observed=0): Thật sự missing, không ai biết giá trị

## 5. Cách trích xuất giá trị dự đoán

Model sinh ra **100 samples** cho mỗi điểm missing → lấy **median** hoặc **quantiles**:

```python
# Lấy median (giá trị dự đoán chính)
predicted_median = torch.quantile(samples, 0.5, dim=1)  # (N, L, K)

# Lấy khoảng tin cậy 90%
predicted_lower = torch.quantile(samples, 0.05, dim=1)  # (N, L, K)
predicted_upper = torch.quantile(samples, 0.95, dim=1)  # (N, L, K)

# Lấy khoảng tin cậy 50%
predicted_q25 = torch.quantile(samples, 0.25, dim=1)
predicted_q75 = torch.quantile(samples, 0.75, dim=1)
```

## 6. Denormalize (về giá trị thật)

Dữ liệu trong pickle đã được normalize. Để lấy giá trị thực:

```python
# Với PhysioNet: scaler=1, mean_scaler=0 → không cần denormalize
# Với PM2.5 / Electricity:
real_target = all_target * scaler + mean_scaler
real_predicted = predicted_median * scaler + mean_scaler
```

## 7. Ghép dữ liệu thật + dự đoán thành 1 chuỗi hoàn chỉnh

```python
import numpy as np

# Với 1 sample (dataind) và 1 feature (k):
dataind = 0
k = 0

all_given = all_observed - all_evalpoint  # mask điểm model được nhìn
target = all_target[dataind, :, k].cpu().numpy()
evalpoint = all_evalpoint[dataind, :, k].cpu().numpy()
given = all_given[dataind, :, k].cpu().numpy()

median = torch.quantile(samples, 0.5, dim=1)[dataind, :, k].cpu().numpy()
lower = torch.quantile(samples, 0.05, dim=1)[dataind, :, k].cpu().numpy()
upper = torch.quantile(samples, 0.95, dim=1)[dataind, :, k].cpu().numpy()

# Ghép: tại điểm given → dùng giá trị thật, tại điểm evalpoint → dùng dự đoán
merged_values = target * given + median * evalpoint

# Hoặc chi tiết hơn, cho từng time step:
for t in range(len(target)):
    if given[t] == 1:
        # Điểm observed → giá trị thật
        print(f"t={t}: real={target[t]:.3f}")
    elif evalpoint[t] == 1:
        # Điểm bị đục lỗ → dự đoán
        print(f"t={t}: predicted={median[t]:.3f} (CI: {lower[t]:.3f} ~ {upper[t]:.3f})")
    else:
        # Thật sự missing (không có ground truth)
        print(f"t={t}: no data")
```

## 8. Cấu trúc JSON gợi ý cho Backend → Frontend

```json
{
  "sample_id": 0,
  "feature_name": "HR",
  "time_steps": [
    {
      "t": 0,
      "value": 72.5,
      "type": "observed"
    },
    {
      "t": 1,
      "value": 74.1,
      "type": "observed"
    },
    {
      "t": 2,
      "value": null,
      "type": "missing"
    },
    {
      "t": 3,
      "value": 73.8,
      "type": "imputed",
      "confidence": {
        "lower_90": 71.2,
        "lower_50": 72.5,
        "median": 73.8,
        "upper_50": 75.0,
        "upper_90": 76.3
      }
    }
  ]
}
```

Frontend nhận JSON này có thể:
- Vẽ **đường liền** cho `observed`
- Vẽ **chấm tròn xanh** cho `observed`  
- Vẽ **đường nét đứt màu khác** cho `imputed`
- Vẽ **vùng mờ (shaded area)** cho khoảng tin cậy
- Bỏ trống hoặc đánh dấu cho `missing`
