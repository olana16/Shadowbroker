"""Regression tests for cybersecurity feed normalization and cache loading."""
from pathlib import Path

from services.fetchers import cybersecurity
from services.fetchers._store import latest_data


def test_normalize_kev_item_maps_expected_fields():
    item = {
        "cveID": "CVE-2025-12345",
        "vendorProject": "Fortinet",
        "product": "FortiOS",
        "vulnerabilityName": "FortiOS Authentication Bypass Vulnerability",
        "dateAdded": "2026-04-01",
        "shortDescription": "An authentication bypass vulnerability in exposed devices.",
        "requiredAction": "Apply updates per vendor instructions.",
        "dueDate": "2026-04-21",
        "knownRansomwareCampaignUse": "Known",
        "notes": "Observed in the wild.",
    }

    normalized = cybersecurity._normalize_kev_item(item)

    assert normalized is not None
    assert normalized["id"] == "kev:cve-2025-12345"
    assert normalized["cve"] == "CVE-2025-12345"
    assert normalized["vendor"] == "Fortinet"
    assert normalized["product"] == "FortiOS"
    assert normalized["known_ransomware"] is True
    assert normalized["risk_score"] >= 9
    assert normalized["severity"] == "critical"


def test_load_cached_cybersecurity_into_store(tmp_path, monkeypatch):
    cache_path = tmp_path / "cybersecurity_cache.json"
    cache_path.write_text(
        '[{"id":"kev:cve-2025-12345","title":"CVE-2025-12345 · Fortinet FortiOS","risk_score":9}]',
        encoding="utf-8",
    )
    monkeypatch.setattr(cybersecurity, "_CYBERSECURITY_CACHE_PATH", Path(cache_path))
    latest_data["cybersecurity"] = []

    count = cybersecurity.load_cached_cybersecurity_into_store()

    assert count == 1
    assert latest_data["cybersecurity"][0]["id"] == "kev:cve-2025-12345"
