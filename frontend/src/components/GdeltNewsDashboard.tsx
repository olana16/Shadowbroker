"use client";

import { useMemo, useState } from "react";
import { Activity, CalendarDays, ExternalLink, Flame, Globe2, MapPin, Newspaper, RadioTower, Send, ShieldAlert, Waves, Wifi } from "lucide-react";
import type { DashboardData, Earthquake, FireHotspot, GDELTIncident, InternetOutage, NewsArticle, StockTicker } from "@/types/dashboard";

type RegionKey =
  | "Africa"
  | "Europe"
  | "USA & Canada"
  | "Latin America"
  | "Caribbean"
  | "Middle East"
  | "Asia"
  | "Oceania";

interface GdeltNewsDashboardProps {
  data: DashboardData;
}

interface RegionArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  dateLabel: string;
  location: string;
  region: RegionKey;
  clusterCount: number;
  lat: number;
  lng: number;
  riskScore: number;
}

interface FeedPanelItem {
  id: string;
  title: string;
  source: string;
  url: string;
  dateLabel: string;
  summary?: string;
  riskScore?: number;
}

interface WatchPanelItem {
  id: string;
  title: string;
  source?: string;
  subtitle: string;
  meta?: string;
  details?: string[];
  url?: string;
  dateLabel?: string;
  riskScore: number;
}

const REGION_ORDER: RegionKey[] = [
  "Africa",
  "Europe",
  "USA & Canada",
  "Latin America",
  "Caribbean",
  "Middle East",
  "Asia",
  "Oceania",
];

function formatDateLabel(raw?: string | null) {
  if (!raw) return "Feed time unavailable";
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return `${new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
  }).format(date)} EAT`;
}

function getSourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function getDisplayChipLabel(source: string, title: string) {
  const normalized = source.trim().toLowerCase();
  if (!normalized || normalized === "article" || normalized === "articles") {
    return title;
  }
  return source;
}

function getArticleDateLabel(article: NewsArticle) {
  return formatDateLabel(article.published || article.pub_date);
}

function clampRisk(score: number) {
  return Math.max(1, Math.min(10, Math.round(score)));
}

function getRiskTone(score: number) {
  if (score >= 8) {
    return {
      badge: "border-red-500/40 bg-red-950/40 text-red-300",
      text: "text-red-300",
      title: "text-red-300",
      card: "border-red-900/40 bg-[linear-gradient(180deg,rgba(38,8,12,0.96),rgba(14,3,5,0.98))] hover:border-red-700/60",
    };
  }
  if (score >= 6) {
    return {
      badge: "border-orange-500/40 bg-orange-950/40 text-orange-300",
      text: "text-orange-300",
      title: "text-orange-300",
      card: "border-orange-900/40 bg-[linear-gradient(180deg,rgba(32,16,7,0.96),rgba(13,6,2,0.98))] hover:border-orange-700/60",
    };
  }
  if (score >= 4) {
    return {
      badge: "border-yellow-500/40 bg-yellow-950/30 text-yellow-300",
      text: "text-yellow-300",
      title: "text-yellow-200",
      card: "border-yellow-900/40 bg-[linear-gradient(180deg,rgba(28,26,8,0.96),rgba(11,10,2,0.98))] hover:border-yellow-700/60",
    };
  }
  return {
    badge: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
    text: "text-emerald-300",
    title: "text-emerald-200",
    card: "border-emerald-900/40 bg-[linear-gradient(180deg,rgba(6,23,16,0.96),rgba(2,10,7,0.98))] hover:border-emerald-700/60",
  };
}

