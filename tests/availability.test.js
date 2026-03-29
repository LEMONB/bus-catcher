const { getAvailableStopIds, routeGoesFromAToB } = require('../js/routing/availability');

const mockCaches = {
    stopTripIdsCache: {
        'stopA': new Set(['trip_1', 'trip_2']),
        'stopB': new Set(['trip_1']),
        'stopC': new Set(['trip_1', 'trip_2']),
        'stopD': new Set(['trip_3']),
        'stopE': new Set(['trip_1', 'trip_3'])
    },
    tripStopTimesCache: {
        'trip_1': [
            { stop_id: 'stopA', stop_sequence: '1' },
            { stop_id: 'stopB', stop_sequence: '2' },
            { stop_id: 'stopC', stop_sequence: '3' },
            { stop_id: 'stopE', stop_sequence: '4' }
        ],
        'trip_2': [
            { stop_id: 'stopA', stop_sequence: '1' },
            { stop_id: 'stopC', stop_sequence: '2' }
        ],
        'trip_3': [
            { stop_id: 'stopD', stop_sequence: '1' },
            { stop_id: 'stopE', stop_sequence: '2' }
        ]
    }
};

describe('getAvailableStopIds', () => {
    test('returns stops reachable from stopA via any trip', () => {
        const availableStops = getAvailableStopIds('stopA', mockCaches);
        
        expect(availableStops.has('stopB')).toBe(true);
        expect(availableStops.has('stopC')).toBe(true);
        expect(availableStops.has('stopE')).toBe(true);
        expect(availableStops.has('stopA')).toBe(false);
    });

    test('does not return stops reachable only before stopA', () => {
        const availableStops = getAvailableStopIds('stopB', mockCaches);
        
        expect(availableStops.has('stopA')).toBe(false);
    });

    test('returns empty set for stop with no trips', () => {
        const availableStops = getAvailableStopIds('nonexistent', mockCaches);
        
        expect(availableStops.size).toBe(0);
    });
});

describe('routeGoesFromAToB', () => {
    test('returns true when A comes before B in trip', () => {
        const result = routeGoesFromAToB('stopA', 'stopC', mockCaches);
        
        expect(result).toBe(true);
    });

    test('returns true when A and B are adjacent', () => {
        const result = routeGoesFromAToB('stopA', 'stopB', mockCaches);
        
        expect(result).toBe(true);
    });

    test('returns false when B comes before A in trip', () => {
        const result = routeGoesFromAToB('stopC', 'stopA', mockCaches);
        
        expect(result).toBe(false);
    });

    test('returns false when stops are on different trips', () => {
        const result = routeGoesFromAToB('stopA', 'stopD', mockCaches);
        
        expect(result).toBe(false);
    });

    test('returns false for same stop', () => {
        const result = routeGoesFromAToB('stopA', 'stopA', mockCaches);
        
        expect(result).toBe(false);
    });
});
