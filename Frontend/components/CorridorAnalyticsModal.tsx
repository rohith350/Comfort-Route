'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, TrendingDown, Clock, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { getTemporalRushFactor } from '@/lib/api';

interface CorridorAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  originName: string;
  destName: string;
  fastestRouteName?: string;
  comfortableRouteName?: string;
}

interface HourlyDataPoint {
  hour: number;
  timeLabel: string;
  fastestOcc: number;
  fastestComfort: number;
  comfortOcc: number;
  comfortScore: number;
  isOptimal: boolean;
  isPeak: boolean;
}

export default function CorridorAnalyticsModal({
  isOpen,
  onClose,
  originName,
  destName,
  fastestRouteName = 'Route 729 Direct',
  comfortableRouteName = 'AC Electric E-44 Feeder',
}: CorridorAnalyticsModalProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute 6 AM to 11 PM (hours 6 through 23)
  const hourlyData = useMemo<HourlyDataPoint[]>(() => {
    const data: HourlyDataPoint[] = [];

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

  if (!isOpen) return null;

  const activePoint = hoveredHour !== null
    ? hourlyData.find((d) => d.hour === hoveredHour) ?? hourlyData[3]
    : hourlyData[3]; // default 9 AM peak

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  24-Hour Corridor Crowding Analytics
                </h2>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Predictive Model
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {originName} ➔ {destName} corridor profile & optimal travel windows
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ─── Key Stats Row ─── */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b border-white/10 bg-zinc-900/40 text-xs">
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 shadow-inner">
            <div className="flex items-center justify-between text-neutral-400 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" /> Morning Crush Window
              </span>
              <span className="text-rose-400 font-bold font-mono tabular-nums">94% Load</span>
            </div>
            <div className="text-white font-bold text-sm mt-1">8:30 AM – 10:30 AM</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Fastest route standing only</div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 shadow-[0_0_16px_rgba(16,185,129,0.15)]">
            <div className="flex items-center justify-between text-neutral-300 text-[11px]">
              <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Optimal Low-Crowd Window
              </span>
              <span className="text-emerald-400 font-bold font-mono tabular-nums">Comfort 84+</span>
            </div>
            <div className="text-emerald-200 font-bold text-sm mt-1">11:30 AM – 4:30 PM</div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5 font-medium">Guaranteed seats & light boarding</div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 shadow-inner">
            <div className="flex items-center justify-between text-neutral-400 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold">
                <TrendingDown className="h-3.5 w-3.5 text-teal-400" /> Comfort Advantage
              </span>
              <span className="text-teal-400 font-bold font-mono tabular-nums">-58% Crowding</span>
            </div>
            <div className="text-white font-bold text-sm mt-1">AC Feeder Corridor</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Saves crush load across peak hours</div>
          </div>
        </div>

        {/* ─── Main Comparison Chart Area ─── */}
        <div className="p-5 flex-1 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-neutral-200 font-bold flex items-center gap-3">
              <span>Hourly Occupancy Comparison (6 AM – 11 PM)</span>
              <span className="text-[10px] text-neutral-500 font-normal">(Hover bars to inspect)</span>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                <span className="text-[11px]">Fastest ({fastestRouteName.split(' ')[0]})</span>
              </div>
              <div className="flex items-center gap-1.5 text-neutral-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span className="text-[11px]">Comfort ({comfortableRouteName.split(' ')[0]})</span>
              </div>
            </div>
          </div>

          {/* Dual Bar Chart */}
          <div className="relative h-44 bg-zinc-950/80 rounded-xl border border-white/10 p-3 flex items-end justify-between gap-1 shadow-inner">
            {/* Optimal window backdrop highlight (11 AM to 4 PM => index 5 to 10) */}
            <div
              className="absolute top-0 bottom-6 bg-emerald-500/10 border-x border-emerald-400/30 rounded pointer-events-none"
              style={{ left: '27.5%', width: '33.5%' }}
            >
              <div className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[9px] text-emerald-300 font-mono font-bold tracking-wider bg-emerald-950/90 px-2 py-0.5 rounded-full border border-emerald-500/40 whitespace-nowrap shadow">
                ★ OPTIMAL SEAT WINDOW
              </div>
            </div>

            {/* Grid line at 80% (Crush load) */}
            <div className="absolute left-0 right-0 top-[20%] border-b border-rose-500/20 pointer-events-none flex justify-end pr-2">
              <span className="text-[9px] text-rose-400/70 font-mono">80% Crush</span>
            </div>
            {/* Grid line at 50% */}
            <div className="absolute left-0 right-0 top-[50%] border-b border-amber-500/20 pointer-events-none flex justify-end pr-2">
              <span className="text-[9px] text-amber-400/60 font-mono">50% Standing</span>
            </div>

            {hourlyData.map((d) => {
              const isSelected = hoveredHour === d.hour;
              return (
                <div
                  key={d.hour}
                  onMouseEnter={() => setHoveredHour(d.hour)}
                  className={`flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative z-10 ${
                    isSelected ? 'opacity-100' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  {/* Bars Container */}
                  <div className="w-full flex items-end justify-center gap-0.5 h-[80%]">
                    {/* Fastest Route Bar */}
                    <div
                      className={`w-2 rounded-t transition-all duration-200 ${
                        d.fastestOcc >= 80
                          ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                          : d.fastestOcc >= 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      } ${isSelected ? 'ring-1 ring-white' : ''}`}
                      style={{ height: `${d.fastestOcc}%` }}
                    />
                    {/* Comfortable Route Bar */}
                    <div
                      className={`w-2 rounded-t bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] transition-all duration-200 ${
                        isSelected ? 'ring-1 ring-emerald-300' : ''
                      }`}
                      style={{ height: `${d.comfortOcc}%` }}
                    />
                  </div>

                  {/* Hour label */}
                  <span className={`text-[9px] mt-1.5 font-mono ${isSelected ? 'text-white font-bold' : 'text-neutral-500'}`}>
                    {d.hour % 3 === 0 ? d.timeLabel.split(' ')[0] : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Hover Details Inspector */}
          {activePoint && (
            <div className="mt-3.5 p-3 rounded-xl bg-zinc-900/80 border border-white/10 flex items-center justify-between text-xs shadow">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-emerald-400" />
                <div>
                  <span className="font-bold text-white tabular-nums">{activePoint.timeLabel} Window:</span>
                  <span className="text-neutral-400 ml-1.5">
                    {activePoint.isPeak
                      ? '⚠️ Peak Rush Hour'
                      : activePoint.isOptimal
                      ? '✨ Optimal Low-Crowd Sweet Spot'
                      : 'Moderate Regular Flow'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div>
                  <span className="text-neutral-400 text-[11px]">Fastest Route: </span>
                  <span className={`font-bold font-mono tabular-nums ${activePoint.fastestOcc >= 80 ? 'text-rose-400' : 'text-amber-400'}`}>
                    {activePoint.fastestOcc}% Load ({activePoint.fastestComfort}/100 Comfort)
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 text-[11px]">Comfort Route: </span>
                  <span className="font-bold font-mono tabular-nums text-emerald-400">
                    {activePoint.comfortOcc}% Load ({activePoint.comfortScore}/100 Comfort)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="px-5 py-3 border-t border-white/10 bg-zinc-900/60 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Hackathon Intelligence: Choosing AC Electric or +12m wait guarantees seating</span>
          </div>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold border border-white/15 transition-all cursor-pointer active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
