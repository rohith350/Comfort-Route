import type { ApiStop, ApiPlanResponse, ApiCrowdReportResponse, ApiScoredStop, LiveVehiclePosition, LiveFeedStatus } from './types';
import { calculateRealStopMetrics } from './realCrowdModel';

const API_BASE = 'http://localhost:5000/api';

// ─── Known stops with geographic coordinates & context tags ───
export const FALLBACK_STOPS: ApiStop[] = [
  { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, is_metro: true, context_tag: 'Residential Hub' },
  { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, is_metro: true, context_tag: 'Office Hub' },
  { id: 'kashmere_gate', name: 'Kashmere Gate ISBT', lat: 28.6675, lng: 77.2285, is_metro: true, context_tag: 'Interstate Hub' },
  { id: 'nehru_place', name: 'Nehru Place Bus Terminal', lat: 28.5494, lng: 77.2529, is_metro: true, context_tag: 'IT & Office Hub' },
  { id: 'anand_vihar', name: 'Anand Vihar ISBT', lat: 28.6469, lng: 77.3160, is_metro: true, context_tag: 'ISBT & Rail Hub' },
  { id: 'saket', name: 'Saket Metro Station', lat: 28.5204, lng: 77.2015, is_metro: true, context_tag: 'Commercial District' },
  { id: 'hauz_khas', name: 'Hauz Khas Metro', lat: 28.5494, lng: 77.2001, is_metro: true, context_tag: 'Metro Interchange' },
  { id: 'rajiv_chowk', name: 'Rajiv Chowk / CP', lat: 28.6328, lng: 77.2195, is_metro: true, context_tag: 'CBD Metro Interchange' },
];

/**
 * Context intelligence for Delhi stops explaining crowd spikes
 */
export const STOP_CONTEXT_MAP: Record<string, string> = {
  uttam_nagar: 'Residential Hub',
  janakpuri_east: 'Metro Interchange',
  tilak_nagar: 'Commercial Area',
  subhash_nagar: 'Residential Hub',
  rajouri_garden: 'Metro Interchange',
  moti_nagar: 'Industrial Precinct',
  shadipur: 'Transit Corridor',
  patel_nagar: 'Residential Zone',
  karol_bagh: 'Market Hub',
  jhandewalan: 'Institutional Hub',
  connaught_place: 'Office Hub',
  rajiv_chowk: 'CBD Metro Interchange',
  dhaula_kuan: 'Airport Express Interchange',
  chanakyapuri: 'Diplomatic Enclave',
  teen_murti: 'Heritage District',
  shivaji_stadium: 'CBD Feeder Terminal',
  kashmere_gate: 'Interstate ISBT / Triple Metro',
  red_fort: 'Heritage Tourist Hub',
  delhi_gate: 'Old Delhi Terminal',
  ito: 'Govt & Institutional Hub',
  pragati_maidan: 'Exhibition & Trade Hub',
  sundar_nagar: 'Residential Arterial',
  nizamuddin: 'Railway Terminal',
  ashram: 'Ring Road Bottleneck',
  lajpat_nagar: 'Commercial Market Hub',
  kailash_colony: 'Residential Hub',
  nehru_place: 'IT & Office Hub',
  sarai_kale_khan: 'ISBT & RRTS Hub',
  moolchand: 'Hospital Hub',
  green_park: 'Commercial Market',
  aiims: 'National Medical Hub',
  ina_market: 'Dilli Haat / Market',
  safdarjung_tomb: 'Heritage Precinct',
  tughlak_road: 'Central Vista Zone',
  udyog_bhawan: 'Ministry & Secretariat',
  patel_chowk: 'Office District',
  anand_vihar: 'ISBT & Rail Hub',
  karkardooma: 'Court & Institutional Hub',
  preet_vihar: 'Commercial Hub',
  laxmi_nagar: 'Student Coaching Hub',
  south_extension: 'High-Street Retail Hub',
  malviya_nagar: 'Residential Hub',
  saket: 'Commercial District',
};

// In-memory store for client-side live reports
export const clientCrowdReports = new Map<string, { level: 'LOW' | 'MEDIUM' | 'HIGH'; timestamp: number }>();

/**
 * Converts decimal time to formatted time string (e.g. 9.45 -> "9:27 AM")
 */
function formatTimeWithOffset(baseTimeStr: string, offsetMins: number): string {
  let [h, m] = baseTimeStr.split(':').map(Number);
  if (isNaN(h)) h = 9;
  if (isNaN(m)) m = 15;
  const totalM = h * 60 + m + offsetMins;
  const newH = Math.floor(totalM / 60) % 24;
  const newM = totalM % 60;
  const period = newH >= 12 ? 'PM' : 'AM';
  const displayH = newH % 12 === 0 ? 12 : newH % 12;
  return `${displayH}:${String(newM).padStart(2, '0')} ${period}`;
}

/**
 * Temporal surge calculation curve for Delhi transit
 */
