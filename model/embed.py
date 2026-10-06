import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn.utils import weight_norm
import math


# class PositionalEmbedding(nn.Module):
#     def __init__(self, d_model, max_len=5000):
#         super(PositionalEmbedding, self).__init__()
#         # Compute the positional encodings once in log space.
#         pe = torch.zeros(max_len, d_model).float()
#         pe.require_grad = False

#         position = torch.arange(0, max_len).float().unsqueeze(1)
#         div_term = (torch.arange(0, d_model, 2).float() * -(math.log(10000.0) / d_model)).exp()

#         pe[:, 0::2] = torch.sin(position * div_term)
#         pe[:, 1::2] = torch.cos(position * div_term)

#         pe = pe.unsqueeze(0)
#         self.register_buffer('pe', pe)

#     def forward(self, x):
#         return self.pe[:, :x.size(1)]

class PositionalEmbedding(nn.Module):
    def __init__(self, d_model, max_len=64, legacy=False, legacy_max_len=None):
        super(PositionalEmbedding, self).__init__()
        self.d_model = d_model
        self.max_len = max_len
        self.legacy = legacy

        if legacy:
            effective_max_len = legacy_max_len if legacy_max_len is not None else max_len
            pe = torch.zeros(effective_max_len, d_model).float()
            pe.require_grad = False
            position = torch.arange(0, effective_max_len).float().unsqueeze(1)
            div_term = (torch.arange(0, d_model, 2).float() * -(math.log(10000.0) / d_model)).exp()
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            self.register_buffer('pe', pe.unsqueeze(0))
            return

        self.position = torch.arange(max_len)

        bits = torch.arange(
            int(torch.log2(torch.tensor(float(max_len))).item()) - 1,
            -1,
            -1,
            dtype=torch.long
        )

        binary_pos = (
            (self.position[:, None] & (1 << bits)) > 0
        ).float()
        self.register_buffer("binary_pos", binary_pos)

        dist = self.position[None, :] - self.position[:, None]
        mask = ~torch.eye(max_len, dtype=torch.bool)
        dist = dist[mask].view(max_len, max_len - 1).float()
        dist = dist / (dist.size(-1))
        self.register_buffer("dist", dist)

        self.relative_compression = nn.Sequential(
            nn.Linear(
                max_len - 1,
                d_model - int(math.log2(max_len))
            ),
            nn.ReLU()
        )

        self.absolute_compression = nn.Linear(int(math.log2(max_len)), int(math.log2(max_len)))
        self.gating = nn.Parameter(torch.tensor(0.0))

    def forward(self, x):
        if self.legacy:
            return self.pe[:, :x.size(1)]

        gate = torch.sigmoid(self.gating)
        relative_out = self.relative_compression(self.dist)
        absolute_out = self.absolute_compression(self.binary_pos)
        pe = torch.cat([(1-gate) * relative_out, gate * absolute_out], dim=-1)
        return pe.unsqueeze(0)


class TokenEmbedding(nn.Module):
    def __init__(self, c_in, d_model):
        super(TokenEmbedding, self).__init__()
        padding = 1 if torch.__version__ >= '1.5.0' else 2
        self.tokenConv = nn.Conv1d(in_channels=c_in, out_channels=d_model,
                                   kernel_size=3, padding=padding, padding_mode='circular', bias=False)
        for m in self.modules():
            if isinstance(m, nn.Conv1d):
                nn.init.kaiming_normal_(m.weight, mode='fan_in', nonlinearity='leaky_relu')

    def forward(self, x):
        x = self.tokenConv(x.permute(0, 2, 1)).transpose(1, 2)
        return x


class DataEmbedding(nn.Module):
    def __init__(self, c_in, d_model, win_size, dropout=0.0, legacy=False, legacy_max_len=None):
        super(DataEmbedding, self).__init__()

        self.value_embedding = TokenEmbedding(c_in=c_in, d_model=d_model)
        self.position_embedding = PositionalEmbedding(d_model=d_model, max_len=win_size, legacy=legacy, legacy_max_len=legacy_max_len)

        self.dropout = nn.Dropout(p=dropout)

    def forward(self, x):
        x = self.value_embedding(x) + self.position_embedding(x)
        return self.dropout(x)
