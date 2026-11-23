'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Home,
  Database,
  Zap,
  TrendingUp,
  Radio,
  Users,
  Activity,
  FileText,
  User,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Building2,
  Table as TableIcon,
  GitBranch,
  BookOpen,
  Map as MapIcon,
  SlidersHorizontal,
  Layers,
  ArrowRightLeft,
  Sparkles,
} from 'lucide-react';

import { DELHI_TRANSIT_STOPS } from '@/lib/delhiStops';
import { generateCandidateRoutes } from '@/lib/crowdingEngine';
import type { TransitStop } from '@/lib/types';

// Dynamically load the Leaflet map with no SSR
const GridlineMap = dynamic(() => import('@/components/GridlineMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#090b0e] text-[#00f5d4] font-mono text-xs">
      Initializing Gridline GIS Engine...
    </div>
  ),
});

// Mock Substations from the reference image
const ASSETS_LIST = [
  { id: 'tavistock', name: 'Tavistock 33/11kV', count: 30, voltage: 2, equipment: 30, type: 'Substation', coords: [28.6665, 77.2285] as [number, number] },
  { id: 'st-tudy-33', name: 'St Tudy 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.6469, 77.3160] as [number, number] },
  { id: 'st-tudy-bsp', name: 'St Tudy BSP 132/33kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.6328, 77.2197] as [number, number] },
  { id: 'stancombe', name: 'Stancombe Quarry 33kV', count: 24, voltage: 1, equipment: 24, type: 'Substation', coords: [28.5919, 77.1616] as [number, number] },
  { id: 'staplegrove', name: 'Staplegrove 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.6253, 77.0658] as [number, number] },
  { id: 'stentaway', name: 'Stentaway 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5672, 77.2100] as [number, number] },
  { id: 'stoke-bishop', name: 'Stoke Bishop 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5431, 77.2065] as [number, number] },
  { id: 'stokenham', name: 'Stokenham 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5244, 77.2185] as [number, number] },
  { id: 'street-bsp', name: 'Street BSP 132/33kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5700, 77.2434] as [number, number] },
  { id: 'stratton', name: 'Stratton 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.6288, 77.2408] as [number, number] },
  { id: 'tale-lane', name: 'Tale Lane PV 132/33kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5494, 77.2528] as [number, number] },
  { id: 'st-tudy-333', name: 'St Tudy 333/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.5708, 77.3271] as [number, number] },
  { id: 'st-catherines', name: 'St Catherines 33/11kV', count: 12, voltage: 2, equipment: 12, type: 'Substation', coords: [28.6514, 77.1907] as [number, number] },
  { id: 'south-molton', name: 'South Molton 33/11kV', count: 18, voltage: 2, equipment: 18, type: 'Substation', coords: [28.6139, 77.2090] as [number, number] },
  { id: 'plymouth-north', name: 'Plymouth North 132/33kV', count: 30, voltage: 2, equipment: 30, type: 'Substation', coords: [28.6665, 77.2285] as [number, number] },
  { id: 'exeter-east', name: 'Exeter East 33/11kV', count: 24, voltage: 2, equipment: 24, type: 'Substation', coords: [28.6469, 77.3160] as [number, number] },
];

export default function GridlineDashboardApp() {
  const [activeTab, setActiveTab] = useState<'browse' | 'map' | 'graph' | 'circuit' | 'table' | 'table_plus' | 'ltds' | 'compare'>('browse');
  const [selectedAssetId, setSelectedAssetId] = useState('st-tudy-bsp');
  const [searchQuery, setSearchQuery] = useState('');

  // Floating filter switches state (Voltage levels)
  const [filterLevel1, setFilterLevel1] = useState(true);
  const [filterLevel2, setFilterLevel2] = useState(true);
  const [filterLevel3, setFilterLevel3] = useState(true);
  const [filterLevel4, setFilterLevel4] = useState(true);
  const [filterLevel5, setFilterLevel5] = useState(true);
  const [filterLevel6, setFilterLevel6] = useState(true);
  const [showSubstations, setShowSubstations] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('south');

  // Accordion state
  const [isOverviewOpen, setIsOverviewOpen] = useState(true);
  const [isIdentifierOpen, setIsIdentifierOpen] = useState(false);
  const [isDetailsVisible, setIsDetailsVisible] = useState(true);

  // Selected asset
  const selectedAsset = ASSETS_LIST.find((a) => a.id === selectedAssetId) || ASSETS_LIST[2];

  // Map representation stop
  const mappedStop: TransitStop = {
    id: selectedAsset.id,
    name: selectedAsset.name,
    coordinates: selectedAsset.coords,
    equipmentCount: selectedAsset.equipment,
    zoneType: 'transit_hub',
  };

  // Filtered assets list
  const filteredAssets = ASSETS_LIST.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Candidate routes for comparison
  const candidateRoutes = generateCandidateRoutes('kashmere-gate', 'nehru-place', 9.25);

  const handleToggleLevel = (lvl: number) => {
    if (lvl === 1) setFilterLevel1((v) => !v);
    if (lvl === 2) setFilterLevel2((v) => !v);
    if (lvl === 3) setFilterLevel3((v) => !v);
    if (lvl === 4) setFilterLevel4((v) => !v);
    if (lvl === 5) setFilterLevel5((v) => !v);
    if (lvl === 6) setFilterLevel6((v) => !v);
  };

  return (
    <div className="flex h-screen w-screen bg-[#090b0e] text-[#d1d5db] font-mono select-none overflow-hidden text-xs">
      {/* 1. Leftmost Icon Rail */}
      <aside className="w-12 h-full bg-[#07090c] border-r border-[#15191f] flex flex-col items-center justify-between py-3 z-30 shrink-0">
        <div className="flex flex-col items-center gap-4">
          {/* Cyan Starburst Logo */}
          <div className="h-7 w-7 rounded bg-[#00f5d4]/10 border border-[#00f5d4]/40 flex items-center justify-center text-[#00f5d4] shadow-[0_0_12px_rgba(0,245,212,0.4)] cursor-pointer">
            <Sparkles className="h-4 w-4 text-[#00f5d4]" />
          </div>

          <nav className="flex flex-col items-center gap-3 text-neutral-500">
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Home">
              <Home className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Database">
              <Database className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded text-[#00f5d4] bg-[#00f5d4]/15 border border-[#00f5d4]/30 shadow-[0_0_8px_rgba(0,245,212,0.3)] transition-colors" title="Power / Grid Model">
              <Zap className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Trends">
              <TrendingUp className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Radio Signals">
              <Radio className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Users">
              <Users className="h-4 w-4" />
            </button>
            <button className="p-1.5 rounded hover:text-white hover:bg-[#12161c] transition-colors" title="Health Diagnostics">
              <Activity className="h-4 w-4" />
            </button>
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3 text-neutral-500">
          <button className="p-1.5 rounded hover:text-white transition-colors" title="Docs">
            <FileText className="h-4 w-4" />
          </button>
          <button className="p-1.5 rounded hover:text-white transition-colors" title="Profile">
            <User className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* 2. Top Header Bar (Exact match to screenshot) */}
        <header className="h-10 border-b border-[#15191f] bg-[#07090c] px-3 flex items-center justify-between text-[11px] shrink-0 z-20">
          {/* Status Group */}
          <div className="flex items-center gap-1.5 bg-[#0e1216] border border-[#1b222a] rounded-full p-0.5 px-1.5">
            <span className="flex items-center gap-1 text-[#00f5d4] font-semibold text-[10px] px-1.5 py-0.5 rounded-full bg-[#00f5d4]/10">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00f5d4]" />
              Published
            </span>
            <span className="text-[#22c55e] text-[10px] px-1.5 py-0.5 cursor-pointer">Validated</span>
            <span className="text-neutral-500 text-[10px] px-1.5 py-0.5 cursor-pointer hover:text-neutral-400">In Review</span>
          </div>

          {/* Navigation Tabs (Exact buttons in screenshot) */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'browse'
                ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/40 font-semibold shadow-[0_0_8px_rgba(0,245,212,0.2)]'
                : 'text-neutral-400 hover:text-white hover:bg-[#12161c]'
                }`}
            >
              <BookOpen className="h-3 w-3" />
              <span>Browse</span>
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${activeTab === 'map'
                ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/40 font-semibold'
                : 'text-neutral-400 hover:text-white hover:bg-[#12161c]'
                }`}
            >
              <MapIcon className="h-3 w-3" />
              <span>Map</span>
            </button>

            <button
              onClick={() => setActiveTab('graph')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="h-3 w-3" />
              <span>Graph</span>
            </button>

            <button
              onClick={() => setActiveTab('circuit')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <GitBranch className="h-3 w-3" />
              <span>Circuit</span>
            </button>

            <button
              onClick={() => setActiveTab('table')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <TableIcon className="h-3 w-3" />
              <span>Table</span>
            </button>

            <button
              onClick={() => setActiveTab('table_plus')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="h-3 w-3" />
              <span>Table++</span>
            </button>

            <button
              onClick={() => setActiveTab('ltds')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="h-3 w-3" />
              <span>LTDS Table Generator</span>
            </button>

            <button
              onClick={() => setActiveTab('compare')}
              className="px-2.5 py-1 rounded text-[11px] text-neutral-400 hover:text-white hover:bg-[#12161c] flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRightLeft className="h-3 w-3" />
              <span>Compare</span>
            </button>
          </div>

          {/* Model Version Tag */}
          <div className="text-[10px] text-neutral-500 font-mono">
            <span>Electrical Grid Company Model</span> •{' '}
            <span className="text-neutral-400">v2.4.1</span> → <span className="text-[#00f5d4]">v2.4.2</span>
          </div>
        </header>

        {/* 3. Three Column Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: South West Assets */}
          <div className="w-64 bg-[#080a0d] border-r border-[#15191f] flex flex-col shrink-0">
            {/* Title Header */}
            <div className="p-3 border-b border-[#15191f] flex items-center justify-between">
              <div>
                <div className="font-bold text-white text-xs">South West Assets</div>
                <div className="text-[10px] text-neutral-500">621 Substations</div>
              </div>
              <ChevronLeft className="h-3.5 w-3.5 text-neutral-500 hover:text-white cursor-pointer" />
            </div>

            {/* Search Input */}
            <div className="p-2 border-b border-[#15191f]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0f1217] border border-[#1b222a] rounded px-2.5 py-1.5 pl-8 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#00f5d4]"
                />
              </div>
            </div>

            {/* Substations List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {filteredAssets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setIsDetailsVisible(true);
                    }}
                    className={`px-2 py-1.5 rounded cursor-pointer flex items-center justify-between text-[11px] transition-colors ${isSelected
                      ? 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/30 font-semibold'
                      : 'text-neutral-400 hover:text-white hover:bg-[#101419]'
                      }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <ChevronRight className="h-3 w-3 text-neutral-600 shrink-0" />
                      <Zap className="h-2.5 w-2.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{asset.name}</span>
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500 shrink-0 ml-1">
                      {asset.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center Column: GIS Map Canvas */}
          <div className="flex-1 relative flex flex-col h-full overflow-hidden bg-[#090b0e]">
            {activeTab === 'compare' ? (
              /* Compare View */
              <div className="p-6 overflow-y-auto h-full space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    Candidate Route Comparison
                  </h2>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="text-xs text-[#00f5d4] hover:underline"
                  >
                    Back to Map
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {candidateRoutes.map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-xl border border-[#1b222a] bg-[#0e1115] space-y-2"
                    >
                      <div className="flex justify-between font-bold text-white">
                        <span>{r.name}</span>
                        <span className="text-[#00f5d4]">{r.durationMinutes} min</span>
                      </div>
                      <div className="text-neutral-400 text-xs">Load: {r.averageOccupancyPct}%</div>
                      <div className="text-[11px] text-neutral-300">{r.tradeoffHighlight}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Main GIS Gridline Map View */
              <div className="flex-1 relative h-full">
                <GridlineMap
                  route={candidateRoutes[0]}
                  allStops={DELHI_TRANSIT_STOPS}
                  selectedStop={mappedStop}
                  onSelectStop={(stop) => {
                    const match = ASSETS_LIST.find((a) => a.id === stop.id);
                    if (match) setSelectedAssetId(match.id);
                  }}
                  showStops={showSubstations}
                  onToggleShowStops={() => setShowSubstations((v) => !v)}
                  filterLevel1={filterLevel1}
                  filterLevel2={filterLevel2}
                  filterLevel3={filterLevel3}
                  filterLevel4={filterLevel4}
                  filterLevel5={filterLevel5}
                  filterLevel6={filterLevel6}
                  onToggleLevel={handleToggleLevel}
                  selectedRegion={selectedRegion}
                  onSelectRegion={setSelectedRegion}
                  onResetView={() => setSelectedAssetId('st-tudy-bsp')}
                />
              </div>
            )}
          </div>

          {/* Right Panel: Details Inspector (Exact match to screenshot) */}
          {isDetailsVisible && (
            <div className="w-80 bg-[#080a0d] border-l border-[#15191f] flex flex-col shrink-0 overflow-y-auto">
              {/* Header */}
              <div className="p-3 border-b border-[#15191f] flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-xs">Details</div>
                  <div className="text-[10px] text-neutral-500">{selectedAsset.name}</div>
                </div>
                <ChevronRight
                  onClick={() => setIsDetailsVisible(false)}
                  className="h-3.5 w-3.5 text-neutral-500 hover:text-white cursor-pointer"
                />
              </div>

              {/* Asset Badge Card */}
              <div className="p-3 border-b border-[#15191f] space-y-2">
                <div className="h-9 w-9 rounded-lg bg-[#0e1216] border border-[#1b222a] flex items-center justify-center text-white">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {selectedAsset.name}
                  </h3>
                  <div className="inline-block mt-1 px-2 py-0.5 rounded bg-[#101419] text-neutral-400 border border-[#1b222a] text-[10px]">
                    {selectedAsset.type}
                  </div>
                </div>
              </div>

              {/* Accordion: Overview */}
              <div className="border-b border-[#15191f]">
                <div
                  onClick={() => setIsOverviewOpen((v) => !v)}
                  className="p-3 flex items-center justify-between cursor-pointer text-white font-semibold hover:bg-[#0e1216]"
                >
                  <span className="flex items-center gap-1.5">
                    {isOverviewOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>Overview</span>
                  </span>
                </div>

                {isOverviewOpen && (
                  <div className="px-3 pb-3 space-y-2 text-[11px]">
                    <div className="flex justify-between py-1 border-b border-[#12161c]">
                      <span className="text-neutral-500">Name</span>
                      <span className="text-white font-medium">{selectedAsset.name}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-[#12161c]">
                      <span className="text-neutral-500">Equipment</span>
                      <span className="text-white font-mono">{selectedAsset.equipment} Items</span>
                    </div>

                    <div className="flex justify-between py-1">
                      <span className="text-neutral-500">Voltage Levels</span>
                      <span className="text-white font-mono">{selectedAsset.voltage}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion: Identifier */}
              <div className="border-b border-[#15191f]">
                <div
                  onClick={() => setIsIdentifierOpen((v) => !v)}
                  className="p-3 flex items-center justify-between cursor-pointer text-white font-semibold hover:bg-[#0e1216]"
                >
                  <span className="flex items-center gap-1.5">
                    {isIdentifierOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>Identifier</span>
                  </span>
                </div>

                {isIdentifierOpen && (
                  <div className="px-3 pb-3 text-[11px] text-neutral-400 font-mono space-y-1">
                    <div>Asset ID: {selectedAsset.id.toUpperCase()}-GRID</div>
                    <div>URN: urn:grid:substation:{selectedAsset.id}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
