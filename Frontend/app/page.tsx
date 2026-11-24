'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  ArrowUpDown,
  Clock,
  Bus,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Train,
  Sparkles,
  Navigation,
  Users,
} from 'lucide-react';

import { fetchStops, fetchPlan, reportCrowd, resetCrowdReports } from '@/lib/api';
import type { ApiStop, ApiScoredRoute, ApiPlanResponse, DemoScenario } from '@/lib/types';

// Dynamic Leaflet map (no SSR)
const TransitMap = dynamic(() => import('@/components/TransitMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#090b0e] text-[#00f5d4] font-mono text-xs">
      Loading Delhi Transit Map…
    </div>
  ),
});

// ─── Demo Scenario Chips ───
const DEMO_SCENARIOS: DemoScenario[] = [
  { label: '9:15 AM Rush', origin: 'uttam_nagar', destination: 'connaught_place', time: '09:15' },
  { label: '2:00 PM Off-Peak', origin: 'uttam_nagar', destination: 'connaught_place', time: '14:00' },
  { label: '6:30 PM Metro Surge', origin: 'kashmere_gate', destination: 'nehru_place', time: '18:30' },
];

// ─── Helpers ───
function statusColorClass(status: string) {
  if (status === 'GREEN') return 'text-emerald-400';
  if (status === 'YELLOW') return 'text-amber-400';
  return 'text-red-400';
}

function statusBgClass(status: string) {
  if (status === 'GREEN') return 'bg-emerald-500/15 border-emerald-500/30';
  if (status === 'YELLOW') return 'bg-amber-500/15 border-amber-500/30';
  return 'bg-red-500/15 border-red-500/30';
}

function tagColor(tag: string) {
  if (tag === 'FASTEST') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (tag === 'MOST COMFORTABLE') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (tag === 'OPTIMAL') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
}

