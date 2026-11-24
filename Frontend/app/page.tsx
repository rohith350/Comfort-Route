'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowUpDown,
  Clock,
  Bus,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Train,
  Sparkles,
  Navigation,
  BarChart3,
  Flame,
  Zap,
  ChevronLeft,
  ShieldCheck,
  AlertTriangle,
  Radio,
  ExternalLink,
  Search,
  Loader2,
} from 'lucide-react';

import { fetchStops, fetchPlan, reportCrowd, resetCrowdReports, STOP_CONTEXT_MAP, getTemporalRushFactor } from '@/lib/api';
import type { ApiStop, ApiPlanResponse, DemoScenario } from '@/lib/types';
import { CrowdTelemetryHud, DayOfWeek } from '@/components/CrowdTelemetryHud';

// Dynamic Leaflet map (no SSR)
const TransitMap = dynamic(() => import('@/components/TransitMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#09090b] text-zinc-400 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>Loading Delhi Transit Network…</span>
      </div>
    </div>
  ),
});

// ─── Demo Scenario Chips ───
const DEMO_SCENARIOS: DemoScenario[] = [
  { label: '9:15 AM Peak', origin: 'uttam_nagar', destination: 'connaught_place', time: '09:15' },
  { label: '10:00 AM Post-Peak', origin: 'uttam_nagar', destination: 'connaught_place', time: '10:00' },
  { label: '12:00 PM Midday', origin: 'uttam_nagar', destination: 'connaught_place', time: '12:00' },
  { label: '2:00 PM Off-Peak', origin: 'uttam_nagar', destination: 'connaught_place', time: '14:00' },
  { label: '6:30 PM Evening Surge', origin: 'kashmere_gate', destination: 'nehru_place', time: '18:30' },
];

type CommandTab = 'journey' | 'details' | 'system' | 'analytics';

// ─── UI Helpers ───
function statusColorClass(status: string) {
  if (status === 'GREEN') return 'text-emerald-400';
  if (status === 'YELLOW') return 'text-amber-400';
  return 'text-red-400';
}

