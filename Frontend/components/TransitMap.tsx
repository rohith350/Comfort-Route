'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ApiScoredRoute } from '@/lib/types';

interface TransitMapProps {
  /** All candidate routes for the current corridor */
  routes: ApiScoredRoute[];
  /** Currently selected route id (highlighted) */
  selectedRouteId: string | null;
  /** Callback when user clicks a route polyline */
  onSelectRoute: (routeId: string) => void;
}

/** Map status color to hex */
function statusColor(status: string): string {
  if (status === 'GREEN') return '#10b981';
  if (status === 'YELLOW') return '#f59e0b';
  return '#ef4444'; // RED
}

export default function TransitMap({ routes, selectedRouteId, onSelectRoute }: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // ─── Initialize map once ───
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.6139, 77.209],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-map-tiles',
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;

    // Resize handling
    const timer = setTimeout(() => map.invalidateSize(), 200);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── Draw routes & stops whenever data or selection changes ───
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (routes.length === 0) return;

    const allCoords: L.LatLngExpression[] = [];

    // Sort so selected route renders last (on top)
    const sorted = [...routes].sort((a, b) => {
      if (a.id === selectedRouteId) return 1;
      if (b.id === selectedRouteId) return -1;
      return 0;
    });

    sorted.forEach((route) => {
      const isSelected = route.id === selectedRouteId;
      const coords: [number, number][] = route.stops.map((s) => [s.lat, s.lng]);
      if (coords.length === 0) return;
      allCoords.push(...coords);

      const color = statusColor(route.status);

      // Glow behind for selected
      if (isSelected) {
        const glow = L.polyline(coords, {
          color,
          weight: 10,
          opacity: 0.25,
          lineCap: 'round',
          lineJoin: 'round',
        });
        layer.addLayer(glow);
      }

      // Main polyline
      const line = L.polyline(coords, {
        color,
        weight: isSelected ? 6 : 3,
        opacity: isSelected ? 1 : 0.45,
        lineCap: 'round',
        lineJoin: 'round',
      });
      line.on('click', () => onSelectRoute(route.id));
      layer.addLayer(line);

      // Stop markers (only for selected route)
      if (isSelected) {
        route.stops.forEach((stop) => {
          const isMetro = stop.is_metro;
          const size = isMetro ? 14 : 10;

          // Load-based color for stop dot
          let dotColor = '#10b981';
          if (stop.load_pct >= 80) dotColor = '#ef4444';
          else if (stop.load_pct >= 50) dotColor = '#f59e0b';

          const icon = L.divIcon({
            className: 'transit-stop-marker',
            html: `
              <div style="position:relative;cursor:pointer;">
                ${isMetro ? `
                  <div style="
                    position:absolute;top:${-(size / 2 + 3)}px;left:${-(size / 2 + 3)}px;
                    width:${size + 6}px;height:${size + 6}px;
                    border-radius:50%;border:1.5px solid ${dotColor};
                    opacity:0.7;animation:pulse 2s ease-in-out infinite;
                  "></div>
                ` : ''}
                <div style="
                  width:${size}px;height:${size}px;
                  background:${dotColor};
                  border:2px solid #090b0e;
                  border-radius:50%;
                  box-shadow:0 0 8px ${dotColor}80;
                "></div>
              </div>
            `,
            iconSize: [size + 6, size + 6],
            iconAnchor: [(size + 6) / 2, (size + 6) / 2],
          });

          const marker = L.marker([stop.lat, stop.lng], { icon });

          marker.bindTooltip(
            `<div style="font-family:ui-monospace,monospace;font-size:11px;padding:2px 4px;">
              <strong style="color:#f3f4f6;">${stop.name}</strong>
              <span style="color:${dotColor};margin-left:6px;">${stop.load_pct}% Load</span>
              ${isMetro ? '<span style="color:#818cf8;margin-left:4px;">Ⓜ Metro</span>' : ''}
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
    });

    // Fit bounds to all visible route coords
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords as [number, number][]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [routes, selectedRouteId, onSelectRoute]);

  return (
    <div className="relative w-full h-full bg-[#090b0e] overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1 pointer-events-auto">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-7 h-7 bg-[#0e1115]/95 hover:bg-[#161a20] border border-[#1b2129] rounded text-white font-bold flex items-center justify-center text-sm shadow cursor-pointer"
        >
          +
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-7 h-7 bg-[#0e1115]/95 hover:bg-[#161a20] border border-[#1b2129] rounded text-white font-bold flex items-center justify-center text-sm shadow cursor-pointer"
        >
          −
        </button>
      </div>

      {/* Attribution */}
      <div className="absolute bottom-3 left-4 z-[1000] text-[10px] text-neutral-500 font-mono pointer-events-none">
        Delhi Transit Crowd Planner • OpenStreetMap
      </div>
    </div>
  );
}
