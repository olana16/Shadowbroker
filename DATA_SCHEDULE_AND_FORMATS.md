# ShadowBroker Data Schedule & Format Reference

## 1. DATA FETCH SCHEDULES

### FAST Tier (Every 60 seconds)
Runs the most frequently for real-time moving entities:

```
fetch_flights()
fetch_military_flights()
fetch_ships()
fetch_satellites()
```

**What updates every 60s:**
- Commercial flights (ADS-B, OpenSky, supplemental sources)
- Military flights & UAV detection
- Ships via AIS stream
- Satellite positions (SGP4 computed)

---

### SLOW Tier (Every 5 minutes)
Refreshes contextual, enrichment, and less-volatile data:

```
fetch_news()
fetch_telegram()  # Optional (if Telethon installed)
fetch_earthquakes()
fetch_firms_fires()
fetch_defense_stocks()
fetch_oil_prices()
fetch_weather()
fetch_space_weather()
fetch_internet_outages()
fetch_cctv()
fetch_kiwisdr()
fetch_frontlines()
fetch_gdelt()
fetch_datacenters()
fetch_military_bases()
fetch_power_plants()
```

---

### VERY SLOW Tier (Every 15 minutes)
Strategic/geopolitical data:

```
fetch_gdelt()              # Conflict & news events (also in slow)
update_liveuamap()         # Ukraine conflict frontline updates
```

---

### CCTV Pipeline (Every 10 minutes)
Ingest CCTV feeds from specific sources:

```
TFLJamCamIngestor()        # London Transport cameras
LTASingaporeIngestor()     # Singapore LTA cameras
AustinTXIngestor()         # Austin TxDOT cameras
NYCDOTIngestor()           # NYC DOT cameras
```

---

### One-Time Initialization (On Startup)
```
fetch_airports()
load_cached_news_into_store()
load_cached_telegram_into_store()
load_cached_earthquakes_into_store()
load_cached_firms_fires_into_store()
load_cached_internet_outages_into_store()
load_cached_markets_into_store()
load_cached_gdelt_into_store()
```

---

## 2. API ENDPOINTS & DATA FORMATS

### FAST Data Endpoint: `/api/live-data/fast`
**Frequency:** Every 60 seconds  
**Method:** `GET`  
**Rate limit:** 120/minute  
**Query Params (optional):** `s`, `w`, `n`, `e` (bounding box: south, west, north, east)

**Response Format (JSON):**
```json
{
  "commercial_flights": [
    {
      "callsign": "UAL123",
      "country": "USA",
      "lat": 40.123,
      "lng": -74.567,
      "alt": 10668,        // meters
      "heading": 180,      // degrees 0-359
      "speed_knots": 450,
      "registration": "N12345",
      "model": "B738",
      "icao24": "a123456",
      "type": "flight",
      "origin_name": "JFK",
      "dest_name": "LHR",
      "origin_loc": [40.6413, -73.7781],
      "dest_loc": [51.47, -0.4543],
      "nac_p": 8,          // Navigation Accuracy (used for GPS jamming)
      "trail": [[lat, lng, alt, timestamp], ...],
      "hold_pattern": false,
      "squawk": "1200",
      "vrate": 200         // vertical rate m/s
    }
  ],
  "military_flights": [
    {
      "callsign": "FORTE2",
      "country": "USA",
      "lat": 35.123,
      "lng": 45.567,
      "alt": 12000,
      "model": "RQ4",
      "military_type": "HALE Surveillance",
      "is_uav": true,
      "registration": "12-1234",
      // ... same base fields as commercial
    }
  ],
  "private_flights": [...],    // GA aircraft
  "private_jets": [...],       // Business jets
  "tracked_flights": [...],    // User-tracked aircraft
  "ships": [
    {
      "mmsi": 123456789,
      "name": "VESSEL NAME",
      "lat": 35.123,
      "lng": -74.567,
      "heading": 180,
      "speed_knots": 15.5,
      "callsign": "CALL",
      "type": "cargo",         // cargo|tanker|passenger|fishing|etc
      "destination": "PORT",
      "updated": "2024-05-25T10:30:00Z"
    }
  ],
  "cctv": [
    {
      "id": "tfl_jc001",
      "name": "Piccadilly Circus",
      "lat": 51.5095,
      "lon": -0.1342,          // Note: "lon" not "lng"
      "url": "https://...",
      "feed_type": "mjpeg|hls|image|embed|other",
      "live": true,
      "source": "TFL"
    }
  ],
  "uavs": [
    {
      // Same as military_flights but with is_uav: true
    }
  ],
  "liveuamap": [
    {
      "type": "feature",
      "geometry": { "type": "Point", "coordinates": [lng, lat] },
      "properties": { "title": "Event", "description": "..." }
    }
  ],
  "gps_jamming": [
    {
      "lat": 35.5,
      "lng": 45.5,
      "severity": "low|medium|high",
      "ratio": 0.35,           // Percentage of degraded aircraft
      "degraded": 7,
      "total": 20
    }
  ],
  "satellites": [
    {
      "id": 25544,
      "name": "ISS",
      "lat": 0.123,
      "lng": -45.567,
      "altitude_km": 408,
      "speed_knots": 17500,
      "country": "Russia/USA",
      "mission": "crewed|cargo|navigation|earth_observation|etc",
      "sat_type": "GPS|GLONASS|BeiDou|Galileo|ISS|etc",
      "period_min": 90
    }
  ],
  "satellite_source": "active|offline_estimate|none",
  "freshness": {
    "flights": "2024-05-25T10:30:00Z",
    "ships": "2024-05-25T10:30:00Z"
    // ... timestamp for each data source
  }
}
```

