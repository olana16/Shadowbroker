import type {
  CommercialFlight,
  DashboardData,
  Earthquake,
  FireHotspot,
  GDELTIncident,
  InternetOutage,
  MilitaryFlight,
  NewsArticle,
  PrivateFlight,
  PrivateJet,
  Satellite,
  TrackedFlight,
  WatchRegion,
  WatchRegionResults,
  WatchResultItem,
} from "@/types/dashboard";
import { buildNewsAlertKey } from "@/utils/alertSpread";

type FlightItem = CommercialFlight | PrivateFlight | PrivateJet | MilitaryFlight | TrackedFlight;

export function inBbox(lat: number | null | undefined, lng: number | null | undefined, region: WatchRegion): boolean {
  if (lat == null || lng == null) return false;
  if (lat < region.south || lat > region.north) return false;
  if (region.west <= region.east) {
    return lng >= region.west && lng <= region.east;
  } else {
    // Crosses the antimeridian (e.g. Russia, Alaska area)
    return lng >= region.west || lng <= region.east;
  }
}

export function getWatchRegionCenter(region: WatchRegion): { lat: number; lng: number } {
  return {
    lat: (region.south + region.north) / 2,
    lng: (region.west + region.east) / 2,
  };
}

export function buildWatchRegionGeoJSON(region: WatchRegion): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: region.label,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [region.west, region.south],
            [region.east, region.south],
            [region.east, region.north],
            [region.west, region.north],
            [region.west, region.south],
          ]],
        },
      },
    ],
  };
}

function toFlightResult(item: FlightItem, entityType: WatchResultItem["entityType"], scope: WatchResultItem["scope"]): WatchResultItem {
  return {
    id: `${entityType}:${item.icao24 || item.callsign}`,
    title: item.callsign || item.registration || item.icao24 || "UNKNOWN",
    subtitle: [item.model || "Unknown", item.origin_name && item.origin_name !== "UNKNOWN" ? item.origin_name : null, item.dest_name && item.dest_name !== "UNKNOWN" ? item.dest_name : null].filter(Boolean).join(" · "),
    lat: item.lat,
    lng: item.lng,
    entityType,
    entityId: item.icao24,
    scope,
    severity: item.alt > 0 ? `${Math.round(item.alt).toLocaleString()} m` : "ground",
  };
}

function toOutageResult(item: InternetOutage): WatchResultItem {
  return {
    id: `outage:${item.country_code}:${item.region_code}`,
    title: `${item.region_name || item.region_code}, ${item.country_name || item.country_code}`,
    subtitle: item.datasource || "IODA",
    lat: item.lat,
    lng: item.lng,
    scope: "outages",
    severity: `${Math.round(item.severity)}% drop`,
  };
}

function toFireResult(item: FireHotspot, idx: number): WatchResultItem {
  return {
    id: `fire:${item.lat}:${item.lng}:${idx}`,
    title: `Fire hotspot`,
    subtitle: `${item.acq_date || "Unknown date"} ${item.acq_time || ""}`.trim(),
    lat: item.lat,
    lng: item.lng,
    scope: "fires",
    severity: `${item.frp?.toFixed(1) || "0.0"} MW`,
  };
}

function toNewsResult(item: NewsArticle, scope: WatchResultItem["scope"]): WatchResultItem {
  const coords = item.coords || (item.lat != null && item.lng != null ? [item.lat, item.lng] as [number, number] : null);
  return {
    id: `news:${buildNewsAlertKey({ title: item.title, coords: coords || undefined, source: item.source, published: item.published, link: item.link }, Number(item.id) || 0)}`,
    title: item.title,
    subtitle: item.source,
    lat: coords?.[0] ?? 0,
    lng: coords?.[1] ?? 0,
    entityType: "news",
    entityId: buildNewsAlertKey({ title: item.title, coords: coords || undefined, source: item.source, published: item.published, link: item.link }, Number(item.id) || 0),
    scope,
    severity: `Risk ${item.risk_score || 0}/10`,
  };
}

