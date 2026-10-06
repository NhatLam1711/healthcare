# Original (old dmodel)
# python main.py --anormly_ratio 0.5 --num_epochs 3    --batch_size 256  --mode train --dataset SWaT  --data_path dataset/SWaT --input_c 51    --output_c 51
# python main.py --anormly_ratio 0.1  --num_epochs 10        --batch_size 256     --mode test    --dataset SWaT   --data_path dataset/SWaT  --input_c 51    --output_c 51  --pretrained_model 10

#!/bin/bash

# +PE (d_model=32)
set -e

echo "=============================="
echo "Train - SWaT - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode train \
    --dataset SWaT \
    --data_path dataset/SWaT \
    --input_c 51 \
    --output_c 51 \
    --win_size 128 \
    --lr 1e-5

echo "=============================="
echo "Test - SWaT - win_size=128"
echo "=============================="
py main.py \
    --anormly_ratio 0.5 \
    --num_epochs 3 \
    --batch_size 64 \
    --mode test \
    --dataset SWaT \
    --data_path dataset/SWaT \
    --input_c 51 \
    --output_c 51 \
    --win_size 128 \
    --lr 1e-5

echo "All experiments completed."