---

### SLOW Data Endpoint: `/api/live-data/slow`
**Frequency:** Every 5 minutes  
**Method:** `GET`  
**Rate limit:** 60/minute  
**Query Params (optional):** `s`, `w`, `n`, `e` (bounding box)

**Response Format (JSON):**
```json
{
  "last_updated": "2024-05-25T10:30:00Z",
  
  "news": [
    {
      "id": "unique-id",
      "title": "Article Title",
      "description": "Summary",
      "source": "Source Name",
      "url": "https://...",
      "published": "2024-05-25T08:00:00Z",
      "lat": 35.123,
      "lng": -74.567,
      "keywords": ["war", "conflict"],
      "risk_score": 0.85,    // 0-1 scale
      "image": "https://..."
    }
  ],
  
  "telegram": [
    {
      "id": "msg-123",
      "channel": "Channel Name",
      "text": "Message text",
      "timestamp": "2024-05-25T10:00:00Z",
      "media": "photo|video|none",
      "url": "https://t.me/..."
    }
  ],
  
  "stocks": {
    "defense": {
      "RTX": { "price": 123.45, "change": 2.5, "timestamp": "..." },
      "LMT": { "price": 456.78, "change": -1.2, "timestamp": "..." }
      // Major US defense contractors
    }
  },
  
  "oil": {
    "WTI": { "price": 78.50, "change": 1.5, "timestamp": "..." },
    "BRENT": { "price": 82.30, "change": 0.8, "timestamp": "..." }
  },
  
  "weather": {
    "type": "radar|satellite",
    "timestamp": "2024-05-25T10:00:00Z",
    "url": "https://weather-tiles/...",
    "bounds": { "north": 60, "south": 20, "east": -60, "west": -110 }
  },
  
  "traffic": [
    {
      "id": "incident-123",
      "type": "accident|congestion|roadwork|etc",
      "lat": 35.123,
      "lng": -74.567,
      "description": "Description",
      "severity": "low|medium|high"
    }
  ],
  
  "earthquakes": [
    {
      "id": "usgs20240525001",
      "lat": 35.123,
      "lng": -74.567,
      "magnitude": 5.2,
      "depth_km": 10,
      "timestamp": "2024-05-25T10:00:00Z",
      "region": "Northern California"
    }
  ],
  
  "frontlines": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": {
          "type": "LineString",
          "coordinates": [[lng, lat], [lng, lat], ...]
        },
        "properties": {
          "date": "2024-05-25",
          "control": "Ukraine|Russia|Contested"
        }
      }
    ]
  },
  
  "gdelt": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [lng, lat] },
        "properties": {
          "event_id": "123456",
          "event_type": "Protests|Armed Conflict|etc",
          "timestamp": "2024-05-25T10:00:00Z",
          "root_code": "PROTESTER_PROTESTED",
          "goldstein_scale": 5.5
        }
      }
    ]
  },
  
  "airports": [
    {
      "id": "JFK",
      "name": "John F. Kennedy",
      "city": "New York",
      "country": "USA",
      "lat": 40.6413,
      "lng": -73.7781,
      "elevation_ft": 13,
      "iata": "JFK",
      "icao": "KJFK"
    }
  ],
  
  "kiwisdr": [
    {
      "id": "kiwisdr-001",
      "name": "Station Name",
      "lat": 35.123,
      "lon": -74.567,        // Note: "lon" not "lng"
      "country": "Country",
      "freq": 14.100,        // MHz
      "antenna": "Antenna Type",
      "users": 5,
      "url": "http://ip:8073"
    }
  ],
  
  "space_weather": {
    "solar_wind_speed": 450,     // km/s
    "kp_index": 5,               // Geomagnetic activity 0-9
    "proton_flux": 1.2,
    "timestamp": "2024-05-25T10:00:00Z"
  },
  
  "internet_outages": [
    {
      "id": "outage-123",
      "country": "Country",
      "affected_providers": ["ISP1", "ISP2"],
      "severity": "major|moderate|minor",
      "lat": 35.123,
      "lng": -74.567,
      "timestamp_start": "2024-05-25T09:00:00Z",
      "estimated_users": 50000
    }
  ],
  
  "firms_fires": [
    {
      "id": "fire-123",
      "lat": 35.123,
      "lng": -74.567,
      "brightness": 350,
      "confidence": 0.85,
      "timestamp": "2024-05-25T10:00:00Z",
      "source": "MODIS|NOAA"
    }
  ],
  
  "datacenters": [
    {
      "id": "dc-001",
      "name": "Datacenter Name",
      "lat": 35.123,
      "lng": -74.567,
      "city": "City",
      "country": "Country",
      "providers": ["Provider1", "Provider2"],
      "asn": 12345
    }
  ],
  
  "military_bases": [
    {
      "id": "base-001",
      "name": "Base Name",
      "lat": 35.123,
      "lng": -74.567,
      "country": "Country",
      "branch": "Army|Navy|Air Force|Marines",
      "personnel": 5000
    }
  ],
  
  "power_plants": [
    {
      "id": "plant-001",
      "name": "Plant Name",
      "lat": 35.123,
      "lng": -74.567,
      "type": "coal|gas|nuclear|hydro|wind|solar",
      "capacity_mw": 1000,
      "country": "Country"
    }
  ],
  
  "freshness": {
    "news": "2024-05-25T10:25:00Z",
    "earthquakes": "2024-05-25T10:20:00Z"
    // ... timestamp for each data source
  }
}
```

