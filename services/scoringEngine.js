/**
 * Comfort & Crowdedness Scoring Engine
 * Computes deterministic, stop-by-stop load propagation and route-level comfort metrics.
 */

import crowdStore from './crowdStore.js';

/**
 * Calculates temporal peak factor based on a 24-hour time string ("HH:MM").
 * - Morning rush: 08:30–11:00, peaking at 09:30 (+35%)
 * - Evening rush: 17:30–20:30, peaking at 18:30 (+40%)
 * - Afternoon off-peak: 13:00–15:30 (+5%)
 * - Night / late evening: gradually drops to baseline (~0-5%)
 *
 * @param {string} timeStr - "HH:MM" (e.g., "09:15")
 * @returns {number} Temporal factor percentage (e.g., 34.2)
 */
export function getTemporalPeakFactor(timeStr = '09:15') {
  let hours = 9.25; // default 09:15
  if (typeof timeStr === 'string' && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      hours = Math.max(0, Math.min(24, h + m / 60));
    }
  }

  // Off-peak daylight baseline is 5%. Drops smoothly between 22:00 and 06:00
  let baseline = 5.0;
  if (hours < 6.0) {
    baseline = Math.max(0, 5.0 * (hours / 6.0));
  } else if (hours > 22.0) {
    baseline = Math.max(0, 5.0 * ((24.0 - hours) / 2.0));
  }

  // Morning rush bell curve: centered at 09:30 (9.5), spread ~0.85 hrs, max +30% on top of baseline => +35%
  const morningRush = 30.0 * Math.exp(-Math.pow(hours - 9.5, 2) / (2 * Math.pow(0.85, 2)));

  // Evening rush bell curve: centered at 18:30 (18.5), spread ~1.0 hr, max +35% on top of baseline => +40%
  const eveningRush = 35.0 * Math.exp(-Math.pow(hours - 18.5, 2) / (2 * Math.pow(1.0, 2)));

  const totalFactor = baseline + morningRush + eveningRush;
  return Number(totalFactor.toFixed(2));
}

/**
 * Headway Penalty Formula:
 * Math.min(20, Math.max(0, (route.headway_mins - 5) * 1.5))
 * Low-frequency buses (high headway) carry higher passenger accumulation.
 *
 * @param {number} headwayMins
 * @returns {number}
 */
export function getHeadwayPenalty(headwayMins = 10) {
  const penalty = Math.min(20, Math.max(0, (headwayMins - 5) * 1.5));
  return Number(penalty.toFixed(2));
}

/**
 * Computes live crowdsourced offsets and downstream cascades along the route stops.
 * Apply any active crowdsourced reports for (route.id, stop.id):
 * - LOW: -15%
 * - MEDIUM: +5%
 * - HIGH: +25%
 * Cascading 50% of that offset to the next 2 downstream stops.
 *
 * @param {Object} route
 * @param {Array<Object>|Map|null} [customReports] - Optional override reports map or array
 * @returns {number[]} Array of accumulated offset percentages per stop index
 */
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

      // Cascade 50% of that offset to the next 2 downstream stops
      const cascadeOffset = 0.5 * baseOffset;
      if (i + 1 < n) {
        offsets[i + 1] += cascadeOffset;
      }
      if (i + 2 < n) {
        offsets[i + 2] += cascadeOffset;
      }
    }
  });

  return offsets;
}

