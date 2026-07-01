from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import date


class BaseCollector(ABC):
    """Base interface for all Veeam data collectors."""

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def get_dashboard_summary(self) -> dict: ...

    @abstractmethod
    def get_recent_jobs(self, limit: int = 10) -> List[dict]: ...

    @abstractmethod
    def get_job_trend(self, days: int = 7) -> List[dict]: ...

    @abstractmethod
    def get_job_history(
        self,
        start_date: Optional[date],
        end_date: Optional[date],
        job_type: Optional[str],
        status: Optional[str],
        job_name: Optional[str],
        server: Optional[str],
        page: int,
        page_size: int,
    ) -> dict: ...

    @abstractmethod
    def get_backup_servers(self) -> List[dict]: ...

    @abstractmethod
    def get_proxy_servers(self) -> List[dict]: ...

    @abstractmethod
    def get_repositories(self) -> List[dict]: ...
