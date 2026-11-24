'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TransitRoute, TransitStop } from '@/lib/types';
import { Maximize2, Navigation } from 'lucide-react';

interface TransitMapViewProps {
  route: TransitRoute;
  allStops: TransitStop[];
  selectedStopId?: string | null;
  onSelectStop: (stop: TransitStop) => void;
}

export default function TransitMapView({
  route,
  allStops,
  selectedStopId,
  onSelectStop,
}: TransitMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.209],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-map-tiles',
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

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

  // Update Route Polyline & Markers with Electric Cyan / Teal
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // Electric Cyan (#00f5d4) as signature route color
    const routeColor = '#00f5d4';

    // Glow underlay
    const glowLine = L.polyline(route.pathCoordinates, {
      color: routeColor,
      weight: 10,
      opacity: 0.4,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layerGroup.addLayer(glowLine);

    // Sharp main polyline
    const mainLine = L.polyline(route.pathCoordinates, {
      color: routeColor,
      weight: 3.5,
      opacity: 1,
      dashArray: route.category === 'comfortable' ? '6, 6' : undefined,
    });
    layerGroup.addLayer(mainLine);

    // Stop markers
    route.stopDetails.forEach((detail, idx) => {
      const isOrigin = idx === 0;
      const isDest = idx === route.stopDetails.length - 1;
      const isSelected = selectedStopId === detail.stop.id;
      const [lat, lng] = detail.stop.coordinates;

      const markerBg = isSelected
        ? '#ffffff'
        : isOrigin
        ? '#00f5d4'
        : isDest
        ? '#ef4444'
        : '#2dd4bf';

      const customIcon = L.divIcon({
        className: 'transit-stop-pin',
        html: `
          <div style="
            position: relative;
            width: ${isOrigin || isDest || isSelected ? '18px' : '12px'};
            height: ${isOrigin || isDest || isSelected ? '18px' : '12px'};
            background-color: ${markerBg};
            border: 2px solid #000000;
            border-radius: 50%;
            box-shadow: 0 0 12px ${isOrigin ? '#00f5d4' : isDest ? '#ef4444' : '#00f5d4'};
            cursor: pointer;
            transition: transform 0.2s ease;
          ">
            ${isOrigin || isDest ? `
              <div style="
                position: absolute;
                inset: -5px;
                border-radius: 50%;
                border: 1px solid ${markerBg};
                animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
              "></div>
            ` : ''}
          </div>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      marker.on('click', () => {
        onSelectStop(detail.stop);
      });

      marker.bindPopup(`
        <div style="padding: 4px; font-family: monospace; font-size: 11px; color: #f8fafc;">
          <div style="font-weight: 700; color: #00f5d4; margin-bottom: 2px;">
            ${detail.stop.name}
          </div>
          <div style="color: #94a3b8; margin-bottom: 2px;">
            ETA: ${detail.arrivalTime} (${detail.minuteOffset} min)
          </div>
          <div style="color: #cbd5e1;">
            Load: ${detail.projectedOccupancyPct}% • Seat Chance: ${detail.seatedChancePct}%
          </div>
        </div>
      `);

      layerGroup.addLayer(marker);
    });

    if (route.pathCoordinates.length > 0) {
      const bounds = L.latLngBounds(route.pathCoordinates);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [route, selectedStopId, onSelectStop]);

  const handleRecenter = () => {
    if (!mapInstanceRef.current || route.pathCoordinates.length === 0) return;
    const bounds = L.latLngBounds(route.pathCoordinates);
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  };

  return (
    <div className="relative w-full h-full bg-[#080a0d] overflow-hidden">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Top overlay tag */}
      <div className="absolute top-4 left-4 z-[1000] bg-[#0d1115]/90 backdrop-blur-md border border-[#1a2129] rounded-lg px-3 py-1.5 text-xs flex items-center gap-3 text-white shadow-xl font-mono">
        <div className="flex items-center gap-2 font-bold text-[#00f5d4]">
          <Navigation className="h-3.5 w-3.5" />
          <span>{route.name}</span>
        </div>
        <span className="text-neutral-500">•</span>
        <span
          className="font-bold"
          style={{
            color: route.averageOccupancyPct > 80 ? '#ef4444' : route.averageOccupancyPct < 50 ? '#00f5d4' : '#facc15',
          }}
        >
          {route.averageOccupancyPct}% Crowded
        </span>
      </div>

      {/* Recenter Button */}
      <button
        onClick={handleRecenter}
        className="absolute top-4 right-4 z-[1000] bg-[#0d1115]/90 hover:bg-[#151c23] border border-[#1a2129] rounded-lg p-2 text-neutral-300 hover:text-white transition-all shadow-xl cursor-pointer"
        title="Fit route to screen"
      >
        <Maximize2 className="h-4 w-4 text-[#00f5d4]" />
      </button>
    </div>
  );
}
