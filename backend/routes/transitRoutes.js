import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreRoute, assignDynamicTags } from '../services/scoringEngine.js';
import crowdStore from '../services/crowdStore.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const corridorsFilePath = path.join(__dirname, '../data/corridors.json');

// Load static curated corridors dataset
let corridors = [];
try {
  const rawData = fs.readFileSync(corridorsFilePath, 'utf-8');
  corridors = JSON.parse(rawData);
} catch (err) {
  console.error('Failed to load corridors dataset:', err.message);
  corridors = [];
}

/**
 * Normalizes stop or route ID strings for robust querying
 */
function normalizeId(id) {
  if (!id || typeof id !== 'string') return '';
  return id.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * GET /api/stops
 * Returns unique list of all stops across all corridors
 * Output: [{ id, name, lat, lng, is_metro }, ...]
 */
router.get('/stops', (req, res) => {
  try {
    const stopsMap = new Map();

    corridors.forEach(corridor => {
      corridor.routes.forEach(route => {
        route.stops.forEach(stop => {
          if (!stopsMap.has(stop.id)) {
            stopsMap.set(stop.id, {
              id: stop.id,
              name: stop.name,
              lat: stop.lat,
              lng: stop.lng,
              is_metro: Boolean(stop.is_metro),
              context_tag: stop.context_tag || (stop.is_metro ? 'Metro Interchange' : 'Bus Stop')
            });
          }
        });
      });
    });

    const stops = Array.from(stopsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return res.json(stops);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to retrieve transit stops',
      details: error.message
    });
  }
});

/**
 * GET /api/plan?origin=<id>&destination=<id>&time=<HH:MM>
 * Scores all matching routes between origin and destination.
 */
router.get('/plan', (req, res) => {
  try {
    const { origin, destination, time } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({
        error: "Missing required query parameters: both 'origin' and 'destination' must be provided.",
        example: "/api/plan?origin=uttam_nagar&destination=connaught_place&time=09:15"
      });
    }

    const normOrigin = normalizeId(origin);
    const normDestination = normalizeId(destination);
    const queryTime = (time && typeof time === 'string' && time.trim()) ? time.trim() : '09:15';

    // Find corridor matching origin and destination
    const corridor = corridors.find(c => {
      const matchForward = normalizeId(c.origin.id) === normOrigin && normalizeId(c.destination.id) === normDestination;
      return matchForward;
    });

    if (!corridor) {
      const availablePairs = corridors.map(c => ({
        origin: c.origin,
        destination: c.destination,
        query_sample: `/api/plan?origin=${c.origin.id}&destination=${c.destination.id}&time=09:15`
      }));

      return res.status(404).json({
        error: `No direct corridor found connecting '${origin}' to '${destination}'.`,
        available_corridors: availablePairs
      });
    }

    // Score all routes for this corridor
    const scoredRoutes = corridor.routes.map(route => {
      return scoreRoute(route, queryTime);
    });

    // Assign dynamic tags: FASTEST, MOST COMFORTABLE, OPTIMAL, ALTERNATE
    const taggedRoutes = assignDynamicTags(scoredRoutes);

    return res.json({
      query: {
        origin: corridor.origin.name,
        destination: corridor.destination.name,
        time: queryTime
      },
      routes: taggedRoutes
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to score journey routes',
      details: error.message
    });
  }
});

/**
 * POST /api/report-crowd
 * Accepts: { "route_id": string, "stop_id": string, "reported_level": "LOW" | "MEDIUM" | "HIGH" }
 * Updates in-memory store and returns active reports count
 */
router.post('/report-crowd', (req, res) => {
  try {
    const { route_id, stop_id, reported_level } = req.body || {};

    if (!route_id || !stop_id || !reported_level) {
      return res.status(400).json({
        error: "Missing required fields: 'route_id', 'stop_id', and 'reported_level' are required.",
        expected_format: {
          route_id: "route_729",
          stop_id: "rajouri_garden",
          reported_level: "HIGH" // "LOW" | "MEDIUM" | "HIGH"
        }
      });
    }

    crowdStore.addReport({ route_id, stop_id, reported_level });

    return res.json({
      success: true,
      message: 'Crowd report recorded',
      active_reports_count: crowdStore.getCount()
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to record crowd report',
      details: error.message
    });
  }
});

/**
 * POST /api/reset
 * Clears all in-memory liveCrowdOffsets
 */
router.post('/reset', (req, res) => {
  try {
    crowdStore.reset();
    return res.json({
      success: true,
      message: 'In-memory crowd reports reset',
      active_reports_count: 0
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to reset crowd reports',
      details: error.message
    });
  }
});

/**
 * GET /api/corridors
 * Convenience endpoint to list all available corridors with metadata
 */
router.get('/corridors', (req, res) => {
  const summary = corridors.map(c => ({
    id: c.id,
    origin: c.origin,
    destination: c.destination,
    routes_count: c.routes.length,
    routes: c.routes.map(r => ({
      id: r.id,
      name: r.name,
      bus_numbers: r.bus_numbers,
      eta_minutes: r.eta_minutes,
      transfers: r.transfers,
      headway_mins: r.headway_mins,
      stop_count: r.stops.length
    }))
  }));
  return res.json(summary);
});

export default router;
