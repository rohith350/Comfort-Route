import type { TransitRoute, TransitStop, RouteStopDetail, OccupancyBadge, CrowdCheckinReport } from './types';
import { DELHI_TRANSIT_STOPS } from './delhiStops';

export function getTemporalMultiplier(timeDecimal: number): number {
  if (timeDecimal >= 8.5 && timeDecimal <= 11.0) {
    const distFromPeak = Math.abs(timeDecimal - 9.5);
    return 1.85 - distFromPeak * 0.45;
  }
  if (timeDecimal >= 17.5 && timeDecimal <= 20.5) {
    const distFromPeak = Math.abs(timeDecimal - 18.75);
    return 1.95 - distFromPeak * 0.45;
  }
  if (timeDecimal >= 13.0 && timeDecimal <= 15.5) {
    return 0.55;
  }
  if (timeDecimal < 7.5 || timeDecimal > 21.5) {
    return 0.45;
  }
  return 0.9;
}

export function formatDecimalTime(decimalTime: number): string {
  const hours = Math.floor(decimalTime);
  const minutes = Math.round((decimalTime - hours) * 60);
  const paddedMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${paddedMins} ${period}`;
}

export function formatTimeOffset(decimalTime: number, offsetMinutes: number): string {
  const totalMinutes = Math.round(decimalTime * 60) + offsetMinutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const paddedMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${paddedMins} ${period}`;
}

export function getOccupancyBadge(occupancy: number): OccupancyBadge {
  if (occupancy < 50) return 'low';
  if (occupancy <= 80) return 'moderate';
  return 'packed';
}

function buildStopProgression(
  origin: TransitStop,
  destination: TransitStop,
  intermediates: TransitStop[],
  baseLoad: number,
  timeDecimal: number,
  crowdReports: CrowdCheckinReport[],
  simulatedSurge: boolean
): RouteStopDetail[] {
  const allStops = [origin, ...intermediates, destination];
  const temporalMult = getTemporalMultiplier(timeDecimal);
  const surgeBoost = simulatedSurge ? 24 : 0;

  let currentOccupancy = baseLoad * 0.75 * temporalMult + surgeBoost;

  return allStops.map((stop, index) => {
    const isPeakStop = stop.isInterchange;
    const progress = index / Math.max(1, allStops.length - 1);

    let stopDelta = 0;
    if (progress < 0.6) {
      stopDelta = (isPeakStop ? 20 : 10) * temporalMult;
    } else {
      stopDelta = -((isPeakStop ? 18 : 25) * (1 / (temporalMult > 1 ? 0.9 : 1)));
    }

    const stopReport = crowdReports.find((r) => r.stopId === stop.id);
    if (stopReport) {
      if (stopReport.crowdLevel === 'high') stopDelta += 20;
      if (stopReport.crowdLevel === 'low') stopDelta -= 15;
    }

    currentOccupancy = Math.max(18, Math.min(99, Math.round(currentOccupancy + stopDelta)));
    const seatedChance = Math.max(5, Math.min(98, Math.round(110 - currentOccupancy * 1.15)));

    let crowdTrend: 'filling' | 'peak' | 'emptying' | 'steady' = 'steady';
    if (currentOccupancy > 80) crowdTrend = 'peak';
    else if (stopDelta > 5) crowdTrend = 'filling';
    else if (stopDelta < -5) crowdTrend = 'emptying';

    return {
      stop,
      arrivalTime: formatTimeOffset(timeDecimal, index * 8),
      minuteOffset: index * 8,
      projectedOccupancyPct: currentOccupancy,
      crowdTrend,
      seatedChancePct: seatedChance,
    };
  });
}

