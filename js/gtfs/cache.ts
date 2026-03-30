import { Record as GTFSRecord } from './parser';

export type StopTime = GTFSRecord & {
    trip_id: string;
    stop_id: string;
    arrival_time: string;
    departure_time: string;
    stop_sequence: string;
};

export type Trip = GTFSRecord & {
    trip_id: string;
    route_id: string;
    direction_id?: string;
};

export type Route = GTFSRecord & {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
};

export interface Caches {
    routeTripIdsCache: Record<string, Set<string>>;
    stopTripIdsCache: Record<string, Set<string>>;
    tripToRouteCache: Record<string, Trip>;
    tripStopTimesCache: Record<string, StopTime[]>;
}

export function buildCaches(tripsData: Trip[], stopTimesData: StopTime[]): Caches {
    const routeTripIdsCache: Record<string, Set<string>> = {};
    const stopTripIdsCache: Record<string, Set<string>> = {};
    const tripToRouteCache: Record<string, Trip> = {};
    const tripStopTimesCache: Record<string, StopTime[]> = {};
    
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
        tripStopTimesCache[tripId].sort((a: StopTime, b: StopTime) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    }
    
    return { routeTripIdsCache, stopTripIdsCache, tripToRouteCache, tripStopTimesCache };
}