function riskLabel(score: number) {
  if (score >= 8) return "Critical";
  if (score >= 6) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function gdeltKeywordBoost(title: string, location: string) {
  const text = `${title} ${location}`.toLowerCase();
  let boost = 0;

  const keywordWeights: Array<[string, number]> = [
    ["nuclear", 4],
    ["missile", 3],
    ["airstrike", 3],
    ["strike", 2],
    ["drone", 2],
    ["attack", 2],
    ["killed", 3],
    ["dead", 3],
    ["wounded", 2],
    ["explosion", 2],
    ["blast", 2],
    ["military", 2],
    ["troops", 2],
    ["war", 2],
    ["conflict", 2],
    ["clash", 2],
    ["shelling", 3],
    ["artillery", 3],
    ["raid", 2],
    ["terror", 3],
    ["protest", 1],
    ["unrest", 2],
    ["crackdown", 2],
    ["border", 1],
  ];

  for (const [keyword, weight] of keywordWeights) {
    if (text.includes(keyword)) boost += weight;
  }

  return boost;
}

function computeGdeltRiskScore(title: string, location: string, count: number) {
  const clusterBase = 2 + Math.min(count || 1, 6);
  const keywordBoost = gdeltKeywordBoost(title, location);
  return clampRisk(Math.min(10, clusterBase + keywordBoost));
}

function isCyberArticle(article: NewsArticle) {
  const text = `${article.source} ${article.title}`.toLowerCase();
  const cyberTerms = [
    "hacker",
    "hack",
    "security",
    "cyber",
    "infosec",
    "ransomware",
    "malware",
    "phishing",
    "breach",
    "cve",
    "exploit",
    "zero-day",
    "microsoft security",
    "bleepingcomputer",
    "krebs",
  ];
  return cyberTerms.some((term) => text.includes(term));
}

function toFeedItems(items: NewsArticle[] | undefined) {
  return (items ?? []).map((item, index) => ({
    id: String(item.id ?? item.telegram_message_id ?? `${item.source}-${index}`),
    title: item.title || "Untitled item",
    source: item.source || "Unknown source",
    url: item.link || "",
    dateLabel: getArticleDateLabel(item),
    summary: item.machine_assessment || item.summary,
    riskScore: clampRisk(item.risk_score ?? 1),
  }));
}

function sortByRisk<T extends { riskScore: number }>(items: T[], limit = 12) {
  return [...items].sort((a, b) => b.riskScore - a.riskScore).slice(0, limit);
}

function toEarthquakeItems(items: Earthquake[] | undefined, freshness?: string | null): WatchPanelItem[] {
  const freshnessLabel = formatDateLabel(freshness);
  return sortByRisk(
    (items ?? []).map((item, index) => ({
      id: item.id || `eq-${index}`,
      title: `M${item.mag.toFixed(1)} • ${item.place}`,
      source: "USGS",
      subtitle: item.title || "USGS earthquake event",
      meta: "Depth unavailable in current payload",
      details: [
        `Coordinates ${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}`,
        `Magnitude ${item.mag.toFixed(1)}`,
        `Source freshness ${freshnessLabel}`,
      ],
      dateLabel: freshnessLabel,
      riskScore: clampRisk(item.mag + 1),
    })),
    12,
  );
}

function toOutageItems(items: InternetOutage[] | undefined, freshness?: string | null): WatchPanelItem[] {
  const freshnessLabel = formatDateLabel(freshness);
  return sortByRisk(
    (items ?? []).map((item, index) => ({
      id: `${item.country_code}-${item.region_code}-${index}`,
      title: `${item.country_name}${item.region_name ? ` • ${item.region_name}` : ""}`,
      source: item.datasource || "IODA",
      subtitle: `${item.datasource} • ${item.level}`,
      meta: `Severity ${(item.severity * 100).toFixed(0)}%`,
      details: [
        `Country ${item.country_code} • Region ${item.region_code || "N/A"}`,
        `Coordinates ${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}`,
        `Feed freshness ${freshnessLabel}`,
      ],
      dateLabel: freshnessLabel,
      riskScore: clampRisk(item.severity * 10),
    })),
    12,
  );
}

function toFireItems(items: FireHotspot[] | undefined): WatchPanelItem[] {
  return sortByRisk(
    (items ?? []).map((item, index) => ({
      id: `${item.lat}-${item.lng}-${index}`,
      title: `FRP ${item.frp.toFixed(1)} • Brightness ${item.brightness.toFixed(0)}`,
      source: "NASA FIRMS",
      subtitle: `${item.daynight.toUpperCase()} • Confidence ${item.confidence}`,
      meta: `${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}`,
      details: [
        `Acquired ${item.acq_date} ${item.acq_time}`,
        `Coordinates ${item.lat.toFixed(2)}, ${item.lng.toFixed(2)}`,
        `Confidence ${item.confidence} • ${item.daynight.toUpperCase()}`,
      ],
      dateLabel: formatDateLabel(`${item.acq_date}T${item.acq_time.slice(0, 2)}:${item.acq_time.slice(2, 4)}:00`),
      riskScore: clampRisk(Math.min(10, item.frp / 20)),
    })),
    12,
  );
}

function marketRiskFromTicker(ticker: StockTicker) {
  return clampRisk(Math.min(10, Math.abs(ticker.change_percent) * 1.6 + 1));
}

function toMarketItems(stocks: Record<string, StockTicker> | undefined, oil: Record<string, StockTicker> | undefined): WatchPanelItem[] {
  const stockItems = Object.entries(stocks ?? {}).map(([symbol, ticker]) => ({
    id: `stock-${symbol}`,
    title: `${symbol} ${ticker.price}`,
    source: "Markets",
    subtitle: `${ticker.up ? "Up" : "Down"} ${ticker.change_percent.toFixed(2)}%`,
    meta: "Market ticker",
    details: [
      `Price ${ticker.price}`,
      `Move ${ticker.change_percent.toFixed(2)}%`,
      `Direction ${ticker.up ? "Positive" : "Negative"}`,
    ],
    riskScore: marketRiskFromTicker(ticker),
  }));
  const oilItems = Object.entries(oil ?? {}).map(([symbol, ticker]) => ({
    id: `oil-${symbol}`,
    title: `${symbol} ${ticker.price}`,
    source: "Oil",
    subtitle: `${ticker.up ? "Up" : "Down"} ${ticker.change_percent.toFixed(2)}%`,
    meta: "Energy market",
    details: [
      `Price ${ticker.price}`,
      `Move ${ticker.change_percent.toFixed(2)}%`,
      `Direction ${ticker.up ? "Positive" : "Negative"}`,
    ],
    riskScore: marketRiskFromTicker(ticker),
  }));
  return sortByRisk([...oilItems, ...stockItems], 12);
}

function classifyRegion(lat: number, lng: number): RegionKey {
  const isMiddleEast = lat >= 12 && lat <= 42 && lng >= 26 && lng <= 65;
  const isOceania =
    (lat <= 5 && lat >= -52 && lng >= 110 && lng <= 180) ||
    (lat <= 25 && lat >= -30 && (lng >= 140 || lng <= -150));
  const isAfrica = lat >= -40 && lat <= 38 && lng >= -25 && lng <= 60 && !isMiddleEast;
  const isEurope = lat >= 35 && lat <= 72 && lng >= -31 && lng <= 45 && !isMiddleEast;
  const isUsaCanada = lng >= -170 && lng <= -50 && lat >= 24 && lat <= 83;
  const isCaribbean = lng >= -89 && lng <= -58 && lat >= 9 && lat <= 28;
  const isLatinAmerica = lng >= -122 && lng <= -30 && lat >= -58 && lat < 24;

  if (isAfrica) return "Africa";
  if (isEurope) return "Europe";
  if (isUsaCanada) return "USA & Canada";
  if (isCaribbean) return "Caribbean";
  if (isLatinAmerica) return "Latin America";
  if (isMiddleEast) return "Middle East";
  if (isOceania) return "Oceania";
  if (lng >= 25 && lng <= 180 && lat >= -10 && lat <= 81) return "Asia";

  if (lng >= -170 && lng <= -50 && lat >= 24) return "USA & Canada";
  if (lng >= -89 && lng <= -58 && lat >= 9 && lat <= 28) return "Caribbean";
  if (lng < -30) return "Latin America";
  if (lat < 0 && lng > 110) return "Oceania";
  if (lng >= -25 && lng < 25) return "Europe";
  return "Asia";
}

function flattenGdeltArticles(gdelt: GDELTIncident[] | undefined, dateLabel: string) {
  const grouped = new Map<RegionKey, RegionArticle[]>(
    REGION_ORDER.map((region) => [region, []]),
  );

  for (const incident of gdelt ?? []) {
    const coords = incident.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;

    const [lng, lat] = coords;
    const region = classifyRegion(lat, lng);
    const props = incident.properties ?? { name: "Unknown", count: 1, _urls_list: [], _headlines_list: [] };
    const urls = props._urls_list ?? [];
    const headlines = props._headlines_list ?? [];

    if (urls.length === 0) {
      const title = props.name || "Untitled incident";
      const location = props.name || "Unknown location";
      grouped.get(region)?.push({
        id: `${props.name}-${lat}-${lng}-0`,
        title,
        source: "GDELT",
        url: "",
        dateLabel,
        location,
        region,
        clusterCount: props.count || 1,
        lat,
        lng,
        riskScore: computeGdeltRiskScore(title, location, props.count || 1),
      });
      continue;
    }

    urls.forEach((url, index) => {
      const title = headlines[index] || props.name || "Untitled incident";
      const location = props.name || "Unknown location";
      grouped.get(region)?.push({
        id: `${props.name}-${lat}-${lng}-${index}`,
        title,
        source: getSourceLabel(url),
        url,
        dateLabel,
        location,
        region,
        clusterCount: props.count || 1,
        lat,
        lng,
        riskScore: computeGdeltRiskScore(title, location, props.count || 1),
      });
    });
  }

  return grouped;
}

function FeedPanel({
  title,
  subtitle,
  items,
  accent,
  icon,
}: {
  title: string;
  subtitle: string;
  items: FeedPanelItem[];
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="flex h-[420px] min-h-[420px] flex-col rounded-3xl border border-cyan-500/35 bg-[rgba(4,8,12,0.88)] p-4 shadow-[0_12px_50px_rgba(0,0,0,0.35),0_0_0_1px_rgba(34,211,238,0.14)] backdrop-blur-md sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-cyan-900/30 pb-4">
        <div>
          <h3 className="text-xl font-semibold tracking-[0.08em] text-red-300">{title}</h3>
          <p className="mt-1 text-sm text-cyan-100/55">{subtitle}</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.24em] ${accent}`}>
          {icon}
          {items.length}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-cyan-900/30 bg-black/20 px-4 py-8 text-center text-sm text-cyan-100/45">
          No items available right now.
        </div>
      ) : (
        <div className="styled-scrollbar flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4">
            {items.map((item) => (
              (() => {
                const tone = getRiskTone(item.riskScore ?? 1);
                return (
              <article
                key={item.id}
                className={`flex flex-col rounded-2xl border p-4 transition-colors ${tone.card}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400/80">
                    {getDisplayChipLabel(item.source, item.title)}
                  </div>
                  {typeof item.riskScore === "number" && (
                    <div className={`rounded-xl border px-2.5 py-1 text-right text-[10px] font-mono uppercase tracking-[0.16em] ${tone.badge}`}>
                      {riskLabel(item.riskScore)} {item.riskScore}/10
                    </div>
                  )}
                </div>

                <h4 className={`text-base font-semibold leading-6 ${tone.title}`}>
                  {item.title}
                </h4>

                <div className="mt-4 flex items-center gap-2 text-sm text-cyan-100/65">
                  <CalendarDays size={14} className="text-cyan-500/80" />
                  <span>{item.dateLabel}</span>
                </div>

                {item.summary && (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-cyan-100/60">
                    {item.summary}
                  </p>
                )}

                <div className="mt-4 pt-2">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-cyan-300 transition-colors hover:text-cyan-200"
                    >
                      Open source
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <div className="text-sm text-cyan-100/45">Source link unavailable.</div>
                  )}
                </div>
              </article>
                );
              })()
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WatchPanel({
  title,
  subtitle,
  items,
  accent,
  icon,
}: {
  title: string;
  subtitle: string;
  items: WatchPanelItem[];
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="flex h-[420px] min-h-[420px] flex-col rounded-3xl border border-cyan-500/35 bg-[rgba(4,8,12,0.88)] p-4 shadow-[0_12px_50px_rgba(0,0,0,0.35),0_0_0_1px_rgba(34,211,238,0.14)] backdrop-blur-md sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-cyan-900/30 pb-4">
        <div>
          <h3 className="text-xl font-semibold tracking-[0.08em] text-red-300">{title}</h3>
          <p className="mt-1 text-sm text-cyan-100/55">{subtitle}</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.24em] ${accent}`}>
          {icon}
          {items.length}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-cyan-900/30 bg-black/20 px-4 py-8 text-center text-sm text-cyan-100/45">
          No items available right now.
        </div>
      ) : (
        <div className="styled-scrollbar flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4">
            {items.map((item) => {
              const tone = getRiskTone(item.riskScore);
              return (
                <article key={item.id} className={`flex flex-col rounded-2xl border p-4 transition-colors ${tone.card}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      {item.source ? (
                        <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400/80">
                          {item.source}
                        </div>
                      ) : null}
                      <div className={`w-fit rounded-xl border px-2.5 py-1 text-right text-[10px] font-mono uppercase tracking-[0.16em] ${tone.badge}`}>
                        {riskLabel(item.riskScore)} {item.riskScore}/10
                      </div>
                    </div>
                    {item.dateLabel ? (
                      <div className="text-right text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-100/45">
                        {item.dateLabel}
                      </div>
                    ) : null}
                  </div>
                  <h4 className={`text-base font-semibold leading-6 ${tone.title}`}>{item.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-cyan-100/65">{item.subtitle}</p>
                  {item.meta ? <p className="mt-2 text-sm text-cyan-100/45">{item.meta}</p> : null}
                  {item.details?.length ? (
                    <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-white/5 bg-black/15 px-3 py-2">
                      {item.details.slice(0, 3).map((detail, index) => (
                        <div key={index} className="text-[11px] leading-5 text-cyan-100/58">
                          {detail}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.url ? (
                    <div className="mt-4 pt-2">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 transition-colors hover:text-cyan-200">
                        Open source
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function GdeltNewsDashboard({ data }: GdeltNewsDashboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const dateLabel = formatDateLabel(data.freshness?.gdelt || data.last_updated);
  const grouped = useMemo(() => flattenGdeltArticles(data.gdelt, dateLabel), [data.gdelt, dateLabel]);
  const telegramItems = useMemo(() => toFeedItems(data.telegram), [data.telegram]);
  const cyberRssItems = useMemo(() => toFeedItems((data.news ?? []).filter(isCyberArticle)), [data.news]);
  const newsRssItems = useMemo(() => toFeedItems((data.news ?? []).filter((item) => !isCyberArticle(item))), [data.news]);
  const earthquakeItems = useMemo(() => toEarthquakeItems(data.earthquakes, data.freshness?.earthquakes), [data.earthquakes, data.freshness?.earthquakes]);
  const outageItems = useMemo(() => toOutageItems(data.internet_outages, data.freshness?.internet_outages), [data.internet_outages, data.freshness?.internet_outages]);
  const fireItems = useMemo(() => toFireItems(data.firms_fires), [data.firms_fires]);
  const marketItems = useMemo(() => toMarketItems(data.stocks, data.oil), [data.stocks, data.oil]);
  const totalItems = useMemo(
    () => REGION_ORDER.reduce((sum, region) => sum + (grouped.get(region)?.length || 0), 0),
    [grouped],
  );

  return (
    <section className="relative z-[4] border-t border-cyan-900/40 bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.18),transparent_34%),linear-gradient(180deg,#030507_0%,#020304_100%)]">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-cyan-900/40 bg-black/50 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.35em] text-cyan-500/80">
                <Newspaper size={14} />
                GDELT Regional Briefing
              </div>
              <h2 className="text-2xl font-semibold tracking-[0.12em] text-white sm:text-3xl">Global Incident News Grid</h2>
              <p className="max-w-3xl text-sm leading-6 text-cyan-100/70">
                Region-sorted incident reporting below the map, organized for quick scan on desktop and mobile.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/20 px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-500/70">Items</div>
                <div className="mt-1 text-lg font-semibold text-white">{totalItems}</div>
              </div>
              <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/20 px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-500/70">Regions</div>
                <div className="mt-1 text-lg font-semibold text-white">{REGION_ORDER.length}</div>
              </div>
              <div className="col-span-2 rounded-2xl border border-cyan-900/40 bg-cyan-950/20 px-4 py-3 sm:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-500/70">Feed Refresh</div>
                <div className="mt-1 text-sm font-semibold text-white">{dateLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <FeedPanel
            title="Telegram"
            subtitle="Monitored Telegram channel updates normalized into feed items."
            items={telegramItems}
            accent="border-sky-900/40 bg-sky-950/20 text-sky-300/80"
            icon={<Send size={13} />}
          />
          <FeedPanel
            title="News RSS"
            subtitle="General and geopolitical RSS items from the configured feed list."
            items={newsRssItems}
            accent="border-cyan-900/40 bg-cyan-950/20 text-cyan-300/80"
            icon={<RadioTower size={13} />}
          />
          <FeedPanel
            title="Cyber RSS"
            subtitle="Security and cyber-focused RSS items split from the same aggregated news feed."
            items={cyberRssItems}
            accent="border-emerald-900/40 bg-emerald-950/20 text-emerald-300/80"
            icon={<ShieldAlert size={13} />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <WatchPanel
            title="Earthquakes"
            subtitle="Magnitude-sorted seismic events with place and feed time."
            items={earthquakeItems}
            accent="border-amber-900/40 bg-amber-950/20 text-amber-300/80"
            icon={<Activity size={13} />}
          />
          <WatchPanel
            title="Internet Outages"
            subtitle="Country and region outage panels ranked by severity."
            items={outageItems}
            accent="border-rose-900/40 bg-rose-950/20 text-rose-300/80"
            icon={<Wifi size={13} />}
          />
          <WatchPanel
            title="FIRMS Fires"
            subtitle="Wildfire hotspots ranked by fire radiative power."
            items={fireItems}
            accent="border-orange-900/40 bg-orange-950/20 text-orange-300/80"
            icon={<Flame size={13} />}
          />
          <WatchPanel
            title="Markets"
            subtitle="Oil and major ticker moves ranked by volatility."
            items={marketItems}
            accent="border-emerald-900/40 bg-emerald-950/20 text-emerald-300/80"
            icon={<Waves size={13} />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {REGION_ORDER.map((region) => {
            const items = grouped.get(region) || [];

            return (
              <section
                key={region}
                className="flex h-[420px] min-h-[420px] flex-col rounded-3xl border border-cyan-500/35 bg-[rgba(4,8,12,0.88)] p-4 shadow-[0_12px_50px_rgba(0,0,0,0.35),0_0_0_1px_rgba(34,211,238,0.14)] backdrop-blur-md sm:p-5"
              >
                <div className="mb-4 flex flex-col gap-3 border-b border-cyan-900/30 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold tracking-[0.08em] text-red-300">{region}</h3>
                    <p className="mt-1 text-sm text-cyan-100/55">
                      {items.length ? `${items.length} mapped article${items.length === 1 ? "" : "s"}` : "No active mapped items in the current feed"}
                    </p>
                  </div>
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-900/40 bg-cyan-950/20 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.24em] text-cyan-400/80">
                    <Globe2 size={13} />
                    {region}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-cyan-900/30 bg-black/20 px-4 py-8 text-center text-sm text-cyan-100/45">
                    Waiting for GDELT items in this region.
                  </div>
                ) : (
                  <div className="styled-scrollbar flex-1 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-4">
                    {items.map((item) => {
                      const isExpanded = expandedId === item.id;
                      const tone = getRiskTone(item.riskScore);

                      return (
                        <article
                          key={item.id}
                          className={`flex flex-col rounded-2xl border p-4 transition-colors ${tone.card}`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400/80">
                              {getDisplayChipLabel(item.source, item.title)}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className={`rounded-xl border px-2.5 py-1 text-right text-[10px] font-mono uppercase tracking-[0.16em] ${tone.badge}`}>
                                {riskLabel(item.riskScore)} {item.riskScore}/10
                              </div>
                              <div className="text-right text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-100/45">
                                {item.clusterCount} clustered events
                              </div>
                            </div>
                          </div>

                          <h4 className={`text-base font-semibold leading-6 ${tone.title}`}>
                            {item.title}
                          </h4>

                          <div className="mt-4 flex flex-col gap-2 text-sm text-cyan-100/65">
                            <div className="flex items-center gap-2">
                              <CalendarDays size={14} className="text-cyan-500/80" />
                              <span>{item.dateLabel}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-cyan-500/80" />
                              <span className="truncate">{item.location}</span>
                            </div>
                          </div>

                          <div className="mt-auto pt-5">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="w-full rounded-xl border border-cyan-800/40 bg-cyan-950/20 px-3 py-2 text-left text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300 transition-colors hover:border-cyan-600/60 hover:bg-cyan-900/30"
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>

                            {isExpanded && (
                              <div className="mt-3 space-y-3 rounded-xl border border-cyan-900/30 bg-black/30 p-3 text-sm text-cyan-100/70">
                                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-500/75">
                                  {item.lat.toFixed(2)}, {item.lng.toFixed(2)}
                                </div>
                                <div className={`inline-flex rounded-xl border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] ${tone.badge}`}>
                                  Cluster-derived risk {item.riskScore}/10
                                </div>
                                {item.url ? (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-cyan-300 transition-colors hover:text-cyan-200"
                                  >
                                    Open original article
                                    <ExternalLink size={14} />
                                  </a>
                                ) : (
                                  <div className="text-cyan-100/45">Original article URL unavailable for this cluster.</div>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