export function generateCandidateRoutes(
  originId: string,
  destinationId: string,
  timeDecimal: number,
  crowdReports: CrowdCheckinReport[] = [],
  simulatedSurge: boolean = false
): TransitRoute[] {
  const origin = DELHI_TRANSIT_STOPS.find((s) => s.id === originId) || DELHI_TRANSIT_STOPS[0];
  const destination = DELHI_TRANSIT_STOPS.find((s) => s.id === destinationId) || DELHI_TRANSIT_STOPS[2];

  const potentialIntermediates = DELHI_TRANSIT_STOPS.filter(
    (s) => s.id !== origin.id && s.id !== destination.id
  );

  // 1. FASTEST ROUTE
  const fastestIntermediates = potentialIntermediates.slice(0, 2);
  const fastestStops = buildStopProgression(
    origin,
    destination,
    fastestIntermediates,
    52,
    timeDecimal,
    crowdReports,
    simulatedSurge
  );
  const fastestAvgOcc = Math.min(
    99,
    Math.round(fastestStops.reduce((acc, s) => acc + s.projectedOccupancyPct, 0) / fastestStops.length)
  );
  const fastestPeakOcc = Math.max(...fastestStops.map((s) => s.projectedOccupancyPct));
  const fastestDuration = 28;

  // 2. MOST COMFORTABLE ROUTE
  const comfortableIntermediates = [
    potentialIntermediates[3] || potentialIntermediates[0],
    potentialIntermediates[1] || potentialIntermediates[0],
  ].filter(Boolean);
  const comfortableStops = buildStopProgression(
    origin,
    destination,
    comfortableIntermediates,
    28,
    timeDecimal,
    crowdReports,
    false
  );
  const comfortAvgOcc = Math.min(
    90,
    Math.round((comfortableStops.reduce((acc, s) => acc + s.projectedOccupancyPct, 0) / comfortableStops.length) * 0.72)
  );
  const comfortPeakOcc = Math.max(...comfortableStops.map((s) => s.projectedOccupancyPct));
  const comfortDuration = fastestDuration + 7;

  // 3. BALANCED ROUTE
  const balancedIntermediates = [
    potentialIntermediates[2] || potentialIntermediates[0],
    potentialIntermediates[4] || potentialIntermediates[1],
  ].filter(Boolean);
  const balancedStops = buildStopProgression(
    origin,
    destination,
    balancedIntermediates,
    38,
    timeDecimal,
    crowdReports,
    simulatedSurge
  );
  const balancedAvgOcc = Math.min(
    95,
    Math.round(balancedStops.reduce((acc, s) => acc + s.projectedOccupancyPct, 0) / balancedStops.length)
  );
  const balancedPeakOcc = Math.max(...balancedStops.map((s) => s.projectedOccupancyPct));
  const balancedDuration = fastestDuration + 4;

  const fastestPath = [origin.coordinates, ...fastestIntermediates.map((s) => s.coordinates), destination.coordinates];
  const comfortPath = [origin.coordinates, ...comfortableIntermediates.map((s) => s.coordinates), destination.coordinates];
  const balancedPath = [origin.coordinates, ...balancedIntermediates.map((s) => s.coordinates), destination.coordinates];

  const fastestRoute: TransitRoute = {
    id: 'route-fastest',
    name: 'DTC Super-Fast Express 502',
    shortName: '502 EXP',
    vehicleType: 'dtc_standard',
    category: 'fastest',
    departureTime: formatDecimalTime(timeDecimal),
    arrivalTime: formatTimeOffset(timeDecimal, fastestDuration),
    durationMinutes: fastestDuration,
    transfers: 0,
    fareINR: 15,
    co2SavingsKg: 1.8,
    walkingDistanceM: 220,
    frequencyMinutes: 6,
    averageOccupancyPct: fastestAvgOcc,
    peakOccupancyPct: fastestPeakOcc,
    occupancyBadge: getOccupancyBadge(fastestAvgOcc),
    comfortScore: Math.max(10, Math.round(100 - fastestAvgOcc * 0.95)),
    seatProbabilityPct: Math.max(8, Math.round(105 - fastestAvgOcc * 1.1)),
    seatedCapacityPct: Math.min(100, Math.round(fastestAvgOcc > 45 ? 45 : fastestAvgOcc)),
    standingCapacityPct: Math.max(0, fastestAvgOcc - 45),
    crowdFactorSummary: 'High crush load due to peak office rush and major metro interchange boarding.',
    tradeoffHighlight: 'Direct express route with minimal travel time, but standing room only during rush windows.',
    pathCoordinates: fastestPath,
    stopDetails: fastestStops,
  };

  const comfortableRoute: TransitRoute = {
    id: 'route-comfortable',
    name: 'Delhi EV Feeder AC-753',
    shortName: 'EV-753 AC',
    vehicleType: 'electric_bus',
    category: 'comfortable',
    departureTime: formatTimeOffset(timeDecimal, 3),
    arrivalTime: formatTimeOffset(timeDecimal, 3 + comfortDuration),
    durationMinutes: comfortDuration,
    transfers: 0,
    fareINR: 25,
    co2SavingsKg: 2.4,
    walkingDistanceM: 180,
    frequencyMinutes: 10,
    averageOccupancyPct: comfortAvgOcc,
    peakOccupancyPct: comfortPeakOcc,
    occupancyBadge: getOccupancyBadge(comfortAvgOcc),
    comfortScore: Math.max(70, Math.round(100 - comfortAvgOcc * 0.45)),
    seatProbabilityPct: Math.max(65, Math.round(100 - comfortAvgOcc * 0.5)),
    seatedCapacityPct: comfortAvgOcc,
    standingCapacityPct: 0,
    crowdFactorSummary: 'Air-conditioned low-floor EV. Smooth ride with wide seat availability throughout.',
    tradeoffHighlight: `Only +${comfortDuration - fastestDuration}m slower, but saves 40% crush load with guaranteed seats!`,
    pathCoordinates: comfortPath,
    stopDetails: comfortableStops,
  };

  const balancedRoute: TransitRoute = {
    id: 'route-balanced',
    name: 'Cluster Feeder Shuttle 429',
    shortName: '429 Cluster',
    vehicleType: 'cluster_bus',
    category: 'balanced',
    departureTime: formatTimeOffset(timeDecimal, 5),
    arrivalTime: formatTimeOffset(timeDecimal, 5 + balancedDuration),
    durationMinutes: balancedDuration,
    transfers: 1,
    fareINR: 20,
    co2SavingsKg: 1.9,
    walkingDistanceM: 340,
    frequencyMinutes: 8,
    averageOccupancyPct: balancedAvgOcc,
    peakOccupancyPct: balancedPeakOcc,
    occupancyBadge: getOccupancyBadge(balancedAvgOcc),
    comfortScore: Math.round(100 - balancedAvgOcc * 0.65),
    seatProbabilityPct: Math.round(95 - balancedAvgOcc * 0.75),
    seatedCapacityPct: Math.min(100, balancedAvgOcc),
    standingCapacityPct: Math.max(0, balancedAvgOcc - 55),
    crowdFactorSummary: 'Balanced transfer route utilizing alternate arterial road to bypass bottlenecks.',
    tradeoffHighlight: `Balanced travel: +${balancedDuration - fastestDuration}m with moderate seating chance.`,
    pathCoordinates: balancedPath,
    stopDetails: balancedStops,
  };

  return [fastestRoute, comfortableRoute, balancedRoute];
}
