# export CUDA_VISIBLE_DEVICES=0

# python main.py --anormly_ratio 0.5 --num_epochs 10   --batch_size 256  --mode train --dataset SMD  --data_path dataset/SMD   --input_c 38
# python main.py --anormly_ratio 0.5 --num_epochs 10   --batch_size 256     --mode test    --dataset SMD   --data_path dataset/SMD     --input_c 38     --pretrained_model 20

# +PE (d_model=32)
set -e

echo "=============================="
echo "Train - SMD - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode train \
    --dataset SMD \
    --data_path dataset/SMD \
    --input_c 38 \
    --output_c 38 \
    --win_size 64 \
    --lr 1e-5

echo "=============================="
echo "Test - SMD - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode test \
    --dataset SMD \
    --data_path dataset/SMD \
    --input_c 38 \
    --output_c 38 \
    --win_size 64 \
    --lr 1e-5

echo "All experiments completed."