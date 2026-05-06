import { useCallback, useState, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { GEOCODE_THROTTLE_MS, GEOCODE_DISTANCE_THRESHOLD, GEOCODE_CACHE_SIZE } from "@/lib/constants";

export function useReverseGeocode() {
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeAbort = useRef<AbortController | null>(null);

  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    setMouseCoords(coords);

    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const dLat = Math.abs(coords.lat - lastGeocodedPos.current.lat);
        const dLng = Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (dLat < GEOCODE_DISTANCE_THRESHOLD && dLng < GEOCODE_DISTANCE_THRESHOLD) return;
      }

      const gridKey = `${(coords.lat).toFixed(2)},${(coords.lng).toFixed(2)}`;
      const cached = geocodeCache.current.get(gridKey);
      if (cached) {
        setLocationLabel(cached);
        lastGeocodedPos.current = coords;
        return;
      }

      if (geocodeAbort.current) geocodeAbort.current.abort();
      geocodeAbort.current = new AbortController();

      try {
        const res = await fetch(
          `${API_BASE}/api/geocode/reverse?lat=${coords.lat}&lng=${coords.lng}`,
          { signal: geocodeAbort.current.signal }
        );
        if (res.ok) {
          const data = await res.json();
          const label = data.label || 'Unknown';

          if (geocodeCache.current.size > GEOCODE_CACHE_SIZE) {
            const iter = geocodeCache.current.keys();
            for (let i = 0; i < 100; i++) {
              const key = iter.next().value;
              if (key !== undefined) geocodeCache.current.delete(key);
            }
          }
          geocodeCache.current.set(gridKey, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch (e: unknown) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) { /* Silently fail - keep last label */ }
      }
    }, GEOCODE_THROTTLE_MS);
  }, []);

  return { mouseCoords, locationLabel, handleMouseCoords };
}
