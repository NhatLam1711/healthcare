# Original (old d_model)
# python main.py --anormly_ratio 1 --num_epochs 3   --batch_size 256  --mode train --dataset MSL  --data_path dataset/MSL --input_c 55    --output_c 55
# python main.py --anormly_ratio 1  --num_epochs 10      --batch_size 256     --mode test    --dataset MSL   --data_path dataset/MSL  --input_c 55    --output_c 55  --pretrained_model 20

# +PE (d_model=32)
set -e

echo "=============================="
echo "Train - MSL - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode train \
    --dataset MSL \
    --data_path dataset/MSL \
    --input_c 55 \
    --output_c 55 \
    --win_size 128

echo "=============================="
echo "Test - MSL - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode test \
    --dataset MSL \
    --data_path dataset/MSL \
    --input_c 55 \
    --output_c 55 \
    --win_size 128 

echo "All experiments completed."



