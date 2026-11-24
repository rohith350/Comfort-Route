// ─── Backend API Response Types ───
// These match the shapes returned by the Express backend at localhost:5000

export interface ApiStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  is_metro: boolean;
}

export interface ApiScoredStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  load_pct: number;
  is_metro: boolean;
}

export interface ApiScoredRoute {
  id: string;
  name: string;
  tag: 'FASTEST' | 'MOST COMFORTABLE' | 'OPTIMAL' | 'ALTERNATE';
  bus_numbers: string[];
  eta_minutes: number;
  transfers: number;
  headway_mins: number;
  overall_occupancy_pct: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  comfort_score: number;
  stops: ApiScoredStop[];
}

export interface ApiPlanResponse {
  query: {
    origin: string;
    destination: string;
    time: string;
  };
  routes: ApiScoredRoute[];
}

export interface ApiCrowdReportResponse {
  success: boolean;
  message: string;
  active_reports_count: number;
}

// ─── UI-Level Types ───

export interface DemoScenario {
  label: string;
  origin: string;
  destination: string;
  time: string;
}

// ─── Legacy / Component-Level Types for backward compatibility ───

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
  lat?: number;
  lng?: number;
  is_metro?: boolean;
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
