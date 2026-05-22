import logging
import time
from typing import Any

import requests
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_USER_AGENT = "ShadowBroker-OSINT/1.0 (live-risk-dashboard; contact@shadowbroker.app)"
_NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
_last_call = 0.0
_search_cache = TTLCache(maxsize=500, ttl=86400)
_reverse_cache = TTLCache(maxsize=2000, ttl=86400)


# Bounding box overrides for countries with overseas territories or massive wraps
# format: [south, north, west, east] (standard Nominatim boundingbox format)
COUNTRY_BBOX_OVERRIDES = {
    "fr": [41.3, 51.1, -5.2, 9.6],        # Metropolitan France
    "us": [24.4, 49.4, -125.0, -66.9],     # Contiguous USA
    "ru": [41.1, 82.1, 19.5, 180.0],       # Mainland Russia (excluding Western Hemisphere chunk to avoid antimeridian wrap)
    "nl": [50.7, 53.6, 3.3, 7.3],          # European Netherlands
    "au": [-44.0, -10.0, 112.0, 154.0],    # Mainland Australia (excluding remote islands)
}



def _wait_for_rate_limit() -> None:
    global _last_call
    elapsed = time.time() - _last_call
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    _last_call = time.time()


def _get_json(path: str, params: dict[str, Any]) -> Any:
    _wait_for_rate_limit()
    res = requests.get(
        f"{_NOMINATIM_BASE}{path}",
        params=params,
        headers={"User-Agent": _USER_AGENT, "Accept-Language": "en"},
        timeout=10,
    )
    if res.status_code == 429:
        logger.warning("Nominatim rate-limited geocoding request")
        return None
    res.raise_for_status()
    return res.json()


def search_places(query: str, limit: int = 5, country_only: bool = False) -> list[dict[str, Any]]:
    q = query.strip()
    if not q:
        return []

    safe_limit = max(1, min(limit, 10))
    # Include a cache schema tag so logic changes do not reuse stale cached results.
    cache_key = f"search:v2:{country_only}:{safe_limit}:{q.lower()}"
    if cache_key in _search_cache:
        return _search_cache[cache_key]

    params: dict[str, Any] = {
        "format": "jsonv2",
        "limit": safe_limit,
        "addressdetails": 1,
        "q": q,
    }
    if country_only:
        # Nominatim country-level search; avoids returning cities/POIs for region watch.
        params["featuretype"] = "country"

    try:
        data = _get_json("/search", params)
    except (requests.RequestException, ValueError, OSError) as exc:
        logger.warning("Nominatim search failed for %r: %s", q, exc)
        return []

    if data is None:
        return []

    results = []
    for item in data if isinstance(data, list) else []:
        try:
            item_lat = float(item["lat"])
            item_lng = float(item["lon"])
            bbox = [float(v) for v in item.get("boundingbox", [])]
            item_type = (item.get("type") or "").lower()
            item_class = (item.get("class") or "").lower()
            item_category = (item.get("category") or "").lower()
            addresstype = (item.get("addresstype") or "").lower()

            is_country = (
                item_type == "country"
                or addresstype == "country"
                or (item_class == "boundary" and item_type in {"administrative", "country"})
                or (item_category == "boundary" and item_type in {"administrative", "country"})
            )

            if is_country:
                country_code = item.get("address", {}).get("country_code", "").lower()
                if country_code in COUNTRY_BBOX_OVERRIDES:
                    bbox = COUNTRY_BBOX_OVERRIDES[country_code]

            if country_only:
                if not is_country:
                    continue

            results.append(
                {
                    "label": item.get("display_name") or q,
                    "display_name": item.get("display_name") or q,
                    "lat": item_lat,
                    "lng": item_lng,
                    "boundingbox": bbox,
                    "type": item.get("type", ""),
                    "class": item.get("class", ""),
                }
            )
        except (TypeError, ValueError, KeyError):
            continue

    _search_cache[cache_key] = results
    return results


def reverse_place(lat: float, lng: float) -> dict[str, Any]:
    cache_key = f"reverse:{round(lat, 2)}:{round(lng, 2)}"
    if cache_key in _reverse_cache:
        return _reverse_cache[cache_key]

    try:
        data = _get_json(
            "/reverse",
            {
                "lat": lat,
                "lon": lng,
                "format": "jsonv2",
                "zoom": 10,
                "addressdetails": 1,
            },
        )
    except (requests.RequestException, ValueError, OSError) as exc:
        logger.warning("Nominatim reverse failed for (%s, %s): %s", lat, lng, exc)
        return {}

    addr = data.get("address", {}) if isinstance(data, dict) else {}
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or ""
    state = addr.get("state") or addr.get("region") or ""
    country = addr.get("country") or ""
    parts = [city, state, country]
    label = ", ".join(part for part in parts if part)
    if not label and isinstance(data, dict):
        label = ",".join((data.get("display_name") or "").split(",")[:3]).strip()

    result = {
        "label": label or "Unknown",
        "city": city,
        "state": state,
        "country": country,
        "country_code": (addr.get("country_code") or "").upper(),
        "display_name": data.get("display_name", "") if isinstance(data, dict) else "",
    }
    _reverse_cache[cache_key] = result
    return result
