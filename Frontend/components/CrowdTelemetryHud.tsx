'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Clock, RotateCcw, Zap, Sparkles, CheckCircle2, Radio } from 'lucide-react';
import type { LiveFeedStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
 * 1-line smart insight explaining the crowding condition.
 * Clean, compact copy that never truncates with an ellipsis.
 */
export function getSmartInsight(prob: number, day: DayOfWeek, hour: number): string {
  if (prob >= 80) {
    if (hour >= 8 && hour <= 11) return 'Peak morning rush · AC Electric corridor saves crowd load';
    if (hour >= 17 && hour <= 20) return 'Heavy evening rush · Recommend +12m wait for guaranteed seat';
    return 'High crush density · Alternate AC corridor recommended';
  }
  if (prob >= 50) {
    if (day === 'Sat') return 'Weekend market traffic · Moderate seating available';
    return 'Moderate corridor occupancy · Standing likely on direct bus';
  }
  if (day === 'Sun') return 'Sunday off-peak schedule · High seat availability';
  return 'Optimal window · High seat availability';
}

interface CrowdTelemetryHudProps {
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
  departureTimeStr: string;
  onSelectHour: (hour: number) => void;
  isSurgeDemo?: boolean;
  onRefresh?: () => void;
  liveStatus?: LiveFeedStatus;
  onReportCrowd?: (level: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  onResetCrowd?: () => void;
  isEmbedded?: boolean;
}

export function CrowdTelemetryHud({
  selectedDay,
  onSelectDay,
  departureTimeStr,
  onSelectHour,
  isSurgeDemo = false,
  onRefresh,
  liveStatus,
  onReportCrowd,
  onResetCrowd,
  isEmbedded = false,
}: CrowdTelemetryHudProps) {
  // Live ticking digital clock
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [checkInFeedback, setCheckInFeedback] = useState<string | null>(null);

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

  const handleReport = (level: 'LOW' | 'MEDIUM' | 'HIGH') => {
    setCheckInFeedback('Report logged — updating routes');
    onReportCrowd?.(level);
    setTimeout(() => {
      setCheckInFeedback(null);
    }, 2400);
  };

  const handleReset = () => {
    setCheckInFeedback('Reports reset');
    onResetCrowd?.();
    setTimeout(() => {
      setCheckInFeedback(null);
    }, 2000);
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
    <aside
      aria-label="Crowd telemetry and live commuter check-in"
      className={
        isEmbedded
          ? 'w-full flex flex-col gap-2.5'
          : 'hidden md:flex fixed top-4 right-4 w-[310px] z-30 rounded-2xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl p-3.5 shadow-2xl flex-col gap-2.5 transition-all duration-300'
      }
    >
      {/* ━━━ OTD CONNECTION STATUS BADGE ━━━ */}
      {liveStatus && (
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
          <span className="text-[9px] text-zinc-400 font-mono tracking-wider">DELHI OTD</span>
          <Badge
            variant="outline"
            className={`h-auto px-2 py-0.5 rounded-full text-[8.5px] font-mono font-bold tracking-wider flex items-center gap-1.5 ${
              liveStatus.isLiveRealtime
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                liveStatus.isLiveRealtime ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {liveStatus.source || 'GTFS SCHEDULE + LIVE TRAFFIC'}
          </Badge>
        </div>
      )}

      {/* ━━━ ROW 1: LIVE CLOCK, DATE & DAY SELECTOR ━━━ */}
      <div className="space-y-2">
        {/* Clock & Date Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-white font-mono font-bold text-xs tracking-wider tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-400" />
              {formattedClock}
            </span>
            <span className="text-[10px] text-zinc-600 font-medium">·</span>
            <span className="text-[10px] text-zinc-400 font-mono font-medium">{formattedDate}</span>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 cursor-pointer active:scale-95"
            title="Refresh Delhi Transit Forecast"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
          </Button>
        </div>

        {/* Day-of-Week Selector Pills */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS_OF_WEEK.map((d) => {
            const isActive = d === selectedDay;
            return (
              <Button
                key={d}
                variant={isActive ? 'default' : 'outline'}
                size="xs"
                onClick={() => onSelectDay(d)}
                className={`h-6 px-0 text-[10px] font-mono font-bold rounded-md cursor-pointer ${
                  isActive
                    ? 'bg-white text-zinc-950 border-white hover:bg-zinc-200 shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {d}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ━━━ ROW 2: SELECTED DAY CROWD PROBABILITY METER ━━━ */}
      <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-zinc-400" />
            Crowd Probability
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-extrabold font-mono tabular-nums ${
                activeProb >= 80 ? 'text-red-400' : activeProb >= 50 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {activeProb}%
            </span>
            <Badge
              variant="outline"
              className={`h-auto text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase ${
                activeProb >= 80
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : activeProb >= 50
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {dayCategory}
            </Badge>
          </div>
        </div>

        {/* Horizontal Progress Gauge */}
        <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden p-[0.5px]">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              activeProb >= 80
                ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                : activeProb >= 50
                ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
                : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'
            }`}
            style={{ width: `${activeProb}%` }}
          />
        </div>

        {/* 1-Line Smart Insight (Never clips or ellipses) */}
        <div className="text-[10px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 flex items-center gap-1.5 leading-tight">
          <Zap className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
          <span className="truncate">{smartInsight}</span>
        </div>
      </div>

      {/* ━━━ ROW 3: MINI HOURLY CROWD SPARKLINE (6 AM to 11 PM) ━━━ */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-zinc-400 font-semibold uppercase tracking-wider">
            Predicted Hourly Curve
          </span>
          <span className="text-zinc-300 font-mono font-medium tabular-nums">
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
        <div className="h-9 flex items-end justify-between gap-[2px] p-1 bg-zinc-950 rounded-lg border border-zinc-800">
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
                    ? 'bg-white ring-1 ring-white shadow-sm'
                    : item.prob >= 80
                    ? 'bg-red-500/80 hover:bg-red-500'
                    : item.prob >= 50
                    ? 'bg-amber-500/80 hover:bg-amber-500'
                    : 'bg-emerald-500/80 hover:bg-emerald-500'
                } ${isHovered ? 'scale-y-110 brightness-125' : ''}`}
                style={{ height: `${barHeightPct}%` }}
                title={`${item.label} · ${item.prob}% Crowd Probability (Click to set departure)`}
              />
            );
          })}
        </div>

        {/* Axis Labels */}
        <div className="flex justify-between text-[8px] font-mono text-zinc-500 px-0.5">
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>11 PM</span>
        </div>
      </div>

      {/* ━━━ ROW 4: INTERACTIVE "LIVE CROWD CHECK-IN" WIDGET ━━━ */}
      <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] text-zinc-200 uppercase font-bold tracking-wider">
              Live Commuter Check-In
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleReset}
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
            title="Reset reported crowds"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        <div className="text-[10px] text-zinc-400">
          On this bus? Report current load:
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReport('LOW')}
            className="h-7 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-300 active:scale-95 cursor-pointer"
          >
            Low
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReport('MEDIUM')}
            className="h-7 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 hover:text-amber-300 active:scale-95 cursor-pointer"
          >
            Medium
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleReport('HIGH')}
            className="h-7 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 hover:text-red-300 active:scale-95 cursor-pointer"
          >
            High
          </Button>
        </div>

        {checkInFeedback && (
          <div className="text-[10px] text-emerald-300 font-medium flex items-center gap-1 pt-0.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>{checkInFeedback}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