function barColor(pct: number) {
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
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

// ─── Main Component ───
export default function CrowdPlannerApp() {
  // Data state
  const [stops, setStops] = useState<ApiStop[]>([]);
  const [origin, setOrigin] = useState('uttam_nagar');
  const [destination, setDestination] = useState('connaught_place');
  const [timeSlider, setTimeSlider] = useState(sliderFromTime('09:15')); // 06:00=24, 23:00=92
  const [planData, setPlanData] = useState<ApiPlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const timeStr = useMemo(() => timeFromSlider(timeSlider), [timeSlider]);
  const selectedRoute = useMemo(
    () => planData?.routes.find((r) => r.id === selectedRouteId) ?? planData?.routes[0] ?? null,
    [planData, selectedRouteId]
  );

  // ─── Load stops on mount ───
  useEffect(() => {
    fetchStops().then(setStops);
  }, []);

  // ─── Fetch plan whenever origin / destination / time changes ───
  const loadPlan = useCallback(async (o: string, d: string, t: string) => {
    setLoading(true);
    const data = await fetchPlan(o, d, t);
    setPlanData(data);
    setSelectedRouteId(data.routes[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPlan(origin, destination, timeStr);
  }, [origin, destination, timeStr, loadPlan]);

  // ─── Swap origin & destination ───
  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  // ─── Demo scenario click ───
  const handleScenario = (s: DemoScenario) => {
    setOrigin(s.origin);
    setDestination(s.destination);
    setTimeSlider(sliderFromTime(s.time));
  };

  // ─── Crowd report ───
  const handleCrowdReport = async (level: 'LOW' | 'MEDIUM' | 'HIGH', stopId: string) => {
    if (!selectedRoute) return;
    const res = await reportCrowd(selectedRoute.id, stopId, level);
    if (res.success) {
      showToast(`Reported ${level} at ${stopId} ✓`);
      loadPlan(origin, destination, timeStr);
    } else {
      showToast('Backend offline — report not saved');
    }
  };

  // ─── Reset demo ───
  const handleReset = async () => {
    await resetCrowdReports();
    showToast('Demo state reset ✓');
    loadPlan(origin, destination, timeStr);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Find fastest route for ETA delta display
  const fastestEta = useMemo(() => {
    if (!planData) return 0;
    return Math.min(...planData.routes.map((r) => r.eta_minutes));
  }, [planData]);

  // Origin / Destination display names
  const originName = stops.find((s) => s.id === origin)?.name ?? planData?.query.origin ?? origin;
  const destName = stops.find((s) => s.id === destination)?.name ?? planData?.query.destination ?? destination;

  // Filter origin stops from destination and vice versa
  const originStops = stops.filter((s) => s.id !== destination);
  const destStops = stops.filter((s) => s.id !== origin);

  return (
    <div className="flex h-screen w-screen bg-[#090b0e] text-[#d1d5db] font-mono select-none overflow-hidden text-xs">

      {/* ━━━ 1. Left Icon Rail ━━━ */}
      <aside className="w-12 h-full bg-[#07090c] border-r border-[#15191f] flex flex-col items-center justify-between py-3 z-30 shrink-0">
        <div className="flex flex-col items-center gap-4">
          <div className="h-7 w-7 rounded bg-[#00f5d4]/10 border border-[#00f5d4]/40 flex items-center justify-center text-[#00f5d4] shadow-[0_0_12px_rgba(0,245,212,0.4)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <nav className="flex flex-col items-center gap-3 text-neutral-500">
            <button className="p-1.5 rounded text-[#00f5d4] bg-[#00f5d4]/15 border border-[#00f5d4]/30 shadow-[0_0_8px_rgba(0,245,212,0.3)]" title="Journey Planner">
              <Navigation className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Crowd Reports">
              <Users className="h-4 w-4" />
            </button>
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3 text-neutral-500">
          <button className="p-1.5 rounded hover:text-white transition-colors" title="Map View">
            <MapPin className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ━━━ Main Workspace ━━━ */}
      <div className="flex-1 flex flex-col h-full min-w-0">

        {/* ━━━ 2. Top Header Bar ━━━ */}
        <header className="h-10 border-b border-[#15191f] bg-[#07090c] px-3 flex items-center justify-between text-[11px] shrink-0 z-20">
          {/* Status pills */}
          <div className="flex items-center gap-1.5 bg-[#0e1216] border border-[#1b222a] rounded-full p-0.5 px-1.5">
            <span className="flex items-center gap-1 text-[#00f5d4] font-semibold text-[10px] px-1.5 py-0.5 rounded-full bg-[#00f5d4]/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00f5d4] animate-pulse" />
              GTFS + Live Crowd Model
            </span>
            <span className="text-[#22c55e] text-[10px] px-1.5 py-0.5">Delhi NCR Corridors</span>
          </div>

          {/* Title */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-white font-semibold text-xs tracking-wide">Delhi Transit Crowd Planner</span>
          </div>

          {/* Time display */}
          <div className="text-[10px] text-neutral-500 font-mono">
            Query time: <span className="text-[#00f5d4]">{displayTime(timeStr)}</span>
          </div>
        </header>

        {/* ━━━ 3. Three-Column Workspace ━━━ */}
        <div className="flex-1 flex overflow-hidden">

          {/* ━━━ LEFT PANEL: Journey Planner ━━━ */}
          <div className="w-80 bg-[#080a0d] border-r border-[#15191f] flex flex-col shrink-0 overflow-y-auto">

            {/* Panel Header */}
            <div className="p-3 border-b border-[#15191f]">
              <div className="font-bold text-white text-xs">Journey Planner</div>
              <div className="text-[10px] text-neutral-500">Select route & compare comfort scores</div>
            </div>

            {/* Origin & Destination Selectors */}
            <div className="p-3 border-b border-[#15191f] space-y-2">
              {/* Origin */}
              <div>
                <label className="text-[10px] text-neutral-500 mb-0.5 block">ORIGIN</label>
                <select
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full bg-[#0f1217] border border-[#1b222a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00f5d4] appearance-none cursor-pointer"
                >
                  {originStops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Swap button */}
              <div className="flex justify-center">
                <button
                  onClick={handleSwap}
                  className="p-1 rounded-full border border-[#1b222a] bg-[#0e1216] hover:bg-[#161a20] hover:border-[#00f5d4]/40 transition-colors cursor-pointer"
                  title="Swap Origin & Destination"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" />
                </button>
              </div>

              {/* Destination */}
              <div>
                <label className="text-[10px] text-neutral-500 mb-0.5 block">DESTINATION</label>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full bg-[#0f1217] border border-[#1b222a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00f5d4] appearance-none cursor-pointer"
                >
                  {destStops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Demo Scenario Chips */}
            <div className="p-3 border-b border-[#15191f]">
              <div className="text-[10px] text-neutral-500 mb-1.5">QUICK DEMO SCENARIOS</div>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_SCENARIOS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => handleScenario(s)}
                    className="px-2 py-1 rounded-full text-[10px] border border-[#1b222a] bg-[#0e1216] text-neutral-300 hover:border-[#00f5d4]/50 hover:text-[#00f5d4] transition-colors cursor-pointer"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time-of-Day Slider */}
            <div className="p-3 border-b border-[#15191f]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> TIME OF DAY
                </span>
                <span className="text-[11px] text-[#00f5d4] font-semibold bg-[#00f5d4]/10 px-2 py-0.5 rounded-full">
                  {displayTime(timeStr)}
                </span>
              </div>
              <input
                type="range"
                min={24}  /* 06:00 */
                max={92}  /* 23:00 */
                step={1}
                value={timeSlider}
                onChange={(e) => setTimeSlider(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-[#1b222a] rounded-full appearance-none cursor-pointer accent-[#00f5d4]"
              />
              <div className="flex justify-between text-[9px] text-neutral-600 mt-0.5">
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>11 PM</span>
              </div>
            </div>

            {/* Route Comparison Cards */}
            <div className="p-3 space-y-2 flex-1">
              <div className="text-[10px] text-neutral-500 mb-1">
                {loading ? 'Loading routes…' : `${planData?.routes.length ?? 0} ROUTES FOUND`}
              </div>

              {planData?.routes.map((route) => {
                const isSelected = route.id === (selectedRouteId ?? planData.routes[0]?.id);
                const etaDelta = route.eta_minutes - fastestEta;
                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedRouteId(route.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#0e1216] border-[#00f5d4]/40 shadow-[0_0_12px_rgba(0,245,212,0.15)]'
                        : 'bg-[#0a0c10] border-[#15191f] hover:border-[#1b222a] hover:bg-[#0e1216]'
                    }`}
                  >
                    {/* Tag + Bus Numbers */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tagColor(route.tag)}`}>
                        {route.tag}
                      </span>
                      <span className="text-[11px] text-white font-semibold flex items-center gap-1">
                        <Bus className="h-3 w-3 text-neutral-400" />
                        {route.bus_numbers.join(' → ')}
                      </span>
                    </div>

                    {/* ETA · Transfers · Comfort */}
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-white font-bold">
                        {route.eta_minutes} min
                        {etaDelta > 0 && (
                          <span className="text-neutral-500 font-normal ml-1">(+{etaDelta}m)</span>
                        )}
                      </span>
                      {route.transfers > 0 && (
                        <span className="text-amber-400 text-[10px] flex items-center gap-0.5">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {route.transfers} transfer
                        </span>
                      )}
                      <span className="text-[10px]">
                        Comfort{' '}
                        <span className={`font-bold ${route.comfort_score >= 50 ? 'text-emerald-400' : route.comfort_score >= 25 ? 'text-amber-400' : 'text-red-400'}`}>
                          {route.comfort_score}/100
                        </span>
                      </span>
                    </div>

                    {/* Occupancy Bar */}
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className={statusColorClass(route.status)}>
                          {route.overall_occupancy_pct}%{' '}
                          {route.overall_occupancy_pct >= 80 ? 'Packed' : route.overall_occupancy_pct >= 50 ? 'Standing Room' : 'Seats Available'}
                        </span>
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${statusBgClass(route.status)} ${statusColorClass(route.status)}`}>
                          {route.status}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#15191f] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor(route.overall_occupancy_pct)}`}
                          style={{ width: `${route.overall_occupancy_pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ━━━ CENTER: Map Canvas ━━━ */}
          <div className="flex-1 relative h-full overflow-hidden bg-[#090b0e]">
            <TransitMap
              routes={planData?.routes ?? []}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
            />
          </div>

          {/* ━━━ RIGHT PANEL: Stop Details & Crowd Check-In ━━━ */}
          <div className="w-80 bg-[#080a0d] border-l border-[#15191f] flex flex-col shrink-0 overflow-y-auto">
            {/* Header */}
            <div className="p-3 border-b border-[#15191f]">
              <div className="font-bold text-white text-xs">Route Details</div>
              <div className="text-[10px] text-neutral-500">
                {selectedRoute ? selectedRoute.name : 'Select a route'}
              </div>
            </div>

            {selectedRoute && (
              <>
                {/* Route summary card */}
                <div className="p-3 border-b border-[#15191f] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Bus className="h-4 w-4 text-[#00f5d4]" />
                    <span className="text-white font-bold text-sm">Bus {selectedRoute.bus_numbers.join(' → ')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#0e1216] rounded p-1.5 border border-[#15191f]">
                      <div className="text-[10px] text-neutral-500">ETA</div>
                      <div className="text-white font-bold text-sm">{selectedRoute.eta_minutes}m</div>
                    </div>
                    <div className="bg-[#0e1216] rounded p-1.5 border border-[#15191f]">
                      <div className="text-[10px] text-neutral-500">Load</div>
                      <div className={`font-bold text-sm ${statusColorClass(selectedRoute.status)}`}>
                        {selectedRoute.overall_occupancy_pct}%
                      </div>
                    </div>
                    <div className="bg-[#0e1216] rounded p-1.5 border border-[#15191f]">
                      <div className="text-[10px] text-neutral-500">Comfort</div>
                      <div className="text-[#00f5d4] font-bold text-sm">{selectedRoute.comfort_score}</div>
                    </div>
                  </div>
                </div>

                {/* Stop-by-Stop Load Breakdown */}
                <div className="p-3 border-b border-[#15191f] flex-1">
                  <div className="text-[10px] text-neutral-500 mb-2">STOP-BY-STOP CROWD LEVELS</div>
                  <div className="space-y-0.5">
                    {selectedRoute.stops.map((stop, idx) => {
                      const isLast = idx === selectedRoute.stops.length - 1;
                      return (
                        <div key={stop.id} className="flex items-start gap-2">
                          {/* Timeline line + dot */}
                          <div className="flex flex-col items-center w-4 shrink-0">
                            <div className={`w-2.5 h-2.5 rounded-full border-2 border-[#090b0e] shrink-0 ${
                              stop.is_metro ? 'ring-1 ring-indigo-400/50' : ''
                            } ${barColor(stop.load_pct)}`} />
                            {!isLast && <div className="w-px flex-1 min-h-[16px] bg-[#1b222a]" />}
                          </div>
                          {/* Stop info */}
                          <div className="flex-1 pb-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-white font-medium flex items-center gap-1">
                                {stop.name}
                                {stop.is_metro && <Train className="h-2.5 w-2.5 text-indigo-400" />}
                              </span>
                              <span className={`text-[10px] font-bold ${
                                stop.load_pct >= 80 ? 'text-red-400' : stop.load_pct >= 50 ? 'text-amber-400' : 'text-emerald-400'
                              }`}>
                                {stop.load_pct}%
                              </span>
                            </div>
                            {/* Mini bar */}
                            <div className="w-full h-1 bg-[#15191f] rounded-full mt-0.5">
                              <div
                                className={`h-full rounded-full ${barColor(stop.load_pct)}`}
                                style={{ width: `${stop.load_pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Crowd Check-In Widget */}
                <div className="p-3 space-y-2">
                  <div className="text-[10px] text-neutral-500">ON THIS BUS? REPORT LIVE CROWDING</div>

                  {/* Stop selector for report */}
                  <select
                    id="report-stop"
                    defaultValue={selectedRoute.stops[0]?.id}
                    className="w-full bg-[#0f1217] border border-[#1b222a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00f5d4] appearance-none cursor-pointer"
                  >
                    {selectedRoute.stops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  {/* Report buttons */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => {
                        const sel = (document.getElementById('report-stop') as HTMLSelectElement)?.value;
                        if (sel) handleCrowdReport('LOW', sel);
                      }}
                      className="py-2 rounded text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                    >
                      🟢 Low
                    </button>
                    <button
                      onClick={() => {
                        const sel = (document.getElementById('report-stop') as HTMLSelectElement)?.value;
                        if (sel) handleCrowdReport('MEDIUM', sel);
                      }}
                      className="py-2 rounded text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
                    >
                      🟡 Medium
                    </button>
                    <button
                      onClick={() => {
                        const sel = (document.getElementById('report-stop') as HTMLSelectElement)?.value;
                        if (sel) handleCrowdReport('HIGH', sel);
                      }}
                      className="py-2 rounded text-[10px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
                    >
                      🔴 High
                    </button>
                  </div>

                  {/* Reset Demo */}
                  <button
                    onClick={handleReset}
                    className="w-full mt-1 py-1.5 rounded text-[10px] text-neutral-500 hover:text-white border border-[#15191f] hover:border-[#1b222a] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset Demo
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ Toast ━━━ */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0e1216] border border-[#00f5d4]/40 text-[#00f5d4] text-xs px-4 py-2 rounded-lg shadow-[0_0_20px_rgba(0,245,212,0.2)] flex items-center gap-2 font-mono animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {toast}
        </div>
      )}
    </div>
  );
}
