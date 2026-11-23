import test from 'node:test';
import assert from 'node:assert/strict';
import { getTemporalPeakFactor, getHeadwayPenalty, scoreRoute, assignDynamicTags } from '../services/scoringEngine.js';
import crowdStore from '../services/crowdStore.js';
import fs from 'node:fs';

const corridors = JSON.parse(fs.readFileSync('./data/corridors.json', 'utf-8'));

test('Corridors dataset contains 4 major Delhi corridors with at least 2 routes each', () => {
  assert.equal(corridors.length, 4);

  const corridorPairs = corridors.map(c => `${c.origin.id}->${c.destination.id}`);
  assert.ok(corridorPairs.includes('uttam_nagar->connaught_place'));
  assert.ok(corridorPairs.includes('kashmere_gate->nehru_place'));
  assert.ok(corridorPairs.includes('anand_vihar->saket'));
  assert.ok(corridorPairs.includes('hauz_khas->rajiv_chowk'));

  corridors.forEach(c => {
    assert.ok(c.routes.length >= 2, `Corridor ${c.id} should have at least 2 routes`);
    c.routes.forEach(r => {
      assert.ok(r.stops.length >= 2, `Route ${r.id} should have stops`);
      r.stops.forEach(s => {
        assert.ok(s.id, 'Stop must have id');
        assert.ok(s.name, 'Stop must have name');
        assert.ok(typeof s.lat === 'number', 'Stop must have numerical lat');
        assert.ok(typeof s.lng === 'number', 'Stop must have numerical lng');
        assert.ok(typeof s.is_metro === 'boolean', 'Stop must have boolean is_metro');
        assert.ok(typeof s.base_weight === 'number', 'Stop must have base_weight');
      });
    });
  });
});

test('Temporal Peak Factor behaves deterministically', () => {
  // Morning peak at 09:30 should be ~35%
  const peakMorning = getTemporalPeakFactor('09:30');
  assert.ok(peakMorning >= 34.5 && peakMorning <= 35.5, `09:30 morning peak should be ~35%, got ${peakMorning}`);

  // Morning rush around 09:15 should be high (~33%)
  const morning915 = getTemporalPeakFactor('09:15');
  assert.ok(morning915 >= 30, `09:15 factor should be > 30%, got ${morning915}`);

  // Evening peak at 18:30 should be ~40%
  const peakEvening = getTemporalPeakFactor('18:30');
  assert.ok(peakEvening >= 39.5 && peakEvening <= 40.5, `18:30 evening peak should be ~40%, got ${peakEvening}`);

  // Afternoon off-peak at 14:00 should be ~5%
  const afternoonOffPeak = getTemporalPeakFactor('14:00');
  assert.ok(afternoonOffPeak >= 4.5 && afternoonOffPeak <= 5.5, `14:00 off-peak should be ~5%, got ${afternoonOffPeak}`);
});

test('Headway Penalty calculation', () => {
  assert.equal(getHeadwayPenalty(5), 0);
  assert.equal(getHeadwayPenalty(3), 0);
  assert.equal(getHeadwayPenalty(7), 3);
  assert.equal(getHeadwayPenalty(14), 13.5);
  assert.equal(getHeadwayPenalty(25), 20); // capped at 20
});

test('Scoring Engine scores route with load clamped between 10% and 100%', () => {
  const route729 = corridors[0].routes[0];
  const scored = scoreRoute(route729, '09:15');

  assert.equal(scored.id, 'route_729');
  assert.ok(scored.overall_occupancy_pct >= 10 && scored.overall_occupancy_pct <= 100);
  assert.ok(['GREEN', 'YELLOW', 'RED'].includes(scored.status));
  assert.ok(scored.comfort_score >= 5 && scored.comfort_score <= 99);

  scored.stops.forEach(s => {
    assert.ok(s.load_pct >= 10 && s.load_pct <= 100, `Stop load ${s.load_pct} should be clamped between 10 and 100`);
    assert.ok(typeof s.is_metro === 'boolean');
  });
});

test('Direct vs Alternative route dynamic tags and trade-off', () => {
  const corridor1 = corridors[0];
  const scoredRoutes = corridor1.routes.map(r => scoreRoute(r, '09:15'));
  const tagged = assignDynamicTags(scoredRoutes);

  const direct = tagged.find(r => r.id === 'route_729');
  const alternate = tagged.find(r => r.id === 'route_740_522');

  assert.ok(direct.eta_minutes < alternate.eta_minutes, 'Direct route should have lower ETA');
  assert.equal(direct.tag, 'FASTEST');

  assert.ok(alternate.comfort_score > direct.comfort_score, 'Alternate route should have higher comfort score');
  assert.equal(alternate.tag, 'MOST COMFORTABLE');
});

test('Crowdsourced reporting and downstream cascading', () => {
  crowdStore.reset();
  const route729 = corridors[0].routes[0];

  const beforeScore = scoreRoute(route729, '09:15');
  const stopIndex = 4; // Rajouri Garden
  const targetStopId = route729.stops[stopIndex].id;
  const downstreamStop1 = route729.stops[stopIndex + 1].id;
  const downstreamStop2 = route729.stops[stopIndex + 2].id;

  // Add HIGH report for Rajouri Garden (+25%, cascades +12.5% to next 2 stops)
  crowdStore.addReport({
    route_id: route729.id,
    stop_id: targetStopId,
    reported_level: 'HIGH'
  });

  const afterScore = scoreRoute(route729, '09:15');

  const beforeStop = beforeScore.stops[stopIndex].load_pct;
  const afterStop = afterScore.stops[stopIndex].load_pct;
  assert.ok(afterStop >= beforeStop, 'Reported stop should have higher or equal load');

  // Verify reset clears reports
  crowdStore.reset();
  assert.equal(crowdStore.getCount(), 0);
  const resetScore = scoreRoute(route729, '09:15');
  assert.equal(resetScore.stops[stopIndex].load_pct, beforeStop, 'Stop load should revert after reset');
});
