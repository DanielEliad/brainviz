from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SmoothingAlgorithm(str, Enum):
    MOVING_AVERAGE = "moving_average"
    EXPONENTIAL = "exponential"
    GAUSSIAN = "gaussian"


class InterpolationAlgorithm(str, Enum):
    LINEAR = "linear"
    CUBIC_SPLINE = "cubic_spline"
    B_SPLINE = "b_spline"
    UNIVARIATE_SPLINE = "univariate_spline"


class SmoothingParams(BaseModel):
    algorithm: Optional[SmoothingAlgorithm] = Field(
        default=None, description="Smoothing algorithm"
    )
    window: int = Field(
        default=3, ge=2, le=10, description="Window size for moving average"
    )
    alpha: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Alpha for exponential smoothing"
    )
    sigma: float = Field(
        default=1.0, ge=0.1, le=5.0, description="Sigma for gaussian smoothing"
    )


class InterpolationParams(BaseModel):
    algorithm: Optional[InterpolationAlgorithm] = Field(
        default=None, description="Interpolation algorithm"
    )
    factor: int = Field(
        default=2, ge=2, le=10, description="Frame multiplication factor"
    )


class CorrelationRequest(BaseModel):
    file_path: str = Field(..., description="Relative path to subject file")
    method: str = Field(..., description="Correlation method: pearson, spearman, wavelet")
    window_size: Optional[int] = Field(default=None, ge=5, description="Sliding window size (None = full series)")
    step: Optional[int] = Field(default=None, ge=1, description="Step between windows (None = 1)")
    smoothing: Optional[SmoothingParams] = Field(default=None, description="Smoothing parameters")
    interpolation: Optional[InterpolationParams] = Field(default=None, description="Interpolation parameters")


