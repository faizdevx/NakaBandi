from typing import Protocol

from ..schemas import BBox, FlowBatch, Incident


class TrafficProvider(Protocol):
    """Adding a provider means implementing this and normalizing into the shared schema."""

    name: str
    attribution: str
    capabilities: dict[str, bool]
    max_bbox_side: float  # degrees per request

    async def flow(self, bbox: BBox, max_functional_class: int) -> FlowBatch: ...

    async def incidents(self, bbox: BBox) -> list[Incident]: ...
