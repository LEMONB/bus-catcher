function buildCaches(tripsData, stopTimesData) {
    const routeTripIdsCache = {};
    const stopTripIdsCache = {};
    const tripToRouteCache = {};
    const tripStopTimesCache = {};
    
    for (const trip of tripsData) {
        const routeId = trip.route_id;
        tripToRouteCache[trip.trip_id] = trip;
        
        if (!routeTripIdsCache[routeId]) {
            routeTripIdsCache[routeId] = new Set();
        }
        routeTripIdsCache[routeId].add(trip.trip_id);
    }
    
    for (const st of stopTimesData) {
        const stopId = st.stop_id;
        const tripId = st.trip_id;
        
        if (!stopTripIdsCache[stopId]) {
            stopTripIdsCache[stopId] = new Set();
        }
        stopTripIdsCache[stopId].add(tripId);
        
        if (!tripStopTimesCache[tripId]) {
            tripStopTimesCache[tripId] = [];
        }
        tripStopTimesCache[tripId].push(st);
    }
    
    for (const tripId in tripStopTimesCache) {
        tripStopTimesCache[tripId].sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    }
    
    return { routeTripIdsCache, stopTripIdsCache, tripToRouteCache, tripStopTimesCache };
}

module.exports = { buildCaches };
