from ..config import settings
from .base import TrafficProvider
from .here import HereProvider


def build_provider(client) -> TrafficProvider | None:
    return HereProvider(client, settings.here_api_key) if settings.here_api_key else None