export function getTemporalRushFactor(hours: number): number {
  let baseline = 6.0;
  if (hours < 6.0) baseline = Math.max(0, 5.0 * (hours / 6.0));
  else if (hours > 22.0) baseline = Math.max(0, 5.0 * ((24.0 - hours) / 2.0));

  // Morning rush peaking at 09:30 (+32%)
  const morningRush = 32.0 * Math.exp(-Math.pow(hours - 9.5, 2) / (2 * Math.pow(0.9, 2)));
  // Evening rush peaking at 18:30 (+36%)
  const eveningRush = 36.0 * Math.exp(-Math.pow(hours - 18.5, 2) / (2 * Math.pow(1.05, 2)));

  return baseline + morningRush + eveningRush;
}

/**
 * Day of week multiplier reflecting real Delhi transit demand:
 * - Mon-Fri: sharp 9 AM & 6:30 PM office spikes
 * - Sat: moderate afternoon market surges (Chandni Chowk, CP, Connaught Place)
 * - Sun: drops crowding by ~35% across all routes
 */
export function getDayCrowdMultiplier(dayOfWeek: string = 'Tue', hours: number = 9.25): number {
  const day = (dayOfWeek || 'Tue').toLowerCase().slice(0, 3);
  if (day === 'sun') {
    return 0.65; // ~35% reduction on Sunday
  }
  if (day === 'sat') {
    if (hours >= 13 && hours <= 17) return 0.92; // afternoon market surge
    if (hours >= 8 && hours <= 11) return 0.76;
    return 0.80;
  }
  if (day === 'mon' || day === 'tue') return 1.05; // peak start of week
  return 1.0;
}

/**
 * Dynamic calculation engine guaranteeing realistic routes:
 * 1. FASTEST: direct express (often crowded in peak)
 * 2. MOST COMFORTABLE (AC Electric / Feeder corridor, Comfort >= 75)
 * 3. WAIT-12-MINS (Same bus, next departure with guaranteed seat, Comfort >= 75)
 */
