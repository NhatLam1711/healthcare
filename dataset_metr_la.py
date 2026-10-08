import os
import pickle
import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset


class METRLA_Dataset(Dataset):
    def __init__(self, data_dir="./data/METR-LA", eval_length=12, mode="train", missing_rate=0.1):
        """
        Args:
            data_dir (str): Đường dẫn tới thư mục chứa các file .pkl
            eval_length (int): Độ dài chuỗi thời gian cho mỗi sample (mặc định: 12)
            mode (str): 'train', 'val', hoặc 'test'
            missing_rate (float): Tỷ lệ đục lỗ ngẫu nhiên (ví dụ: 0.1 nghĩa là che đi 10% để test)
        """
        self.eval_length = eval_length
        self.mode = mode
        self.missing_rate = missing_rate

        # 1. Tải Mean/Std phục vụ inverse scaler về sau
        meanstd_path = os.path.join(data_dir, "metr_meanstd.pk")
        with open(meanstd_path, "rb") as f:
            mean_std = pickle.load(f)
            if isinstance(mean_std, dict):
                self.train_mean = mean_std["mean"]
                self.train_std = mean_std["std"]
            else:
                self.train_mean, self.train_std = mean_std

        # 2. Đọc trực tiếp ma trận dữ liệu 2D của từng tập từ file pkl tương ứng
        set_file = f"{mode}_set.pkl" if mode != "val" else "val_set.pkl"
        set_path = os.path.join(data_dir, set_file)

        with open(set_path, "rb") as f:
            raw_data = pickle.load(f)
            if hasattr(raw_data, "values"):
                raw_data = raw_data.values
            self.data = np.array(raw_data, dtype=np.float32)

        # 3. Xử lý giá trị khuyết thiếu tự nhiên và chuẩn hóa dữ liệu (giống bảng PM25)
        # observed_mask = 1 tại những vị trí dữ liệu gốc thực sự tồn tại (không bị NaN)
        self.observed_mask = (~np.isnan(self.data)).astype(np.float32)
        self.data = np.nan_to_num(self.data, nan=0.0)
        
        # Thực hiện chuẩn hóa Z-score luôn tại đây
        self.data = ((self.data - self.train_mean) / self.train_std) * self.observed_mask

        # 4. SỬA TẠI ĐÂY: Tạo mặt nạ Ground-Truth (gt_mask) khác biệt với observed_mask
        if self.mode in ["val", "test"]:
            # Tự động tạo một mặt nạ ngẫu nhiên dựa trên tỷ lệ missing_rate để làm bài test cho mô hình
            np.random.seed(42)  # Cố định seed để kết quả kiểm thử không bị thay đổi giữa các lần chạy
            random_mask = (np.random.rand(*self.data.shape) > self.missing_rate).astype(np.float32)
            
            # gt_mask là tập con của observed_mask (chỉ giữ lại những điểm không bị đục lỗ ngẫu nhiên)
            self.gt_mask = self.observed_mask * random_mask
        else:
            # Trong chế độ train, gt_mask bằng chính observed_mask (mô hình sẽ tự đục lỗ động khi train)
            self.gt_mask = self.observed_mask

        # 5. Tính toán số lượng mẫu dựa trên Cửa sổ trượt (Sliding Window)
        self.num_samples = len(self.data) - self.eval_length + 1
        print(f"[{mode.upper()}] Khởi tạo thành công! Kích thước ma trận gốc: {self.data.shape} -> Tổng số mẫu trượt: {self.num_samples}")

    def __getitem__(self, org_index):
        # org_index đóng vai trò là vị trí bắt đầu của cửa sổ trượt
        start_idx = org_index
        end_idx = start_idx + self.eval_length

        # Cắt chuỗi thời gian con (sub-window) có độ dài eval_length
        sub_data = self.data[start_idx:end_idx]
        sub_obs_mask = self.observed_mask[start_idx:end_idx]
        sub_gt_mask = self.gt_mask[start_idx:end_idx]

        # SỬA TẠI ĐÂY: Trả về đầy đủ các trường cấu trúc giống hàm __getitem__ của PM25_Dataset
        s = {
            "observed_data": sub_data,          # Shape: (eval_length, 207)
            "observed_mask": sub_obs_mask,      # Shape: (eval_length, 207)
            "gt_mask": sub_gt_mask,              # Shape: (eval_length, 207) -> Đã khác với observed_mask ở tập test/val
            "hist_mask": sub_obs_mask,          # Tạm thời gán bằng obs_mask đối với METR-LA
            "timepoints": np.arange(self.eval_length).astype(np.int64),
            "cut_length": 0,                    # Thêm giá trị mặc định để tránh lỗi thiếu key ở các file xử lý sau
        }
        return s

    def __len__(self):
        return self.num_samples


def get_dataloader(data_dir="./data/METR-LA", batch_size=64, device="cpu"):
    train_dataset = METRLA_Dataset(data_dir=data_dir, mode="train")
    val_dataset = METRLA_Dataset(data_dir=data_dir, mode="val")
    test_dataset = METRLA_Dataset(data_dir=data_dir, mode="test")

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    valid_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, num_workers=0)

    # Đưa bộ chuyển đổi scaler lên Device chỉ định
    scaler = torch.tensor(train_dataset.train_std, device=device, dtype=torch.float32)
    mean_scaler = torch.tensor(train_dataset.train_mean, device=device, dtype=torch.float32)

    return train_loader, valid_loader, test_loader, scaler, mean_scaler