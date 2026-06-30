(function(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.NaviCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function buildCumulativeDists(coords) {
        const cumulative = [0];
        let total = 0;
        for (let i = 1; i < coords.length; i++) {
            total += haversine(coords[i - 1].lat, coords[i - 1].lng, coords[i].lat, coords[i].lng);
            cumulative.push(total);
        }
        return { cumulative, total };
    }

    function projectPointToRoute(lat, lng, coords, cumulativeDists) {
        if (!coords.length) return { percent: 0, doneKm: 0, remainingKm: 0, closestIndex: 0, distanceFromRoute: Infinity, snapped: { lat, lng } };
        const metrics = cumulativeDists && cumulativeDists.length === coords.length ? { cumulative: cumulativeDists, total: cumulativeDists[cumulativeDists.length - 1] || 0 } : buildCumulativeDists(coords);
        let minD = Infinity, closestIndex = 0, bestDone = 0, bestSnap = coords[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const p = coords[i], q = coords[i + 1];
            const dx = q.lng - p.lng, dy = q.lat - p.lat, len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((lng - p.lng) * dx + (lat - p.lat) * dy) / len2)) : 0;
            const snapLat = p.lat + t * dy, snapLng = p.lng + t * dx;
            const d = haversine(lat, lng, snapLat, snapLng);
            if (d < minD) {
                const segmentKm = haversine(p.lat, p.lng, q.lat, q.lng);
                minD = d;
                closestIndex = t >= 0.5 ? i + 1 : i;
                bestDone = (metrics.cumulative[i] || 0) + segmentKm * t;
                bestSnap = { lat: snapLat, lng: snapLng };
            }
        }
        const doneKm = Math.max(0, Math.min(bestDone, metrics.total));
        const remainingKm = Math.max(0, metrics.total - doneKm);
        return {
            percent: metrics.total ? Math.min(100, doneKm / metrics.total * 100) : 0,
            doneKm,
            remainingKm,
            closestIndex,
            distanceFromRoute: minD,
            snapped: bestSnap
        };
    }

    function distToCoords(lat, lng, coords, step) {
        if (!coords.length) return Infinity;
        const sampleStep = step || (coords.length < 80 ? 1 : 3);
        let minD = Infinity;
        for (let i = 0; i < coords.length; i += sampleStep) {
            const d = haversine(lat, lng, coords[i].lat, coords[i].lng);
            if (d < minD) minD = d;
            if (minD < 0.1) return minD;
        }
        return minD;
    }

    function nearestRouteIndex(lat, lng, coords, startIndex) {
        let minD = Infinity, best = startIndex || 0;
        for (let i = Math.max(0, startIndex || 0); i < coords.length; i++) {
            const c = coords[i], d = haversine(lat, lng, c.lat, c.lng);
            if (d < minD) { minD = d; best = i; }
        }
        return best;
    }

    function isJunctionManeuver(type, modifier) {
        const junctionTypes = new Set(['turn', 'roundabout', 'rotary', 'fork', 'merge', 'end of road', 'on ramp', 'off ramp', 'arrive']);
        if (!junctionTypes.has(type)) return false;
        return !(type === 'turn' && (!modifier || modifier === 'straight'));
    }

    function distanceToNextInstructionKm(progress, instructions, cumulativeDists, currentIndex) {
        if (!progress || !instructions || !instructions.length) return Infinity;
        const start = Math.max(0, currentIndex || 0);
        for (let i = start; i < instructions.length; i++) {
            const inst = instructions[i];
            if (!inst) continue;
            const instDone = cumulativeDists && typeof inst.index === 'number' ? cumulativeDists[inst.index] : null;
            const dist = Math.max(0, (typeof instDone === 'number' ? instDone : progress.doneKm) - (progress.doneKm || 0));
            if (dist >= 0) return dist;
        }
        return Infinity;
    }

    function shouldZoomForManeuver(distanceKm, enterKm, exitKm, lastZooming) {
        if (!Number.isFinite(distanceKm)) return false;
        const enter = typeof enterKm === 'number' ? enterKm : 0.35;
        const exit = typeof exitKm === 'number' ? exitKm : 0.08;
        if (distanceKm <= exit) return false;
        return lastZooming ? distanceKm <= enter * 1.25 : distanceKm <= enter;
    }

    function summarizePois(pois) {
        return pois.reduce((acc, poi) => {
            const type = poi.type || (poi.limit ? 'camera' : 'poi');
            acc[type] = (acc[type] || 0) + 1;
            acc.total += 1;
            return acc;
        }, { total: 0 });
    }

    return { haversine, buildCumulativeDists, projectPointToRoute, distToCoords, nearestRouteIndex, isJunctionManeuver, distanceToNextInstructionKm, shouldZoomForManeuver, summarizePois };
});
