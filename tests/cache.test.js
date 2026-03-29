const { buildCaches } = require('../js/gtfs/cache');

const mockTrips = [
    { trip_id: 'trip_1', route_id: 'route_525' },
    { trip_id: 'trip_2', route_id: 'route_525' },
    { trip_id: 'trip_3', route_id: 'route_32' }
];

const mockStopTimes = [
    { trip_id: 'trip_1', stop_id: 'stopA', arrival_time: '08:00:00', stop_sequence: '1' },
    { trip_id: 'trip_1', stop_id: 'stopB', arrival_time: '08:15:00', stop_sequence: '2' },
    { trip_id: 'trip_1', stop_id: 'stopC', arrival_time: '08:30:00', stop_sequence: '3' },
    { trip_id: 'trip_2', stop_id: 'stopA', arrival_time: '09:00:00', stop_sequence: '1' },
    { trip_id: 'trip_3', stop_id: 'stopC', arrival_time: '10:00:00', stop_sequence: '1' },
    { trip_id: 'trip_3', stop_id: 'stopA', arrival_time: '10:30:00', stop_sequence: '2' }
];

describe('buildCaches', () => {
    test('creates routeTripIdsCache mapping route to trips', () => {
        const { routeTripIdsCache } = buildCaches(mockTrips, mockStopTimes);
        
        expect(routeTripIdsCache['route_525']).toBeInstanceOf(Set);
        expect(routeTripIdsCache['route_525'].size).toBe(2);
        expect(routeTripIdsCache['route_32']).toBeInstanceOf(Set);
        expect(routeTripIdsCache['route_32'].size).toBe(1);
    });

    test('creates stopTripIdsCache mapping stop to trips', () => {
        const { stopTripIdsCache } = buildCaches(mockTrips, mockStopTimes);
        
        expect(stopTripIdsCache['stopA']).toBeInstanceOf(Set);
        expect(stopTripIdsCache['stopA'].size).toBe(3);
        expect(stopTripIdsCache['stopB'].size).toBe(1);
        expect(stopTripIdsCache['stopC'].size).toBe(2);
    });

    test('creates tripToRouteCache mapping trip to route', () => {
        const { tripToRouteCache } = buildCaches(mockTrips, mockStopTimes);
        
        expect(tripToRouteCache['trip_1'].route_id).toBe('route_525');
        expect(tripToRouteCache['trip_2'].route_id).toBe('route_525');
        expect(tripToRouteCache['trip_3'].route_id).toBe('route_32');
    });

    test('creates tripStopTimesCache with sorted stop times', () => {
        const { tripStopTimesCache } = buildCaches(mockTrips, mockStopTimes);
        
        expect(tripStopTimesCache['trip_1']).toHaveLength(3);
        expect(tripStopTimesCache['trip_1'][0].stop_sequence).toBe('1');
        expect(tripStopTimesCache['trip_1'][1].stop_sequence).toBe('2');
        expect(tripStopTimesCache['trip_1'][2].stop_sequence).toBe('3');
    });

    test('handles empty data', () => {
        const { routeTripIdsCache, stopTripIdsCache, tripToRouteCache, tripStopTimesCache } = buildCaches([], []);
        
        expect(Object.keys(routeTripIdsCache).length).toBe(0);
        expect(Object.keys(stopTripIdsCache).length).toBe(0);
        expect(Object.keys(tripToRouteCache).length).toBe(0);
        expect(Object.keys(tripStopTimesCache).length).toBe(0);
    });
});
