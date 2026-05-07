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
