from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    tomtom_api_key: str = ""
    here_api_key: str = ""
    redis_url: str = ""
    database_url: str = ""
    admin_token: str = ""
    static_dir: str = ""

    flow_ttl_seconds: int = 900
    road_ttl_seconds: int = 60
    national_ttl_seconds: int = 10800

    # Daily guards that keep TomTom inside its free monthly quota (20K flow, 200K tiles, 2.5K incidents).
    flow_daily_budget: int = 600
    tile_daily_budget: int = 6000
    incident_daily_budget: int = 75

    geo_user_agent: str = "Nakabandi/0.1 (https://github.com/faizdevx/NakaBandi)"
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    overpass_url: str = "https://overpass-api.de/api/interpreter"

    ai_provider: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    ollama_url: str = ""
    ollama_model: str = "llama3.2"


settings = Settings()
