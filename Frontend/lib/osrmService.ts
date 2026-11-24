/**
 * OSRM Routing Service with in-memory caching and offline road curvature fallback.
 * Snaps transit stops to real road networks across Delhi corridors.
 */

// In-memory cache for segment geometries: key "lat1,lng1_lat2,lng2" -> [[lat, lng], ...]
const segmentGeometryCache = new Map<string, [number, number][]>();

/**
 * Generates realistic interpolated road curve points between two geographic coordinates
 * Used when OSRM is unreachable, offline, or times out.
 */
export function getInterpolatedRoadCurve(
  p1: [number, number],
  p2: [number, number]
): [number, number][] {
  const steps = 8;
  const points: [number, number][] = [];
  const dLat = p2[0] - p1[0];
  const dLng = p2[1] - p1[1];

  // Perpendicular offset for subtle organic road-like curving
  const perpLat = -dLng * 0.08;
  const perpLng = dLat * 0.08;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curve = Math.sin(t * Math.PI);
    points.push([
      p1[0] + dLat * t + perpLat * curve,
      p1[1] + dLng * t + perpLng * curve,
    ]);
  }
  return points;
}

/**
 * Fetches real driving road geometry between two stops using OSRM.
 * Returns Leaflet [lat, lng] coordinate pairs.
 */
export async function fetchSegmentRoadGeometry(
  from: [number, number],
  to: [number, number]
): Promise<[number, number][]> {
  const cacheKey = `${from[0].toFixed(4)},${from[1].toFixed(4)}_${to[0].toFixed(4)},${to[1].toFixed(4)}`;

  if (segmentGeometryCache.has(cacheKey)) {
    return segmentGeometryCache.get(cacheKey)!;
  }

  try {
    // OSRM expects: /route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=full&geometries=geojson
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2800) });

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
      // OSRM GeoJSON is [lng, lat] -> convert to Leaflet [lat, lng]
      const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );
      segmentGeometryCache.set(cacheKey, coords);
      return coords;
    }
    throw new Error('No OSRM geometry found');
  } catch {
    // Offline / timeout / rate-limit fallback
    const fallbackCoords = getInterpolatedRoadCurve(from, to);
    segmentGeometryCache.set(cacheKey, fallbackCoords);
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
 * <50%: #22c55e (Green)
 * 50-80%: #f59e0b (Amber)
 * >80%: #ef4444 (Red)
 */
export function getCrowdColor(loadPct: number): string {
  if (loadPct > 80) return '#ef4444';
  if (loadPct >= 50) return '#f59e0b';
  return '#22c55e';
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
