import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from torch.utils.data import Dataset, DataLoader

# (Đã bỏ "from PIL import Image" - import này không được dùng ở bất kỳ đâu
#  trong file, tồn tại chỉ vì copy thừa từ code gốc. Giữ lại sẽ bắt máy phải
#  cài thêm Pillow một cách không cần thiết.)


class GenericNpySegLoader(Dataset):
    """
    Loader tổng quát cho MỌI dataset lưu dạng .npy, miễn là đặt đúng tên file
    theo quy ước: {prefix}_train.npy, {prefix}_test.npy, {prefix}_test_label.npy
    trong thư mục data_path.

    Thay thế cho SMDSegLoader/MSLSegLoader/SMAPSegLoader (3 class gần như
    giống hệt nhau, chỉ khác tên file hardcode) - thêm dataset MỚI (vd
    "2DGesture") chỉ cần đặt đúng tên file, KHÔNG cần thêm class/code mới.
    """

    def __init__(self, data_path, win_size, step, mode="train", prefix=None):
        self.mode = mode
        self.step = step
        self.win_size = win_size
        self.prefix = prefix or os.path.basename(os.path.normpath(data_path))

        self.scaler = StandardScaler()
        data = np.load(os.path.join(data_path, f"{self.prefix}_train.npy"))
        self.scaler.fit(data)
        data = self.scaler.transform(data)

        test_data = np.load(os.path.join(data_path, f"{self.prefix}_test.npy"))
        self.test = self.scaler.transform(test_data)

        self.train = data
        self.val = self.test
        self.test_labels = np.load(os.path.join(data_path, f"{self.prefix}_test_label.npy"))

        print(f"[{self.prefix}] train: {self.train.shape}  test: {self.test.shape}")

    def __len__(self):
        if self.mode == "train":
            return (self.train.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "val":
            return (self.val.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "test":
            return (self.test.shape[0] - self.win_size) // self.step + 1
        else:
            return (self.test.shape[0] - self.win_size) // self.win_size + 1

    def __getitem__(self, index):
        index = index * self.step
        if self.mode == "train":
            return np.float32(self.train[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "val":
            return np.float32(self.val[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "test":
            return (
                np.float32(self.test[index:index + self.win_size]),
                np.float32(self.test_labels[index:index + self.win_size]),
            )
        else:
            start = index // self.step * self.win_size
            end = start + self.win_size
            return np.float32(self.test[start:end]), np.float32(self.test_labels[start:end])


class PSMSegLoader(Dataset):
    """Dataset dạng CSV (khác cấu trúc file với các dataset .npy ở trên) - giữ nguyên như bản gốc."""

    def __init__(self, data_path, win_size, step, mode="train"):
        self.mode = mode
        self.step = step
        self.win_size = win_size
        self.scaler = StandardScaler()

        data = pd.read_csv(os.path.join(data_path, "train.csv"))
        data = np.nan_to_num(data.values[:, 1:])
        self.scaler.fit(data)
        data = self.scaler.transform(data)

        test_data = pd.read_csv(os.path.join(data_path, "test.csv"))
        test_data = np.nan_to_num(test_data.values[:, 1:])
        self.test = self.scaler.transform(test_data)

        self.train = data
        self.val = self.test
        self.test_labels = pd.read_csv(os.path.join(data_path, "test_label.csv")).values[:, 1:]

        print(f"[PSM] train: {self.train.shape}  test: {self.test.shape}")

    def __len__(self):
        if self.mode == "train":
            return (self.train.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "val":
            return (self.val.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "test":
            return (self.test.shape[0] - self.win_size) // self.step + 1
        else:
            return (self.test.shape[0] - self.win_size) // self.win_size + 1

    def __getitem__(self, index):
        index = index * self.step
        if self.mode == "train":
            return np.float32(self.train[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "val":
            return np.float32(self.val[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "test":
            return (
                np.float32(self.test[index:index + self.win_size]),
                np.float32(self.test_labels[index:index + self.win_size]),
            )
        else:
            start = index // self.step * self.win_size
            end = start + self.win_size
            return np.float32(self.test[start:end]), np.float32(self.test_labels[start:end])


class SWaTSegLoader(Dataset):
    """Dataset dạng CSV (khác cấu trúc file với các dataset .npy ở trên) - giữ nguyên như bản gốc."""

    def __init__(self, data_path, win_size, step, mode="train"):
        self.mode = mode
        self.step = step
        self.win_size = win_size
        self.scaler = StandardScaler()

        data = pd.read_csv(os.path.join(data_path, "swat_train2.csv"))
        data = data.values[:, :-1]
        self.scaler.fit(data)
        data = self.scaler.transform(data)

        test_data = pd.read_csv(os.path.join(data_path, "swat2.csv"))
        self.test = self.scaler.transform(test_data.values[:, :-1])

        self.train = data
        self.val = self.test
        self.test_labels = pd.read_csv(os.path.join(data_path, "swat2.csv")).values[:, -1]

        print(f"[SWaT] train: {self.train.shape}  test: {self.test.shape}")

    def __len__(self):
        if self.mode == "train":
            return (self.train.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "val":
            return (self.val.shape[0] - self.win_size) // self.step + 1
        elif self.mode == "test":
            return (self.test.shape[0] - self.win_size) // self.step + 1
        else:
            return (self.test.shape[0] - self.win_size) // self.win_size + 1

    def __getitem__(self, index):
        index = index * self.step
        if self.mode == "train":
            return np.float32(self.train[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "val":
            return np.float32(self.val[index:index + self.win_size]), np.float32(self.test_labels[0:self.win_size])
        elif self.mode == "test":
            return (
                np.float32(self.test[index:index + self.win_size]),
                np.float32(self.test_labels[index:index + self.win_size]),
            )
        else:
            start = index // self.step * self.win_size
            end = start + self.win_size
            return np.float32(self.test[start:end]), np.float32(self.test_labels[start:end])


# Dataset dùng định dạng CSV đặc thù, khác quy ước .npy chung -> vẫn cần class riêng.
_CSV_LOADERS = {
    "PSM": PSMSegLoader,
    "SWaT": SWaTSegLoader,
}


def get_loader_segment(data_path, batch_size, win_size=100, step=1, mode="train", dataset="KDD"):
    """
    dataset thuộc _CSV_LOADERS (PSM, SWaT) -> dùng loader CSV riêng.
    MỌI dataset khác (SMD, MSL, SMAP, và bất kỳ dataset mới nào trong tương
    lai như 2DGesture) -> tự động dùng GenericNpySegLoader, miễn là có đủ
    3 file {dataset}_train.npy / _test.npy / _test_label.npy trong data_path.

    LƯU Ý: "step" giờ được dùng đúng như tham số truyền vào (bản gốc hardcode
    step=1 cho các loader .npy bất kể bạn truyền gì - đây là nguyên nhân
    chính gây chậm khi tính train_energy, vì tạo ra gần như 1 sliding window
    mỗi điểm dữ liệu). Giữ mặc định step=1 để KHÔNG đổi hành vi/độ chính xác
    so với bản gốc - muốn train_energy nhanh hơn, truyền step lớn hơn (xem
    STEP_TRAIN trong api.py).
    """
    if dataset in _CSV_LOADERS:
        loader = _CSV_LOADERS[dataset](data_path, win_size, step, mode)
    else:
        loader = GenericNpySegLoader(data_path, win_size, step, mode, prefix=dataset)

    shuffle = mode == "train"
    return DataLoader(dataset=loader, batch_size=batch_size, shuffle=shuffle, num_workers=0)
