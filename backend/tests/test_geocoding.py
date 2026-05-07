from services import geocoding


def test_search_places_country_only_sets_featuretype(monkeypatch):
    captured = {}

    def fake_get_json(path, params):
        captured["path"] = path
        captured["params"] = params
        return []

    monkeypatch.setattr(geocoding, "_get_json", fake_get_json)
    geocoding.search_places("Ethiopia", limit=1, country_only=True)

    assert captured["path"] == "/search"
    assert captured["params"]["featuretype"] == "country"


def test_search_places_country_only_filters_non_country(monkeypatch):
    def fake_get_json(_path, _params):
        return [
            {
                "display_name": "Addis Ababa, Ethiopia",
                "lat": "9.03",
                "lon": "38.74",
                "boundingbox": ["8.7", "9.2", "38.5", "39.0"],
                "type": "city",
                "class": "place",
            },
            {
                "display_name": "Ethiopia",
                "lat": "9.14",
                "lon": "40.49",
                "boundingbox": ["3.40", "14.89", "32.99", "47.98"],
                "type": "country",
                "class": "boundary",
            },
        ]

    monkeypatch.setattr(geocoding, "_get_json", fake_get_json)
    results = geocoding.search_places("Ethiopia", limit=5, country_only=True)

    assert len(results) == 1
    assert results[0]["type"] == "country"


def test_search_places_country_only_accepts_category_boundary(monkeypatch):
    def fake_get_json(_path, _params):
        return [
            {
                "display_name": "Iran",
                "lat": "32.6475314",
                "lon": "54.5643516",
                "boundingbox": ["24.8353084", "39.7824624", "44.0318908", "63.3332704"],
                "type": "administrative",
                "category": "boundary",
                "addresstype": "country",
            }
        ]

    monkeypatch.setattr(geocoding, "_get_json", fake_get_json)
    results = geocoding.search_places("Iran", limit=1, country_only=True)

    assert len(results) == 1
    assert results[0]["label"] == "Iran"


def test_search_places_does_not_cache_transient_nominatim_failures(monkeypatch):
    cache_key = "search:v2:True:1:iran"

    def fake_get_json(_path, _params):
        return None

    monkeypatch.setattr(geocoding, "_get_json", fake_get_json)
    if cache_key in geocoding._search_cache:
        del geocoding._search_cache[cache_key]

    results = geocoding.search_places("Iran", limit=1, country_only=True)

    assert results == []
    assert cache_key not in geocoding._search_cache
