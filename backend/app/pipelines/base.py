from abc import ABC, abstractmethod
from typing import List

from app.models import GraphFrame, GraphMeta


class GraphPipeline(ABC):
    """Defines the interface for creating graph frames from raw data."""

    @abstractmethod
    def get_meta(self) -> GraphMeta:
        raise NotImplementedError

    @abstractmethod
    def frame_at(self, timestamp: int) -> GraphFrame:
        raise NotImplementedError

    @abstractmethod
    def available_timestamps(self) -> List[int]:
        raise NotImplementedError
