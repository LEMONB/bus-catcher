import { Caches, StopTime } from '../gtfs/cache';

export function getAvailableStopIds(stopAId: string, caches: Caches): Set<string> {
    const { stopTripIdsCache, tripStopTimesCache } = caches;
    const availableStops = new Set<string>();
    
    const tripIds = stopTripIdsCache[stopAId];
    if (!tripIds) return availableStops;
    
    for (const tripId of tripIds) {
        const tripStops = tripStopTimesCache[tripId];
        if (!tripStops) continue;
        
        const idxA = tripStops.findIndex((st: StopTime) => st.stop_id === stopAId);
        if (idxA < 0) continue;
        
        for (let i = idxA + 1; i < tripStops.length; i++) {
            availableStops.add(tripStops[i].stop_id);
        }
    }
    
    return availableStops;
}

export function routeGoesFromAToB(stopAId: string, stopBId: string, caches: Caches): boolean {
    if (stopAId === stopBId) return false;
    
    const { stopTripIdsCache, tripStopTimesCache } = caches;
    
    const tripIds = stopTripIdsCache[stopAId];
    if (!tripIds) return false;
    
    for (const tripId of tripIds) {
        const tripStops = tripStopTimesCache[tripId];
        if (!tripStops) continue;
        
        const idxA = tripStops.findIndex((st: StopTime) => st.stop_id === stopAId);
        const idxB = tripStops.findIndex((st: StopTime) => st.stop_id === stopBId);
        
        if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
            return true;
        }
    }
    
    return false;
}
