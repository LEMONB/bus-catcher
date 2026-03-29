const { getWalkTime, timeToSeconds, calculateWaitTime } = require('../utils/time');

const WALKING_SPEED_KMH = 5;

function findBuses(stopA, stopB, homePoint, caches, routesData, currentTime) {
    const { stopTripIdsCache, tripToRouteCache, tripStopTimesCache } = caches;
    
    const stopATripIds = stopTripIdsCache[stopA.stop_id];
    if (!stopATripIds) return [];
    
    const tripsByRoute = {};
    for (const tripId of stopATripIds) {
        const trip = tripToRouteCache[tripId];
        if (!trip) continue;
        
        if (!tripsByRoute[trip.route_id]) {
            tripsByRoute[trip.route_id] = [];
        }
        tripsByRoute[trip.route_id].push(tripId);
    }
    
    const buses = [];
    
    for (const routeId in tripsByRoute) {
        const tripIds = tripsByRoute[routeId];
        let bestTrip = null;
        let bestWaitTime = Infinity;
        
        for (const tripId of tripIds) {
            const tripStops = tripStopTimesCache[tripId];
            if (!tripStops) continue;
            
            const idxA = tripStops.findIndex(st => st.stop_id === stopA.stop_id);
            const idxB = tripStops.findIndex(st => st.stop_id === stopB.stop_id);
            
            if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
                const departureTime = tripStops[idxA].arrival_time;
                const departureSecs = timeToSeconds(departureTime);
                
                const waitTimeSecs = calculateWaitTime(departureSecs, currentTime);
                
                if (waitTimeSecs < bestWaitTime) {
                    bestWaitTime = waitTimeSecs;
                    bestTrip = { tripId, tripStops, departureSecs };
                }
            }
        }
        
        if (bestTrip) {
            const walkTimeMinutes = calculateWalkTime(stopA, homePoint);
            const waitTimeMinutes = Math.floor(bestWaitTime / 60);
            const canMakeIt = waitTimeMinutes > walkTimeMinutes;
            
            const trip = tripToRouteCache[bestTrip.tripId];
            const route = routesData.find(r => r.route_id === routeId);
            
            buses.push({
                route,
                waitTimeMinutes,
                walkTimeMinutes,
                canMakeIt,
                homeStop: stopA,
                destStop: stopB,
                tripId: bestTrip.tripId,
                allStopTimes: bestTrip.tripStops
            });
        }
    }
    
    buses.sort((a, b) => a.waitTimeMinutes - b.waitTimeMinutes);
    
    return buses;
}

function calculateWalkTime(stop, homePt) {
    const R = 6371;
    const dLat = (parseFloat(stop.stop_lat) - homePt.lat) * Math.PI / 180;
    const dLon = (parseFloat(stop.stop_lon) - homePt.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(homePt.lat * Math.PI / 180) * Math.cos(parseFloat(stop.stop_lat) * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

module.exports = { findBuses };
