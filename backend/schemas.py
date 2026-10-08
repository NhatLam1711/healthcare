from typing import List, Optional

from pydantic import BaseModel


class MetaResponse(BaseModel):
    dataset: str
    num_samples: int
    num_timesteps: int
    num_features: int
    nsample_per_point: int
    feature_names: List[str]


class RealPoint(BaseModel):
    t: int
    value: Optional[float]
    type: str


class Confidence(BaseModel):
    lower_90: float
    lower_50: float
    median: float
    upper_50: float
    upper_90: float


class ComparisonPoint(BaseModel):
    t: int
    value: Optional[float]
    type: str
    ground_truth: Optional[float] = None
    confidence: Optional[Confidence] = None
