"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Globe2, LocateFixed, Search, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import type { WatchRegion, WatchRegionResults, WatchResultItem } from "@/types/dashboard";

interface RegionWatchPanelProps {
  watchRegion: WatchRegion | null;
  watchResults: WatchRegionResults;
  onSetWatchRegion: (region: WatchRegion) => void;
  onClearWatchRegion: () => void;
  onFocusResult: (item: WatchResultItem) => void;
  onFlyToRegion: (region: WatchRegion) => void;
}

const SECTION_ORDER: Array<keyof Omit<WatchRegionResults, "total">> = ["flights", "outages", "fires", "news", "earthquakes", "satellites"];
const SECTION_LABELS: Record<keyof Omit<WatchRegionResults, "total">, string> = {
  flights: "Flights",
  outages: "Outages",
  fires: "Fires",
  news: "News",
  earthquakes: "Earthquakes",
  satellites: "Satellites",
};

export default function RegionWatchPanel({
  watchRegion,
  watchResults,
  onSetWatchRegion,
  onClearWatchRegion,
  onFocusResult,
  onFlyToRegion,
}: RegionWatchPanelProps) {
  const [countryQuery, setCountryQuery] = useState("");
  const [countryBusy, setCountryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geocodeCache = useRef<Map<string, any>>(new Map());


  useEffect(() => {
    if (!watchRegion) return;
    if (watchRegion.query) {
      setCountryQuery(watchRegion.query);
    }
  }, [watchRegion]);

  const summary = useMemo(
    () => SECTION_ORDER.map((key) => ({ key, count: watchResults[key].length, label: SECTION_LABELS[key] })),
    [watchResults],
  );

  const applyCountry = async () => {
    const q = countryQuery.trim();
    if (!q) {
      setError("Enter a country name first.");
      return;
    }
    setCountryBusy(true);
    setError(null);

    const cacheKey = q.toLowerCase();
    if (geocodeCache.current.has(cacheKey)) {
      const match = geocodeCache.current.get(cacheKey);
      let south, north, west, east;
      if (match.boundingbox?.length === 4) {
        [south, north, west, east] = match.boundingbox.map(Number);
      } else if (match.bbox?.length === 4) {
        [west, south, east, north] = match.bbox.map(Number);
      } else {
        setError("No bounding box in cached data.");
        setCountryBusy(false);
        return;
      }
      onSetWatchRegion({
        mode: "country",
        label: match.display_name || match.label || q,
        query: q,
        south,
        west,
        north,
        east,
      });
      setCountryBusy(false);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/geocode/search?q=${encodeURIComponent(q)}&limit=1`
      );

      if (res.status === 304) {
        if (geocodeCache.current.has(cacheKey)) {
          const match = geocodeCache.current.get(cacheKey);
          let south, north, west, east;
          if (match.boundingbox?.length === 4) {
            [south, north, west, east] = match.boundingbox.map(Number);
          } else if (match.bbox?.length === 4) {
            [west, south, east, north] = match.bbox.map(Number);
          } else {
            setError("No bounding box in cached data for 304.");
            setCountryBusy(false);
            return;
          }
          onSetWatchRegion({
            mode: "country",
            label: match.display_name || match.label || q,
            query: q,
            south,
            west,
            north,
            east,
          });
        } else {
          setError("304 received but no cached data.");
        }
        setCountryBusy(false);
        return;
      }

      if (!res.ok) {
        throw new Error(`Country lookup failed with ${res.status}`);
      }

      const data = await res.json();
      console.log("Geocode response:", data);

      const matches = Array.isArray(data)
        ? data
        : data.results || data.features || [];

      const match = matches[0];

      if (!match) {
        setError("Country not found.");
        setCountryBusy(false);
        return;
      }

      // Support multiple bbox formats
      let south, north, west, east;

      if (match.boundingbox?.length === 4) {
        [south, north, west, east] =
          match.boundingbox.map(Number);
      } else if (match.bbox?.length === 4) {
        [west, south, east, north] =
          match.bbox.map(Number);
      } else {
        setError("No bounding box returned.");
        setCountryBusy(false);
        return;
      }

      geocodeCache.current.set(cacheKey, match);

      onSetWatchRegion({
        mode: "country",
        label: match.display_name || match.label || q,
        query: q,
        south,
        west,
        north,
        east,
      });
    } catch (err) {
      console.error(err);
      setError("Lookup failed.");
    } finally {
      setCountryBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-cyan-900/40 bg-[var(--bg-primary)]/55 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.2)] overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            placeholder="Ethiopia"
            className="flex-1 rounded border border-[var(--border-primary)]/50 bg-black/30 px-3 py-2 text-[10px] font-mono text-[var(--text-secondary)] outline-none focus:border-cyan-500/50"
          />
          <button
            onClick={applyCountry}
            disabled={countryBusy}
            className="rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-[10px] font-mono text-cyan-400 hover:bg-cyan-950/30 disabled:opacity-40"
          >
            {countryBusy ? "..." : <Search size={12} />}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={applyCountry}
            disabled={countryBusy}
            className="flex-1 rounded border border-cyan-500/40 bg-cyan-950/20 px-3 py-2 text-[10px] font-mono tracking-widest text-cyan-400 hover:bg-cyan-950/30 disabled:opacity-40"
          >
            WATCH REGION
          </button>
          {watchRegion && (
            <button
              onClick={() => onFlyToRegion(watchRegion)}
              className="rounded border border-[var(--border-primary)] px-3 py-2 text-[10px] font-mono text-[var(--text-muted)] hover:text-cyan-400 hover:border-cyan-500/40"
            >
              <LocateFixed size={12} />
            </button>
          )}
          {watchRegion && (
            <button
              onClick={onClearWatchRegion}
              className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-2 text-[10px] font-mono text-red-400 hover:bg-red-950/20"
              title="Clear watch region"
            >
              <Trash2 size={10} />
              CLEAR
            </button>
          )}
        </div>

        {error && <div className="rounded border border-red-900/40 bg-red-950/20 px-3 py-2 text-[10px] font-mono text-red-400">{error}</div>}

        {watchRegion ? (
          <>
            <div className="rounded border border-cyan-900/30 bg-cyan-950/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-300">
                <Globe2 size={12} />
                <span className="truncate">{watchRegion.label}</span>
              </div>
              <div className="mt-1 text-[9px] font-mono text-[var(--text-muted)]">
                {watchRegion.south.toFixed(2)}, {watchRegion.west.toFixed(2)} → {watchRegion.north.toFixed(2)}, {watchRegion.east.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 xl:grid-cols-6">
              {summary.map((item) => (
                <div key={item.key} className="rounded border border-[var(--border-primary)]/50 bg-black/20 px-2 py-2 text-center">
                  <div className="text-[11px] font-bold font-mono text-cyan-300">{item.count}</div>
                  <div className="text-[8px] font-mono text-[var(--text-muted)]">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="max-h-[360px] overflow-y-auto styled-scrollbar space-y-3 pr-1">
              {SECTION_ORDER.map((section) => {
                const items = watchResults[section];
                if (!items.length) return null;
                return (
                  <div key={section} className="rounded border border-[var(--border-primary)]/40 bg-black/15">
                    <div className="border-b border-[var(--border-primary)]/40 px-3 py-2 text-[10px] font-mono tracking-widest text-[var(--text-secondary)]">
                      {SECTION_LABELS[section]} ({items.length})
                    </div>
                    <div className="divide-y divide-[var(--border-primary)]/20">
                      {items.slice(0, 8).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => onFocusResult(item)}
                          className="w-full px-3 py-2 text-left hover:bg-cyan-950/15 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[10px] font-mono text-[var(--text-primary)]">{item.title}</div>
                              {item.subtitle && <div className="truncate text-[9px] font-mono text-[var(--text-muted)] mt-0.5">{item.subtitle}</div>}
                            </div>
                            {item.severity && <div className="shrink-0 text-[8px] font-mono text-cyan-400">{item.severity}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {watchResults.total === 0 && (
                <div className="rounded border border-[var(--border-primary)]/40 bg-black/15 px-3 py-4 text-center text-[10px] font-mono text-[var(--text-muted)]">
                  No matching live items inside this region right now.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded border border-[var(--border-primary)]/40 bg-black/15 px-3 py-4 text-[10px] font-mono text-[var(--text-muted)]">
            Set a bbox or resolve a country name to start a watchlist that follows this region only.
          </div>
        )}
      </div>
    </div>
  );
}