function toGdeltResult(item: GDELTIncident): WatchResultItem | null {
  const coords = item.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  const title = item.properties?.name || "GDELT incident";
  const clusterCount = item.properties?.count || 0;
  const headlines = item.properties?._headlines_list || [];
  return {
    id: `gdelt:${title}:${lat}:${lng}`,
    title,
    subtitle: headlines[0] || "GDELT clustered reporting",
    lat,
    lng,
    entityType: "gdelt",
    entityId: title,
    scope: "news",
    severity: clusterCount > 0 ? `${clusterCount} reports` : "GDELT",
  };
}

function toSatelliteResult(item: Satellite): WatchResultItem {
  return {
    id: `satellite:${item.id}`,
    title: item.name,
    subtitle: item.country || item.sat_type || "Satellite",
    lat: item.lat,
    lng: item.lng,
    entityType: "satellite",
    entityId: item.id,
    scope: "satellites",
    severity: `${Math.round(item.alt_km || 0)} km`,
  };
}

function toEarthquakeResult(item: Earthquake): WatchResultItem {
  return {
    id: `earthquake:${item.id}`,
    title: item.title || item.place || "Earthquake",
    subtitle: item.place || "USGS event",
    lat: item.lat,
    lng: item.lng,
    scope: "earthquakes",
    severity: `M${item.mag}`,
  };
}

export function filterDashboardDataForWatchRegion(data: DashboardData, region: WatchRegion | null): WatchRegionResults {
  if (!region) {
    return {
      flights: [],
      outages: [],
      fires: [],
      news: [],
      earthquakes: [],
      satellites: [],
      total: 0,
    };
  }

  const flights: WatchResultItem[] = [
    ...(data.commercial_flights || []).filter((f) => inBbox(f.lat, f.lng, region)).map((f) => toFlightResult(f, "flight", "flights")),
    ...(data.private_flights || []).filter((f) => inBbox(f.lat, f.lng, region)).map((f) => toFlightResult(f, "private_flight", "flights")),
    ...(data.private_jets || []).filter((f) => inBbox(f.lat, f.lng, region)).map((f) => toFlightResult(f, "private_jet", "flights")),
    ...(data.military_flights || []).filter((f) => inBbox(f.lat, f.lng, region)).map((f) => toFlightResult(f, "military_flight", "flights")),
    ...(data.tracked_flights || []).filter((f) => inBbox(f.lat, f.lng, region)).map((f) => toFlightResult(f, "tracked_flight", "flights")),
  ];

  const outages = (data.internet_outages || [])
    .filter((item) => inBbox(item.lat, item.lng, region))
    .map(toOutageResult)
    .sort((a, b) => parseFloat((b.severity || "0").split("%")[0]) - parseFloat((a.severity || "0").split("%")[0]));

  const fires = (data.firms_fires || [])
    .filter((item) => inBbox(item.lat, item.lng, region))
    .map((item, idx) => toFireResult(item, idx))
    .sort((a, b) => parseFloat(b.severity || "0") - parseFloat(a.severity || "0"));

  const newsItems = [...(data.news || []), ...(data.telegram || [])]
    .filter((item) => {
      const coords = item.coords || (item.lat != null && item.lng != null ? [item.lat, item.lng] : null);
      return inBbox(coords?.[0], coords?.[1], region);
    })
    .map((item) => toNewsResult(item, "news"))
    .concat(
      (data.gdelt || [])
        .filter((item) => inBbox(item.geometry?.coordinates?.[1], item.geometry?.coordinates?.[0], region))
        .map(toGdeltResult)
        .filter((item): item is WatchResultItem => item !== null)
    )
    .sort((a, b) => parseFloat((b.severity || "0").replace(/[^\d.]/g, "")) - parseFloat((a.severity || "0").replace(/[^\d.]/g, "")));

  const satellites = (data.satellites || [])
    .filter((item) => inBbox(item.lat, item.lng, region))
    .map(toSatelliteResult);

  const earthquakes = (data.earthquakes || [])
    .filter((item) => inBbox(item.lat, item.lng, region))
    .map(toEarthquakeResult)
    .sort((a, b) => parseFloat((b.severity || "0").replace(/[^\d.]/g, "")) - parseFloat((a.severity || "0").replace(/[^\d.]/g, "")));

  return {
    flights,
    outages,
    fires,
    news: newsItems,
    earthquakes,
    satellites,
    total: flights.length + outages.length + fires.length + newsItems.length + earthquakes.length + satellites.length,
  };
}
