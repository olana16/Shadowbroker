import logging
import re
import time
from urllib.parse import parse_qs, urlparse

from services.network_utils import fetch_with_curl

logger = logging.getLogger(__name__)

_CACHE_TTL = 1800
_embed_cache: dict[str, tuple[float, str]] = {}


def _cache_get(url: str) -> str | None:
    cached = _embed_cache.get(url)
    if not cached:
        return None
    ts, value = cached
    if time.time() - ts > _CACHE_TTL:
        _embed_cache.pop(url, None)
        return None
    return value


def _cache_set(url: str, embed_url: str) -> str:
    _embed_cache[url] = (time.time(), embed_url)
    return embed_url


def _watch_embed(video_id: str) -> str:
    return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1&mute=1&playsinline=1&rel=0"


def _channel_live_embed(channel_id: str) -> str:
    return f"https://www.youtube-nocookie.com/embed/live_stream?channel={channel_id}&autoplay=1&mute=1&playsinline=1"


def _extract_channel_id_from_html(html: str) -> str | None:
    patterns = [
        r'"channelId":"(UC[a-zA-Z0-9_-]{20,})"',
        r'"externalId":"(UC[a-zA-Z0-9_-]{20,})"',
        r'https://www\.youtube\.com/channel/(UC[a-zA-Z0-9_-]{20,})',
        r'/channel/(UC[a-zA-Z0-9_-]{20,})',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1)
    return None


def resolve_youtube_embed_url(youtube_url: str) -> str:
    cached = _cache_get(youtube_url)
    if cached:
        return cached

    parsed = urlparse(youtube_url)
    host = parsed.netloc.replace("www.", "").replace("m.", "")
    path = parsed.path.rstrip("/")

    if host == "youtu.be":
        video_id = path.lstrip("/")
        if video_id:
            return _cache_set(youtube_url, _watch_embed(video_id))

    if host == "youtube.com":
        if path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
            if video_id:
                return _cache_set(youtube_url, _watch_embed(video_id))

        if path.startswith("/shorts/"):
            video_id = path.split("/")[2]
            if video_id:
                return _cache_set(youtube_url, _watch_embed(video_id))

        if path.startswith("/channel/"):
            parts = path.split("/")
            if len(parts) >= 3 and parts[2]:
                return _cache_set(youtube_url, _channel_live_embed(parts[2]))

        if path.startswith("/@") or path.startswith("/c/") or path.startswith("/user/"):
            try:
                response = fetch_with_curl(youtube_url, timeout=12)
                html = response.text
                channel_id = _extract_channel_id_from_html(html)
                if channel_id:
                    return _cache_set(youtube_url, _channel_live_embed(channel_id))
            except Exception as e:
                logger.warning(f"Failed to resolve YouTube channel handle URL {youtube_url}: {e}")

    return _cache_set(youtube_url, youtube_url)
