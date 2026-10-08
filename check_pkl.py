import pickle
import numpy as np

# Đường dẫn tới file của bạn
file_path = "./data/METR-LA/train_set.pkl"

with open(file_path, "rb") as f:
    data = pickle.load(f)

print("--- KHÁM NGHIỆM FILE TRAIN_SET.PKL ---")
print("1. Kiểu dữ liệu gốc (Type):", type(data))

if isinstance(data, dict):
    print("2. Các Keys có trong dict:", list(data.keys()))
    for k, v in data.items():
        if hasattr(v, "shape"):
            print(f"   - Key '{k}' có Shape: {v.shape}, Kiểu: {type(v)}")
        else:
            print(f"   - Key '{k}' có Chiều dài (Len): {len(v)}, Kiểu: {type(v)}")
            if len(v) > 0: print("     Mẫu phần tử đầu tiên:", v[0])
elif hasattr(data, "shape"):
    print("2. Shape của mảng:", data.shape)
    print("3. Kiểu dữ liệu phần tử:", data.dtype)
    print("4. Một vài phần tử đầu tiên:\n", data[:3])
else:
    print("2. Chiều dài (Len) của danh sách:", len(data))
    if len(data) > 0:
        print("3. Kiểu dữ liệu của phần tử đầu tiên:", type(data[0]))
        print("4. Vài phần tử đầu tiên:", data[:3])