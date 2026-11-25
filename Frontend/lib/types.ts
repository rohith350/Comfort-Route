// ─── Backend API Response Types ───
// These match the shapes returned by the Express backend at localhost:5000

export interface ApiStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  is_metro: boolean;
  context_tag?: string;
}

export interface ApiScoredStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  load_pct: number;
  is_metro: boolean;
  context_tag?: string; // e.g. "Metro Interchange", "Office Hub", "Market Hub"
  seat_prob?: number; // 0 - 100%
  seat_tag?: 'Guaranteed Seat' | 'High Seat Chance' | 'Moderate Seats' | 'Standing Likely' | 'Standing Only';
  turnover_note?: string; // e.g. "↑ Seats free up at Rajouri Garden Metro Interchange"
}

export interface LiveVehiclePosition {
  vehicleId: string;
  routeId: string;
  lat: number;
  lng: number;
  speedKmH: number;
  bearing?: number;
  timestamp: number;
  etaNextStopMins: number;
}

export interface LiveFeedStatus {
  source: 'LIVE OTD STREAM' | 'GTFS SCHEDULE + LIVE TRAFFIC';
  isLiveRealtime: boolean;
  activeBusesCount: number;
  lastUpdated: number;
  note: string;
}

export interface ApiScoredRoute {
  id: string;
  name: string;
  tag: 'FASTEST' | 'MOST COMFORTABLE' | 'OPTIMAL' | 'ALTERNATE' | 'WAIT & SIT';
  bus_numbers: string[];
  eta_minutes: number;
  transfers: number;
  headway_mins: number;
  overall_occupancy_pct: number;
  status: 'GREEN' | 'YELLOW' | 'RED';
  comfort_score: number;
  stops: ApiScoredStop[];

  // Enhanced Demo & Intelligence Metadata
  bus_type?: 'DTC Non-AC' | 'Cluster AC Electric' | 'Delhi EV Feeder' | 'DTC Standard' | 'DTC Low-Floor AC' | 'DIMTS Cluster' | 'DMRC Metro Feeder';
  headway_text?: string; // e.g. "Every 6 mins"
  highlight_pill?: string; // e.g. "Wait 12m to get a guaranteed seat"
  comfort_headline?: string; // e.g. "36% Seats Open"
  departure_note?: string; // e.g. "Depart 9:27 AM (+12m wait)"
  category?: 'fastest' | 'comfortable' | 'wait_and_sit';
  live_buses?: LiveVehiclePosition[];
  feed_status?: LiveFeedStatus;
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

// ─── UI-Level & Autocomplete Types ───

export interface DemoScenario {
  label: string;
  origin: string;
  destination: string;
  time: string;
}

export interface BusSearchResult {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  bus_type: string;
  seat_prob_pct: number;
  headway_mins: number;
  avg_crowd_pct: number;
  stops_count?: number;
}

export interface ApiDetailedStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  load_pct: number;
  seat_prob: number;
  seat_tag?: string;
  turnover_note?: string;
  is_metro: boolean;
}