export function calculateDynamicPlan(
  origin: string,
  destination: string,
  timeStr: string,
  isSurgeDemo: boolean = false,
  dayOfWeek: string = 'Tue'
): ApiPlanResponse {
  let hours = 9.25;
  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) hours = h + m / 60;
  }

  const temporalFactor = getTemporalRushFactor(hours);
  const surgeMultiplier = isSurgeDemo ? 1.35 : 1.0;
  const dayMult = getDayCrowdMultiplier(dayOfWeek, hours);

  // Primary fast route occupancy (e.g. Bus 729)
  const baseFastOcc = Math.round((48 + temporalFactor * 1.1) * surgeMultiplier * dayMult);
  const fastOcc = Math.min(98, Math.max(22, baseFastOcc));
  const fastComfort = Math.max(8, Math.min(94, Math.round(100 - fastOcc)));
  const fastStatus = fastOcc > 80 ? 'RED' : fastOcc >= 50 ? 'YELLOW' : 'GREEN';

  // Comfortable route occupancy (AC Electric / Alternate corridor, guaranteed seats)
  // Low baseline demand and high seat availability (always Comfort >= 75)
  const baseComfortOcc = Math.min(35, Math.max(14, Math.round((20 + temporalFactor * 0.28) * Math.min(1.0, dayMult))));
  const comfortOcc = baseComfortOcc;
  const comfortableScore = Math.min(95, Math.max(76, Math.round(100 - comfortOcc * 0.55)));
  const comfortSeatsOpenPct = Math.round(100 - comfortOcc);

  // Wait 12 Mins route (Same primary bus, following interval when rush clears)
  const waitOcc = Math.min(38, Math.max(15, Math.round(fastOcc * 0.42)));
  const waitComfort = Math.min(94, Math.max(77, Math.round(100 - waitOcc * 0.6)));
  const waitSeatsOpenPct = Math.round(100 - waitOcc);

  const departurePlus12 = formatTimeWithOffset(timeStr, 12);

  // ─── Corridor 1: Uttam Nagar -> Connaught Place ───
  if (
    (origin === 'uttam_nagar' && destination === 'connaught_place') ||
    (origin === 'connaught_place' && destination === 'uttam_nagar')
  ) {
    const rawStopsFast: ApiScoredStop[] = [
      { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, load_pct: Math.min(95, Math.round(fastOcc * 0.75)), is_metro: true, context_tag: 'Residential Hub' },
      { id: 'janakpuri_east', name: 'Janakpuri East', lat: 28.6289, lng: 77.0787, load_pct: Math.min(98, Math.round(fastOcc * 0.88)), is_metro: true, context_tag: 'Metro Interchange' },
      { id: 'tilak_nagar', name: 'Tilak Nagar', lat: 28.6366, lng: 77.0963, load_pct: Math.min(98, Math.round(fastOcc * 0.92)), is_metro: true, context_tag: 'Commercial Area' },
      { id: 'subhash_nagar', name: 'Subhash Nagar', lat: 28.6402, lng: 77.1051, load_pct: Math.min(98, Math.round(fastOcc * 0.94)), is_metro: true, context_tag: 'Residential Hub' },
      { id: 'rajouri_garden', name: 'Rajouri Garden', lat: 28.6492, lng: 77.1225, load_pct: Math.min(100, Math.round(fastOcc * 1.05)), is_metro: true, context_tag: 'Metro Interchange' },
      { id: 'moti_nagar', name: 'Moti Nagar', lat: 28.6578, lng: 77.1424, load_pct: Math.min(100, Math.round(fastOcc * 0.99)), is_metro: true, context_tag: 'Industrial Precinct' },
      { id: 'shadipur', name: 'Shadipur', lat: 28.6517, lng: 77.1582, load_pct: Math.min(100, Math.round(fastOcc * 0.97)), is_metro: true, context_tag: 'Transit Corridor' },
      { id: 'patel_nagar', name: 'Patel Nagar', lat: 28.6536, lng: 77.1645, load_pct: Math.min(100, Math.round(fastOcc * 0.98)), is_metro: true, context_tag: 'Residential Zone' },
      { id: 'karol_bagh', name: 'Karol Bagh', lat: 28.6441, lng: 77.1906, load_pct: Math.min(100, Math.round(fastOcc * 1.08)), is_metro: true, context_tag: 'Market Hub' },
      { id: 'jhandewalan', name: 'Jhandewalan', lat: 28.6444, lng: 77.2005, load_pct: Math.min(95, Math.round(fastOcc * 0.95)), is_metro: true, context_tag: 'Institutional Hub' },
      { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, load_pct: Math.min(92, Math.round(fastOcc * 0.85)), is_metro: true, context_tag: 'Office Hub' },
    ];

    const rawStopsComfort: ApiScoredStop[] = [
      { id: 'uttam_nagar', name: 'Uttam Nagar', lat: 28.6219, lng: 77.0583, load_pct: Math.round(comfortOcc * 0.8), is_metro: true, context_tag: 'Residential Hub' },
      { id: 'mayapuri_crossing', name: 'Mayapuri Crossing', lat: 28.6245, lng: 77.1310, load_pct: Math.round(comfortOcc * 0.9), is_metro: true, context_tag: 'Arterial Bypass' },
      { id: 'dhaula_kuan', name: 'Dhaula Kuan Interchange', lat: 28.5921, lng: 77.1616, load_pct: Math.round(comfortOcc * 1.05), is_metro: true, context_tag: 'Airport Express Interchange' },
      { id: 'chanakyapuri', name: 'Chanakyapuri Post Office', lat: 28.5983, lng: 77.1856, load_pct: Math.round(comfortOcc * 0.85), is_metro: false, context_tag: 'Diplomatic Enclave' },
      { id: 'shivaji_stadium', name: 'Shivaji Stadium Bus Terminal', lat: 28.6288, lng: 77.2132, load_pct: Math.round(comfortOcc * 0.9), is_metro: true, context_tag: 'CBD Feeder Terminal' },
      { id: 'connaught_place', name: 'Connaught Place', lat: 28.6315, lng: 77.2167, load_pct: Math.round(comfortOcc * 0.8), is_metro: true, context_tag: 'Office Hub' },
    ];

    // Compute real stop metrics using the mathematical crowd model
    const fastMetrics = calculateRealStopMetrics(
      rawStopsFast.map((s) => s.id),
      hours,
      14,
      14,
      isSurgeDemo ? 1.4 : 1.15,
      42
    );

    const stopsFast: ApiScoredStop[] = rawStopsFast.map((s, idx) => {
      const m = fastMetrics[idx];
      return {
        ...s,
        load_pct: m ? m.loadPct : s.load_pct,
        seat_prob: m ? m.seatProb : Math.max(10, 100 - s.load_pct),
        seat_tag: m ? m.seatTag : 'Moderate Seats',
        turnover_note: m?.turnoverNote,
      };
    });

    const comfortMetrics = calculateRealStopMetrics(
      rawStopsComfort.map((s) => s.id),
      hours,
      8,
      8,
      1.05,
      36
    );

    const stopsComfort: ApiScoredStop[] = rawStopsComfort.map((s, idx) => {
      const m = comfortMetrics[idx];
      return {
        ...s,
        load_pct: m ? m.loadPct : s.load_pct,
        seat_prob: m ? m.seatProb : 82,
        seat_tag: m ? m.seatTag : 'High Seat Chance',
        turnover_note: m?.turnoverNote,
      };
    });

    const stopsWait: ApiScoredStop[] = stopsFast.map((s) => ({
      ...s,
      load_pct: Math.max(15, Math.round(s.load_pct * 0.42)),
      seat_prob: Math.min(98, Math.max(78, Math.round(100 - s.load_pct * 0.4))),
      seat_tag: 'Guaranteed Seat',
      turnover_note: s.turnover_note,
    }));

    return {
      query: { origin: 'Uttam Nagar', destination: 'Connaught Place', time: timeStr },
      routes: [
        {
          id: 'route_729',
          name: 'Route 729 Direct',
          tag: 'FASTEST',
          bus_numbers: ['729'],
          eta_minutes: 42,
          transfers: 0,
          headway_mins: 14,
          headway_text: 'Every 14 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: fastOcc,
          status: fastStatus,
          comfort_score: fastComfort,
          category: 'fastest',
          stops: stopsFast,
        },
        {
          id: 'route_ac_e44',
          name: 'AC Electric E-44 → Metro Feeder',
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['E-44', 'MF-1'],
          eta_minutes: 48,
          transfers: 1,
          headway_mins: 8,
          headway_text: 'Every 8 mins',
          bus_type: 'Cluster AC Electric',
          overall_occupancy_pct: comfortOcc,
          status: 'GREEN',
          comfort_score: comfortableScore,
          comfort_headline: `${comfortSeatsOpenPct}% Seats Open`,
          highlight_pill: 'AC Electric corridor · High seating chance',
          category: 'comfortable',
          stops: stopsComfort,
        },
        {
          id: 'route_729_wait12',
          name: `Bus 729 (Depart ${departurePlus12})`,
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['729'],
          eta_minutes: 54, // 42m + 12m wait
          transfers: 0,
          headway_mins: 12,
          headway_text: 'Next in 12 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: waitOcc,
          status: 'GREEN',
          comfort_score: waitComfort,
          comfort_headline: `${waitSeatsOpenPct}% Seats Open`,
          highlight_pill: 'Wait 12m to get a guaranteed seat',
          departure_note: `Depart ${departurePlus12} · +12m wait`,
          category: 'wait_and_sit',
          stops: stopsWait,
        },
      ],
    };
  }

  // ─── Corridor 2: Kashmere Gate -> Nehru Place ───
  if (
    (origin === 'kashmere_gate' && destination === 'nehru_place') ||
    (origin === 'nehru_place' && destination === 'kashmere_gate')
  ) {
    const stopsFast: ApiScoredStop[] = [
      { id: 'kashmere_gate', name: 'Kashmere Gate ISBT', lat: 28.6675, lng: 77.2285, load_pct: Math.min(95, Math.round(fastOcc * 0.9)), is_metro: true, context_tag: 'Interstate Hub' },
      { id: 'red_fort', name: 'Red Fort', lat: 28.6562, lng: 77.2410, load_pct: Math.min(98, Math.round(fastOcc * 0.92)), is_metro: true, context_tag: 'Heritage Tourist Hub' },
      { id: 'delhi_gate', name: 'Delhi Gate', lat: 28.6405, lng: 77.2403, load_pct: Math.min(98, Math.round(fastOcc * 0.94)), is_metro: true, context_tag: 'Old Delhi Terminal' },
      { id: 'ito', name: 'ITO Crossing', lat: 28.6288, lng: 77.2415, load_pct: Math.min(100, Math.round(fastOcc * 1.06)), is_metro: true, context_tag: 'Govt & Institutional Hub' },
      { id: 'pragati_maidan', name: 'Pragati Maidan', lat: 28.6219, lng: 77.2442, load_pct: Math.min(98, Math.round(fastOcc * 0.96)), is_metro: true, context_tag: 'Exhibition & Trade Hub' },
      { id: 'nizamuddin', name: 'Hazrat Nizamuddin', lat: 28.5916, lng: 77.2507, load_pct: Math.min(100, Math.round(fastOcc * 1.02)), is_metro: true, context_tag: 'Railway Terminal' },
      { id: 'ashram', name: 'Ashram Chowk', lat: 28.5714, lng: 77.2588, load_pct: Math.min(100, Math.round(fastOcc * 1.08)), is_metro: true, context_tag: 'Ring Road Bottleneck' },
      { id: 'lajpat_nagar', name: 'Lajpat Nagar Ring Road', lat: 28.5677, lng: 77.2433, load_pct: Math.min(98, Math.round(fastOcc * 1.04)), is_metro: true, context_tag: 'Commercial Market Hub' },
      { id: 'kailash_colony', name: 'Kailash Colony', lat: 28.5552, lng: 77.2425, load_pct: Math.min(95, Math.round(fastOcc * 0.95)), is_metro: true, context_tag: 'Residential Hub' },
      { id: 'nehru_place', name: 'Nehru Place Bus Terminal', lat: 28.5494, lng: 77.2529, load_pct: Math.min(92, Math.round(fastOcc * 0.88)), is_metro: true, context_tag: 'IT & Office Hub' },
    ];

    const stopsComfort: ApiScoredStop[] = [
      { id: 'kashmere_gate', name: 'Kashmere Gate ISBT', lat: 28.6675, lng: 77.2285, load_pct: Math.round(comfortOcc * 0.8), is_metro: true, context_tag: 'Interstate Hub' },
      { id: 'sarai_kale_khan', name: 'Sarai Kale Khan ISBT', lat: 28.5912, lng: 77.2574, load_pct: Math.round(comfortOcc * 1.05), is_metro: true, context_tag: 'ISBT & RRTS Hub' },
      { id: 'moolchand', name: 'Moolchand Hospital', lat: 28.5661, lng: 77.2341, load_pct: Math.round(comfortOcc * 0.9), is_metro: true, context_tag: 'Hospital Hub' },
      { id: 'nehru_place', name: 'Nehru Place Bus Terminal', lat: 28.5494, lng: 77.2529, load_pct: Math.round(comfortOcc * 0.85), is_metro: true, context_tag: 'IT & Office Hub' },
    ];

    return {
      query: { origin: 'Kashmere Gate', destination: 'Nehru Place', time: timeStr },
      routes: [
        {
          id: 'route_429',
          name: 'Route 429 Direct',
          tag: 'FASTEST',
          bus_numbers: ['429'],
          eta_minutes: 48,
          transfers: 0,
          headway_mins: 15,
          headway_text: 'Every 15 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: fastOcc,
          status: fastStatus,
          comfort_score: fastComfort,
          category: 'fastest',
          stops: stopsFast,
        },
        {
          id: 'route_ev_419',
          name: 'Cluster AC Electric EV-419',
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['EV-419'],
          eta_minutes: 54,
          transfers: 0,
          headway_mins: 7,
          headway_text: 'Every 7 mins',
          bus_type: 'Cluster AC Electric',
          overall_occupancy_pct: comfortOcc,
          status: 'GREEN',
          comfort_score: comfortableScore,
          comfort_headline: `${comfortSeatsOpenPct}% Seats Open`,
          highlight_pill: 'AC Electric express via Sarai Kale Khan bypass',
          category: 'comfortable',
          stops: stopsComfort,
        },
        {
          id: 'route_429_wait12',
          name: `Bus 429 (Depart ${departurePlus12})`,
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['429'],
          eta_minutes: 60,
          transfers: 0,
          headway_mins: 12,
          headway_text: 'Next in 12 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: waitOcc,
          status: 'GREEN',
          comfort_score: waitComfort,
          comfort_headline: `${waitSeatsOpenPct}% Seats Open`,
          highlight_pill: 'Wait 12m to get a guaranteed seat',
          departure_note: `Depart ${departurePlus12} · +12m wait`,
          category: 'wait_and_sit',
          stops: stopsFast.map((s) => ({ ...s, load_pct: Math.round(s.load_pct * 0.45) })),
        },
      ],
    };
  }

  // ─── Corridor 3: Anand Vihar -> Saket ───
  if (
    (origin === 'anand_vihar' && destination === 'saket') ||
    (origin === 'saket' && destination === 'anand_vihar')
  ) {
    const stopsFast: ApiScoredStop[] = [
      { id: 'anand_vihar', name: 'Anand Vihar ISBT', lat: 28.6469, lng: 77.3160, load_pct: Math.min(95, Math.round(fastOcc * 0.9)), is_metro: true, context_tag: 'ISBT & Rail Hub' },
      { id: 'karkardooma', name: 'Karkardooma Court', lat: 28.6508, lng: 77.3031, load_pct: Math.min(98, Math.round(fastOcc * 0.92)), is_metro: true, context_tag: 'Court & Institutional Hub' },
      { id: 'preet_vihar', name: 'Preet Vihar', lat: 28.6406, lng: 77.2952, load_pct: Math.min(98, Math.round(fastOcc * 0.94)), is_metro: true, context_tag: 'Commercial Hub' },
      { id: 'laxmi_nagar', name: 'Laxmi Nagar Metro', lat: 28.6304, lng: 77.2776, load_pct: Math.min(100, Math.round(fastOcc * 1.06)), is_metro: true, context_tag: 'Student Coaching Hub' },
      { id: 'sarai_kale_khan', name: 'Sarai Kale Khan ISBT', lat: 28.5912, lng: 77.2574, load_pct: Math.min(100, Math.round(fastOcc * 1.02)), is_metro: true, context_tag: 'ISBT & RRTS Hub' },
      { id: 'lajpat_nagar', name: 'Lajpat Nagar Ring Road', lat: 28.5677, lng: 77.2433, load_pct: Math.min(100, Math.round(fastOcc * 1.05)), is_metro: true, context_tag: 'Commercial Market Hub' },
      { id: 'south_extension', name: 'South Extension', lat: 28.5702, lng: 77.2185, load_pct: Math.min(98, Math.round(fastOcc * 0.98)), is_metro: true, context_tag: 'High-Street Retail Hub' },
      { id: 'malviya_nagar', name: 'Malviya Nagar', lat: 28.5282, lng: 77.2064, load_pct: Math.min(95, Math.round(fastOcc * 0.92)), is_metro: true, context_tag: 'Residential Hub' },
      { id: 'saket', name: 'Saket Metro Station', lat: 28.5204, lng: 77.2015, load_pct: Math.min(90, Math.round(fastOcc * 0.85)), is_metro: true, context_tag: 'Commercial District' },
    ];

    const stopsComfort: ApiScoredStop[] = [
      { id: 'anand_vihar', name: 'Anand Vihar ISBT', lat: 28.6469, lng: 77.3160, load_pct: Math.round(comfortOcc * 0.8), is_metro: true, context_tag: 'ISBT & Rail Hub' },
      { id: 'aiims', name: 'AIIMS Ansari Nagar', lat: 28.5672, lng: 77.2100, load_pct: Math.round(comfortOcc * 1.05), is_metro: true, context_tag: 'National Medical Hub' },
      { id: 'saket', name: 'Saket Metro Station', lat: 28.5204, lng: 77.2015, load_pct: Math.round(comfortOcc * 0.85), is_metro: true, context_tag: 'Commercial District' },
    ];

    return {
      query: { origin: 'Anand Vihar', destination: 'Saket', time: timeStr },
      routes: [
        {
          id: 'route_534',
          name: 'Route 534 Direct',
          tag: 'FASTEST',
          bus_numbers: ['534'],
          eta_minutes: 54,
          transfers: 0,
          headway_mins: 16,
          headway_text: 'Every 16 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: fastOcc,
          status: fastStatus,
          comfort_score: fastComfort,
          category: 'fastest',
          stops: stopsFast,
        },
        {
          id: 'route_ac_543',
          name: 'AC Electric 543 → Feeder',
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['543-AC'],
          eta_minutes: 62,
          transfers: 0,
          headway_mins: 9,
          headway_text: 'Every 9 mins',
          bus_type: 'Cluster AC Electric',
          overall_occupancy_pct: comfortOcc,
          status: 'GREEN',
          comfort_score: comfortableScore,
          comfort_headline: `${comfortSeatsOpenPct}% Seats Open`,
          highlight_pill: 'Barapullah elevated expressway AC corridor',
          category: 'comfortable',
          stops: stopsComfort,
        },
        {
          id: 'route_534_wait12',
          name: `Bus 534 (Depart ${departurePlus12})`,
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['534'],
          eta_minutes: 66,
          transfers: 0,
          headway_mins: 12,
          headway_text: 'Next in 12 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: waitOcc,
          status: 'GREEN',
          comfort_score: waitComfort,
          comfort_headline: `${waitSeatsOpenPct}% Seats Open`,
          highlight_pill: 'Wait 12m to get a guaranteed seat',
          departure_note: `Depart ${departurePlus12} · +12m wait`,
          category: 'wait_and_sit',
          stops: stopsFast.map((s) => ({ ...s, load_pct: Math.round(s.load_pct * 0.44) })),
        },
      ],
    };
  }

  // ─── Corridor 4: Hauz Khas -> Rajiv Chowk ───
  if (
    (origin === 'hauz_khas' && destination === 'rajiv_chowk') ||
    (origin === 'rajiv_chowk' && destination === 'hauz_khas')
  ) {
    const stopsFast: ApiScoredStop[] = [
      { id: 'hauz_khas', name: 'Hauz Khas Metro', lat: 28.5494, lng: 77.2001, load_pct: Math.min(95, Math.round(fastOcc * 0.9)), is_metro: true, context_tag: 'Metro Interchange' },
      { id: 'green_park', name: 'Green Park', lat: 28.5588, lng: 77.2069, load_pct: Math.min(98, Math.round(fastOcc * 0.93)), is_metro: true, context_tag: 'Commercial Market' },
      { id: 'aiims', name: 'AIIMS Ansari Nagar', lat: 28.5672, lng: 77.2100, load_pct: Math.min(100, Math.round(fastOcc * 1.05)), is_metro: true, context_tag: 'National Medical Hub' },
      { id: 'ina_market', name: 'INA Market / Dilli Haat', lat: 28.5752, lng: 77.2106, load_pct: Math.min(98, Math.round(fastOcc * 0.98)), is_metro: true, context_tag: 'Market Hub' },
      { id: 'udyog_bhawan', name: 'Udyog Bhawan', lat: 28.6116, lng: 77.2120, load_pct: Math.min(98, Math.round(fastOcc * 0.99)), is_metro: true, context_tag: 'Ministry Hub' },
      { id: 'patel_chowk', name: 'Patel Chowk', lat: 28.6231, lng: 77.2144, load_pct: Math.min(98, Math.round(fastOcc * 0.97)), is_metro: true, context_tag: 'Office District' },
      { id: 'rajiv_chowk', name: 'Rajiv Chowk / CP', lat: 28.6328, lng: 77.2195, load_pct: Math.min(92, Math.round(fastOcc * 0.88)), is_metro: true, context_tag: 'CBD Metro Interchange' },
    ];

    const stopsComfort: ApiScoredStop[] = [
      { id: 'hauz_khas', name: 'Hauz Khas Metro', lat: 28.5494, lng: 77.2001, load_pct: Math.round(comfortOcc * 0.8), is_metro: true, context_tag: 'Metro Interchange' },
      { id: 'india_gate', name: 'India Gate Hexagon', lat: 28.6129, lng: 77.2295, load_pct: Math.round(comfortOcc * 0.9), is_metro: false, context_tag: 'Boulevard Arterial' },
      { id: 'rajiv_chowk', name: 'Rajiv Chowk / CP', lat: 28.6328, lng: 77.2195, load_pct: Math.round(comfortOcc * 0.85), is_metro: true, context_tag: 'CBD Metro Interchange' },
    ];

    return {
      query: { origin: 'Hauz Khas', destination: 'Rajiv Chowk', time: timeStr },
      routes: [
        {
          id: 'route_505',
          name: 'Route 505 Direct',
          tag: 'FASTEST',
          bus_numbers: ['505'],
          eta_minutes: 35,
          transfers: 0,
          headway_mins: 15,
          headway_text: 'Every 15 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: fastOcc,
          status: fastStatus,
          comfort_score: fastComfort,
          category: 'fastest',
          stops: stopsFast,
        },
        {
          id: 'route_ac_522a',
          name: 'Cluster AC Electric 522A',
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['522A-AC'],
          eta_minutes: 42,
          transfers: 0,
          headway_mins: 8,
          headway_text: 'Every 8 mins',
          bus_type: 'Cluster AC Electric',
          overall_occupancy_pct: comfortOcc,
          status: 'GREEN',
          comfort_score: comfortableScore,
          comfort_headline: `${comfortSeatsOpenPct}% Seats Open`,
          highlight_pill: 'India Gate arterial route · Guaranteed seating',
          category: 'comfortable',
          stops: stopsComfort,
        },
        {
          id: 'route_505_wait12',
          name: `Bus 505 (Depart ${departurePlus12})`,
          tag: 'MOST COMFORTABLE',
          bus_numbers: ['505'],
          eta_minutes: 47,
          transfers: 0,
          headway_mins: 12,
          headway_text: 'Next in 12 mins',
          bus_type: 'DTC Non-AC',
          overall_occupancy_pct: waitOcc,
          status: 'GREEN',
          comfort_score: waitComfort,
          comfort_headline: `${waitSeatsOpenPct}% Seats Open`,
          highlight_pill: 'Wait 12m to get a guaranteed seat',
          departure_note: `Depart ${departurePlus12} · +12m wait`,
          category: 'wait_and_sit',
          stops: stopsFast.map((s) => ({ ...s, load_pct: Math.round(s.load_pct * 0.42) })),
        },
      ],
    };
  }

  // ─── Generic Fallback for any other arbitrary stop pair ───
  const originStop = FALLBACK_STOPS.find((s) => s.id === origin) || FALLBACK_STOPS[0];
  const destStop = FALLBACK_STOPS.find((s) => s.id === destination) || FALLBACK_STOPS[1];

  const genericStopsFast: ApiScoredStop[] = [
    { id: originStop.id, name: originStop.name, lat: originStop.lat, lng: originStop.lng, load_pct: Math.round(fastOcc * 0.8), is_metro: originStop.is_metro, context_tag: originStop.context_tag },
    { id: 'midpoint_crossing', name: 'Central Interchange', lat: (originStop.lat + destStop.lat) / 2, lng: (originStop.lng + destStop.lng) / 2, load_pct: fastOcc, is_metro: true, context_tag: 'Metro Interchange' },
    { id: destStop.id, name: destStop.name, lat: destStop.lat, lng: destStop.lng, load_pct: Math.round(fastOcc * 0.85), is_metro: destStop.is_metro, context_tag: destStop.context_tag },
  ];

  const genericStopsComfort: ApiScoredStop[] = [
    { id: originStop.id, name: originStop.name, lat: originStop.lat, lng: originStop.lng, load_pct: Math.round(comfortOcc * 0.8), is_metro: originStop.is_metro, context_tag: originStop.context_tag },
    { id: 'midpoint_feeder', name: 'Ring Road EV Station', lat: (originStop.lat + destStop.lat) / 2 + 0.008, lng: (originStop.lng + destStop.lng) / 2 - 0.008, load_pct: comfortOcc, is_metro: true, context_tag: 'EV Arterial Bypass' },
    { id: destStop.id, name: destStop.name, lat: destStop.lat, lng: destStop.lng, load_pct: Math.round(comfortOcc * 0.85), is_metro: destStop.is_metro, context_tag: destStop.context_tag },
  ];

  return {
    query: { origin: originStop.name, destination: destStop.name, time: timeStr },
    routes: [
      {
        id: 'route_generic_fast',
        name: `Express Direct ${originStop.name.split(' ')[0]}`,
        tag: 'FASTEST',
        bus_numbers: ['601'],
        eta_minutes: 40,
        transfers: 0,
        headway_mins: 14,
        headway_text: 'Every 14 mins',
        bus_type: 'DTC Non-AC',
        overall_occupancy_pct: fastOcc,
        status: fastStatus,
        comfort_score: fastComfort,
        category: 'fastest',
        stops: genericStopsFast,
      },
      {
        id: 'route_generic_comfort',
        name: 'AC Electric E-44 → Feeder',
        tag: 'MOST COMFORTABLE',
        bus_numbers: ['E-44', 'MF-2'],
        eta_minutes: 48,
        transfers: 1,
        headway_mins: 8,
        headway_text: 'Every 8 mins',
        bus_type: 'Cluster AC Electric',
        overall_occupancy_pct: comfortOcc,
        status: 'GREEN',
        comfort_score: comfortableScore,
        comfort_headline: `${comfortSeatsOpenPct}% Seats Open`,
        highlight_pill: 'AC Electric corridor · High seating chance',
        category: 'comfortable',
        stops: genericStopsComfort,
      },
      {
        id: 'route_generic_wait12',
        name: `Express Direct (Depart ${departurePlus12})`,
        tag: 'MOST COMFORTABLE',
        bus_numbers: ['601'],
        eta_minutes: 52,
        transfers: 0,
        headway_mins: 12,
        headway_text: 'Next in 12 mins',
        bus_type: 'DTC Non-AC',
        overall_occupancy_pct: waitOcc,
        status: 'GREEN',
        comfort_score: waitComfort,
        comfort_headline: `${waitSeatsOpenPct}% Seats Open`,
        highlight_pill: 'Wait 12m to get a guaranteed seat',
        departure_note: `Depart ${departurePlus12} · +12m wait`,
        category: 'wait_and_sit',
        stops: genericStopsFast.map((s) => ({ ...s, load_pct: Math.round(s.load_pct * 0.42) })),
      },
    ],
  };
}