---

## 3. INPUT DATA FORMATS (POST Endpoints)

### POST `/api/ais/feed` (Accept AIS messages from local receiver)
**Rate limit:** 60/minute  
**Purpose:** Ingest AIS-catcher JSON feed

**Request Body Format (JSON):**
```json
{
  "msgs": [
    "!AIVDM,1,1,,A,13P5SV0P01PrVHLNVJ2IqWpL05Dt,0*23",
    "!AIVDM,2,1,3,B,55?MbV02>H97ac<E8wE6qF0@T4@Dn2222222216L961O5Gf0NSQEp6ClRp8,0*1C",
    "!AIVDM,2,2,3,B,88888888880,2*25"
  ]
}
```

**Response Format (JSON):**
```json
{
  "status": "ok",
  "ingested": 42
}
```

---

### POST `/api/viewport` (Send map bounds)
**Rate limit:** 60/minute  
**Purpose:** Optimize AIS stream by viewport bounding box

**Request Body Format (JSON):**
```json
{
  "s": -90.0,      // South latitude
  "w": -180.0,     // West longitude
  "n": 90.0,       // North latitude
  "e": 180.0       // East longitude
}
```

**Response Format (JSON):**
```json
{
  "status": "ok"
}
```

---

## 4. CONFIGURATION ENDPOINTS (Settings)

### GET/PUT `/api/settings/news-feeds`
**Response Format:**
```json
[
  {
    "name": "BBC News",
    "url": "https://www.bbc.com/news/rss.xml",
    "keywords": ["conflict", "military"],
    "enabled": true
  }
]
```

---

### GET/PUT `/api/settings/news-keywords`
**Response Format:**
```json
[
  "war",
  "conflict",
  "military",
  "strike",
  "defense",
  "weapons"
]
```

---

### GET/PUT `/api/settings/telegram-channels`
**Response Format:**
```json
[
  {
    "channel_id": 123456789,
    "username": "@channel_name",
    "name": "Channel Name",
    "enabled": true
  }
]
```

---

### GET/PUT `/api/settings/live-video-channels`
**Response Format:**
```json
[
  {
    "id": "custom-001",
    "name": "Custom Stream",
    "url": "https://example.com/stream.m3u8",
    "feed_type": "hls|mjpeg|image|embed",
    "location": "City, Country",
    "enabled": true
  }
]
```

---

## 5. DATA TYPE REFERENCE

### Coordinate System
- All coordinates: **[latitude, longitude]** (NOT longitude, latitude)
- Latitude: -90 to +90 (South/North)
- Longitude: -180 to +180 (West/East)
- Exception: CCTV & KiwiSDR use `lon` field instead of `lng`

### Common Numeric Fields
- **Altitude:** Meters (converted from feet × 0.3048)
- **Speed:** Knots
- **Heading:** Degrees 0-359 (0° = North, 90° = East)
- **Magnitude (earthquakes):** Richter scale
- **Confidence:** 0-1 scale (decimal)
- **GPS Jamming Ratio:** 0-1 scale (percentage × 100)

### Timestamps
- Format: **ISO 8601** (`2024-05-25T10:30:00Z`)
- Timezone: **UTC**

### Coordinate Bounding Box (Optional)
- `s` (south), `w` (west), `n` (north), `e` (east)
- Used in `/api/live-data/fast` and `/api/live-data/slow` to reduce payload
- Adds 20% padding automatically for antimeridian-safe queries

---

## 6. RATE LIMITS (Request Throttling)

| Endpoint | Limit |
|----------|-------|
| `/api/live-data/fast` | 120/minute |
| `/api/live-data/slow` | 60/minute |
| `/api/live-data` | 120/minute |
| `/api/refresh` | 2/minute |
| `/api/ais/feed` | 60/minute |
| `/api/viewport` | 60/minute |
| `/api/health` | 60/minute |
| Settings GET | 30/minute |
| Settings PUT | 10/minute |

---

## 7. ERROR HANDLING

### Invalid JSON
```json
{
  "error": "invalid JSON"
}
```
**HTTP Status:** 400

### Rate Limited
**HTTP Status:** 429

### Server Error
**HTTP Status:** 500
