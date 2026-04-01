"""
Live video channel configuration for the YouTube news panel.

Defaults live in backend/config/live_video_channels.json.
Runtime/user-saved channels are stored in backend/data/live_video_channels.json.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "live_video_channels.json"
RUNTIME_CONFIG_PATH = Path(__file__).parent.parent / "data" / "live_video_channels.json"
MAX_CHANNELS = 20

DEFAULT_CHANNELS = [
    {"name": "Sky News", "region": "UK / Global", "youtube_url": "https://www.youtube.com/watch?v=9Auq9mYxFEE", "enabled": True},
    {"name": "Al Jazeera English", "region": "Middle East / Global", "youtube_url": "https://www.youtube.com/watch?v=bNyUyrR0PHo", "enabled": True},
    {"name": "Bloomberg Television", "region": "Markets / Global", "youtube_url": "https://www.youtube.com/channel/UCIALMKvObZNtJ6AmdCLP7Lg/live", "enabled": True},
]


def _normalize_channel(channel: dict) -> dict | None:
    if not isinstance(channel, dict):
        return None

    name = str(channel.get("name", "")).strip()
    region = str(channel.get("region", "")).strip()
    youtube_url = str(channel.get("youtube_url", "")).strip()
    enabled = bool(channel.get("enabled", True))

    if not name or not youtube_url:
        return None
    if "youtube.com" not in youtube_url and "youtu.be" not in youtube_url:
        return None

    return {
        "name": name,
        "region": region or "Global",
        "youtube_url": youtube_url,
        "enabled": enabled,
    }


def get_channels() -> list[dict]:
    for path in (RUNTIME_CONFIG_PATH, DEFAULT_CONFIG_PATH):
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            channels = data.get("channels", []) if isinstance(data, dict) else data
            normalized = [_normalize_channel(ch) for ch in channels]
            normalized = [ch for ch in normalized if ch]
            if normalized:
                return normalized[:MAX_CHANNELS]
        except Exception as e:
            logger.warning(f"Failed to load live video config from {path}: {e}")
    return [_normalize_channel(ch) for ch in DEFAULT_CHANNELS if _normalize_channel(ch)]


def save_channels(channels: list[dict]) -> bool:
    if not isinstance(channels, list):
        return False
    normalized = [_normalize_channel(ch) for ch in channels]
    normalized = [ch for ch in normalized if ch][:MAX_CHANNELS]
    try:
        RUNTIME_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        RUNTIME_CONFIG_PATH.write_text(
            json.dumps({"channels": normalized}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return True
    except Exception as e:
        logger.error(f"Failed to save live video channels: {e}")
        return False


def reset_channels() -> bool:
    return save_channels(list(DEFAULT_CHANNELS))
