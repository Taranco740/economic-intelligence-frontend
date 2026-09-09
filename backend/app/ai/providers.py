from abc import ABC, abstractmethod
from dataclasses import dataclass
@dataclass(frozen=True)
class AIRequest:
    system: str
    user: str
    model: str
class AIProvider(ABC):
    @abstractmethod
    def generate(self, request: AIRequest) -> str: raise NotImplementedError
