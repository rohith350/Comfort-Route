/**
 * Comfort & Crowdedness Scoring Engine
 * Computes deterministic, stop-by-stop load propagation and route-level comfort metrics.
 */

import crowdStore from './crowdStore.js';

/**
 * Calculates temporal peak factor based on a 24-hour time string ("HH:MM").
 */
export function getTemporalPeakFactor(timeStr = '09:15') {
  let hours = 9.25;
  if (typeof timeStr === 'string' && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      hours = Math.max(0, Math.min(24, h + m / 60));
    }
  }

  let baseline = 5.0;
  if (hours < 6.0) {
    baseline = Math.max(0, 5.0 * (hours / 6.0));
  } else if (hours > 22.0) {
    baseline = Math.max(0, 5.0 * ((24.0 - hours) / 2.0));
  }

  const morningRush = 30.0 * Math.exp(-Math.pow(hours - 9.5, 2) / (2 * Math.pow(0.85, 2)));
  const eveningRush = 35.0 * Math.exp(-Math.pow(hours - 18.5, 2) / (2 * Math.pow(1.0, 2)));

  const totalFactor = baseline + morningRush + eveningRush;
  return Number(totalFactor.toFixed(2));
}

export function getHeadwayPenalty(headwayMins = 10) {
  const penalty = Math.min(20, Math.max(0, (headwayMins - 5) * 1.5));
  return Number(penalty.toFixed(2));
}

export function calculateCascadedOffsets(route, customReports = null) {
  const stops = route.stops || [];
  const n = stops.length;
  const offsets = new Array(n).fill(0);

  stops.forEach((stop, i) => {
    let report = null;

    if (customReports instanceof Map) {
      report = customReports.get(`${route.id}:${stop.id}`);
    } else if (Array.isArray(customReports)) {
      report = customReports.find(r => r.route_id === route.id && r.stop_id === stop.id);
    } else {
      report = crowdStore.getReport(route.id, stop.id);
    }

    if (report && typeof report.offset === 'number') {
      const baseOffset = report.offset;
      offsets[i] += baseOffset;

      const cascadeOffset = 0.5 * baseOffset;
      if (i + 1 < n) offsets[i + 1] += cascadeOffset;
      if (i + 2 < n) offsets[i + 2] += cascadeOffset;
    }
  });

  return offsets;
}

export function scoreRoute(route, timeStr = '09:15', liveCrowdOverrides = null) {
  const stops = route.stops || [];
  const n = stops.length;

  const temporalFactor = getTemporalPeakFactor(timeStr);
  const headwayPenalty = getHeadwayPenalty(route.headway_mins);
  const cascadedOffsets = calculateCascadedOffsets(route, liveCrowdOverrides);

  const scoredStops = [];
  let prevAccumulatedLoad = 0;

  for (let i = 0; i < n; i++) {
    const stop = stops[i];
    const metroSpike = stop.is_metro ? 16 : 0;
    const baseWeight = typeof stop.base_weight === 'number' ? stop.base_weight : 12;
    const stopDensity = baseWeight + metroSpike;
    const offset = cascadedOffsets[i] || 0;

    let accumulated = 0;
    if (i === 0) {
      accumulated = stopDensity + (temporalFactor + headwayPenalty) * 0.7 + offset;
    } else {
      accumulated = (prevAccumulatedLoad * 0.55) + (stopDensity * 0.8) + ((temporalFactor + headwayPenalty) * 0.45) + offset;
    }

    let taperFactor = 1.0;
    if (i === n - 1) {
      taperFactor = 0.75;
    } else if (i === n - 2) {
      taperFactor = 0.90;
    }

    const rawLoad = accumulated * taperFactor;
    const clampedLoad = Math.min(100, Math.max(10, Math.round(rawLoad)));
    prevAccumulatedLoad = accumulated;

    scoredStops.push({
      id: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      load_pct: clampedLoad,
      is_metro: Boolean(stop.is_metro),
      context_tag: stop.context_tag || (stop.is_metro ? 'Metro Interchange' : 'Bus Stop')
    });
  }

  const totalWeight = stops.reduce((sum, s) => sum + (s.base_weight || 10), 0);
  const weightedSum = scoredStops.reduce((sum, s, idx) => sum + s.load_pct * (stops[idx].base_weight || 10), 0);
  const overall_occupancy_pct = Math.round(weightedSum / (totalWeight || 1));

  let status = 'GREEN';
  if (overall_occupancy_pct > 80) {
    status = 'RED';
  } else if (overall_occupancy_pct >= 50) {
    status = 'YELLOW';
  } else {
    status = 'GREEN';
  }

  const transfers = typeof route.transfers === 'number' ? route.transfers : 0;
  const comfort_score = Math.max(5, Math.min(99, Math.round(100 - overall_occupancy_pct - (transfers * 8))));

  return {
    id: route.id,
    name: route.name || route.id,
    tag: 'ALTERNATE',
    bus_type: route.bus_type || 'DTC Non-AC',
    bus_numbers: route.bus_numbers || [],
    eta_minutes: route.eta_minutes,
    transfers,
    headway_mins: route.headway_mins,
    headway_text: route.headway_text || `Every ${route.headway_mins} mins`,
    highlight_pill: route.highlight_pill,
    comfort_headline: route.comfort_headline,
    category: route.category,
    overall_occupancy_pct,
    status,
    comfort_score,
    stops: scoredStops
  };
}

export function assignDynamicTags(routes) {
  if (!routes || routes.length === 0) return routes;

  let minEta = Infinity;
  let fastestIndex = 0;
  routes.forEach((r, idx) => {
    if (r.eta_minutes < minEta && !r.category?.includes('wait')) {
      minEta = r.eta_minutes;
      fastestIndex = idx;
    }
  });

  let bestComfortIndex = -1;
  let maxComfort = -Infinity;
  let minOcc = Infinity;
  routes.forEach((r, idx) => {
    if (idx === fastestIndex && routes.length > 1) return;
    if (r.comfort_score > maxComfort || (r.comfort_score === maxComfort && r.overall_occupancy_pct < minOcc)) {
      maxComfort = r.comfort_score;
      minOcc = r.overall_occupancy_pct;
      bestComfortIndex = idx;
    }
  });

  if (bestComfortIndex === -1) bestComfortIndex = 0;

  routes.forEach((r, idx) => {
    if (idx === fastestIndex) {
      r.tag = 'FASTEST';
    } else if (idx === bestComfortIndex) {
      r.tag = 'MOST COMFORTABLE';
    } else {
      r.tag = 'ALTERNATE';
    }
  });

  return routes;
}
