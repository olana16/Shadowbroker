"""
News risk keyword configuration.

Defaults live in backend/config/news_keywords.json.
Runtime/user-saved keywords are stored in backend/data/news_keywords.json so
they survive Docker container rebuilds when /app/data is mounted as a volume.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent.parent / "config" / "news_keywords.json"
RUNTIME_CONFIG_PATH = Path(__file__).parent.parent / "data" / "news_keywords.json"
MAX_KEYWORDS = 100

DEFAULT_KEYWORDS = [
    "war",
    "missile",
    "strike",
    "attack",
    "crisis",
    "tension",
    "military",
    "conflict",
    "defense",
    "clash",
    "nuclear",
]


def _normalize_keyword(keyword: object) -> str | None:
    if not isinstance(keyword, str):
        return None
    cleaned = keyword.strip().lower()
    if not cleaned:
        return None
    if len(cleaned) > 60:
        return None
    return cleaned


def _merge_keywords(saved_keywords: list[object]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()

    for keyword in saved_keywords:
        normalized = _normalize_keyword(keyword)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)

    for keyword in DEFAULT_KEYWORDS:
        normalized = _normalize_keyword(keyword)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)

    return merged[:MAX_KEYWORDS]


def get_keywords() -> list[str]:
    """Load runtime keywords first, then merge in any missing defaults."""
    try:
        for path in (RUNTIME_CONFIG_PATH, DEFAULT_CONFIG_PATH):
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                keywords = data.get("keywords", []) if isinstance(data, dict) else data
                if isinstance(keywords, list) and keywords:
                    return _merge_keywords(keywords)
    except (IOError, OSError, json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Failed to read news keyword config: {e}")
    return _merge_keywords(DEFAULT_KEYWORDS)


def save_keywords(keywords: list[object]) -> bool:
    """Validate and save keywords to the persistent runtime config."""
    if not isinstance(keywords, list):
        return False
    if len(keywords) > MAX_KEYWORDS:
        return False

    normalized_keywords: list[str] = []
    seen: set[str] = set()
    for keyword in keywords:
        normalized = _normalize_keyword(keyword)
        if not normalized or normalized in seen:
            return False
        seen.add(normalized)
        normalized_keywords.append(normalized)

    try:
        RUNTIME_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        RUNTIME_CONFIG_PATH.write_text(
            json.dumps({"keywords": normalized_keywords}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return True
    except (IOError, OSError) as e:
        logger.error(f"Failed to write news keyword config: {e}")
        return False


def reset_keywords() -> bool:
    """Reset keywords to defaults."""
    return save_keywords(list(DEFAULT_KEYWORDS))
