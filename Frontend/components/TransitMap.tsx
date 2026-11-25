'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ApiScoredRoute, ApiScoredStop, LiveVehiclePosition } from '@/lib/types';
import { fetchAllRouteSegments, type RouteRoadSegment } from '@/lib/osrmService';
import { Button } from '@/components/ui/button';

interface TransitMapProps {
  /** All candidate routes for the current corridor */
  routes: ApiScoredRoute[];
  /** Currently selected route id (highlighted) */
  selectedRouteId: string | null;
  /** Callback when user clicks a route polyline */
  onSelectRoute: (routeId: string) => void;
  /** Whether the left command drawer is expanded */
  isDrawerOpen?: boolean;
  liveBuses?: LiveVehiclePosition[];
  selectedStopId?: string | null;
  onSelectStop?: (stopId: string) => void;
}

/** High-vibrancy neon colors */
function getNeonColor(loadPct: number): string {
  if (loadPct > 80) return '#ef4444'; // Crimson
  if (loadPct >= 50) return '#f59e0b'; // Amber
  return '#10b981'; // Vibrant Emerald
}

type MapMode = 'satellite' | 'street';

export default function TransitMap({
  routes,
  selectedRouteId,
  onSelectRoute,
  isDrawerOpen = true,
  liveBuses = [],
  selectedStopId,
  onSelectStop,
}: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const liveBusMarkerRef = useRef<L.Marker | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [roadSegments, setRoadSegments] = useState<RouteRoadSegment[]>([]);
  const [loadingGeometry, setLoadingGeometry] = useState(false);

  const lastFittedRouteKey = useRef<string>('');

  // ─── Initialize Map instance once ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.625, 77.16],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    const baseGroup = L.layerGroup().addTo(map);
    baseLayerGroupRef.current = baseGroup;

    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      map.remove();
      mapRef.current = null;
      baseLayerGroupRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // ─── Manage Base Tile Layers (Hybrid Satellite vs Light Street Map) ───
  useEffect(() => {
    const baseGroup = baseLayerGroupRef.current;
    if (!baseGroup) return;

    baseGroup.clearLayers();

    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

    if (mapMode === 'satellite') {
      if (maptilerKey) {
        // MapTiler Hybrid raster tiles
        const maptilerHybrid = L.tileLayer(
          `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${maptilerKey}`,
          {
            maxZoom: 19,
            attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
          }
        );
        baseGroup.addLayer(maptilerHybrid);
      } else {
        // Zero-Key Esri World Imagery (Satellite)
        const esriImagery = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
          }
        );
        baseGroup.addLayer(esriImagery);

        // Transparent Reference Labels, Neighborhoods & Highways overlay
        const esriLabels = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 19,
            opacity: 0.95,
            zIndex: 2,
          }
        );
        baseGroup.addLayer(esriLabels);
      }
    } else {
      // Light, high-readability Street Map (replaces dark map)
      if (maptilerKey) {
        const maptilerStreets = L.tileLayer(
          `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${maptilerKey}`,
          {
            maxZoom: 19,
            attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
          }
        );
        baseGroup.addLayer(maptilerStreets);
      } else {
        // Zero-Key OpenStreetMap Public Street Map (Midnight Slate filter applied via CSS)
        const streetMap = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            className: 'midnight-slate-tiles',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }
        );
        baseGroup.addLayer(streetMap);
      }
    }
  }, [mapMode]);

  const activeRoute = routes.find((r) => r.id === selectedRouteId) ?? routes[0] ?? null;

  // ─── Fetch real road geometry for the selected route ───
  useEffect(() => {
    let active = true;
    if (!activeRoute || activeRoute.stops.length < 2) {
      Promise.resolve().then(() => {
        if (active) setRoadSegments([]);
      });
      return;
    }

    Promise.resolve().then(() => {
      if (active) setLoadingGeometry(true);
    });

    fetchAllRouteSegments(activeRoute.stops).then((segments) => {
      if (!active) return;
      const neonSegments = segments.map((s) => ({
        ...s,
        color: getNeonColor(s.loadPct),
      }));
      setRoadSegments(neonSegments);
      setLoadingGeometry(false);
    });

    return () => {
      active = false;
    };
  }, [activeRoute]);

  // ─── Auto-Zoom to Active Route with responsive padding ───
  const fitMapToActiveRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map || !activeRoute || activeRoute.stops.length === 0) return;

    const activeCoords: [number, number][] = activeRoute.stops.map((s) => [s.lat, s.lng]);
    const bounds = L.latLngBounds(activeCoords);

    const mapSize = map.getSize();
    const isMobile = mapSize.x < 768;

    const safeLeft = isMobile
      ? 24
      : isDrawerOpen
      ? Math.max(120, Math.min(420, Math.floor(mapSize.x * 0.35)))
      : 90;
    const safeRight = isMobile
      ? 24
      : Math.max(90, Math.min(340, Math.floor(mapSize.x * 0.30)));
    const safeTop = isMobile ? 68 : 70;
    const safeBottom = isMobile
      ? isDrawerOpen
        ? Math.floor(mapSize.y * 0.56)
        : 92
      : 70;

    map.fitBounds(bounds, {
      paddingTopLeft: [safeLeft, safeTop],
      paddingBottomRight: [safeRight, safeBottom],
      maxZoom: 14,
      animate: true,
    });
  }, [activeRoute, isDrawerOpen]);

  // Trigger fitBounds on route or drawer toggle change
  useEffect(() => {
    if (!activeRoute) return;
    const routeKey = `${activeRoute.id}_${activeRoute.stops[0]?.id}_${activeRoute.stops[activeRoute.stops.length - 1]?.id}_${isDrawerOpen ? 'open' : 'closed'}`;

    if (lastFittedRouteKey.current !== routeKey) {
      lastFittedRouteKey.current = routeKey;
      fitMapToActiveRoute();
    }
  }, [activeRoute, isDrawerOpen, fitMapToActiveRoute]);

  // ─── Render layers: Dual-Layer Neon Polylines & Animated Pins ───
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 1. Draw unselected routes as subtle dashed lines (3px, dashArray: '6, 8', opacity 0.65)
    routes.forEach((route) => {
      if (route.id === activeRoute?.id) return;
      const coords: [number, number][] = route.stops.map((s) => [s.lat, s.lng]);
      if (coords.length < 2) return;

      const unselectedLine = L.polyline(coords, {
        color: '#64748b',
        weight: 3,
        opacity: 0.65,
        dashArray: '6, 8',
        lineCap: 'round',
      });
      unselectedLine.on('click', () => onSelectRoute(route.id));
      layer.addLayer(unselectedLine);
    });

    const activePathPoints: [number, number][] = [];

    // 2. Precise Road-Snapped Polylines with 6px Dark Casing & 4px Main Line (5px on hover)
    if (roadSegments.length > 0) {
      roadSegments.forEach((segment) => {
        if (segment.coordinates.length < 2) return;
        activePathPoints.push(...segment.coordinates);

        // Dark outer casing line (6px, #05070c, opacity 0.85)
        const casing = L.polyline(segment.coordinates, {
          color: '#05070c',
          weight: 6,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        });
        layer.addLayer(casing);

        // Main crisp colored route line (4px, 5px on hover)
        const core = L.polyline(segment.coordinates, {
          color: segment.color,
          weight: 4,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        });

        core.on('mouseover', () => {
          core.setStyle({ weight: 5 });
        });
        core.on('mouseout', () => {
          core.setStyle({ weight: 4 });
        });

        core.bindTooltip(
          `<div style="font-family:inherit;font-size:11px;padding:3px 6px;">
            <div style="color:#d1d5db;font-weight:500;">${segment.fromName} → ${segment.toName}</div>
            <div style="color:${segment.color};font-weight:700;margin-top:2px;">
              ${segment.loadPct}% Crowdedness
            </div>
          </div>`,
          { permanent: false, direction: 'top', className: 'transit-tooltip' }
        );
        layer.addLayer(core);
      });
    } else if (activeRoute && activeRoute.stops.length >= 2) {
      const coords: [number, number][] = activeRoute.stops.map((s) => [s.lat, s.lng]);
      activePathPoints.push(...coords);
      const color = getNeonColor(activeRoute.overall_occupancy_pct);

      const casing = L.polyline(coords, {
        color: '#05070c',
        weight: 6,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      });
      const core = L.polyline(coords, {
        color,
        weight: 4,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
      });
      core.on('mouseover', () => core.setStyle({ weight: 5 }));
      core.on('mouseout', () => core.setStyle({ weight: 4 }));
      layer.addLayer(casing);
      layer.addLayer(core);
    }

    // 3. Render Stop Markers with 4-5px Radius Circle & 2px White Border
    if (activeRoute) {
      activeRoute.stops.forEach((stop: ApiScoredStop, idx: number) => {
        const isOrigin = idx === 0;
        const isDestination = idx === activeRoute.stops.length - 1;
        const isMetro = stop.is_metro;
        const dotColor = getNeonColor(stop.load_pct);

        let markerHtml = '';
        let iconSize: [number, number] = [20, 20];
        let iconAnchor: [number, number] = [10, 10];

        if (isOrigin) {
          iconSize = [26, 26];
          iconAnchor = [13, 13];
          markerHtml = `
            <div style="width:26px;height:26px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <div class="animate-beacon" style="position:absolute;width:24px;height:24px;border-radius:50%;background:#10b981;border:1.5px solid #34d399;opacity:0.75;"></div>
              <div style="width:12px;height:12px;background:#10b981;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 0 1.5px #05070c, 0 1px 4px rgba(0,0,0,0.5);z-index:2;"></div>
            </div>
          `;
        } else if (isDestination) {
          iconSize = [26, 26];
          iconAnchor = [13, 13];
          markerHtml = `
            <div style="width:26px;height:26px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <div class="animate-beacon" style="position:absolute;width:24px;height:24px;border-radius:50%;background:#38bdf8;border:1.5px solid #7dd3fc;opacity:0.75;"></div>
              <div style="width:12px;height:12px;background:#38bdf8;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 0 1.5px #05070c, 0 1px 4px rgba(0,0,0,0.5);z-index:2;"></div>
            </div>
          `;
        } else {
          iconSize = [20, 20];
          iconAnchor = [10, 10];
          markerHtml = `
            <div style="width:20px;height:20px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              ${
                isMetro
                  ? `
                <div style="
                  position:absolute;
                  width:16px;height:16px;
                  border-radius:50%;
                  border:1.5px solid ${dotColor}aa;
                  background:${dotColor}20;
                "></div>`
                  : ''
              }
              <div style="
                width:9px;height:9px;
                background:${dotColor};
                border:2px solid #ffffff;
                border-radius:50%;
                box-shadow:0 0 0 1px #05070c, 0 1px 3px rgba(0,0,0,0.5);
                z-index:2;
              "></div>
            </div>
          `;
        }

        const isSelectedStop = selectedStopId === stop.id;
        const icon = L.divIcon({
          className: 'transit-stop-marker',
          html: markerHtml + (isSelectedStop ? `<div style="position:absolute;inset:0px;border-radius:50%;border:2px solid #22d3ee;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ''),
          iconSize,
          iconAnchor,
        });

        const marker = L.marker([stop.lat, stop.lng], { icon });

        marker.on('click', () => {
          if (onSelectStop) {
            onSelectStop(stop.id);
          }
        });

        const badgeLabel = isOrigin ? 'ORIGIN' : isDestination ? 'DESTINATION' : isMetro ? 'METRO INTERCHANGE' : '';
        const badgeHtml = badgeLabel
          ? `<span style="background:${isOrigin ? '#10b98125' : isDestination ? '#38bdf825' : '#818cf820'};border:1px solid ${isOrigin ? '#10b98160' : isDestination ? '#38bdf860' : '#818cf850'};color:${isOrigin ? '#34d399' : isDestination ? '#7dd3fc' : '#a5b4fc'};padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;letter-spacing:0.04em;">${badgeLabel}</span>`
          : '';

        const contextBadge = stop.context_tag
          ? `<span style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#9ca3af;padding:1px 6px;border-radius:4px;font-size:10px;">${stop.context_tag}</span>`
          : '';

        const seatBadge = stop.seat_prob !== undefined
          ? `<span style="background:${stop.seat_prob >= 60 ? '#10b98125' : stop.seat_prob >= 30 ? '#f59e0b25' : '#ef444425'};border:1px solid ${stop.seat_prob >= 60 ? '#10b98160' : stop.seat_prob >= 30 ? '#f59e0b60' : '#ef444460'};color:${stop.seat_prob >= 60 ? '#34d399' : stop.seat_prob >= 30 ? '#fbbf24' : '#f87171'};padding:1px 6px;border-radius:4px;font-size:9.5px;font-weight:600;">🪑 ${stop.seat_prob}% Seats</span>`
          : '';

        marker.bindTooltip(
          `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;padding:3px 6px;min-width:150px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <strong style="color:#ffffff;">${stop.name}</strong>
              ${badgeHtml}
            </div>
            <div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <span style="color:${dotColor};font-weight:700;font-size:11px;">
                ${stop.load_pct}% Load
              </span>
              ${seatBadge}
            </div>
            ${contextBadge ? `<div style="margin-top:3px;">${contextBadge}</div>` : ''}
            ${stop.turnover_note ? `<div style="margin-top:3px;color:#38bdf8;font-size:10px;font-weight:600;">${stop.turnover_note}</div>` : ''}
          </div>`,
          {
            permanent: false,
            direction: 'top',
            offset: [0, -10],
            className: 'transit-tooltip',
          }
        );

        layer.addLayer(marker);
      });
    }

    // 4. Real GPS Buses (from GTFS-Realtime) or Animated Live Bus Marker Gliding Along Route
    if (liveBuses && liveBuses.length > 0) {
      liveBuses.forEach((bus) => {
        const busIcon = L.divIcon({
          className: 'live-bus-marker',
          html: `
            <div style="width:28px;height:28px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <div style="position:absolute;width:26px;height:26px;border-radius:50%;background:#06b6d430;border:1.5px solid #06b6d4;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
              <div style="width:22px;height:22px;background:#0f172a;border:2px solid #22d3ee;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #ffffff, 0 2px 4px rgba(0,0,0,0.4);z-index:2;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="15" rx="2"/><path d="M4 11h16"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const liveMarker = L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 2500 });
        liveMarker.bindTooltip(
          `<div style="font-size:11px;padding:3px 6px;font-weight:600;color:#22d3ee;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
            🚌 <strong>${bus.vehicleId}</strong> (Route ${bus.routeId})<br/>
            <span style="color:#94a3b8;font-size:10px;">Live Speed: ${bus.speedKmH} km/h • Next Stop in ~${bus.etaNextStopMins}m</span>
          </div>`,
          { permanent: false, direction: 'top', className: 'transit-tooltip' }
        );
        layer.addLayer(liveMarker);
      });
    } else if (activePathPoints.length >= 2) {
      const dists: number[] = [0];
      for (let i = 0; i < activePathPoints.length - 1; i++) {
        const p1 = activePathPoints[i];
        const p2 = activePathPoints[i + 1];
        const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        dists.push(dists[i] + d);
      }
      const totalDist = dists[dists.length - 1];

      if (totalDist > 0) {
        const busIcon = L.divIcon({
          className: 'live-bus-marker',
          html: `
            <div style="width:28px;height:28px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;">
              <div style="position:absolute;width:26px;height:26px;border-radius:50%;background:#10b98130;border:1.5px solid #10b981;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
              <div style="width:22px;height:22px;background:#0f172a;border:2px solid #34d399;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #ffffff, 0 2px 4px rgba(0,0,0,0.4);z-index:2;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="15" rx="2"/><path d="M4 11h16"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const liveBusMarker = L.marker(activePathPoints[0], { icon: busIcon, zIndexOffset: 2000 });
        const busNum = activeRoute?.bus_numbers[0] || '729';
        liveBusMarker.bindTooltip(
          `<div style="font-size:11px;padding:2px 4px;font-weight:600;color:#34d399;">
            🚌 Bus ${busNum} • Live Telemetry (En Route)
          </div>`,
          { permanent: false, direction: 'top', className: 'transit-tooltip' }
        );
        layer.addLayer(liveBusMarker);
        liveBusMarkerRef.current = liveBusMarker;

        const cycleDuration = 16000;
        const animateBus = () => {
          const now = Date.now();
          const t = (now % cycleDuration) / cycleDuration;
          const currentTargetDist = t * totalDist;

          let segIdx = 0;
          while (segIdx < dists.length - 2 && dists[segIdx + 1] < currentTargetDist) {
            segIdx++;
          }

          const segStartDist = dists[segIdx];
          const segEndDist = dists[segIdx + 1];
          const segSpan = segEndDist - segStartDist;
          const segT = segSpan > 0 ? (currentTargetDist - segStartDist) / segSpan : 0;

          const p1 = activePathPoints[segIdx];
          const p2 = activePathPoints[segIdx + 1];
          const lat = p1[0] + (p2[0] - p1[0]) * segT;
          const lng = p1[1] + (p2[1] - p1[1]) * segT;

          liveBusMarker.setLatLng([lat, lng]);
          animationFrameRef.current = requestAnimationFrame(animateBus);
        };

        animationFrameRef.current = requestAnimationFrame(animateBus);
      }
    }
  }, [routes, activeRoute, roadSegments, onSelectRoute, liveBuses, onSelectStop, selectedStopId]);

  return (
    <div className="relative w-full h-full bg-[#07090c] overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />

      {/* Geometry Loading Indicator */}
      {loadingGeometry && (
        <div className="absolute top-5 right-20 z-[500] flex items-center gap-2 bg-[#0b1120]/90 backdrop-blur-xl border border-cyan-400/20 px-3 py-1.5 rounded-full text-[11px] text-cyan-200 shadow-[0_0_24px_rgba(6,182,212,0.3)]">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-medium">Snapping road geometry…</span>
        </div>
      )}

      {/* Map Mode Switcher Pill & Corridor Recenter Button */}
      <div className="absolute top-[4.25rem] right-3 md:top-auto md:bottom-5 md:right-16 z-20 pointer-events-auto flex items-center gap-1.5 md:gap-2">
        {/* Compact Toggle Pill (Street Map | Satellite) */}
        <div className="flex items-center p-0.5 rounded-xl glass-control-elevated">
          <button
            type="button"
            onClick={() => setMapMode('street')}
            aria-pressed={mapMode === 'street'}
            className={`px-2 py-1 md:px-2.5 rounded-lg text-[10.5px] md:text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              mapMode === 'street'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Street Map
          </button>
          <button
            type="button"
            onClick={() => setMapMode('satellite')}
            aria-pressed={mapMode === 'satellite'}
            className={`px-2 py-1 md:px-2.5 rounded-lg text-[10.5px] md:text-[11px] font-medium transition-all duration-150 cursor-pointer ${
              mapMode === 'satellite'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Satellite
          </button>
        </div>

        {/* Fit Corridor Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={fitMapToActiveRoute}
          title="Recenter Map to Active Corridor"
          className="h-7 md:h-8 px-2 md:px-3 glass-control-elevated hover:bg-zinc-900/90 rounded-xl text-zinc-300 hover:text-white text-[10.5px] md:text-xs flex items-center gap-1 md:gap-1.5 cursor-pointer"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span className="font-medium">Fit</span>
          <span className="hidden sm:inline font-medium">Corridor</span>
        </Button>
      </div>

      {/* Zoom Controls */}
      <div className="hidden md:flex absolute bottom-5 right-5 z-20 flex-col gap-1.5 pointer-events-auto">
        <Button
          variant="outline"
          size="icon"
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Zoom in"
          className="glass-control-elevated hover:bg-zinc-900/90 rounded-xl text-white font-bold text-sm cursor-pointer active:scale-95"
        >
          +
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Zoom out"
          className="glass-control-elevated hover:bg-zinc-900/90 rounded-xl text-white font-bold text-sm cursor-pointer active:scale-95"
        >
          −
        </Button>
      </div>

      {/* Attribution & Legend */}
      <div className="absolute top-[4.25rem] left-3 md:top-auto md:bottom-5 md:left-20 z-20 flex items-center gap-2 md:gap-3 text-[9.5px] md:text-[10px] text-zinc-400 font-mono pointer-events-none glass-control-elevated px-2.5 py-1 md:px-3 md:py-1.5 rounded-full">
        <div className="flex items-center gap-1 md:gap-1.5 font-sans font-medium">
          <span className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" /> &lt;50%
        </div>
        <div className="flex items-center gap-1 md:gap-1.5 font-sans font-medium">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_6px_#f59e0b]" /> 50–80%
        </div>
        <div className="flex items-center gap-1 md:gap-1.5 font-sans font-medium">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_#ef4444]" /> &gt;80%
        </div>
        <span className="hidden md:inline text-zinc-600">|</span>
        <span className="hidden md:inline text-zinc-400 font-sans">
          {mapMode === 'street' ? 'Midnight Slate Street' : 'Esri Hybrid Satellite'} • OSRM
        </span>
      </div>
    </div>
  );
}
