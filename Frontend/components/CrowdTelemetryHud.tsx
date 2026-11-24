'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Clock, RotateCcw, Zap, Sparkles, Radio } from 'lucide-react';
import type { LiveFeedStatus } from '@/lib/types';

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayOfWeek = typeof DAYS_OF_WEEK[number];

/**
 * Calculates hourly crowd probability for a given day and hour (6 to 23).
 * Realistic model for Delhi transit:
 * - Mon-Fri: sharp 9 AM (88-92%) & 6:30 PM (86-90%) office rush spikes
 * - Sat: moderate afternoon market surges (1 PM - 5 PM: 72-78%)
 * - Sun: drops crowding by ~35% across all corridors (peak ~48%)
 */
export function getDayHourProbability(day: DayOfWeek, hour: number, isSurge: boolean = false): number {
  if (isSurge) return Math.min(98, 92 + (hour % 3) * 2);

  if (day === 'Sun') {
    let base = 24;
    if (hour >= 17 && hour <= 20) base = 48 - Math.abs(hour - 18.5) * 4;
    else if (hour >= 12 && hour <= 16) base = 42 - Math.abs(hour - 14) * 3;
    else if (hour >= 9 && hour <= 11) base = 32;
    return Math.max(18, Math.min(52, Math.round(base)));
  }

  if (day === 'Sat') {
    let base = 35;
    if (hour >= 13 && hour <= 17) {
      base = 76 - Math.abs(hour - 15) * 3; // Peak 76% at 3 PM
    } else if (hour >= 8 && hour <= 11) {
      base = 60 - Math.abs(hour - 9.5) * 4;
    } else if (hour >= 18 && hour <= 21) {
      base = 68 - Math.abs(hour - 19) * 4;
    }
    return Math.max(24, Math.min(82, Math.round(base)));
  }

  // Weekdays (Mon - Fri)
  let prob = 30;
  const morningExp = Math.exp(-Math.pow(hour - 9.3, 2) / 2.2);
  const eveningExp = Math.exp(-Math.pow(hour - 18.5, 2) / 2.5);

  prob += morningExp * 58; // up to ~88-90%
  prob += eveningExp * 54; // up to ~84-88%

  if (hour >= 12 && hour <= 15) prob = Math.max(prob, 42);
  if (day === 'Mon' || day === 'Tue') prob += 3;

  return Math.max(22, Math.min(94, Math.round(prob)));
}

/**
 * 1-line smart insight explaining the crowding condition
 */
export function getSmartInsight(prob: number, day: DayOfWeek, hour: number): string {
  if (prob >= 80) {
    if (hour >= 8 && hour <= 11) return 'Peak office transit window · AC E-44 saves 58% crowd load';
    if (hour >= 17 && hour <= 20) return 'Heavy evening rush corridor · Recommend +12m wait for guaranteed seat';
    return 'High crush density expected · Recommend alternate AC corridor';
  }
  if (prob >= 50) {
    if (day === 'Sat') return 'Weekend market traffic active · Moderate seating on trunk corridors';
    return 'Moderate corridor occupancy · Standing likely on direct Bus 729';
  }
  if (day === 'Sun') return 'Sunday off-peak schedule · High seating availability across all lines';
  return 'Optimal travel window · Guaranteed seating on direct route';
}

interface CrowdTelemetryHudProps {
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
  departureTimeStr: string;
  onSelectHour: (hour: number) => void;
  isSurgeDemo?: boolean;
  onRefresh?: () => void;
  liveStatus?: LiveFeedStatus;
}

