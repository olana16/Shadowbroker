"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { BarChart3, ChevronLeft, ChevronRight, Newspaper, Radar, ShieldAlert, SlidersHorizontal, Tv } from "lucide-react";
import WorldviewLeftPanel from "@/components/WorldviewLeftPanel";
import NewsFeed from "@/components/NewsFeed";
import MarketsPanel from "@/components/MarketsPanel";
import FilterPanel from "@/components/FilterPanel";
import FindLocateBar from "@/components/FindLocateBar";
import TopRightControls from "@/components/TopRightControls";
import CyberThreatPanel from "@/components/CyberThreatPanel";
import SettingsPanel from "@/components/SettingsPanel";
import MapLegend from "@/components/MapLegend";
import RegionWatchPanel from "@/components/RegionWatchPanel";
import ScaleBar from "@/components/ScaleBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardDataProvider } from "@/lib/DashboardDataContext";
import OnboardingModal, { useOnboarding } from "@/components/OnboardingModal";
import ChangelogModal, { useChangelog } from "@/components/ChangelogModal";
import type { KiwiSDR, SelectedEntity, WatchRegion, WatchResultItem } from "@/types/dashboard";
import { NOMINATIM_DEBOUNCE_MS } from "@/lib/constants";
import { useDataPolling } from "@/hooks/useDataPolling";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useRegionDossier } from "@/hooks/useRegionDossier";
import { filterDashboardDataForWatchRegion, getWatchRegionCenter } from "@/utils/regionWatch";

const MaplibreViewer = dynamic(() => import("@/components/MaplibreViewer"), { ssr: false });
const LiveNewsPanel = dynamic(() => import("@/components/LiveNewsPanel"), { ssr: false });

