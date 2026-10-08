import argparse
import torch
import datetime
import json
import yaml
import os

# Import dataset và model mới dành cho METR-LA
from dataset_metr_la import get_dataloader 
from main_model import CSDI_METRLA
from utils import train, evaluate

parser = argparse.ArgumentParser(description="CSDI for METR-LA")
parser.add_argument("--config", type=str, default="base.yaml")
parser.add_argument('--device', default='cuda:0', help='Device for Training/Inference')
parser.add_argument("--modelfolder", type=str, default="")
parser.add_argument(
    "--targetstrategy", type=str, default="random", choices=["mix", "random", "historical"]
)
parser.add_argument("--nsample", type=int, default=100)
parser.add_argument("--unconditional", action="store_true")

args = parser.parse_args()
print(args)

# Đọc cấu hình từ file config yaml
path = "config/" + args.config
with open(path, "r") as f:
    config = yaml.safe_load(f)

config["model"]["is_unconditional"] = args.unconditional
config["model"]["target_strategy"] = args.targetstrategy

print(json.dumps(config, indent=4))

# Tạo thư mục lưu kết quả model dựa trên thời gian thực tại
current_time = datetime.datetime.now().strftime("%Y%m%d_%H%M%S") 
foldername = f"./save/metr_la_{current_time}/"

print('Model folder:', foldername)
os.makedirs(foldername, exist_ok=True)
with open(foldername + "config.json", "w") as f:
    json.dump(config, f, indent=4)

# Khởi tạo dataloader cho METR-LA (sử dụng đường dẫn thư mục chứa ảnh của bạn)
train_loader, valid_loader, test_loader, scaler, mean_scaler = get_dataloader(
    data_dir="./data/METR-LA", 
    batch_size=config["train"]["batch_size"], 
    device=args.device
)

# Khởi tạo model CSDI ứng với 207 features của METR-LA
model = CSDI_METRLA(config, args.device, target_dim=207).to(args.device)

# Tiến hành Train hoặc Load checkpoint cũ
if args.modelfolder == "":
    train(
        model,
        config["train"],
        train_loader,
        valid_loader=valid_loader,
        foldername=foldername,
    )
else:
    model.load_state_dict(torch.load("./save/" + args.modelfolder + "/model.pth"))

# Đánh giá trên tập test dữ liệu giao thông METR-LA
evaluate(
    model,
    test_loader,
    nsample=args.nsample,
    scaler=scaler,
    mean_scaler=mean_scaler,
    foldername=foldername,
)