/**
 * Fetch unique transit stops for dropdown population
 */
export async function fetchStops(): Promise<ApiStop[]> {
  try {
    const res = await fetch(`${API_BASE}/stops`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ApiStop[] = await res.json();
    return data.map((s) => ({
      ...s,
      context_tag: STOP_CONTEXT_MAP[s.id] || (s.is_metro ? 'Metro Station' : 'Bus Stop'),
    }));
  } catch {
    return FALLBACK_STOPS;
  }
}

/**
 * Fetch scored journey plan between origin and destination
 */
export async function fetchPlan(
  origin: string,
  destination: string,
  time: string,
  isSurgeDemo: boolean = false,
  dayOfWeek: string = 'Tue'
): Promise<ApiPlanResponse> {
  // Always use rich calculation engine to guarantee 3 targeted routes & metadata
  try {
    const params = new URLSearchParams({ origin, destination, time, day: dayOfWeek });
    const res = await fetch(`${API_BASE}/plan?${params}`, { signal: AbortSignal.timeout(1800) });
    if (res.ok) {
      const data: ApiPlanResponse = await res.json();
      // Ensure context tags and comfortable options exist
      if (data?.routes?.length >= 2) {
        return {
          ...data,
          routes: data.routes.map((r) => ({
            ...r,
            stops: r.stops.map((s) => ({
              ...s,
              context_tag: STOP_CONTEXT_MAP[s.id] || (s.is_metro ? 'Metro Interchange' : 'Bus Stop'),
            })),
          })),
        };
      }
    }
  } catch {
    // Backend offline / slow -> fallback seamlessly
  }

  return calculateDynamicPlan(origin, destination, time, isSurgeDemo, dayOfWeek);
}

/**
 * Submit a live crowd report
 */
export async function reportCrowd(
  route_id: string,
  stop_id: string,
  reported_level: 'LOW' | 'MEDIUM' | 'HIGH'
): Promise<ApiCrowdReportResponse> {
  clientCrowdReports.set(`${route_id}:${stop_id}`, {
    level: reported_level,
    timestamp: Date.now(),
  });

  try {
    const res = await fetch(`${API_BASE}/report-crowd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route_id, stop_id, reported_level }),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) return await res.json();
  } catch {
    // Handled in client state
  }

  return {
    success: true,
    message: `Recorded ${reported_level} report at ${stop_id}`,
    active_reports_count: clientCrowdReports.size,
  };
}

/**
 * Reset in-memory crowd reports
 */
export async function resetCrowdReports(): Promise<boolean> {
  clientCrowdReports.clear();
  try {
    const res = await fetch(`${API_BASE}/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return true;
  }
}

/**
 * Autocomplete search across real Delhi GTFS routes (routes.txt)
 */
export async function searchGtfsRoutes(query: string) {
  try {
    const res = await fetch(`/api/transit/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      return data.routes || [];
    }
  } catch {
    // Offline fallback
  }
  return [];
}

/**
 * Fetch live GPS vehicle positions from Delhi OTD feed or scheduled timetable
 */
export async function fetchLiveVehiclePositions(routeId: string): Promise<{
  positions: LiveVehiclePosition[];
  feedStatus: LiveFeedStatus;
}> {
  try {
    const res = await fetch(`/api/transit/live?route_id=${encodeURIComponent(routeId)}`);
    if (res.ok) {
      const data = await res.json();
      return {
        positions: data.positions || [],
        feedStatus: data.feedStatus || {
          source: 'GTFS SCHEDULE + LIVE TRAFFIC',
          isLiveRealtime: false,
          activeBusesCount: 0,
          lastUpdated: Date.now(),
          note: 'Live traffic sync',
        },
      };
    }
  } catch {
    // Fallback
  }

  return {
    positions: [],
    feedStatus: {
      source: 'GTFS SCHEDULE + LIVE TRAFFIC',
      isLiveRealtime: false,
      activeBusesCount: 0,
      lastUpdated: Date.now(),
      note: 'Live schedule and traffic telemetry',
    },
  };
}

/**
 * Fetch full real GTFS route with all stops and mathematical crowd/seat chance
 */
export async function fetchRouteByBusId(busId: string, hour: number = 9.25) {
  try {
    const res = await fetch(`/api/transit/route?id=${encodeURIComponent(busId)}&hour=${hour}`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback
  }
  return null;
}

