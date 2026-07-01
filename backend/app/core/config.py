from pydantic_settings import BaseSettings
from typing import List
from urllib.parse import quote_plus


class Settings(BaseSettings):
    # DB (PostgreSQL — Veeam v12)
    VEEAM_DB_TYPE: str = "postgresql"
    VEEAM_DB_HOST: str = ""
    VEEAM_DB_PORT: int = 5432
    VEEAM_DB_NAME: str = "VeeamBackup"
    VEEAM_DB_USER: str = ""
    VEEAM_DB_PASSWORD: str = ""

    # VBR REST API (폴백)
    VEEAM_API_HOST: str = ""
    VEEAM_API_USER: str = ""
    VEEAM_API_PASSWORD: str = ""
    VEEAM_API_VERIFY_SSL: bool = False

    # JWT
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Grafana
    GRAFANA_URL: str = ""
    GRAFANA_API_KEY: str = ""

    # App
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def db_url(self) -> str:
        pw = quote_plus(self.VEEAM_DB_PASSWORD)
        return (
            f"postgresql+psycopg2://{self.VEEAM_DB_USER}:{pw}"
            f"@{self.VEEAM_DB_HOST}:{self.VEEAM_DB_PORT}/{self.VEEAM_DB_NAME}"
        )

    class Config:
        env_file = ".env"


settings = Settings()