function tagBadgeClass(tag: string) {
  if (tag === 'FASTEST') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (tag === 'MOST COMFORTABLE') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

function barGradientClass(pct: number) {
  if (pct >= 80) return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  if (pct >= 50) return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
  return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
}

function timeFromSlider(val: number): string {
  const h = Math.floor(val / 4);
  const m = (val % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function displayTime(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${m} ${period}`;
}

function sliderFromTime(t: string): number {
  const [hStr, mStr] = t.split(':');
  return parseInt(hStr, 10) * 4 + Math.floor(parseInt(mStr, 10) / 15);
}

// ─── Circular Radial Progress Ring for Comfort Score ───
function ComfortRadialRing({ score }: { score: number }) {
  const radius = 12.5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
        <circle
          cx="16"
          cy="16"
          r={radius}
          className="stroke-zinc-800"
          strokeWidth="2.5"
          fill="none"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold font-mono tabular-nums leading-none" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  );
}

export default function CrowdPlannerApp() {
  const [stops, setStops] = useState<ApiStop[]>([]);
  const [origin, setOrigin] = useState('uttam_nagar');
  const [destination, setDestination] = useState('connaught_place');
  const [timeSlider, setTimeSlider] = useState(sliderFromTime('09:15')); // 09:15
  const [planData, setPlanData] = useState<ApiPlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Tab State: activeTab controls drawer expansion
  const [activeTab, setActiveTab] = useState<CommandTab | null>('journey');
  const [isSurgeDemo, setIsSurgeDemo] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Tue');
  const [isSearching, setIsSearching] = useState(false);
  const [customReportStop, setCustomReportStop] = useState<string | null>(null);
  const [analyticsHoverHour, setAnalyticsHoverHour] = useState<number | null>(null);

  const isDrawerOpen = activeTab !== null;
  const timeStr = useMemo(() => timeFromSlider(timeSlider), [timeSlider]);

  // Deduplicate routes by id and ensure dynamic tagging:
  // - Lowest ETA gets 'FASTEST'
  // - Highest comfort score gets 'MOST COMFORTABLE' strictly once
  // - Any 3rd option gets 'ALTERNATE'
  const displayRoutes = useMemo(() => {
    if (!planData?.routes || planData.routes.length === 0) return [];

    // Deduplicate by id
    const seenIds = new Set<string>();
    const deduped: typeof planData.routes = [];
    for (const r of planData.routes) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        deduped.push({ ...r });
      }
    }

    if (deduped.length === 0) return [];

    // 1. Identify single fastest route (non-wait)
    let fastestIndex = 0;
    let minEta = Infinity;
    deduped.forEach((r, idx) => {
      if (r.eta_minutes < minEta && !r.category?.includes('wait')) {
        minEta = r.eta_minutes;
        fastestIndex = idx;
      }
    });

    // 2. Identify single most comfortable route (highest score, lowest occupancy)
    let bestComfortIndex = -1;
    let maxComfort = -Infinity;
    let minOcc = Infinity;
    deduped.forEach((r, idx) => {
      if (idx === fastestIndex && deduped.length > 1) return;
      if (r.comfort_score > maxComfort || (r.comfort_score === maxComfort && r.overall_occupancy_pct < minOcc)) {
        maxComfort = r.comfort_score;
        minOcc = r.overall_occupancy_pct;
        bestComfortIndex = idx;
      }
    });

    if (bestComfortIndex === -1) bestComfortIndex = 0;

    return deduped.map((r, idx) => {
      let tag: 'FASTEST' | 'MOST COMFORTABLE' | 'OPTIMAL' | 'ALTERNATE' | 'WAIT & SIT' = 'ALTERNATE';
      if (idx === fastestIndex) {
        tag = 'FASTEST';
      } else if (idx === bestComfortIndex) {
        tag = 'MOST COMFORTABLE';
      } else {
        tag = 'ALTERNATE';
      }

      // Differentiate bus numbers for wait-and-sit options so cards are distinct
      let busNumbers = [...r.bus_numbers];
      if ((r.id.includes('wait') || r.category === 'wait_and_sit') && busNumbers.length === 1 && !busNumbers[0].includes('+')) {
        busNumbers = [`${busNumbers[0]} (+12m)`];
      }

      return {
        ...r,
        tag,
        bus_numbers: busNumbers,
      };
    });
  }, [planData?.routes]);

  const selectedRoute = useMemo(
    () => displayRoutes.find((r) => r.id === selectedRouteId) ?? displayRoutes[0] ?? null,
    [displayRoutes, selectedRouteId]
  );

  const selectedReportStop = useMemo(() => {
    if (customReportStop && selectedRoute?.stops.some((s) => s.id === customReportStop)) {
      return customReportStop;
    }
    return selectedRoute?.stops[0]?.id || '';
  }, [customReportStop, selectedRoute]);

  useEffect(() => {
    fetchStops().then(setStops);
  }, []);

  // Fetch plan asynchronously whenever query params or day change
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
    });

    fetchPlan(origin, destination, timeStr, isSurgeDemo, selectedDay).then((data) => {
      if (!active) return;
      setPlanData(data);
      setSelectedRouteId((prev) => {
        if (prev && data.routes.some((r) => r.id === prev)) return prev;
        return data.routes[0]?.id ?? null;
      });
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [origin, destination, timeStr, isSurgeDemo, selectedDay]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleScenario = (s: DemoScenario) => {
    setOrigin(s.origin);
    setDestination(s.destination);
    setTimeSlider(sliderFromTime(s.time));
  };

  const handleToggleSurge = () => {
    const nextSurge = !isSurgeDemo;
    setIsSurgeDemo(nextSurge);
    if (nextSurge) {
      showToast('🚨 Live Rush Surge simulated: High crush load (+32% crowd surge)');
    } else {
      showToast('Switched to Predictive Model baseline');
    }
  };

  // Day selection from HUD
  const handleSelectDay = (day: DayOfWeek) => {
    setSelectedDay(day);
    if (day === 'Sun') {
      showToast('Sunday schedule active: Corridor crowd drops ~35%');
    } else if (day === 'Sat') {
      showToast('Saturday schedule active: Afternoon retail surge in Central Delhi');
    } else {
      showToast(`${day} weekday rush active: 9 AM & 6:30 PM peak load`);
    }
  };

  // Jump departure hour from HUD sparkline
  const handleSelectHourFromHud = (hour: number) => {
    const timeFormatted = `${hour.toString().padStart(2, '0')}:00`;
    setTimeSlider(sliderFromTime(timeFormatted));
    showToast(`Departure set to ${displayTime(timeFormatted)}`);
  };

  // Explicit Search CTA action with simulated shimmer pulse
  const handleSearchRoutes = () => {
    setIsSearching(true);
    setLoading(true);
    showToast(`Searching optimal routes for ${selectedDay} · ${displayTime(timeStr)}…`);
    setTimeout(() => {
      fetchPlan(origin, destination, timeStr, isSurgeDemo, selectedDay).then((data) => {
        setPlanData(data);
        setIsSearching(false);
        setLoading(false);
        const topComfort = data.routes.find((r) => r.tag === 'MOST COMFORTABLE');
        showToast(
          `Found ${data.routes.length} routes · Top Comfort: Bus ${topComfort?.bus_numbers.join(' → ') || 'E-44'} (${topComfort?.comfort_score || 84}/100)`
        );
      });
    }, 380);
  };

  // Refresh forecast from HUD
  const handleRefreshForecast = () => {
    showToast(`Forecast updated for ${selectedDay} · ${displayTime(timeStr)} ✓`);
  };

  // Select route from Plan Journey tab and transition immediately to Route Details
  const handleSelectRouteFromJourney = (routeId: string) => {
    setSelectedRouteId(routeId);
    setActiveTab('details');
  };

  // Instant Interactive Crowd Reporting (fired from drawer or top-right HUD)
  const handleCrowdReport = (level: 'LOW' | 'MEDIUM' | 'HIGH') => {
    if (!selectedRoute || !planData) return;

    const stopToReport = selectedReportStop || selectedRoute.stops[0]?.id;
    const stopObj = selectedRoute.stops.find((s) => s.id === stopToReport) || selectedRoute.stops[0];
    const stopIdx = selectedRoute.stops.findIndex((s) => s.id === stopToReport);

    const targetLoad = level === 'LOW' ? 24 : level === 'MEDIUM' ? 62 : 96;

    const updatedRoutes = planData.routes.map((r) => {
      if (r.id !== selectedRoute.id) return r;

      const newStops = r.stops.map((s, idx) => {
        if (idx === stopIdx) {
          return { ...s, load_pct: targetLoad };
        }
        if (idx === stopIdx + 1) {
          const delta = (targetLoad - s.load_pct) * 0.45;
          return { ...s, load_pct: Math.min(100, Math.max(15, Math.round(s.load_pct + delta))) };
        }
        if (idx === stopIdx + 2) {
          const delta = (targetLoad - s.load_pct) * 0.25;
          return { ...s, load_pct: Math.min(100, Math.max(15, Math.round(s.load_pct + delta))) };
        }
        return s;
      });

      const avgOcc = Math.round(newStops.reduce((sum, s) => sum + s.load_pct, 0) / newStops.length);
      const newComfort = Math.max(5, Math.min(99, Math.round(100 - avgOcc - r.transfers * 8)));
      const newStatus: 'GREEN' | 'YELLOW' | 'RED' = avgOcc > 80 ? 'RED' : avgOcc >= 50 ? 'YELLOW' : 'GREEN';

      return {
        ...r,
        stops: newStops,
        overall_occupancy_pct: avgOcc,
        comfort_score: newComfort,
        status: newStatus,
      };
    });

    const updatedActiveRoute = updatedRoutes.find((r) => r.id === selectedRoute.id);
    const newComfort = updatedActiveRoute?.comfort_score ?? 14;

    setPlanData({ ...planData, routes: updatedRoutes });

    showToast(
      `Report logged at ${stopObj?.name || 'stop'} — updating routes (${newComfort}/100)`
    );

    reportCrowd(selectedRoute.id, stopToReport, level);
  };

  const handleReset = async () => {
    setIsSurgeDemo(false);
    await resetCrowdReports();
    showToast('Crowd reports reset to predictive model ✓');
    const data = await fetchPlan(origin, destination, timeStr, false);
    setPlanData(data);
  };

  const fastestEta = useMemo(() => {
    if (!displayRoutes || displayRoutes.length === 0) return 0;
    return Math.min(...displayRoutes.map((r) => r.eta_minutes));
  }, [displayRoutes]);

  const originName = stops.find((s) => s.id === origin)?.name ?? planData?.query.origin ?? origin;
  const destName = stops.find((s) => s.id === destination)?.name ?? planData?.query.destination ?? destination;

  const originStops = stops.filter((s) => s.id !== destination);
  const destStops = stops.filter((s) => s.id !== origin);

  const sliderPct = useMemo(() => {
    return Math.min(100, Math.max(0, ((timeSlider - 24) / (92 - 24)) * 100));
  }, [timeSlider]);

  // Hourly Analytics Data for Tab 4
  const hourlyData = useMemo(() => {
    const data = [];
    for (let h = 6; h <= 23; h++) {
      const temporal = getTemporalRushFactor(h);
      const fastOcc = Math.min(98, Math.max(26, Math.round(44 + temporal * 1.15)));
      const fastComfort = Math.max(6, Math.min(94, Math.round(100 - fastOcc)));

      const comfortOcc = Math.min(36, Math.max(16, Math.round(18 + temporal * 0.28)));
      const comfortScore = Math.max(76, Math.min(95, Math.round(100 - comfortOcc * 0.55)));

      const isPeak = (h >= 8 && h <= 10) || (h >= 17 && h <= 20);
      const isOptimal = (h >= 11 && h <= 16) || h >= 21;

      const period = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;

      data.push({
        hour: h,
        timeLabel: `${displayH} ${period}`,
        fastestOcc: fastOcc,
        fastestComfort: fastComfort,
        comfortOcc,
        comfortScore,
        isOptimal,
        isPeak,
      });
    }
    return data;
  }, []);

  const activeAnalyticsPoint = analyticsHoverHour !== null
    ? hourlyData.find((d) => d.hour === analyticsHoverHour) ?? hourlyData[3]
    : hourlyData[3];

  return (
    <div className="relative h-screen w-screen bg-[#09090b] text-[#ededed] font-sans antialiased select-none overflow-hidden text-[13px]">
      {/* ━━━ FULL-BLEED CENTRAL MAP (fixed inset-0, z-0) ━━━ */}
      <div className="fixed inset-0 z-0">
        <TransitMap
          routes={displayRoutes}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          isDrawerOpen={isDrawerOpen}
        />
      </div>

      {/* ━━━ 1. SLIM LEFT ICON RAIL (fixed left-4 top-4 bottom-4 w-14, z-30) ━━━ */}
      <aside className="fixed left-4 top-4 bottom-4 w-14 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/80 rounded-2xl shadow-2xl pointer-events-auto z-30 flex flex-col items-center justify-between py-4">
        <div className="flex flex-col items-center gap-3 w-full px-2">
          {/* Button 1: Brand / Live Feed Toggle */}
          <button
            onClick={() => setActiveTab(activeTab === 'system' ? null : 'system')}
            className={`relative p-2.5 rounded-xl transition-all cursor-pointer group flex items-center justify-center w-10 h-10 ${
              activeTab === 'system'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
            title="Live System & Simulation"
          >
            <Sparkles className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
          </button>

          {/* Button 2: Plan Journey */}
          <button
            onClick={() => setActiveTab(activeTab === 'journey' ? null : 'journey')}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center w-10 h-10 ${
              activeTab === 'journey'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
            title="Plan Journey (Origin, Destination, Suggested Routes)"
          >
            <Navigation className="h-4 w-4" />
          </button>

          {/* Button 3: Route Details & Live Crowd Report */}
          <button
            onClick={() => setActiveTab(activeTab === 'details' ? null : 'details')}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center w-10 h-10 ${
              activeTab === 'details'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
            title="Route Details & Crowd Check-In"
          >
            <Bus className="h-4 w-4" />
          </button>

          {/* Button 4: 24-Hour Corridor Analytics */}
          <button
            onClick={() => setActiveTab(activeTab === 'analytics' ? null : 'analytics')}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center w-10 h-10 ${
              activeTab === 'analytics'
                ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
            title="24-Hour Corridor Analytics"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>

        {/* Rail Bottom Action */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleReset}
            className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all cursor-pointer"
            title="Reset Live Crowd Data & Simulation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ━━━ 2. UNIFIED LEFT COMMAND DRAWER (Expandable w-[350px], z-30) ━━━ */}
      <div
        className={`fixed left-[4.75rem] top-4 bottom-4 w-[350px] z-30 rounded-2xl bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/80 shadow-2xl flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDrawerOpen
            ? 'opacity-100 translate-x-0 pointer-events-auto'
            : 'opacity-0 -translate-x-8 pointer-events-none w-0 border-transparent shadow-none'
        }`}
      >
        {/* Subtle Top Accent Divider */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-zinc-700 to-transparent shrink-0" />

        {/* ─── Consolidated Header Block ─── */}
        <div className="px-3.5 py-2.5 border-b border-zinc-800/80 shrink-0 bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs tracking-wider uppercase text-white">
                Comfort Route Planner
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono font-bold tracking-tight">
                DELHI
              </span>
            </div>

            {/* Collapse Drawer Chevron */}
            <button
              onClick={() => setActiveTab(null)}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Collapse Drawer (90%+ Map Mode)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Controls Sub-Bar: Live Badge, Rush Surge Demo & Scheduled Time */}
          <div className="flex items-center justify-between gap-1.5 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
                Live Feed
              </span>

              {/* Surge Demo Toggle */}
              <button
                onClick={handleToggleSurge}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                  isSurgeDemo
                    ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)] animate-pulse'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
                title="Toggle simulated rush surge"
              >
                <Flame className={`h-2.5 w-2.5 ${isSurgeDemo ? 'text-red-400' : 'text-zinc-500'}`} />
                <span>{isSurgeDemo ? 'SURGE ACTIVE' : 'NORM'}</span>
              </button>
            </div>

            <span className="text-[10px] font-mono font-semibold text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md tabular-nums">
              {displayTime(timeStr)}
            </span>
          </div>
        </div>

        {/* ─── TAB CONTENT PANELS ─── */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none fade-mask-bottom p-3.5">
          {/* TAB 1: PLAN JOURNEY */}
          {activeTab === 'journey' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-left-3 duration-300">
              {/* Origin & Destination */}
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div>
                  <label className="text-[9.5px] text-zinc-400 mb-0.5 block font-semibold uppercase tracking-wider">
                    From Origin
                  </label>
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer hover:border-zinc-700 transition-all shadow-inner"
                  >
                    {originStops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center -my-0.5">
                  <button
                    onClick={handleSwap}
                    className="p-1 rounded-full border border-zinc-800 bg-zinc-950 hover:bg-zinc-850 hover:border-zinc-700 transition-all cursor-pointer text-zinc-400 hover:text-white active:scale-95 shadow"
                    title="Swap Origin & Destination"
                  >
                    <ArrowUpDown className="h-2.5 w-2.5" />
                  </button>
                </div>

                <div>
                  <label className="text-[9.5px] text-zinc-400 mb-0.5 block font-semibold uppercase tracking-wider">
                    To Destination
                  </label>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full h-8 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer hover:border-zinc-700 transition-all shadow-inner"
                  >
                    {destStops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Departure Time Slider with Consistent 12-Hour Format */}
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9.5px] text-zinc-400 flex items-center gap-1 font-semibold uppercase tracking-wider">
                    <Clock className="h-3 w-3 text-zinc-400" /> Departure time
                  </span>
                  <div className="flex items-center">
                    <span className="text-xs font-mono font-bold text-white bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded-md tabular-nums">
                      {displayTime(timeStr)}
                    </span>
                  </div>
                </div>

                <div className="relative pt-3.5 pb-1">
                  <div
                    className="absolute top-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-white shadow pointer-events-none transition-all duration-75 tabular-nums -translate-x-1/2"
                    style={{ left: `${sliderPct}%` }}
                  >
                    {displayTime(timeStr)}
                  </div>

                  <div className="relative w-full h-1 bg-zinc-800 rounded-full">
                    <div
                      className="absolute top-0 left-0 h-1 rounded-full bg-zinc-400 pointer-events-none"
                      style={{ width: `${sliderPct}%` }}
                    />
                    <input
                      type="range"
                      min={24}
                      max={92}
                      step={1}
                      value={timeSlider}
                      onChange={(e) => setTimeSlider(parseInt(e.target.value, 10))}
                      className="custom-slider absolute top-0 left-0 w-full h-1 appearance-none cursor-pointer m-0"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[9px] text-zinc-500 mt-1 font-mono">
                  <span>6 AM</span>
                  <span>12 PM</span>
                  <span>6 PM</span>
                  <span>11 PM</span>
                </div>
              </div>

              {/* Primary "Search Routes" CTA Button (Crisp High-Contrast White) */}
              <button
                onClick={handleSearchRoutes}
                disabled={isSearching}
                className="w-full h-8 rounded-lg bg-white text-zinc-950 font-semibold text-xs tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm overflow-hidden relative"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
                    <span>Optimizing Transit Routes…</span>
                  </>
                ) : (
                  <>
                    <Search className="w-3.5 h-3.5 text-zinc-950" />
                    <span>Search Routes</span>
                  </>
                )}
              </button>

              {/* Popular Departure Times Chips */}
              <div className="pt-0.5">
                <div className="text-[9px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">
                  Popular Departure Times
                </div>
                <div className="flex flex-wrap gap-1">
                  {DEMO_SCENARIOS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleScenario(s)}
                      className="px-2 py-0.5 rounded text-[9px] border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-800 transition-all cursor-pointer active:scale-95"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggested Route Cards (Deduplicated, Dynamic Single Tags) */}
              <div className="space-y-1.5 pt-0.5">
                <div className="text-[9.5px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                  <span>{loading ? 'Finding routes…' : `${displayRoutes.length} Suggested Routes`}</span>
                  <span className="text-[9px] text-zinc-400 lowercase font-normal flex items-center gap-0.5">
                    click to inspect <ArrowRight className="w-2.5 h-2.5" />
                  </span>
                </div>

                {displayRoutes.map((route) => {
                  const isSelected = route.id === (selectedRouteId ?? displayRoutes[0]?.id);
                  const etaDelta = route.eta_minutes - fastestEta;
                  const isComfort = route.tag === 'MOST COMFORTABLE';
                  const isTopRecommended = isComfort && route.category === 'comfortable';

                  return (
                    <div
                      key={route.id}
                      onClick={() => handleSelectRouteFromJourney(route.id)}
                      className={`py-2 px-3 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                        isSelected
                          ? isComfort
                            ? 'ring-1 ring-emerald-500/50 bg-zinc-900 border-emerald-500/40 shadow-[0_4px_24px_rgba(16,185,129,0.15)]'
                            : route.status === 'RED'
                            ? 'ring-1 ring-red-500/50 bg-zinc-900 border-red-500/40 shadow-[0_4px_24px_rgba(239,68,68,0.15)]'
                            : 'ring-1 ring-zinc-500 bg-zinc-900 border-zinc-700'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${tagBadgeClass(route.tag)}`}>
                            {route.tag}
                          </span>
                          {isTopRecommended && (
                            <span className="relative overflow-hidden px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-bold tracking-wider uppercase flex items-center gap-1">
                              <Sparkles className="w-2 h-2 text-emerald-400" />
                              <span>RECOMMENDED</span>
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-zinc-200 font-bold flex items-center gap-1">
                          <Bus className="h-3 w-3 text-zinc-400" />
                          Bus {route.bus_numbers.join(' → ')}
                        </span>
                      </div>

                      {route.highlight_pill && (
                        <div className="my-1 py-0.5 px-1.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300 text-[9.5px] font-medium flex items-center gap-1 shadow-sm">
                          <Zap className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                          <span className="truncate">{route.highlight_pill}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs my-1">
                        <div>
                          <span className="text-white font-extrabold text-xs font-mono tabular-nums">
                            {route.eta_minutes}m
                          </span>
                          {etaDelta > 0 && (
                            <span className="text-zinc-500 font-mono font-normal text-[10px] ml-1 tabular-nums">
                              (+{etaDelta}m)
                            </span>
                          )}
                          {route.transfers > 0 && (
                            <span className="text-amber-400 text-[9.5px] flex items-center gap-0.5 mt-0.5">
                              <ArrowRight className="h-2.5 w-2.5" />
                              {route.transfers} transfer
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[9.5px] text-zinc-400 font-medium">Comfort:</span>
                          <ComfortRadialRing score={route.comfort_score} />
                        </div>
                      </div>

                      <div className="mt-0.5">
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className={`flex items-center gap-1 font-semibold tabular-nums ${statusColorClass(route.status)}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]" />
                            {route.overall_occupancy_pct}%
                            <span className="text-zinc-400 font-normal font-sans">
                              {route.comfort_headline
                                ? `· ${route.comfort_headline}`
                                : route.overall_occupancy_pct >= 80
                                ? 'Packed (Crush)'
                                : route.overall_occupancy_pct >= 50
                                ? 'Standing'
                                : 'Seats available'}
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${barGradientClass(
                              route.overall_occupancy_pct
                            )}`}
                            style={{ width: `${route.overall_occupancy_pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ROUTE DETAILS & CROWD REPORT */}
          {activeTab === 'details' && selectedRoute && (
            <div className="space-y-3 animate-in fade-in slide-in-from-left-3 duration-300">
              {/* Back to Routes Breadcrumb Button */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('journey')}
                  className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all font-semibold cursor-pointer active:scale-95"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Routes</span>
                </button>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {selectedRoute.bus_type || 'DTC Non-AC'}
                </span>
              </div>

              {/* Active Route Summary Card */}
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Bus className="h-4 w-4 text-emerald-400" />
                    <span className="text-white font-bold text-sm">
                      Bus {selectedRoute.bus_numbers.join(' → ')}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-300 tabular-nums">
                    {selectedRoute.headway_text || `Every ${selectedRoute.headway_mins}m`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-zinc-950 rounded-xl p-2 border border-zinc-800 shadow-inner">
                    <div className="text-[9px] text-zinc-400 uppercase font-semibold">ETA</div>
                    <div className="text-white font-bold font-mono text-xs mt-0.5 tabular-nums">
                      {selectedRoute.eta_minutes}m
                    </div>
                  </div>
                  <div className="bg-zinc-950 rounded-xl p-2 border border-zinc-800 shadow-inner">
                    <div className="text-[9px] text-zinc-400 uppercase font-semibold">Load</div>
                    <div
                      className={`font-bold font-mono text-xs mt-0.5 tabular-nums transition-colors duration-300 ${statusColorClass(
                        selectedRoute.status
                      )}`}
                    >
                      {selectedRoute.overall_occupancy_pct}%
                    </div>
                  </div>
                  <div className="bg-zinc-950 rounded-xl p-2 border border-zinc-800 shadow-inner">
                    <div className="text-[9px] text-zinc-400 uppercase font-semibold">Comfort</div>
                    <div
                      className={`font-bold font-mono text-xs mt-0.5 tabular-nums transition-colors duration-300 ${
                        selectedRoute.comfort_score >= 75
                          ? 'text-emerald-400'
                          : selectedRoute.comfort_score >= 50
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {selectedRoute.comfort_score}/100
                    </div>
                  </div>
                </div>
              </div>

              {/* Stop-by-Stop Load Progression */}
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                <div className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                  <span>Stops along this route ({selectedRoute.stops.length})</span>
                  <span className="text-[9px] text-zinc-500 font-normal lowercase">load progression</span>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-none pr-1">
                  {selectedRoute.stops.map((stop, idx) => {
                    const isLast = idx === selectedRoute.stops.length - 1;
                    const context = stop.context_tag || STOP_CONTEXT_MAP[stop.id];

                    return (
                      <div key={stop.id} className="flex items-start gap-2">
                        <div className="flex flex-col items-center w-3.5 shrink-0 mt-1">
                          <div
                            className={`w-2 h-2 rounded-full border border-black shrink-0 transition-colors duration-300 ${
                              stop.is_metro ? 'ring-2 ring-zinc-500' : ''
                            } ${barGradientClass(stop.load_pct)}`}
                          />
                          {!isLast && <div className="w-px flex-1 min-h-[16px] bg-zinc-800" />}
                        </div>

                        <div className="flex-1 pb-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-white font-medium flex items-center gap-1 truncate max-w-[170px]">
                              <span className="truncate">{stop.name}</span>
                              {stop.is_metro && <Train className="h-2.5 w-2.5 text-zinc-400 shrink-0" />}
                            </span>
                            <span
                              className={`font-bold font-mono text-[11px] tabular-nums transition-colors duration-300 ${
                                stop.load_pct >= 80
                                ? 'text-red-400'
                                : stop.load_pct >= 50
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                              }`}
                            >
                              {stop.load_pct}%
                            </span>
                          </div>

                          {context && (
                            <div className="text-[9px] text-zinc-400 font-normal mt-0.5 flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                                {context}
                              </span>
                            </div>
                          )}

                          <div className="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ease-out ${barGradientClass(
                                stop.load_pct
                              )}`}
                              style={{ width: `${stop.load_pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Crowd Reporting Widget */}
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                <div className="text-[11px] text-white font-bold flex items-center justify-between">
                  <span>Report live crowding on this bus</span>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold tracking-wider animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    LIVE
                  </span>
                </div>

                <select
                  value={selectedReportStop}
                  onChange={(e) => setCustomReportStop(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer hover:border-zinc-700 transition-all shadow-inner"
                >
                  {selectedRoute.stops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.context_tag ? `(${s.context_tag})` : ''}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleCrowdReport('LOW')}
                    className="py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer text-center"
                  >
                    Low
                  </button>
                  <button
                    onClick={() => handleCrowdReport('MEDIUM')}
                    className="py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer text-center"
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => handleCrowdReport('HIGH')}
                    className="py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer text-center"
                  >
                    High
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE SYSTEM & SIMULATION */}
          {activeTab === 'system' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-left-3 duration-300">
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="font-bold text-xs text-white">Delhi Transit Real-Time Fleet Feed</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Active monitoring engine utilizing predictive rush curves, real OSRM road geometry, and crowdsourced seat availability.
                </p>

                {/* Big Rush Surge Simulation Toggle */}
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-red-400" />
                      <span>Rush Surge Simulation</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">Simulate instant 94% crush load spike</div>
                  </div>

                  <button
                    onClick={handleToggleSurge}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSurgeDemo
                        ? 'bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.5)]'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {isSurgeDemo ? 'SURGE ON' : 'ENABLE'}
                  </button>
                </div>

                {/* Corridor Status Cards */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">
                    Monitored Corridors (4 Major Trunks)
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-200">Uttam Nagar ➔ Connaught Place</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">Bus 729 / E-44</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-200">Kashmere Gate ➔ Nehru Place</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">Bus 429 / EV-419</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-200">Anand Vihar ➔ Saket</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">Bus 534 / 543-AC</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-200">Hauz Khas ➔ Rajiv Chowk</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">Bus 505 / 522A</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setActiveTab('journey')}
                    className="flex-1 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Plan Journey</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setActiveTab('analytics')}
                    className="flex-1 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>View Analytics</span>
                    <BarChart3 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 24-HOUR CORRIDOR ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-left-3 duration-300">
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-white">24-Hour Corridor Crowding Profile</div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold uppercase">
                    Hourly Model
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  {originName} ➔ {destName} trunk corridor comparison
                </div>

                {/* Key Insight Cards */}
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="flex items-center gap-1 text-[10px] text-red-400 font-semibold">
                      <AlertTriangle className="w-3 h-3" /> Morning Rush
                    </div>
                    <div className="text-white font-bold text-xs mt-0.5">8:30 – 10:30 AM</div>
                    <div className="text-[9px] text-zinc-500">94% crush load</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                      <ShieldCheck className="w-3 h-3" /> Optimal Window
                    </div>
                    <div className="text-emerald-300 font-bold text-xs mt-0.5">11:30 AM – 4:30 PM</div>
                    <div className="text-[9px] text-emerald-400/80">Guaranteed seats</div>
                  </div>
                </div>

                {/* Dual Bar Chart (6 AM to 11 PM) */}
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5">
                    <span>Hourly Load (6 AM – 11 PM)</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-red-500" /> Fastest
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Comfort
                      </span>
                    </div>
                  </div>

                  <div className="relative h-36 bg-zinc-950 rounded-xl border border-zinc-800 p-2.5 flex items-end justify-between gap-0.5 shadow-inner">
                    {/* Optimal Window Highlight */}
                    <div
                      className="absolute top-0 bottom-5 bg-emerald-500/10 border-x border-emerald-500/30 rounded pointer-events-none"
                      style={{ left: '27.5%', width: '33.5%' }}
                    >
                      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-emerald-300 font-mono font-bold tracking-wider bg-zinc-950 px-1 rounded border border-emerald-500/40 whitespace-nowrap">
                        ★ OPTIMAL WINDOW
                      </div>
                    </div>

                    {hourlyData.map((d) => {
                      const isSelected = analyticsHoverHour === d.hour;
                      return (
                        <div
                          key={d.hour}
                          onMouseEnter={() => setAnalyticsHoverHour(d.hour)}
                          className={`flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative z-10 ${
                            isSelected ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                          }`}
                        >
                          <div className="w-full flex items-end justify-center gap-0.5 h-[80%]">
                            <div
                              className={`w-1.5 rounded-t transition-all ${
                                d.fastestOcc >= 80 ? 'bg-red-500' : d.fastestOcc >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                              } ${isSelected ? 'ring-1 ring-white' : ''}`}
                              style={{ height: `${d.fastestOcc}%` }}
                            />
                            <div
                              className={`w-1.5 rounded-t bg-emerald-400 transition-all ${
                                isSelected ? 'ring-1 ring-emerald-300' : ''
                              }`}
                              style={{ height: `${d.comfortOcc}%` }}
                            />
                          </div>
                          <span className={`text-[8px] mt-1 font-mono ${isSelected ? 'text-white font-bold' : 'text-zinc-500'}`}>
                            {d.hour % 3 === 0 ? d.timeLabel.split(' ')[0] : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Hourly Inspector Details */}
                  {activeAnalyticsPoint && (
                    <div className="mt-2.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-bold text-white">{activeAnalyticsPoint.timeLabel}:</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-red-400 font-mono font-bold">
                          {activeAnalyticsPoint.fastestOcc}% Load
                        </span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {activeAnalyticsPoint.comfortOcc}% Comfort
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ━━━ FLOATING TOP-RIGHT "DATE, DAY & CROWD PROBABILITY HUD" (z-30) ━━━ */}
      <CrowdTelemetryHud
        selectedDay={selectedDay}
        onSelectDay={handleSelectDay}
        departureTimeStr={timeStr}
        onSelectHour={handleSelectHourFromHud}
        isSurgeDemo={isSurgeDemo}
        onRefresh={handleRefreshForecast}
        onReportCrowd={(level) => handleCrowdReport(level)}
        onResetCrowd={handleReset}
      />

      {/* ━━━ Active Route Indicator when Drawer is Collapsed (z-30) ━━━ */}
      {!isDrawerOpen && selectedRoute && (
        <button
          onClick={() => setActiveTab('details')}
          className="fixed top-[22rem] right-4 z-30 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/80 rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-2 text-xs text-white hover:border-zinc-700 transition-all cursor-pointer group active:scale-95"
          title="Click to view Route Details"
        >
          <span className="flex items-center gap-1.5 font-bold font-mono text-[11px]">
            <span className={`w-2 h-2 rounded-full ${barGradientClass(selectedRoute.overall_occupancy_pct)}`} />
            Bus {selectedRoute.bus_numbers[0]}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="font-mono text-zinc-300 text-[11px] tabular-nums">{selectedRoute.eta_minutes}m</span>
          <span className="text-zinc-600">·</span>
          <span className="text-emerald-400 font-mono font-bold text-[11px] tabular-nums">
            Score {selectedRoute.comfort_score}
          </span>
        </button>
      )}

      {/* ━━━ Floating Dark-Mode Toast Notification ━━━ */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[1000] bg-zinc-950/95 border border-zinc-800 text-white text-xs px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 font-sans backdrop-blur-xl animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">{toast}</span>
        </div>
      )}
    </div>
  );
}
