import logging
from typing import Optional
from .base import BaseCollector
from .db_collector import DBCollector
from .api_collector import APICollector
from .mock_collector import MockCollector

log = logging.getLogger(__name__)

_collector: Optional[BaseCollector] = None


def get_collector() -> BaseCollector:
    global _collector
    if _collector is not None:
        return _collector

    for cls in [DBCollector, APICollector, MockCollector]:
        c = cls()
        if c.is_available():
            log.info(f"Using collector: {cls.__name__}")
            _collector = c
            return _collector

    raise RuntimeError("No collector available")


def reset_collector():
    """Force re-detection on next call (useful after config change)."""
    global _collector
    _collector = None