function LocateBar({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const parseCoords = (s: string): { lat: number; lng: number } | null => {
    const m = s.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    return null;
  };

  const handleSearch = async (q: string) => {
    setValue(q);
    const coords = parseCoords(q);
    if (coords) {
      setResults([{ label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`, ...coords }]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`, {
          headers: { "Accept-Language": "en" },
        });
        const data = await res.json();
        setResults(
          data.map((r: { display_name: string; lat: string; lon: string }) => ({
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          })),
        );
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, NOMINATIM_DEBOUNCE_MS);
  };

  const handleSelect = (r: { lat: number; lng: number }) => {
    onLocate(r.lat, r.lng);
    setOpen(false);
    setValue("");
    setResults([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 px-3 py-1.5 text-[9px] font-mono tracking-[0.15em] text-[var(--text-muted)] backdrop-blur-md transition-colors hover:border-cyan-800 hover:text-cyan-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        LOCATE
      </button>
    );
  }

  return (
    <div className="relative w-[min(420px,calc(100vw-2rem))]">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-800/60 bg-[var(--bg-primary)]/80 px-3 py-2 shadow-[0_0_20px_rgba(0,255,255,0.1)] backdrop-blur-md">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan-500"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setValue("");
              setResults([]);
            }
            if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
          }}
          placeholder="Enter coordinates (31.8, 34.8) or place name..."
          className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] font-mono tracking-wider outline-none placeholder:text-[var(--text-muted)]"
        />
        {loading && <div className="h-3 w-3 animate-spin rounded-full border border-cyan-500 border-t-transparent" />}
        <button onClick={() => {
          setOpen(false);
          setValue("");
          setResults([]);
        }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>
      </div>
      {results.length > 0 && (
        <div className="styled-scrollbar absolute bottom-full left-0 right-0 mb-1 max-h-[200px] overflow-y-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/95 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] backdrop-blur-md">
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r)} className="flex w-full items-center gap-2 border-b border-[var(--border-primary)]/50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-cyan-950/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cyan-500"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              <span className="truncate font-mono text-[9px] text-[var(--text-secondary)]">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardContent() {
  const { data, backendStatus } = useDataPolling();
  const { mouseCoords, locationLabel, handleMouseCoords } = useReverseGeocode();
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [trackedSdr, setTrackedSdr] = useState<KiwiSDR | null>(null);
  const { regionDossier, regionDossierLoading, handleMapRightClick } = useRegionDossier(selectedEntity, setSelectedEntity);

  const [uiVisible, setUiVisible] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightPanelView, setRightPanelView] = useState<"news" | "region" | "cyber" | "markets" | "live" | "filters">("news");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 2, latitude: 20 });
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ lat: number; lng: number }[]>([]);
  const [activeLayers, setActiveLayers] = useState({
    flights: true,
    private: true,
    jets: true,
    military: true,
    tracked: true,
    satellites: true,
    ships_military: true,
    ships_cargo: true,
    ships_civilian: false,
    ships_passenger: true,
    ships_tracked_yachts: true,
    earthquakes: true,
    cctv: false,
    ukraine_frontline: true,
    global_incidents: true,
    day_night: true,
    gps_jamming: true,
    gibs_imagery: false,
    highres_satellite: false,
    kiwisdr: false,
    firms: false,
    internet_outages: false,
    datacenters: false,
    military_bases: false,
    power_plants: false,
  });
  const [gibsDate, setGibsDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.6);
  const effects = { bloom: true };
  const [activeStyle, setActiveStyle] = useState("DEFAULT");
  const stylesList = ["DEFAULT", "SATELLITE"];
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; ts: number; zoom?: number; bounds?: { south: number; west: number; north: number; east: number } } | null>(null);
  const [watchRegion, setWatchRegion] = useState<WatchRegion | null>(null);
  const { showOnboarding, setShowOnboarding } = useOnboarding();
  const { showChangelog, setShowChangelog } = useChangelog();
  const watchResults = useMemo(() => filterDashboardDataForWatchRegion(data, watchRegion), [data, watchRegion]);

  const focusWatchResult = (item: WatchResultItem) => {
    setFlyToLocation({ lat: item.lat, lng: item.lng, ts: Date.now(), zoom: 7 });
    if (item.entityType && item.entityId != null) {
      setSelectedEntity({ type: item.entityType, id: item.entityId });
    }
  };

  const cycleStyle = () => {
    setActiveStyle((prev) => {
      const idx = stylesList.indexOf(prev);
      const next = stylesList[(idx + 1) % stylesList.length];
      setActiveLayers((l) => ({ ...l, highres_satellite: next === "SATELLITE" }));
      return next;
    });
  };

  const rightPanelTabs = [
    { key: "news", label: "NEWS", icon: Newspaper, description: "RSS and Telegram intercepts in one feed" },
    { key: "region", label: "REGION", icon: Radar, description: "Watch one country across all live feeds" },
    { key: "cyber", label: "CYBER", icon: ShieldAlert, description: "Exploited vulnerabilities and cyber reporting" },
    { key: "markets", label: "MARKETS", icon: BarChart3, description: "Defense stocks and commodity movement" },
    { key: "live", label: "LIVE", icon: Tv, description: "Live video sources and channels" },
    { key: "filters", label: "FILTERS", icon: SlidersHorizontal, description: "Refine flights and tracked activity" },
  ] as const;

  const activeRightPanel = rightPanelTabs.find((tab) => tab.key === rightPanelView) || rightPanelTabs[0];

  return (
    <DashboardDataProvider data={data} selectedEntity={selectedEntity} setSelectedEntity={setSelectedEntity}>
      <main className="min-h-screen w-full overflow-y-auto bg-[var(--bg-primary)] font-sans text-[var(--foreground)]">
        <section className="relative h-screen min-h-[780px] overflow-hidden">
          <div className="absolute inset-0">
            <ErrorBoundary name="Map">
              <MaplibreViewer
                data={data}
                activeLayers={activeLayers}
                activeFilters={activeFilters}
                effects={{ ...effects, bloom: effects.bloom && activeStyle !== "DEFAULT", style: activeStyle }}
                onEntityClick={setSelectedEntity}
                selectedEntity={selectedEntity}
                watchRegion={watchRegion}
                flyToLocation={flyToLocation}
                gibsDate={gibsDate}
                gibsOpacity={gibsOpacity}
                onMouseCoords={handleMouseCoords}
                onRightClick={handleMapRightClick}
                regionDossier={regionDossier}
                regionDossierLoading={regionDossierLoading}
                onViewStateChange={setMapView}
                measureMode={measureMode}
                onMeasureClick={(pt: { lat: number; lng: number }) => {
                  setMeasurePoints((prev) => (prev.length >= 3 ? prev : [...prev, pt]));
                }}
                measurePoints={measurePoints}
                trackedSdr={trackedSdr}
                setTrackedSdr={setTrackedSdr}
              />
            </ErrorBoundary>
          </div>

          {uiVisible && (
            <>
              <motion.div
                className="hud-zone pointer-events-none absolute left-6 top-24 bottom-6 z-[200] flex w-80 flex-col gap-6 max-md:hidden"
                animate={{ x: leftOpen ? 0 : -360 }}
                transition={{ type: "spring", damping: 30, stiffness: 250 }}
              >
                <ErrorBoundary name="WorldviewLeftPanel">
                  <WorldviewLeftPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} onSettingsClick={() => setSettingsOpen(true)} onLegendClick={() => setLegendOpen(true)} gibsDate={gibsDate} setGibsDate={setGibsDate} gibsOpacity={gibsOpacity} setGibsOpacity={setGibsOpacity} onEntityClick={setSelectedEntity} onFlyTo={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} trackedSdr={trackedSdr} setTrackedSdr={setTrackedSdr} />
                </ErrorBoundary>
              </motion.div>

              <motion.div
                className="hud-zone pointer-events-auto absolute left-0 top-1/2 z-[201] -translate-y-1/2 max-md:hidden"
                animate={{ x: leftOpen ? 344 : 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 250 }}
              >
                <button
                  onClick={() => setLeftOpen(!leftOpen)}
                  className="flex flex-col items-center gap-1.5 rounded-r-md border border-cyan-400 border-l-0 bg-cyan-400 px-1.5 py-5 text-black shadow-[2px_0_12px_rgba(0,0,0,0.4)] transition-colors hover:border-cyan-300 hover:bg-cyan-300"
                >
                  {leftOpen ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                  <span className="text-[7px] font-bold tracking-[0.2em] text-black" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>LAYERS</span>
                </button>
              </motion.div>

              <motion.div
                className="hud-zone pointer-events-auto absolute right-0 top-1/2 z-[201] -translate-y-1/2 max-lg:hidden"
                animate={{ x: rightOpen ? -344 : 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 250 }}
              >
                <button
                  onClick={() => setRightOpen(!rightOpen)}
                  className="flex flex-col items-center gap-1.5 rounded-l-md border border-cyan-400 border-r-0 bg-cyan-400 px-1.5 py-5 text-black shadow-[-2px_0_12px_rgba(0,0,0,0.4)] transition-colors hover:border-cyan-300 hover:bg-cyan-300"
                >
                  {rightOpen ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
                  <span className="text-[7px] font-bold tracking-[0.2em] text-black" style={{ writingMode: "vertical-rl" }}>INTEL</span>
                </button>
              </motion.div>

              <motion.div
                className="hud-zone pointer-events-auto absolute right-6 top-24 bottom-6 z-[200] flex w-[22rem] flex-col max-lg:hidden"
                animate={{ x: rightOpen ? 0 : 360 }}
                transition={{ type: "spring", damping: 30, stiffness: 250 }}
              >
                <div className="flex h-full min-h-0 flex-col rounded-2xl border border-cyan-900/40 bg-[var(--bg-primary)]/72 p-3 shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                  <TopRightControls />

                  <div className="mt-3 shrink-0">
                    <FindLocateBar
                      data={data}
                      onLocate={(lat, lng) => {
                        setFlyToLocation({ lat, lng, ts: Date.now() });
                      }}
                      onFilter={(filterKey, value) => {
                        setActiveFilters((prev) => {
                          const current = prev[filterKey] || [];
                          if (!current.includes(value)) {
                            return { ...prev, [filterKey]: [...current, value] };
                          }
                          return prev;
                        });
                      }}
                    />
                  </div>

                  <div className="mt-3 shrink-0 rounded-xl border border-[var(--border-primary)]/70 bg-black/20 p-1.5">
                    <div className="grid grid-cols-6 gap-1">
                      {rightPanelTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = rightPanelView === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setRightPanelView(tab.key)}
                            className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[8px] font-mono tracking-[0.18em] transition-colors ${
                              isActive
                                ? "bg-cyan-500/15 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.12)]"
                                : "text-[var(--text-muted)] hover:bg-cyan-950/20 hover:text-cyan-300"
                            }`}
                            title={tab.description}
                          >
                            <Icon size={13} />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 shrink-0 rounded-xl border border-[var(--border-primary)]/60 bg-black/20 px-3 py-2">
                    <div className="font-mono text-[8px] tracking-[0.24em] text-cyan-500/70">GLOBAL THREAT INTERCEPT</div>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">{activeRightPanel.label} WORKSPACE</div>
                    <div className="mt-1 text-[9px] font-mono text-[var(--text-muted)]">{activeRightPanel.description}</div>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 overflow-hidden">
                    {rightPanelView === "news" && (
                      <ErrorBoundary name="NewsFeedRightDock">
                        <NewsFeed data={data} selectedEntity={selectedEntity} regionDossier={regionDossier} regionDossierLoading={regionDossierLoading} />
                      </ErrorBoundary>
                    )}

                    {rightPanelView === "region" && (
                      <ErrorBoundary name="RegionWatchPanel">
                        <RegionWatchPanel
                          watchRegion={watchRegion}
                          watchResults={watchResults}
                          onSetWatchRegion={(region) => {
                            setWatchRegion(region);
                            const center = getWatchRegionCenter(region);
                            setFlyToLocation({
                              ...center,
                              ts: Date.now(),
                              bounds: {
                                south: region.south,
                                west: region.west,
                                north: region.north,
                                east: region.east,
                              },
                            });
                          }}
                          onClearWatchRegion={() => setWatchRegion(null)}
                          onFocusResult={focusWatchResult}
                          onFlyToRegion={(region) => {
                            const center = getWatchRegionCenter(region);
                            setFlyToLocation({
                              ...center,
                              ts: Date.now(),
                              bounds: {
                                south: region.south,
                                west: region.west,
                                north: region.north,
                                east: region.east,
                              },
                            });
                          }}
                        />
                      </ErrorBoundary>
                    )}

                    {rightPanelView === "cyber" && (
                      <ErrorBoundary name="CyberThreatPanel">
                        <CyberThreatPanel data={data} />
                      </ErrorBoundary>
                    )}

                    {rightPanelView === "markets" && (
                      <ErrorBoundary name="MarketsPanel">
                        <MarketsPanel data={data} />
                      </ErrorBoundary>
                    )}

                    {rightPanelView === "live" && (
                      <ErrorBoundary name="LiveNewsPanel">
                        <LiveNewsPanel />
                      </ErrorBoundary>
                    )}

                    {rightPanelView === "filters" && (
                      <ErrorBoundary name="FilterPanel">
                        <FilterPanel data={data} activeFilters={activeFilters} setActiveFilters={setActiveFilters} />
                      </ErrorBoundary>
                    )}
                  </div>
                </div>
              </motion.div>

              {!(selectedEntity?.type === "region_dossier" && regionDossier?.sentinel2) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1, duration: 1 }}
                  className="hud-zone pointer-events-auto absolute bottom-6 left-1/2 z-[200] flex w-[min(calc(100%-2rem),900px)] -translate-x-1/2 flex-col items-center gap-2 px-4"
                >
                  <LocateBar onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />

                  <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-4 rounded-xl border border-[var(--border-primary)] border-b-2 border-b-cyan-900 bg-[var(--bg-primary)]/60 px-6 py-3 shadow-[0_4px_30px_rgba(0,0,0,0.2)] backdrop-blur-md">
                    <div className="flex min-w-[120px] flex-col items-center">
                      <div className="font-mono text-[8px] tracking-[0.2em] text-[var(--text-muted)]">COORDINATES</div>
                      <div className="font-mono text-[11px] font-bold tracking-wide text-cyan-400">
                        {mouseCoords ? `${mouseCoords.lat.toFixed(4)}, ${mouseCoords.lng.toFixed(4)}` : "0.0000, 0.0000"}
                      </div>
                    </div>

                    <div className="hidden h-8 w-px bg-[var(--border-primary)] sm:block" />

                    <div className="flex min-w-[180px] max-w-[320px] flex-col items-center">
                      <div className="font-mono text-[8px] tracking-[0.2em] text-[var(--text-muted)]">LOCATION</div>
                      <div className="max-w-[320px] truncate font-mono text-[10px] text-[var(--text-secondary)]">
                        {locationLabel || "Hover over map..."}
                      </div>
                    </div>

                    <div className="hidden h-8 w-px bg-[var(--border-primary)] sm:block" />

                    <div className="flex cursor-pointer flex-col items-center" onClick={cycleStyle}>
                      <div className="font-mono text-[8px] tracking-[0.2em] text-[var(--text-muted)]">STYLE</div>
                      <div className="font-mono text-[11px] font-bold text-cyan-400">{activeStyle}</div>
                    </div>

                    <div className="hidden h-8 w-px bg-[var(--border-primary)] sm:block" />

                    <div className="flex flex-col items-center" title={`Kp Index: ${data?.space_weather?.kp_index ?? "N/A"}`}>
                      <div className="font-mono text-[8px] tracking-[0.2em] text-[var(--text-muted)]">SOLAR</div>
                      <div className={`font-mono text-[11px] font-bold ${
                        (data?.space_weather?.kp_index ?? 0) >= 5 ? "text-red-400" :
                        (data?.space_weather?.kp_index ?? 0) >= 4 ? "text-yellow-400" :
                        "text-green-400"
                      }`}>
                        {data?.space_weather?.kp_text || "N/A"}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}

          {!uiVisible && (
            <button
              onClick={() => setUiVisible(true)}
              className="pointer-events-auto absolute bottom-6 right-6 z-[200] rounded border border-[var(--border-primary)] bg-[var(--bg-primary)]/60 px-4 py-2 font-mono text-[10px] tracking-widest text-cyan-500 backdrop-blur-md transition-colors hover:border-cyan-800 hover:text-cyan-300"
            >
              RESTORE UI
            </button>
          )}

          <div className="pointer-events-auto absolute bottom-[5.5rem] left-[26rem] z-[201] max-xl:left-6 max-md:hidden">
            <ScaleBar
              zoom={mapView.zoom}
              latitude={mapView.latitude}
              measureMode={measureMode}
              measurePoints={measurePoints}
              onToggleMeasure={() => {
                setMeasureMode((m) => !m);
                if (measureMode) setMeasurePoints([]);
              }}
              onClearMeasure={() => setMeasurePoints([])}
            />
          </div>

          <div
            className="pointer-events-none absolute inset-0 z-[2]"
            style={{ background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 100%)" }}
          />
          <div className="pointer-events-none absolute inset-0 z-[3] bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] opacity-5" style={{ backgroundSize: "100% 4px" }} />

          <ErrorBoundary name="SettingsPanel">
            <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
          </ErrorBoundary>

          <ErrorBoundary name="MapLegend">
            <MapLegend isOpen={legendOpen} onClose={() => setLegendOpen(false)} />
          </ErrorBoundary>

          {showOnboarding && (
            <OnboardingModal
              onClose={() => setShowOnboarding(false)}
              onOpenSettings={() => {
                setShowOnboarding(false);
                setSettingsOpen(true);
              }}
            />
          )}

          {!showOnboarding && showChangelog && (
            <ChangelogModal onClose={() => setShowChangelog(false)} />
          )}

          {backendStatus === "disconnected" && (
            <div className="absolute top-0 left-0 right-0 z-[9000] flex items-center justify-center border-b border-red-500/40 bg-red-950/90 py-2 backdrop-blur-sm">
              <span className="font-mono text-[10px] tracking-widest text-red-400">
                BACKEND OFFLINE - Cannot reach backend server. Check that the backend container is running and BACKEND_URL is correct.
              </span>
            </div>
          )}
        </section>
      </main>
    </DashboardDataProvider>
  );
}
