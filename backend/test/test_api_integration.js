process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';

let serverInstance;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      const port = serverInstance.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => {
    serverInstance.close(resolve);
  });
});

test('GET /health returns status ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { status: 'ok' });
});

test('GET /api/stops returns unique list of Delhi transit stops with coordinates', async () => {
  const res = await fetch(`${baseUrl}/api/stops`);
  assert.equal(res.status, 200);
  const stops = await res.json();
  assert.ok(Array.isArray(stops));
  assert.ok(stops.length > 15);

  const uttamNagar = stops.find(s => s.id === 'uttam_nagar');
  assert.ok(uttamNagar);
  assert.equal(uttamNagar.name, 'Uttam Nagar');
  assert.ok(typeof uttamNagar.lat === 'number');
  assert.ok(typeof uttamNagar.lng === 'number');
  assert.equal(uttamNagar.is_metro, true);
});

test('GET /api/plan?origin=uttam_nagar&destination=connaught_place&time=09:15', async () => {
  const res = await fetch(`${baseUrl}/api/plan?origin=uttam_nagar&destination=connaught_place&time=09:15`);
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.query.origin, 'Uttam Nagar');
  assert.equal(data.query.destination, 'Connaught Place');
  assert.equal(data.query.time, '09:15');
  assert.ok(Array.isArray(data.routes));
  assert.equal(data.routes.length, 3);

  const direct = data.routes.find(r => r.id === 'route_729');
  assert.ok(direct);
  assert.equal(direct.tag, 'FASTEST');
  assert.deepEqual(direct.bus_numbers, ['729']);
  assert.equal(direct.transfers, 0);
  assert.ok(direct.overall_occupancy_pct >= 80);
  assert.equal(direct.status, 'RED');
  assert.ok(direct.comfort_score > 0);

  const firstStop = direct.stops[0];
  assert.equal(firstStop.id, 'uttam_nagar');
  assert.ok(typeof firstStop.load_pct === 'number');
  assert.equal(firstStop.is_metro, true);

  const alternate = data.routes.find(r => r.id === 'route_740_522');
  assert.ok(alternate);
  assert.equal(alternate.tag, 'MOST COMFORTABLE');
  assert.ok(alternate.comfort_score > direct.comfort_score);

  const waitSit = data.routes.find(r => r.id === 'route_729_wait12');
  assert.ok(waitSit);
  assert.equal(waitSit.tag, 'ALTERNATE');
});

test('POST /api/report-crowd and POST /api/reset', async () => {
  // Step 1: Submit a crowd report
  const reportRes = await fetch(`${baseUrl}/api/report-crowd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route_id: 'route_729',
      stop_id: 'rajouri_garden',
      reported_level: 'HIGH'
    })
  });
  assert.equal(reportRes.status, 200);
  const reportData = await reportRes.json();
  assert.equal(reportData.success, true);
  assert.equal(reportData.message, 'Crowd report recorded');
  assert.ok(reportData.active_reports_count >= 1);

  // Step 2: Reset reports
  const resetRes = await fetch(`${baseUrl}/api/reset`, { method: 'POST' });
  assert.equal(resetRes.status, 200);
  const resetData = await resetRes.json();
  assert.equal(resetData.success, true);
  assert.equal(resetData.active_reports_count, 0);
});

test('GET /api/plan returns 400 for missing origin or destination', async () => {
  const res = await fetch(`${baseUrl}/api/plan?origin=uttam_nagar`);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test('GET /api/plan returns 404 for unknown corridor with available corridors listed', async () => {
  const res = await fetch(`${baseUrl}/api/plan?origin=random_place&destination=another_place`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(data.error);
  assert.ok(Array.isArray(data.available_corridors));
  assert.equal(data.available_corridors.length, 4);
});
