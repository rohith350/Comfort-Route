/**
 * OSRM Routing Service with in-memory caching and graceful direct-line fallback.
 * Snaps transit stops to real road networks across Delhi corridors.
 */

// In-memory cache for segment geometries: key "lat1,lng1_lat2,lng2" -> [[lat, lng], ...]
const segmentGeometryCache = new Map<string, [number, number][]>();

/**
 * Fetches real driving road geometry between two stops using the free public OSRM API.
 * Returns Leaflet [lat, lng] coordinate pairs snapped to roads.
 */
export async function fetchSegmentRoadGeometry(
  from: [number, number],
  to: [number, number]
): Promise<[number, number][]> {
  const cacheKey = `${from[0].toFixed(5)},${from[1].toFixed(5)}_${to[0].toFixed(5)},${to[1].toFixed(5)}`;

  if (segmentGeometryCache.has(cacheKey)) {
    return segmentGeometryCache.get(cacheKey)!;
  }

  try {
    // OSRM format: /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
      // OSRM GeoJSON is [lng, lat] -> convert to Leaflet [lat, lng]
      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );

      // Pin exact start & end coordinates to the stop locations so pins and segments align 100% seamlessly
      if (coords.length > 0) {
        coords[0] = [from[0], from[1]];
        coords[coords.length - 1] = [to[0], to[1]];
      }

      segmentGeometryCache.set(cacheKey, coords);
      return coords;
    }
    throw new Error('No OSRM geometry found');
  } catch {
    // Fall back gracefully to direct stop coordinates if OSRM is unreachable or timed out
    const fallbackCoords: [number, number][] = [from, to];
    return fallbackCoords;
  }
}

export interface RouteRoadSegment {
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  loadPct: number;
  color: string;
  coordinates: [number, number][];
}

/**
 * Returns color hex code based on predicted crowdedness load
 * <50%: #10b981 (Emerald)
 * 50-80%: #f59e0b (Amber)
 * >80%: #ef4444 (Crimson)
 */
export function getCrowdColor(loadPct: number): string {
  if (loadPct > 80) return '#ef4444';
  if (loadPct >= 50) return '#f59e0b';
  return '#10b981';
}

/**
 * Fetches all road segments for a route's consecutive stops in parallel.
 */
export async function fetchAllRouteSegments(
  stops: { id: string; name: string; lat: number; lng: number; load_pct: number }[]
): Promise<RouteRoadSegment[]> {
  if (stops.length < 2) return [];

  const promises = stops.slice(0, -1).map(async (stop, idx) => {
    const nextStop = stops[idx + 1];
    const coords = await fetchSegmentRoadGeometry(
      [stop.lat, stop.lng],
      [nextStop.lat, nextStop.lng]
    );

    // Segment load is representative of the boarding load at the stop
    const segLoad = stop.load_pct;
    const color = getCrowdColor(segLoad);

    return {
      fromStopId: stop.id,
      toStopId: nextStop.id,
      fromName: stop.name,
      toName: nextStop.name,
      loadPct: segLoad,
      color,
      coordinates: coords,
    };
  });

  return Promise.all(promises);
}
