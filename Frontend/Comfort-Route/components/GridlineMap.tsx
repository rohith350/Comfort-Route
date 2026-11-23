'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TransitRoute, TransitStop } from '@/lib/types';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface GridlineMapProps {
  route: TransitRoute;
  allStops: TransitStop[];
  selectedStop: TransitStop | null;
  onSelectStop: (stop: TransitStop) => void;
  showStops: boolean;
  onToggleShowStops: () => void;
  filterLevel1: boolean; // 132kV / Low
  filterLevel2: boolean; // 33kV / Moderate
  filterLevel3: boolean; // 22kV / Packed
  filterLevel4: boolean; // 11kV / EV
  filterLevel5: boolean; // 6kV / Express
  filterLevel6: boolean; // Unknown
  onToggleLevel: (level: number) => void;
  selectedRegion: string;
  onSelectRegion: (reg: string) => void;
  onResetView: () => void;
}

export default function GridlineMap({
  route,
  allStops,
  selectedStop,
  onSelectStop,
  showStops,
  onToggleShowStops,
  filterLevel1,
  filterLevel2,
  filterLevel3,
  filterLevel4,
  filterLevel5,
  filterLevel6,
  onToggleLevel,
  selectedRegion,
  onSelectRegion,
  onResetView,
}: GridlineMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const floatingPanelRef = useRef<HTMLDivElement>(null);

  // State to COLLAPSE / EXPAND the Voltage Levels card (< chevron)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.209],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark high-contrast GIS satellite tile layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-map-tiles',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    if (floatingPanelRef.current) {
      L.DomEvent.disableClickPropagation(floatingPanelRef.current);
      L.DomEvent.disableScrollPropagation(floatingPanelRef.current);
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Fly to stop
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedStop) return;
    mapInstanceRef.current.flyTo(selectedStop.coordinates, 13, { duration: 0.8 });
  }, [selectedStop]);

  // Update Route Polyline & Glowing Nodes
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // Cyan glowing polyline
    const routeColor = '#00f5d4';

    const glowLine = L.polyline(route.pathCoordinates, {
      color: routeColor,
      weight: 6,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layerGroup.addLayer(glowLine);

    const mainLine = L.polyline(route.pathCoordinates, {
      color: routeColor,
      weight: 2.5,
      opacity: 0.9,
    });
    layerGroup.addLayer(mainLine);

    if (showStops) {
      allStops.forEach((stop, idx) => {
        const isRouteStop = route.stopDetails.some((d) => d.stop.id === stop.id);
        const isSelected = selectedStop?.id === stop.id;
        const [lat, lng] = stop.coordinates;

        // Voltage / Crowd level styling
        const customIcon = L.divIcon({
          className: 'gridline-marker',
          html: `
            <div style="position: relative; cursor: pointer;">
              ${isSelected ? `
                <div style="
                  position: absolute;
                  top: -8px;
                  left: -8px;
                  width: 26px;
                  height: 26px;
                  border-radius: 50%;
                  border: 1.5px solid #00f5d4;
                  opacity: 0.8;
                "></div>
              ` : ''}
              <div style="
                width: ${isSelected ? '12px' : isRouteStop ? '10px' : '8px'};
                height: ${isSelected ? '12px' : isRouteStop ? '10px' : '8px'};
                background-color: ${isSelected ? '#ffffff' : '#00f5d4'};
                border: 1.5px solid #090c0f;
                border-radius: 50%;
                box-shadow: 0 0 10px #00f5d4;
              "></div>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([lat, lng], { icon: customIcon });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectStop(stop);
        });

        marker.bindPopup(`
          <div style="padding: 4px; font-family: monospace; font-size: 11px; color: #f3f4f6;">
            <div style="font-weight: 700; color: #00f5d4; margin-bottom: 2px;">
              ${stop.name}
            </div>
            <div style="color: #94a3b8; font-size: 10px;">
              Equipment: ${stop.equipmentCount || 24} Items
            </div>
          </div>
        `);

        layerGroup.addLayer(marker);
      });
    }
  }, [route, allStops, selectedStop, showStops, onSelectStop]);

  const handleRegionClick = (reg: string) => {
    onSelectRegion(reg);
    if (!mapInstanceRef.current) return;

    const regionCoords: Record<string, [number, number]> = {
      east: [28.6288, 77.2408],
      west: [28.6253, 77.0658],
      wales: [28.6665, 77.2285],
      south: [28.5494, 77.2528],
    };

    const target = regionCoords[reg] || [28.6139, 77.209];
    mapInstanceRef.current.flyTo(target, 13, { duration: 0.8 });
  };

  const handleReset = () => {
    onResetView();
    if (!mapInstanceRef.current || route.pathCoordinates.length === 0) return;
    const bounds = L.latLngBounds(route.pathCoordinates);
    mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  };

  return (
    <div className="relative w-full h-full bg-[#090b0e] overflow-hidden select-none">
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />

      {/* Floating Filter Box - Exact match to screenshot Voltage Levels */}
      <div
        ref={floatingPanelRef}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-4 left-4 z-[1000] transition-all duration-200 pointer-events-auto ${isPanelCollapsed ? 'w-auto' : 'w-64'
          }`}
      >
        {isPanelCollapsed ? (
          <button
            type="button"
            onClick={() => setIsPanelCollapsed(false)}
            className="flex items-center gap-1.5 bg-[#0e1115]/95 hover:bg-[#161a20] border border-[#1b2129] rounded px-2.5 py-1.5 text-[11px] font-mono text-neutral-300 shadow-2xl cursor-pointer"
          >
            <span>Voltage Levels</span>
            <ChevronRight className="h-3 w-3 text-[#00f5d4]" />
          </button>
        ) : (
          <div className="bg-[#0e1115]/95 backdrop-blur-md border border-[#1b2129] rounded-lg p-3 text-[11px] font-mono text-neutral-300 shadow-2xl space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between text-neutral-400 font-semibold">
              <span className="text-white text-xs">Voltage Levels</span>
              <button
                type="button"
                onClick={() => setIsPanelCollapsed(true)}
                className="p-0.5 rounded hover:bg-[#1a2129] text-neutral-400 hover:text-white cursor-pointer"
                title="Collapse panel"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Toggle Switches with Exact Colors */}
            <div className="space-y-1.5">
              {/* 132kV / 66kV */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <span>132kV / 66kV</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(1)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel1 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel1 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>

              {/* 33kV */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span>33kV</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(2)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel2 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel2 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>

              {/* 22kV - 25kV */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#facc15]" />
                  <span>22kV - 25kV</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(3)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel3 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel3 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>

              {/* 11kV */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                  <span>11kV</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(4)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel4 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel4 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>

              {/* 6kV - 6.6kV */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#3b82f6]" />
                  <span>6kV - 6.6kV</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(5)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel5 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel5 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>

              {/* Unknown */}
              <div className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#f97316]" />
                  <span>Unknown</span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggleLevel(6)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${filterLevel6 ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${filterLevel6 ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* Option */}
            <div className="pt-2 border-t border-[#1b2129]">
              <div className="text-neutral-400 font-semibold mb-1 text-[10px]">Option</div>
              <div className="flex items-center justify-between">
                <span>Show Substations</span>
                <button
                  type="button"
                  onClick={onToggleShowStops}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${showStops ? 'bg-[#00f5d4]' : 'bg-[#1b2129]'
                    }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform ${showStops ? 'translate-x-4' : ''
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* Grid Regions */}
            <div className="pt-2 border-t border-[#1b2129] space-y-1">
              <div className="text-neutral-400 font-semibold mb-1 text-[10px]">Grid Regions</div>
              {[
                { id: 'east', label: 'East Midlands', color: 'bg-[#3b82f6]' },
                { id: 'west', label: 'West Midlands', color: 'bg-[#8b5cf6]' },
                { id: 'wales', label: 'South Wales', color: 'bg-[#ef4444]' },
                { id: 'south', label: 'South West', color: 'bg-[#22c55e]' },
              ].map((reg) => (
                <div
                  key={reg.id}
                  onClick={() => handleRegionClick(reg.id)}
                  className={`px-2 py-1 rounded cursor-pointer flex items-center justify-between transition-colors ${selectedRegion === reg.id
                    ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/30'
                    : 'hover:bg-[#14181e] text-neutral-400'
                    }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${reg.color}`} />
                    <span>{reg.label}</span>
                  </span>
                  {selectedRegion === reg.id && (
                    <span className="text-[9px] bg-[#00f5d4]/20 px-1 py-0.2 rounded text-[#00f5d4] font-bold">
                      Loaded
                    </span>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleReset}
                className="mt-2 text-[10px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset View</span>
              </button>
            </div>

            {/* Loaded count footer */}
            <div className="pt-2 border-t border-[#1b2129] text-[10px] text-neutral-500 space-y-0.5">
              <div className="text-neutral-400 font-semibold">Loaded</div>
              <div>621 Substations</div>
              <div>379 mapped on map</div>
              <div className="text-neutral-600">Location DB: 2072 entries</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom map footer: Feedback & Attribution */}
      <div className="absolute bottom-3 left-4 z-[1000] flex items-center gap-3 text-[10px] text-neutral-400 font-mono pointer-events-auto">
        <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
          <input type="checkbox" className="accent-[#00f5d4]" />
          <span>Feedback</span>
        </label>
        <span className="bg-[#0e1115]/90 border border-[#1b2129] px-2.5 py-1 rounded text-neutral-400">
          Attribution: <strong className="text-white">Large Grid Company</strong> ☊ <span className="text-[#00f5d4]">Squid</span>
        </span>
      </div>

      {/* Map Zoom Controls bottom right */}
      <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1 pointer-events-auto">
        <button
          onClick={() => mapInstanceRef.current?.zoomIn()}
          className="w-7 h-7 bg-[#0e1115]/95 hover:bg-[#161a20] border border-[#1b2129] rounded text-white font-bold flex items-center justify-center text-sm shadow cursor-pointer"
        >
          +
        </button>
        <button
          onClick={() => mapInstanceRef.current?.zoomOut()}
          className="w-7 h-7 bg-[#0e1115]/95 hover:bg-[#161a20] border border-[#1b2129] rounded text-white font-bold flex items-center justify-center text-sm shadow cursor-pointer"
        >
          -
        </button>
      </div>
    </div>
  );
}
