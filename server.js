import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import transitRouter from './routes/transitRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json());

// Request logger for debugging & hackathon demo visibility
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Root / Welcome info
app.get('/', (req, res) => {
  res.json({
    name: 'Crowdedness-Aware Journey Planner API (Delhi Transit)',
    version: '1.0.0',
    documentation: {
      health: 'GET /health',
      stops: 'GET /api/stops',
      plan: 'GET /api/plan?origin=<id>&destination=<id>&time=<HH:MM>',
      report_crowd: 'POST /api/report-crowd',
      reset: 'POST /api/reset',
      corridors: 'GET /api/corridors'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Transit routes
app.use('/api', transitRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Start server only when executed directly (not when imported in tests)
let server = null;
const isDirectExecution = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('server.js')
);

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(` Comfort-Route Backend Server is running!`);
    console.log(` Port:    ${PORT}`);
    console.log(` Health:  http://localhost:${PORT}/health`);
    console.log(` Stops:   http://localhost:${PORT}/api/stops`);
    console.log(` Plan:    http://localhost:${PORT}/api/plan?origin=uttam_nagar&destination=connaught_place&time=09:15`);
    console.log(`========================================================`);
  });
}

export default app;
export { server };
