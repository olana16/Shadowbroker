"""Satellite tracking — public TLE fetch, SGP4 propagation, intel classification.

CelesTrak Fair Use Policy (https://celestrak.org/NORAD/elements/):
  - Do NOT request the same data more than once every 24 hours
  - Use If-Modified-Since headers for conditional requests
  - No parallel/concurrent connections — one request at a time
  - Set a descriptive User-Agent
"""
import math
import time
import json
import re
import logging
import requests
from pathlib import Path
from datetime import datetime, timedelta
from sgp4.api import Satrec, WGS72, jday
from services.fetchers._store import latest_data, _data_lock, _mark_fresh

logger = logging.getLogger("services.data_fetcher")


def _gmst(jd_ut1):
    """Greenwich Mean Sidereal Time in radians from Julian Date."""
    t = (jd_ut1 - 2451545.0) / 36525.0
    gmst_sec = 67310.54841 + (876600.0 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t
    gmst_rad = (gmst_sec % 86400) / 86400.0 * 2 * math.pi
    return gmst_rad


# Satellite GP data cache
# Public TLE providers refresh roughly daily; SGP4 propagation runs every cycle using cached elements.
_SAT_FETCH_INTERVAL = 86400  # 24 hours
_SAT_REFRESH_RETRY_DELAY = 1800  # 30 minutes after a failed live refresh
_TLE_API_BASE = "https://tle.ivanstanojevic.me/api/tle"
_TLE_API_PAGE_SIZE = 500
_TLE_API_MAX_PAGES = 40
_TLE_API_PAGE_DELAY_SECONDS = 0.2
_TLE_API_CATALOG_TIMEOUT = 6
_TLE_API_SEARCH_TIMEOUT = 4
_CELESTRAK_TIMEOUT = 5
_sat_gp_cache = {
    "data": None,
    "last_fetch": 0,
    "source": "none",
    "last_modified": None,
    "last_attempt": 0,
    "next_retry_at": 0,
}
_sat_classified_cache = {"data": None, "gp_fetch_ts": 0}
_SAT_CACHE_PATH = Path(__file__).parent.parent.parent / "data" / "sat_gp_cache.json"
_SAT_CACHE_META_PATH = Path(__file__).parent.parent.parent / "data" / "sat_gp_cache_meta.json"
_SAT_SEED_CACHE_PATH = Path(__file__).parent.parent.parent / "bootstrap" / "sat_gp_cache.json"

def _load_sat_cache(max_age_hours=48):
    """Load satellite GP data from local disk cache.

    max_age_hours:
      - numeric: only accept cache newer than this age
      - None: accept any cache age
    """
    try:
        if _SAT_CACHE_PATH.exists():
            import os
            age_hours = (time.time() - os.path.getmtime(str(_SAT_CACHE_PATH))) / 3600
            if max_age_hours is None or age_hours < max_age_hours:
                with open(_SAT_CACHE_PATH, "r") as f:
                    data = json.load(f)
                if isinstance(data, list) and len(data) > 10:
                    logger.info(f"Satellites: Loaded {len(data)} records from disk cache ({age_hours:.1f}h old)")
                    # Restore last_modified from metadata
                    _load_cache_meta()
                    return data
            else:
                logger.info(f"Satellites: Disk cache is {age_hours:.0f}h old, will try fresh fetch")
    except (IOError, OSError, json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning(f"Satellites: Failed to load disk cache: {e}")
    return None

def _save_sat_cache(data):
    """Save satellite GP data to local disk cache."""
    try:
        _SAT_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_SAT_CACHE_PATH, "w") as f:
            json.dump(data, f)
        _save_cache_meta()
        logger.info(f"Satellites: Saved {len(data)} records to disk cache")
    except (IOError, OSError) as e:
        logger.warning(f"Satellites: Failed to save disk cache: {e}")

def _load_cache_meta():
    """Load cache metadata (Last-Modified timestamp) from disk."""
    try:
        if _SAT_CACHE_META_PATH.exists():
            with open(_SAT_CACHE_META_PATH, "r") as f:
                meta = json.load(f)
            _sat_gp_cache["last_modified"] = meta.get("last_modified")
    except (IOError, OSError, json.JSONDecodeError, ValueError, KeyError):
        pass

def _save_cache_meta():
    """Save cache metadata to disk."""
    try:
        with open(_SAT_CACHE_META_PATH, "w") as f:
            json.dump({"last_modified": _sat_gp_cache.get("last_modified")}, f)
    except (IOError, OSError):
        pass


def _load_sat_seed_cache():
    """Load bundled fallback cache baked into the worktree/image for cold starts."""
    try:
        if _SAT_SEED_CACHE_PATH.exists():
            with open(_SAT_SEED_CACHE_PATH, "r") as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 10:
                logger.info(f"Satellites: Loaded {len(data)} records from bundled seed cache")
                return data
    except (IOError, OSError, json.JSONDecodeError, ValueError, KeyError) as e:
        logger.warning(f"Satellites: Failed to load bundled seed cache: {e}")
    return None


# Satellite intelligence classification database
_SAT_INTEL_DB = [
    ("USA 224", {"country": "USA", "mission": "military_recon", "sat_type": "KH-11 Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/KH-11_KENNEN"}),
    ("USA 245", {"country": "USA", "mission": "military_recon", "sat_type": "KH-11 Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/KH-11_KENNEN"}),
    ("USA 290", {"country": "USA", "mission": "military_recon", "sat_type": "KH-11 Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/KH-11_KENNEN"}),
    ("USA 314", {"country": "USA", "mission": "military_recon", "sat_type": "KH-11 Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/KH-11_KENNEN"}),
    ("USA 338", {"country": "USA", "mission": "military_recon", "sat_type": "Keyhole Successor", "wiki": "https://en.wikipedia.org/wiki/KH-11_KENNEN"}),
    ("TOPAZ", {"country": "Russia", "mission": "military_recon", "sat_type": "Optical Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/Persona_(satellite)"}),
    ("PERSONA", {"country": "Russia", "mission": "military_recon", "sat_type": "Optical Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/Persona_(satellite)"}),
    ("KONDOR", {"country": "Russia", "mission": "military_sar", "sat_type": "SAR Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/Kondor_(satellite)"}),
    ("BARS-M", {"country": "Russia", "mission": "military_recon", "sat_type": "Mapping Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/Bars-M"}),
    ("YAOGAN", {"country": "China", "mission": "military_recon", "sat_type": "Remote Sensing / ELINT", "wiki": "https://en.wikipedia.org/wiki/Yaogan"}),
    ("GAOFEN", {"country": "China", "mission": "military_recon", "sat_type": "High-Res Imaging", "wiki": "https://en.wikipedia.org/wiki/Gaofen"}),
    ("JILIN", {"country": "China", "mission": "commercial_imaging", "sat_type": "Video / Imaging", "wiki": "https://en.wikipedia.org/wiki/Jilin-1"}),
    ("OFEK", {"country": "Israel", "mission": "military_recon", "sat_type": "Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/Ofeq"}),
    ("CSO", {"country": "France", "mission": "military_recon", "sat_type": "Optical Reconnaissance", "wiki": "https://en.wikipedia.org/wiki/CSO_(satellite)"}),
    ("IGS", {"country": "Japan", "mission": "military_recon", "sat_type": "Intelligence Gathering", "wiki": "https://en.wikipedia.org/wiki/Information_Gathering_Satellite"}),
    ("CAPELLA", {"country": "USA", "mission": "sar", "sat_type": "SAR Imaging", "wiki": "https://en.wikipedia.org/wiki/Capella_Space"}),
    ("ICEYE", {"country": "Finland", "mission": "sar", "sat_type": "SAR Microsatellite", "wiki": "https://en.wikipedia.org/wiki/ICEYE"}),
    ("COSMO", {"country": "Italy", "mission": "sar", "sat_type": "SAR Constellation", "wiki": "https://en.wikipedia.org/wiki/COSMO-SkyMed"}),
    ("TANDEM", {"country": "Germany", "mission": "sar", "sat_type": "SAR Interferometry", "wiki": "https://en.wikipedia.org/wiki/TanDEM-X"}),
    ("PAZ", {"country": "Spain", "mission": "sar", "sat_type": "SAR Imaging", "wiki": "https://en.wikipedia.org/wiki/PAZ_(satellite)"}),
    ("WORLDVIEW", {"country": "USA", "mission": "commercial_imaging", "sat_type": "Maxar High-Res", "wiki": "https://en.wikipedia.org/wiki/WorldView-3"}),
    ("GEOEYE", {"country": "USA", "mission": "commercial_imaging", "sat_type": "Maxar Imaging", "wiki": "https://en.wikipedia.org/wiki/GeoEye-1"}),
    ("PLEIADES", {"country": "France", "mission": "commercial_imaging", "sat_type": "Airbus Imaging", "wiki": "https://en.wikipedia.org/wiki/Pl%C3%A9iades_(satellite)"}),
    ("SPOT", {"country": "France", "mission": "commercial_imaging", "sat_type": "Airbus Medium-Res", "wiki": "https://en.wikipedia.org/wiki/SPOT_(satellite)"}),
    ("PLANET", {"country": "USA", "mission": "commercial_imaging", "sat_type": "PlanetScope", "wiki": "https://en.wikipedia.org/wiki/Planet_Labs"}),
    ("SKYSAT", {"country": "USA", "mission": "commercial_imaging", "sat_type": "Planet Video", "wiki": "https://en.wikipedia.org/wiki/SkySat"}),
    ("BLACKSKY", {"country": "USA", "mission": "commercial_imaging", "sat_type": "BlackSky Imaging", "wiki": "https://en.wikipedia.org/wiki/BlackSky"}),
    ("NROL", {"country": "USA", "mission": "sigint", "sat_type": "Classified NRO", "wiki": "https://en.wikipedia.org/wiki/National_Reconnaissance_Office"}),
    ("MENTOR", {"country": "USA", "mission": "sigint", "sat_type": "SIGINT / ELINT", "wiki": "https://en.wikipedia.org/wiki/Mentor_(satellite)"}),
    ("LUCH", {"country": "Russia", "mission": "sigint", "sat_type": "Relay / SIGINT", "wiki": "https://en.wikipedia.org/wiki/Luch_(satellite)"}),
    ("SHIJIAN", {"country": "China", "mission": "sigint", "sat_type": "ELINT / Tech Demo", "wiki": "https://en.wikipedia.org/wiki/Shijian"}),
    ("NAVSTAR", {"country": "USA", "mission": "navigation", "sat_type": "GPS", "wiki": "https://en.wikipedia.org/wiki/GPS_satellite_blocks"}),
    ("GLONASS", {"country": "Russia", "mission": "navigation", "sat_type": "GLONASS", "wiki": "https://en.wikipedia.org/wiki/GLONASS"}),
    ("BEIDOU", {"country": "China", "mission": "navigation", "sat_type": "BeiDou", "wiki": "https://en.wikipedia.org/wiki/BeiDou"}),
    ("GALILEO", {"country": "EU", "mission": "navigation", "sat_type": "Galileo", "wiki": "https://en.wikipedia.org/wiki/Galileo_(satellite_navigation)"}),
    ("SBIRS", {"country": "USA", "mission": "early_warning", "sat_type": "Missile Warning", "wiki": "https://en.wikipedia.org/wiki/Space-Based_Infrared_System"}),
    ("TUNDRA", {"country": "Russia", "mission": "early_warning", "sat_type": "Missile Warning", "wiki": "https://en.wikipedia.org/wiki/Tundra_(satellite)"}),
    ("ISS", {"country": "Intl", "mission": "space_station", "sat_type": "Space Station", "wiki": "https://en.wikipedia.org/wiki/International_Space_Station"}),
    ("TIANGONG", {"country": "China", "mission": "space_station", "sat_type": "Space Station", "wiki": "https://en.wikipedia.org/wiki/Tiangong_space_station"}),
    ("CSS", {"country": "China", "mission": "space_station", "sat_type": "Chinese Space Station", "wiki": "https://en.wikipedia.org/wiki/Tiangong_space_station"}),
    # Russian military — COSMOS covers the bulk of active Russian military/SIGINT satellites
    ("COSMOS", {"country": "Russia", "mission": "military_recon", "sat_type": "Russian Military / COSMOS", "wiki": "https://en.wikipedia.org/wiki/Kosmos_(satellite)"}),
    # US military communications
    ("WGS", {"country": "USA", "mission": "sigint", "sat_type": "Wideband Global SATCOM", "wiki": "https://en.wikipedia.org/wiki/Wideband_Global_SATCOM"}),
    ("AEHF", {"country": "USA", "mission": "sigint", "sat_type": "Advanced EHF MILSATCOM", "wiki": "https://en.wikipedia.org/wiki/Advanced_Extremely_High_Frequency"}),
    ("MUOS", {"country": "USA", "mission": "sigint", "sat_type": "Mobile User Objective System", "wiki": "https://en.wikipedia.org/wiki/Mobile_User_Objective_System"}),
    # EU Earth observation
    ("SENTINEL", {"country": "EU", "mission": "commercial_imaging", "sat_type": "ESA Copernicus", "wiki": "https://en.wikipedia.org/wiki/Sentinel_(satellite)"}),
]


def _parse_tle_to_gp(name, norad_id, line1, line2):
    """Convert a two-line element record to the GP fields used by the propagator."""
    try:
        incl = float(line2[8:16].strip())
        raan = float(line2[17:25].strip())
        ecc = float("0." + line2[26:33].strip())
        argp = float(line2[34:42].strip())
        ma = float(line2[43:51].strip())
        mm = float(line2[52:63].strip())
        bstar_str = line1[53:61].strip()
        if bstar_str:
            mantissa = float(bstar_str[:-2]) / 1e5
            exponent = int(bstar_str[-2:])
            bstar = mantissa * (10 ** exponent)
        else:
            bstar = 0.0
        epoch_yr = int(line1[18:20])
        epoch_day = float(line1[20:32].strip())
        year = 2000 + epoch_yr if epoch_yr < 57 else 1900 + epoch_yr
        epoch_dt = datetime(year, 1, 1) + timedelta(days=epoch_day - 1)
        return {
            "OBJECT_NAME": name,
            "NORAD_CAT_ID": norad_id,
            "MEAN_MOTION": mm,
            "ECCENTRICITY": ecc,
            "INCLINATION": incl,
            "RA_OF_ASC_NODE": raan,
            "ARG_OF_PERICENTER": argp,
            "MEAN_ANOMALY": ma,
            "BSTAR": bstar,
            "EPOCH": epoch_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        }
    except (ValueError, TypeError, IndexError, KeyError):
        return None


def _normalize_tle_api_url(url):
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return f"https://tle.ivanstanojevic.me{url}"
    return f"{_TLE_API_BASE.rstrip('/')}/{url.lstrip('/')}"


def _extract_tle_members(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    members = payload.get("member")
    if isinstance(members, list):
        return members
    hydra_members = payload.get("hydra:member")
    if isinstance(hydra_members, list):
        return hydra_members
    items = payload.get("items")
    if isinstance(items, list):
        return items
    return []


def _extract_next_page_url(payload):
    if not isinstance(payload, dict):
        return None
    view = payload.get("view")
    if isinstance(view, dict):
        next_url = view.get("next")
        if next_url:
            return _normalize_tle_api_url(next_url)
    hydra_view = payload.get("hydra:view")
    if isinstance(hydra_view, dict):
        next_url = hydra_view.get("hydra:next")
        if next_url:
            return _normalize_tle_api_url(next_url)
    return _normalize_tle_api_url(payload.get("next"))


def _fetch_satellites_from_tle_api_catalog():
    """Fetch the public TLE catalog and page through it when pagination is exposed."""
    url = f"{_TLE_API_BASE}?page_size={_TLE_API_PAGE_SIZE}&format=json"
    all_results = []
    seen_ids = set()

    for page_num in range(1, _TLE_API_MAX_PAGES + 1):
        response = requests.get(url, timeout=_TLE_API_CATALOG_TIMEOUT)
        if response.status_code != 200:
            logger.warning(f"Satellites: TLE API catalog request failed with {response.status_code} on page {page_num}")
            break

        payload = response.json()
        members = _extract_tle_members(payload)
        if not members:
            break

        for member in members:
            gp = _parse_tle_to_gp(
                member.get("name", "UNKNOWN"),
                member.get("satelliteId"),
                member.get("line1", ""),
                member.get("line2", ""),
            )
            if not gp:
                continue
            sat_id = gp.get("NORAD_CAT_ID")
            if sat_id in seen_ids:
                continue
            seen_ids.add(sat_id)
            all_results.append(gp)

        next_url = _extract_next_page_url(payload)
        if not next_url or next_url == url:
            break
        url = next_url
        if page_num < _TLE_API_MAX_PAGES:
            time.sleep(_TLE_API_PAGE_DELAY_SECONDS)

    return all_results


def _fetch_satellites_from_tle_api_search():
    """Fallback: search the public TLE API by tracked intel keywords."""
    search_terms = set()
    for key, _ in _SAT_INTEL_DB:
        term = key.split()[0] if len(key.split()) > 1 and key.split()[0] in ("USA", "NROL") else key
        search_terms.add(term)

    all_results = []
    seen_ids = set()
    for term in sorted(search_terms):
        try:
            url = f"{_TLE_API_BASE}/?search={term}&page_size=100&format=json"
            response = requests.get(url, timeout=_TLE_API_SEARCH_TIMEOUT)
            if response.status_code != 200:
                continue
            data = response.json()
            for member in _extract_tle_members(data):
                gp = _parse_tle_to_gp(
                    member.get("name", "UNKNOWN"),
                    member.get("satelliteId"),
                    member.get("line1", ""),
                    member.get("line2", ""),
                )
                if gp:
                    sat_id = gp.get("NORAD_CAT_ID")
                    if sat_id not in seen_ids:
                        seen_ids.add(sat_id)
                        all_results.append(gp)
            time.sleep(0.1)
        except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError) as e:
            logger.debug(f"TLE fallback search '{term}' failed: {e}")

    return all_results


def fetch_satellites():
    sats = []
    try:
        now_ts = time.time()
        # Load from disk cache first for immediate display
        if _sat_gp_cache["data"] is None:
            disk_data = _load_sat_cache(max_age_hours=None)
            if disk_data:
                _sat_gp_cache["data"] = disk_data
                _sat_gp_cache["last_fetch"] = now_ts
                _sat_gp_cache["source"] = "disk_cache"
                logger.info("Satellites: Using persisted cache for immediate display while refresh runs")

        if _sat_gp_cache["data"] is None:
            seed_data = _load_sat_seed_cache()
            if seed_data:
                _sat_gp_cache["data"] = seed_data
                _sat_gp_cache["last_fetch"] = now_ts
                _sat_gp_cache["source"] = "seed_cache"
                logger.info("Satellites: Using bundled seed cache for immediate display while refresh runs")

        refresh_due = _sat_gp_cache["data"] is None or (now_ts - _sat_gp_cache["last_fetch"]) > _SAT_FETCH_INTERVAL
        should_retry_live = now_ts >= _sat_gp_cache.get("next_retry_at", 0)

        if refresh_due and should_retry_live:
            _sat_gp_cache["last_attempt"] = now_ts
            live_refresh_succeeded = False
            logger.info("Satellites: attempting live refresh from public providers...")
            try:
                catalog_data = _fetch_satellites_from_tle_api_catalog()
                if catalog_data and len(catalog_data) > 100:
                    _sat_gp_cache["data"] = catalog_data
                    _sat_gp_cache["last_fetch"] = now_ts
                    _sat_gp_cache["source"] = "tle_api"
                    _sat_gp_cache["next_retry_at"] = 0
                    _save_sat_cache(catalog_data)
                    live_refresh_succeeded = True
                    logger.info(f"Satellites: Downloaded {len(catalog_data)} GP records from TLE API catalog")
            except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, OSError) as e:
                logger.warning(f"Satellites: TLE API catalog fetch failed: {e}")

            if not live_refresh_succeeded:
                gp_urls = [
                    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
                    "https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
                ]
                headers = {}
                if _sat_gp_cache.get("last_modified"):
                    headers["If-Modified-Since"] = _sat_gp_cache["last_modified"]

                for url in gp_urls:
                    try:
                        response = requests.get(url, timeout=_CELESTRAK_TIMEOUT, headers=headers)
                        if response.status_code == 304:
                            _sat_gp_cache["last_fetch"] = now_ts
                            _sat_gp_cache["next_retry_at"] = 0
                            live_refresh_succeeded = True
                            logger.info("Satellites: CelesTrak returned 304 Not Modified (data unchanged)")
                            break
                        if response.status_code == 200:
                            gp_data = response.json()
                            if isinstance(gp_data, list) and len(gp_data) > 100:
                                _sat_gp_cache["data"] = gp_data
                                _sat_gp_cache["last_fetch"] = now_ts
                                _sat_gp_cache["source"] = "celestrak"
                                _sat_gp_cache["next_retry_at"] = 0
                                if hasattr(response, "headers"):
                                    lm = response.headers.get("Last-Modified")
                                    if lm:
                                        _sat_gp_cache["last_modified"] = lm
                                _save_sat_cache(gp_data)
                                live_refresh_succeeded = True
                                logger.info(f"Satellites: Downloaded {len(gp_data)} GP records from CelesTrak")
                                break
                    except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError) as e:
                        logger.warning(f"Satellites: Failed to fetch from {url}: {e}")
                        continue

            if not live_refresh_succeeded:
                logger.info("Satellites: TLE catalog unavailable, trying public keyword search fallback...")
                try:
                    fallback_data = _fetch_satellites_from_tle_api_search()
                    if fallback_data and len(fallback_data) > 10:
                        _sat_gp_cache["data"] = fallback_data
                        _sat_gp_cache["last_fetch"] = now_ts
                        _sat_gp_cache["source"] = "tle_api"
                        _sat_gp_cache["next_retry_at"] = 0
                        _save_sat_cache(fallback_data)
                        live_refresh_succeeded = True
                        logger.info(f"Satellites: Got {len(fallback_data)} records from TLE API search fallback")
                except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, OSError) as e:
                    logger.error(f"Satellites: TLE search fallback failed: {e}")

            if _sat_gp_cache["data"] is None:
                disk_data = _load_sat_cache(max_age_hours=None)
                if disk_data:
                    _sat_gp_cache["data"] = disk_data
                    _sat_gp_cache["last_fetch"] = now_ts - (_SAT_FETCH_INTERVAL - 300)
                    _sat_gp_cache["source"] = "disk_cache"
                    logger.info("Satellites: Using stale disk cache because live providers were unavailable")

            if _sat_gp_cache["data"] is None:
                seed_data = _load_sat_seed_cache()
                if seed_data:
                    _sat_gp_cache["data"] = seed_data
                    _sat_gp_cache["last_fetch"] = now_ts - (_SAT_FETCH_INTERVAL - 300)
                    _sat_gp_cache["source"] = "seed_cache"
                    logger.info("Satellites: Using bundled seed cache because no live or persisted cache was available")

            if not live_refresh_succeeded:
                _sat_gp_cache["next_retry_at"] = now_ts + _SAT_REFRESH_RETRY_DELAY
        elif refresh_due and not should_retry_live:
            retry_in = max(0, int(_sat_gp_cache.get("next_retry_at", 0) - now_ts))
            logger.info(f"Satellites: skipping live refresh during cooldown ({retry_in}s remaining)")

        data = _sat_gp_cache["data"]
        if not data:
            logger.warning("No satellite GP data available from any source")
            with _data_lock:
                latest_data["satellites"] = sats
            return

        if _sat_classified_cache["gp_fetch_ts"] == _sat_gp_cache["last_fetch"] and _sat_classified_cache["data"]:
            classified = _sat_classified_cache["data"]
            logger.info(f"Satellites: Using cached classification ({len(classified)} sats, TLEs unchanged)")
        else:
            classified = []
            for sat in data:
                name = sat.get("OBJECT_NAME", "UNKNOWN").upper()
                intel = None
                for key, meta in _SAT_INTEL_DB:
                    if key.upper() in name:
                        intel = dict(meta)
                        break
                if not intel:
                    continue
                entry = {
                    "id": sat.get("NORAD_CAT_ID"),
                    "name": sat.get("OBJECT_NAME", "UNKNOWN"),
                    "MEAN_MOTION": sat.get("MEAN_MOTION"),
                    "ECCENTRICITY": sat.get("ECCENTRICITY"),
                    "INCLINATION": sat.get("INCLINATION"),
                    "RA_OF_ASC_NODE": sat.get("RA_OF_ASC_NODE"),
                    "ARG_OF_PERICENTER": sat.get("ARG_OF_PERICENTER"),
                    "MEAN_ANOMALY": sat.get("MEAN_ANOMALY"),
                    "BSTAR": sat.get("BSTAR"),
                    "EPOCH": sat.get("EPOCH"),
                }
                entry.update(intel)
                classified.append(entry)
            _sat_classified_cache["data"] = classified
            _sat_classified_cache["gp_fetch_ts"] = _sat_gp_cache["last_fetch"]
            logger.info(f"Satellites: {len(classified)} intel-classified out of {len(data)} total in catalog")

        all_sats = classified

        now = datetime.utcnow()
        jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1e6)

        for s in all_sats:
            try:
                mean_motion = s.get('MEAN_MOTION')
                ecc = s.get('ECCENTRICITY')
                incl = s.get('INCLINATION')
                raan = s.get('RA_OF_ASC_NODE')
                argp = s.get('ARG_OF_PERICENTER')
                ma = s.get('MEAN_ANOMALY')
                bstar = s.get('BSTAR', 0)
                epoch_str = s.get('EPOCH')
                norad_id = s.get('id', 0)

                if mean_motion is None or ecc is None or incl is None:
                    continue

                epoch_dt = datetime.strptime(epoch_str[:19], '%Y-%m-%dT%H:%M:%S')
                epoch_jd, epoch_fr = jday(epoch_dt.year, epoch_dt.month, epoch_dt.day,
                                          epoch_dt.hour, epoch_dt.minute, epoch_dt.second)

                sat_obj = Satrec()
                sat_obj.sgp4init(
                    WGS72, 'i', norad_id,
                    (epoch_jd + epoch_fr) - 2433281.5,
                    bstar, 0.0, 0.0, ecc,
                    math.radians(argp), math.radians(incl),
                    math.radians(ma),
                    mean_motion * 2 * math.pi / 1440.0,
                    math.radians(raan)
                )

                e, r, v = sat_obj.sgp4(jd, fr)
                if e != 0:
                    continue

                x, y, z = r
                gmst = _gmst(jd + fr)
                lng_rad = math.atan2(y, x) - gmst
                lat_rad = math.atan2(z, math.sqrt(x*x + y*y))
                alt_km = math.sqrt(x*x + y*y + z*z) - 6371.0

                s['lat'] = round(math.degrees(lat_rad), 4)
                lng_deg = math.degrees(lng_rad) % 360
                s['lng'] = round(lng_deg - 360 if lng_deg > 180 else lng_deg, 4)
                s['alt_km'] = round(alt_km, 1)

                vx, vy, vz = v
                omega_e = 7.2921159e-5
                vx_g = vx + omega_e * y
                vy_g = vy - omega_e * x
                vz_g = vz
                cos_lat = math.cos(lat_rad)
                sin_lat = math.sin(lat_rad)
                cos_lng = math.cos(lng_rad + gmst)
                sin_lng = math.sin(lng_rad + gmst)
                v_east = -sin_lng * vx_g + cos_lng * vy_g
                v_north = -sin_lat * cos_lng * vx_g - sin_lat * sin_lng * vy_g + cos_lat * vz_g
                ground_speed_kms = math.sqrt(v_east**2 + v_north**2)
                s['speed_knots'] = round(ground_speed_kms * 1943.84, 1)
                heading_rad = math.atan2(v_east, v_north)
                s['heading'] = round(math.degrees(heading_rad) % 360, 1)
                sat_name = s.get('name', '')
                usa_match = re.search(r'USA[\s\-]*(\d+)', sat_name)
                if usa_match:
                    s['wiki'] = f"https://en.wikipedia.org/wiki/USA-{usa_match.group(1)}"
                for k in ('MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
                          'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY',
                          'BSTAR', 'EPOCH', 'tle1', 'tle2'):
                    s.pop(k, None)
                sats.append(s)
            except (ValueError, TypeError, KeyError, AttributeError, ZeroDivisionError):
                continue

        logger.info(f"Satellites: {len(classified)} classified, {len(sats)} positioned")
    except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, json.JSONDecodeError, OSError) as e:
        logger.error(f"Error fetching satellites: {e}")
    if sats:
        with _data_lock:
            latest_data["satellites"] = sats
            latest_data["satellite_source"] = _sat_gp_cache.get("source", "none")
        _mark_fresh("satellites")
    else:
        with _data_lock:
            if not latest_data.get("satellites"):
                latest_data["satellites"] = []
                latest_data["satellite_source"] = "none"
