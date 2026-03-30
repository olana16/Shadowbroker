"""
Telegram channel configuration — manages the user-customisable Telegram channel list.

Defaults live in backend/config/telegram_channels.json.
Runtime/user-saved channels are stored in backend/data/telegram_channels.json so they
survive Docker container rebuilds when /app/data is mounted as a volume.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "telegram_channels.json"
RUNTIME_CONFIG_PATH = Path(__file__).parent.parent / "data" / "telegram_channels.json"
MAX_CHANNELS = 20

DEFAULT_CHANNELS = [
    {"username": "@tikvahethiopia", "name": "Tikvah Ethiopia", "enabled": True},
    {"username": "@Sport_433et", "name": "Sport 433 ", "enabled": True},
    {"username": "@insagovet", "name": "Insa ETH", "enabled": True},
]


def _normalize_channel(channel: dict) -> dict | None:
    """Validate and normalize a single channel entry."""
    if not isinstance(channel, dict):
        return None

    username = str(channel.get("username", "")).strip()
    if not username.startswith("@"):
        username = "@" + username
    name = str(channel.get("name", username)).strip()
    enabled = channel.get("enabled", True)

    if not username or len(username) < 2:
        return None

    return {
        "username": username,
        "name": name,
        "enabled": bool(enabled)
    }


def get_channels():
    """Get the list of configured Telegram channels."""
    # Try runtime config first
    if RUNTIME_CONFIG_PATH.exists():
        try:
            with open(RUNTIME_CONFIG_PATH, 'r') as f:
                data = json.load(f)
                channels = [_normalize_channel(ch) for ch in data.get("channels", [])]
                channels = [ch for ch in channels if ch]  # Filter out None
                if channels:
                    return channels
        except Exception as e:
            logger.warning(f"Failed to load runtime Telegram config: {e}")

    # Fall back to default config
    if DEFAULT_CONFIG_PATH.exists():
        try:
            with open(DEFAULT_CONFIG_PATH, 'r') as f:
                data = json.load(f)
                channels = [_normalize_channel(ch) for ch in data.get("channels", [])]
                channels = [ch for ch in channels if ch]
                if channels:
                    return channels
        except Exception as e:
            logger.warning(f"Failed to load default Telegram config: {e}")

    # Ultimate fallback
    return [_normalize_channel(ch) for ch in DEFAULT_CHANNELS if _normalize_channel(ch)]


def save_channels(channels: list):
    """Save the list of channels to runtime config."""
    normalized = [_normalize_channel(ch) for ch in channels]
    normalized = [ch for ch in normalized if ch][:MAX_CHANNELS]  # Limit and filter

    RUNTIME_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(RUNTIME_CONFIG_PATH, 'w') as f:
            json.dump({"channels": normalized}, f, indent=2)
        logger.info(f"Saved {len(normalized)} Telegram channels to {RUNTIME_CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Failed to save Telegram channels: {e}")
        return False
    return True


def reset_channels() -> bool:
    """Reset Telegram channels to defaults."""
    return save_channels(list(DEFAULT_CHANNELS))


def get_enabled_channels():
    """Get only enabled channels."""
    channels = get_channels()
    return [ch for ch in channels if ch["enabled"]]
