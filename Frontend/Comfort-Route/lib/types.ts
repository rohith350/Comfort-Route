export type OccupancyBadge = 'low' | 'moderate' | 'packed';

export interface TransitStop {
  id: string;
  name: string;
  hindiName?: string;
  coordinates: [number, number]; // [lat, lng]
  isInterchange?: boolean;
  interchangeLines?: string[];
  zoneType: 'commercial' | 'transit_hub' | 'residential' | 'institutional';
  equipmentCount?: number;
}

export interface RouteStopDetail {
  stop: TransitStop;
  arrivalTime: string;
  minuteOffset: number;
  projectedOccupancyPct: number;
  crowdTrend: 'filling' | 'peak' | 'emptying' | 'steady';
  seatedChancePct: number;
}

export interface TransitRoute {
  id: string;
  name: string;
  shortName: string;
  vehicleType: 'electric_bus' | 'dtc_standard' | 'metro_feeder' | 'cluster_bus';
  category: 'fastest' | 'comfortable' | 'balanced';
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  transfers: number;
  fareINR: number;
  co2SavingsKg: number;
  walkingDistanceM: number;
  frequencyMinutes: number;
  
  averageOccupancyPct: number;
  peakOccupancyPct: number;
  occupancyBadge: OccupancyBadge;
  comfortScore: number;
  seatProbabilityPct: number;
  seatedCapacityPct: number;
  standingCapacityPct: number;
  crowdFactorSummary: string;
  tradeoffHighlight: string;

  pathCoordinates: [number, number][];
  stopDetails: RouteStopDetail[];
}

export interface CrowdCheckinReport {
  id: string;
  timestamp: string;
  stopId: string;
  routeId: string;
  crowdLevel: 'low' | 'medium' | 'high';
  reportedMinutesAgo: number;
}