/**
 * Score a single route with realistic stop-by-stop load propagation:
 * - Temporal peak factor
 * - Stop density (base_weight) + Metro interchange spike (+18%)
 * - Partial passenger carry-over across consecutive stops
 * - Terminal tapering (passengers alighting near destination)
 * - Headway penalty
 * - Live crowd offset cascading
 *
 * @param {Object} route - The route definition from corridors dataset
 * @param {string} [timeStr="09:15"] - 24-hour time string
 * @param {any} [liveCrowdOverrides=null] - Optional crowd reports
 * @returns {Object} Scored route with stop loads, comfort_score, status, overall_occupancy_pct
 */
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
    const metroSpike = stop.is_metro ? 18 : 0;
    const baseWeight = typeof stop.base_weight === 'number' ? stop.base_weight : 12;
    const stopDensity = baseWeight + metroSpike;
    const offset = cascadedOffsets[i] || 0;

    let accumulated = 0;
    if (i === 0) {
      // Origin stop: passengers board
      // Base load derived from stop demand + peak & headway factor
      accumulated = stopDensity + (temporalFactor + headwayPenalty) * 0.7 + offset;
    } else {
      // Intermediate stops: carry over 55% of passengers from previous stop,
      // plus newly boarding passengers proportional to stop density & system peak
      accumulated = (prevAccumulatedLoad * 0.55) + (stopDensity * 0.8) + ((temporalFactor + headwayPenalty) * 0.45) + offset;
    }

    // Terminal tapering: passengers disembark near the terminal destination
    let taperFactor = 1.0;
    if (i === n - 1) {
      taperFactor = 0.75; // destination stop
    } else if (i === n - 2) {
      taperFactor = 0.90; // penultimate stop
    }

    const rawLoad = accumulated * taperFactor;
    // Clamped strictly between 10% and 100%
    const clampedLoad = Math.min(100, Math.max(10, Math.round(rawLoad)));

    // Track for next stop carry-over
    prevAccumulatedLoad = accumulated;

    scoredStops.push({
      id: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      load_pct: clampedLoad,
      is_metro: Boolean(stop.is_metro)
    });
  }

  // Calculate overall_occupancy_pct: weighted average of stop loads along the route
  const totalWeight = stops.reduce((sum, s) => sum + (s.base_weight || 10), 0);
  const weightedSum = scoredStops.reduce((sum, s, idx) => sum + s.load_pct * (stops[idx].base_weight || 10), 0);
  const overall_occupancy_pct = Math.round(weightedSum / (totalWeight || 1));

  // Determine status: "GREEN" (< 50), "YELLOW" (50–80), or "RED" (> 80)
  let status = 'GREEN';
  if (overall_occupancy_pct > 80) {
    status = 'RED';
  } else if (overall_occupancy_pct >= 50) {
    status = 'YELLOW';
  } else {
    status = 'GREEN';
  }

  // Comfort score (0–100): Math.max(5, Math.min(99, Math.round(100 - overall_occupancy_pct - (route.transfers * 10))))
  const transfers = typeof route.transfers === 'number' ? route.transfers : 0;
  const comfort_score = Math.max(5, Math.min(99, Math.round(100 - overall_occupancy_pct - (transfers * 10))));

  return {
    id: route.id,
    name: route.name || route.id,
    tag: 'ALTERNATE', // will be dynamically tagged across corridor routes
    bus_numbers: route.bus_numbers || [],
    eta_minutes: route.eta_minutes,
    transfers,
    headway_mins: route.headway_mins,
    overall_occupancy_pct,
    status,
    comfort_score,
    stops: scoredStops
  };
}

/**
 * Auto-assign dynamic tags across returned routes:
 * - Tag the lowest eta_minutes route as "FASTEST"
 * - Tag the highest comfort_score route as "MOST COMFORTABLE"
 * - If the same route wins both, tag it "OPTIMAL" and tag the second as "ALTERNATE"
 *
 * @param {Array<Object>} routes - Scored routes
 * @returns {Array<Object>} Routes with dynamic tags assigned
 */
export function assignDynamicTags(routes) {
  if (!routes || routes.length === 0) return routes;

  if (routes.length === 1) {
    routes[0].tag = 'OPTIMAL';
    return routes;
  }

  let minEta = Infinity;
  let maxComfort = -Infinity;

  routes.forEach(r => {
    if (r.eta_minutes < minEta) minEta = r.eta_minutes;
    if (r.comfort_score > maxComfort) maxComfort = r.comfort_score;
  });

  const fastestCandidates = routes.filter(r => r.eta_minutes === minEta);
  const mostComfortableCandidates = routes.filter(r => r.comfort_score === maxComfort);

  // If the same route is both fastest and most comfortable:
  if (
    fastestCandidates.length === 1 &&
    mostComfortableCandidates.length === 1 &&
    fastestCandidates[0].id === mostComfortableCandidates[0].id
  ) {
    routes.forEach(r => {
      r.tag = r.id === fastestCandidates[0].id ? 'OPTIMAL' : 'ALTERNATE';
    });
    return routes;
  }

  // Identify distinct fastest and most comfortable routes
  const fastestRouteId = fastestCandidates[0].id;
  const comfortableRoute = mostComfortableCandidates.find(r => r.id !== fastestRouteId) || mostComfortableCandidates[0];
  const comfortableRouteId = comfortableRoute.id;

  routes.forEach(r => {
    if (r.id === fastestRouteId) {
      r.tag = 'FASTEST';
    } else if (r.id === comfortableRouteId) {
      r.tag = 'MOST COMFORTABLE';
    } else {
      r.tag = 'ALTERNATE';
    }
  });

  return routes;
}
