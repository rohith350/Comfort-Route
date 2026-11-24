export type WorkspaceCard = {
  title: string;
  href: string;
  icon:
    | "database"
    | "flexibility"
    | "planning"
    | "operations"
    | "stakeholders"
    | "connections";
  details: string[];
};

export const dashboardOverview = {
  company: "Delhi Transit Authority",
  date: "23 November 2026",
};

export const networkBasemapUrl =
  "https://assets.watermelon.sh/components/map-sample.png";

export const workspaceCards: WorkspaceCard[] = [
  {
    title: "Journey Planner",
    href: "/",
    icon: "flexibility",
    details: [
      "Compare direct vs alternate transit routes",
      "Live crowd prediction & comfort scoring",
    ],
  },
  {
    title: "Crowd Analytics",
    href: "/crowd-analytics",
    icon: "database",
    details: [
      "Historical commuter rush trends",
      "Metro hub interchange bottlenecks",
    ],
  },
];

export type ModellingAction = {
  title: string;
  description: string;
  icon: "database" | "comparison" | "clearview";
};

export type NetworkRegion = {
  name: string;
  legendName: string;
  color: "blue" | "purple" | "red" | "green";
  position: "north-east" | "central" | "west" | "south-east";
};

export const modellingDashboard = {
  title: "Delhi Transit Crowd Planner",
  description:
    "Real-time crowding-aware journey planning and passenger comfort metrics across Delhi NCR",
  version: "GTFS Model v1.0",
  latestVersion: "v1.0",
  currentModel: "Delhi Transit Authority",
  currentVersion: "v1.0",
  latestUpdate: "Peak load propagation active",
  coverage: "100%",
  lastPublished: "Just now",
  openIssues: 0,
};

export const modelWorkflowStatuses = {
  publication: "GTFS + Live Crowd Model",
  validation: "Delhi NCR Corridors",
  review: "Live Telemetry",
};

export const modellingActions: ModellingAction[] = [
  {
    title: "Route Comparison",
    description: "Compare ETA, comfort score, and occupancy across candidate routes",
    icon: "comparison",
  },
  {
    title: "Crowdsourced Reports",
    description: "Live passenger check-ins with automated downstream cascade",
    icon: "database",
  },
];

export const networkRegions: NetworkRegion[] = [
  {
    name: "West Delhi Corridor",
    legendName: "Uttam Nagar - CP",
    color: "blue",
    position: "west",
  },
  {
    name: "North-South Corridor",
    legendName: "Kashmere Gate - Nehru Place",
    color: "purple",
    position: "central",
  },
  {
    name: "East-South Corridor",
    legendName: "Anand Vihar - Saket",
    color: "red",
    position: "north-east",
  },
  {
    name: "South Central Corridor",
    legendName: "Hauz Khas - Rajiv Chowk",
    color: "green",
    position: "south-east",
  },
];

export type GridAsset = {
  id: string;
  name: string;
  voltage: string;
  equipmentCount: number;
  mapPosition: {
    x: number;
    y: number;
  };
};

export const flexibilityDashboard = {
  regionName: "Delhi NCR",
  assetType: "Transit Hub",
  substationCount: 42,
  mappedSubstationCount: 42,
  locationCount: 4,
  attributionCompany: "Delhi Transit Authority",
  attributionProduct: "CrowdPlanner",
  voltageLevels: ["Metro Interchange", "Bus Terminal"],
  coordinates: "28.6139, 77.2090",
};

export const gridAssets: GridAsset[] = [
  {
    id: "uttam-nagar",
    name: "Uttam Nagar",
    voltage: "Metro Line 3",
    equipmentCount: 26,
    mapPosition: { x: 30, y: 50 },
  },
  {
    id: "connaught-place",
    name: "Connaught Place",
    voltage: "Yellow/Blue Line",
    equipmentCount: 42,
    mapPosition: { x: 60, y: 48 },
  },
  {
    id: "kashmere-gate",
    name: "Kashmere Gate ISBT",
    voltage: "Triple Interchange",
    equipmentCount: 38,
    mapPosition: { x: 62, y: 32 },
  },
  {
    id: "nehru-place",
    name: "Nehru Place",
    voltage: "Violet Line",
    equipmentCount: 28,
    mapPosition: { x: 68, y: 75 },
  },
  {
    id: "anand-vihar",
    name: "Anand Vihar ISBT",
    voltage: "Blue/Pink Line",
    equipmentCount: 36,
    mapPosition: { x: 82, y: 44 },
  },
  {
    id: "saket",
    name: "Saket",
    voltage: "Yellow Line",
    equipmentCount: 22,
    mapPosition: { x: 58, y: 84 },
  },
  {
    id: "hauz-khas",
    name: "Hauz Khas",
    voltage: "Yellow/Magenta Line",
    equipmentCount: 32,
    mapPosition: { x: 55, y: 78 },
  },
  {
    id: "rajiv-chowk",
    name: "Rajiv Chowk",
    voltage: "Central Hub",
    equipmentCount: 45,
    mapPosition: { x: 61, y: 47 },
  },
];

export const voltageLevelFilters = [
  { id: "green", label: "Green (< 50% Seats Available)", color: "green" },
  { id: "yellow", label: "Yellow (50-80% Standing)", color: "yellow" },
  { id: "red", label: "Red (> 80% Packed)", color: "red" },
  { id: "metro", label: "Metro Hubs", color: "blue" },
  { id: "terminal", label: "Bus Terminals", color: "neutral" },
  { id: "feeder", label: "EV Feeders", color: "brown" },
] as const;
