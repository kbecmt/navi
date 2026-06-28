const assert = require('assert');
const core = require('../navi-core');

const route = [
    { lat: 52.0, lng: 21.0 },
    { lat: 52.0, lng: 21.01 },
    { lat: 52.0, lng: 21.02 }
];

const metrics = core.buildCumulativeDists(route);
assert.strictEqual(metrics.cumulative.length, route.length);
assert(metrics.total > 1.2 && metrics.total < 1.5, 'route total should be about 1.37 km at Warsaw latitude');

const projected = core.projectPointToRoute(52.0004, 21.01, route, metrics.cumulative);
assert(projected.distanceFromRoute > 0.03 && projected.distanceFromRoute < 0.06, 'projection should report lateral distance');
assert(projected.percent > 45 && projected.percent < 55, 'middle point should be close to 50 percent');
assert(projected.remainingKm > 0.5 && projected.remainingKm < 0.8, 'remaining distance should be half the route');

assert.strictEqual(core.nearestRouteIndex(52.0, 21.019, route, 0), 2);
assert(core.distToCoords(52.0, 21.01, route) < 0.1);

assert.strictEqual(core.isJunctionManeuver('turn', 'left'), true);
assert.strictEqual(core.isJunctionManeuver('turn', 'straight'), false);
assert.strictEqual(core.isJunctionManeuver('continue', 'straight'), false);
assert.strictEqual(core.isJunctionManeuver('roundabout', ''), true);

const summary = core.summarizePois([
    { type: 'camera' },
    { type: 'fuel' },
    { type: 'fuel' },
    { limit: 50 }
]);
assert.strictEqual(summary.total, 4);
assert.strictEqual(summary.camera, 2);
assert.strictEqual(summary.fuel, 2);

console.log('navi core tests ok');