export function CrowdTelemetryHud({
  selectedDay,
  onSelectDay,
  departureTimeStr,
  onSelectHour,
  isSurgeDemo = false,
  onRefresh,
  liveStatus,
}: CrowdTelemetryHudProps) {
  // Live ticking digital clock
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Parse active departure hour
  const departureHour = useMemo(() => {
    if (departureTimeStr && departureTimeStr.includes(':')) {
      const h = parseInt(departureTimeStr.split(':')[0], 10);
      return isNaN(h) ? 9 : h;
    }
    return 9;
  }, [departureTimeStr]);

  // Current crowd probability for selected day & hour
  const activeProb = useMemo(() => {
    return getDayHourProbability(selectedDay, departureHour, isSurgeDemo);
  }, [selectedDay, departureHour, isSurgeDemo]);

  // 18-hour sparkline curve (6 AM to 11 PM)
  const hourlyCurve = useMemo(() => {
    const hours: { hour: number; label: string; prob: number }[] = [];
    for (let h = 6; h <= 23; h++) {
      const p = getDayHourProbability(selectedDay, h, isSurgeDemo);
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const period = h >= 12 ? 'PM' : 'AM';
      hours.push({
        hour: h,
        label: `${displayH} ${period}`,
        prob: p,
      });
    }
    return hours;
  }, [selectedDay, isSurgeDemo]);

  const smartInsight = useMemo(() => {
    return getSmartInsight(activeProb, selectedDay, departureHour);
  }, [activeProb, selectedDay, departureHour]);

  const handleRefreshClick = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      onRefresh?.();
    }, 400);
  };

  // Day surge badge label
  const dayCategory = useMemo(() => {
    if (activeProb >= 80) return `${selectedDay} Peak Surge`;
    if (activeProb >= 50) return `${selectedDay} Moderate`;
    return `${selectedDay} Off-Peak`;
  }, [activeProb, selectedDay]);

  const formattedDate = useMemo(() => {
    if (!currentTime) return 'Tue, Nov 24';
    return currentTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [currentTime]);

  const formattedClock = useMemo(() => {
    if (!currentTime) return '09:15:00';
    return currentTime.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [currentTime]);

  return (
    <div className="fixed top-4 right-4 w-[310px] z-20 rounded-2xl border border-cyan-400/20 bg-[#0b1120]/85 backdrop-blur-2xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-col gap-2.5 transition-all duration-300">
      {/* ━━━ OTD CONNECTION STATUS BADGE ━━━ */}
      <div className="flex items-center justify-between pb-1 border-b border-cyan-400/15">
        <span className="text-[9px] text-neutral-400 font-mono tracking-wider">DELHI OTD</span>
        <span
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8.5px] font-mono font-bold tracking-wider ${
            liveStatus?.isLiveRealtime
              ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.35)]'
              : 'bg-amber-950/80 border border-amber-500/50 text-amber-300'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              liveStatus?.isLiveRealtime ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          {liveStatus?.source || 'GTFS SCHEDULE + LIVE TRAFFIC'}
        </span>
      </div>

      {/* ━━━ ROW 1: LIVE CLOCK, DATE & DAY SELECTOR ━━━ */}
      <div className="space-y-2">
        {/* Clock & Date Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-white font-mono font-bold text-xs tracking-wider tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              {formattedClock}
            </span>
            <span className="text-[10px] text-neutral-400 font-medium">·</span>
            <span className="text-[10px] text-neutral-300 font-mono font-medium">{formattedDate}</span>
          </div>

          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="p-1 rounded-lg text-neutral-400 hover:text-cyan-300 hover:bg-white/5 transition-all cursor-pointer active:scale-95 border border-transparent hover:border-cyan-400/30"
            title="Refresh Delhi Transit Forecast"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>

        {/* Day-of-Week Selector Pills */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS_OF_WEEK.map((d) => {
            const isActive = d === selectedDay;
            return (
              <button
                key={d}
                onClick={() => onSelectDay(d)}
                className={`py-1 text-[10px] font-mono font-bold rounded-md transition-all cursor-pointer text-center ${
                  isActive
                    ? 'bg-gradient-to-tr from-cyan-500/30 to-emerald-400/30 border border-cyan-400/70 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                    : 'bg-zinc-950/70 border border-white/5 text-neutral-400 hover:text-white hover:border-white/20 hover:bg-zinc-900/60'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* ━━━ ROW 2: SELECTED DAY CROWD PROBABILITY METER ━━━ */}
      <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-cyan-400/15 space-y-1.5 shadow-inner">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
            Crowd Probability
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-extrabold font-mono tabular-nums ${
                activeProb >= 80 ? 'text-rose-400' : activeProb >= 50 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {activeProb}%
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border font-mono uppercase ${
                activeProb >= 80
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                  : activeProb >= 50
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                  : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              }`}
            >
              {dayCategory}
            </span>
          </div>
        </div>

        {/* Horizontal Glow Gauge */}
        <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden p-[0.5px]">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              activeProb >= 80
                ? 'bg-gradient-to-r from-amber-400 to-rose-500 shadow-[0_0_8px_#f43f5e]'
                : activeProb >= 50
                ? 'bg-gradient-to-r from-emerald-400 to-amber-400 shadow-[0_0_8px_#f59e0b]'
                : 'bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_8px_#10b981]'
            }`}
            style={{ width: `${activeProb}%` }}
          />
        </div>

        {/* 1-Line Smart Insight */}
        <div className="text-[9.5px] text-cyan-200/90 bg-cyan-950/40 border border-cyan-500/20 rounded-md px-2 py-1 flex items-center gap-1.5 leading-tight">
          <Zap className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
          <span className="truncate">{smartInsight}</span>
        </div>
      </div>

      {/* ━━━ ROW 3: MINI HOURLY CROWD SPARKLINE (6 AM to 11 PM) ━━━ */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-neutral-400 font-semibold uppercase tracking-wider">
            Predicted Hourly Curve
          </span>
          <span className="text-cyan-300 font-mono font-medium tabular-nums">
            {hoveredHour !== null
              ? `${hourlyCurve.find((c) => c.hour === hoveredHour)?.label}: ${
                  hourlyCurve.find((c) => c.hour === hoveredHour)?.prob
                }%`
              : `${departureHour % 12 === 0 ? 12 : departureHour % 12} ${
                  departureHour >= 12 ? 'PM' : 'AM'
                }: ${activeProb}%`}
          </span>
        </div>

        {/* 18-bar interactive chart */}
        <div className="h-9 flex items-end justify-between gap-[2px] p-1 bg-black/50 rounded-lg border border-white/5">
          {hourlyCurve.map((item) => {
            const isCurrent = item.hour === departureHour;
            const isHovered = item.hour === hoveredHour;
            const barHeightPct = Math.max(14, Math.round((item.prob / 100) * 100));

            return (
              <div
                key={item.hour}
                onClick={() => onSelectHour(item.hour)}
                onMouseEnter={() => setHoveredHour(item.hour)}
                onMouseLeave={() => setHoveredHour(null)}
                className={`flex-1 rounded-sm transition-all duration-150 cursor-pointer relative group ${
                  isCurrent
                    ? 'bg-gradient-to-t from-cyan-400 to-emerald-300 ring-1 ring-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)]'
                    : item.prob >= 80
                    ? 'bg-rose-500/70 hover:bg-rose-400'
                    : item.prob >= 50
                    ? 'bg-amber-500/70 hover:bg-amber-400'
                    : 'bg-emerald-500/70 hover:bg-emerald-400'
                } ${isHovered ? 'scale-y-110 brightness-125' : ''}`}
                style={{ height: `${barHeightPct}%` }}
                title={`${item.label} · ${item.prob}% Crowd Probability (Click to set departure)`}
              />
            );
          })}
        </div>

        {/* Axis Labels */}
        <div className="flex justify-between text-[8px] font-mono text-neutral-500 px-0.5">
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>11 PM</span>
        </div>
      </div>
    </div>
  );
}
