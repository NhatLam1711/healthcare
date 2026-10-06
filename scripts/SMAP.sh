# Original (old d_model)

# python main.py --anormly_ratio 1 --num_epochs 3   --batch_size 256  --mode train --dataset SMAP  --data_path dataset/SMAP --input_c 25    --output_c 25
# python main.py --anormly_ratio 1  --num_epochs 10        --batch_size 256     --mode test    --dataset SMAP   --data_path dataset/SMAP  --input_c 25    --output_c 25  --pretrained_model 20

# +PE (d_model=32)

set -e

echo "=============================="
echo "Train - SMAP - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode train \
    --dataset SMAP \
    --data_path dataset/SMAP \
    --input_c 25 \
    --output_c 25 \
    --win_size 128 \
    --lr 1e-5

echo "=============================="
echo "Test - SMAP - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode test \
    --dataset SMAP \
    --data_path dataset/SMAP \
    --input_c 25 \
    --output_c 25 \
    --win_size 128 \
    --lr 1e-5

echo "All experiments completed."

