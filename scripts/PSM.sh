# Original
# python main.py --anormly_ratio 1 --num_epochs 3    --batch_size 256  --mode train --dataset PSM  --data_path dataset/PSM --input_c 25    --output_c 25
# python main.py --anormly_ratio 1  --num_epochs 10       --batch_size 256     --mode test    --dataset PSM   --data_path dataset/PSM  --input_c 25    --output_c 25  --pretrained_model 20

# +PE (d_model=32)
set -e

echo "=============================="
echo "Train - PSM - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode train \
    --dataset PSM \
    --data_path dataset/PSM \
    --input_c 25 \
    --output_c 25 \
    --win_size 128 

echo "=============================="
echo "Test - PSM - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode test \
    --dataset PSM \
    --data_path dataset/PSM \
    --input_c 25 \
    --output_c 25 \
    --win_size 128 

echo "All experiments completed."