"""Cybersecurity fetchers — exploited vulnerabilities and threat advisories."""
import json
import logging
import re
from pathlib import Path

from services.fetchers._store import latest_data, _data_lock, _mark_fresh
from services.fetchers.retry import with_retry
from services.network_utils import fetch_with_curl

logger = logging.getLogger("services.data_fetcher")

_BASE_DATA_DIR = Path(__file__).parent.parent.parent / "data"
_CYBERSECURITY_CACHE_PATH = _BASE_DATA_DIR / "cybersecurity_cache.json"
_CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"


def _load_cybersecurity_cache() -> list[dict]:
    try:
        if _CYBERSECURITY_CACHE_PATH.exists():
            with open(_CYBERSECURITY_CACHE_PATH, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if isinstance(cached, list):
                return cached
    except (IOError, OSError, json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to load cybersecurity cache: %s", e)
    return []


def _save_cybersecurity_cache(items: list[dict]) -> None:
    try:
        _CYBERSECURITY_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_CYBERSECURITY_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
    except (IOError, OSError) as e:
        logger.warning("Failed to save cybersecurity cache: %s", e)


def load_cached_cybersecurity_into_store() -> int:
    cached = _load_cybersecurity_cache()
    if not cached:
        return 0
    with _data_lock:
        if latest_data.get("cybersecurity"):
            return len(latest_data["cybersecurity"])
        latest_data["cybersecurity"] = cached
    _mark_fresh("cybersecurity")
    logger.info("Loaded %s cached cybersecurity items into store", len(cached))
    return len(cached)


def _to_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def _risk_score_for_kev(item: dict) -> int:
    title = f"{item.get('vulnerabilityName', '')} {item.get('shortDescription', '')}".lower()
    score = 7
    if str(item.get("knownRansomwareCampaignUse", "")).strip().lower() == "known":
        score += 2
    if any(term in title for term in ("remote code execution", "rce", "authentication bypass", "privilege escalation", "zero-day")):
        score += 1
    return max(1, min(score, 10))


def _severity_from_score(score: int) -> str:
    if score >= 9:
        return "critical"
    if score >= 7:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


def _normalize_kev_item(item: dict) -> dict | None:
    cve = str(item.get("cveID") or "").strip()
    vendor = str(item.get("vendorProject") or "").strip()
    product = str(item.get("product") or "").strip()
    vuln_name = str(item.get("vulnerabilityName") or "").strip()
    if not cve or not vuln_name:
        return None

    score = _risk_score_for_kev(item)
    ransomware = str(item.get("knownRansomwareCampaignUse", "")).strip().lower() == "known"
    title_parts = [cve]
    if vendor or product:
        title_parts.append(" ".join(part for part in (vendor, product) if part).strip())

    return {
        "id": f"kev:{cve.lower()}",
        "type": "vulnerability",
        "title": " · ".join(title_parts),
        "summary": vuln_name,
        "source": "CISA KEV",
        "link": f"https://www.cisa.gov/known-exploited-vulnerabilities-catalog?search_api_fulltext={cve}",
        "published": item.get("dateAdded"),
        "risk_score": score,
        "severity": _severity_from_score(score),
        "cve": cve,
        "vendor": vendor,
        "product": product,
        "known_ransomware": ransomware,
        "due_date": item.get("dueDate"),
        "required_action": item.get("requiredAction"),
        "notes": item.get("notes"),
        "short_description": item.get("shortDescription"),
        "tags": [tag for tag in ("kev", "ransomware" if ransomware else "", _to_slug(vendor), _to_slug(product)) if tag],
    }


@with_retry(max_retries=1, base_delay=2)
def fetch_cybersecurity():
    items: list[dict] = []
    fetched = False
    try:
        response = fetch_with_curl(_CISA_KEV_URL, timeout=20)
        if response.status_code == 200:
            fetched = True
            payload = response.json()
            vulnerabilities = payload.get("vulnerabilities", [])
            for raw in vulnerabilities[:120]:
                normalized = _normalize_kev_item(raw)
                if normalized:
                    items.append(normalized)
            items.sort(
                key=lambda item: (
                    int(item.get("risk_score", 0)),
                    str(item.get("published") or ""),
                ),
                reverse=True,
            )
        else:
            logger.warning("Cybersecurity feed returned status %s", response.status_code)
    except Exception as e:
        logger.error("Error fetching cybersecurity feed: %s", e)

    with _data_lock:
        if items or not latest_data.get("cybersecurity") or fetched:
            latest_data["cybersecurity"] = items
    if items:
        _save_cybersecurity_cache(items)
        _mark_fresh("cybersecurity")
