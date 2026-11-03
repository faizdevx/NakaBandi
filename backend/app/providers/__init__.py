from ..config import settings
from .base import TrafficProvider
from .here import HereProvider
from .tomtom import TomTomProvider


def build_provider(client) -> TrafficProvider | None:
    if settings.tomtom_api_key:
        return TomTomProvider(client, settings.tomtom_api_key)
    return HereProvider(client, settings.here_api_key) if settings.here_api_key else None
