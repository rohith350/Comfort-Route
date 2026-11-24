import type { ApiStop, ApiPlanResponse, ApiCrowdReportResponse } from './types';

const API_BASE = 'http://localhost:5000/api';

// ─── Fallback static data when backend is offline ───
const FALLBACK_STOPS: ApiStop[] = [
  { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, is_metro: true },
  { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, is_metro: true },
  { id: 'kashmere_gate', name: 'Kashmere Gate ISBT', lat: 28.6675, lng: 77.2285, is_metro: true },
  { id: 'nehru_place', name: 'Nehru Place Bus Terminal', lat: 28.5494, lng: 77.2529, is_metro: true },
  { id: 'anand_vihar', name: 'Anand Vihar ISBT', lat: 28.6469, lng: 77.3160, is_metro: true },
  { id: 'saket', name: 'Saket Metro Station', lat: 28.5204, lng: 77.2015, is_metro: true },
  { id: 'hauz_khas', name: 'Hauz Khas Metro', lat: 28.5494, lng: 77.2001, is_metro: true },
  { id: 'rajiv_chowk', name: 'Rajiv Chowk / CP', lat: 28.6328, lng: 77.2195, is_metro: true },
];

const FALLBACK_PLAN: ApiPlanResponse = {
  query: { origin: 'Uttam Nagar', destination: 'Connaught Place', time: '09:15' },
  routes: [
    {
      id: 'route_729', name: 'Route 729 Direct', tag: 'FASTEST',
      bus_numbers: ['729'], eta_minutes: 42, transfers: 0, headway_mins: 14,
      overall_occupancy_pct: 89, status: 'RED', comfort_score: 11,
      stops: [
        { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, load_pct: 65, is_metro: true },
        { id: 'rajouri_garden', name: 'Rajouri Garden', lat: 28.6492, lng: 77.1225, load_pct: 88, is_metro: true },
        { id: 'karol_bagh', name: 'Karol Bagh', lat: 28.6441, lng: 77.1906, load_pct: 95, is_metro: true },
        { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, load_pct: 78, is_metro: true },
      ],
    },
    {
      id: 'route_740_522', name: 'Route 740 + 522 (Transfer at Dhaula Kuan)', tag: 'MOST COMFORTABLE',
      bus_numbers: ['740', '522'], eta_minutes: 50, transfers: 1, headway_mins: 7,
      overall_occupancy_pct: 48, status: 'GREEN', comfort_score: 42,
      stops: [
        { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, load_pct: 42, is_metro: true },
        { id: 'dhaula_kuan', name: 'Dhaula Kuan Interchange', lat: 28.5921, lng: 77.1616, load_pct: 55, is_metro: true },
        { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, load_pct: 38, is_metro: true },
      ],
    },
  ],
};

/**
 * Fetch unique transit stops for dropdown population
 */
export async function fetchStops(): Promise<ApiStop[]> {
  try {
    const res = await fetch(`${API_BASE}/stops`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    console.warn('[API] Backend offline — using fallback stops');
    return FALLBACK_STOPS;
  }
}

/**
 * Fetch scored journey plan between origin and destination
 */
export async function fetchPlan(origin: string, destination: string, time: string): Promise<ApiPlanResponse> {
  try {
    const params = new URLSearchParams({ origin, destination, time });
    const res = await fetch(`${API_BASE}/plan?${params}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    console.warn('[API] Backend offline — using fallback plan');
    return FALLBACK_PLAN;
  }
}

/**
 * Submit a live crowd report
 */
export async function reportCrowd(
  route_id: string, stop_id: string, reported_level: 'LOW' | 'MEDIUM' | 'HIGH'
): Promise<ApiCrowdReportResponse> {
  try {
    const res = await fetch(`${API_BASE}/report-crowd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_id, stop_id, reported_level }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    console.warn('[API] Backend offline — crowd report not sent');
    return { success: false, message: 'Backend offline', active_reports_count: 0 };
  }
}

/**
 * Reset in-memory crowd reports (demo reset)
 */
export async function resetCrowdReports(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.warn('[API] Backend offline — could not reset');
    return false;
  }
}
