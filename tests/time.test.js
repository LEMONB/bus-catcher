const { getWalkTime, timeToSeconds, calculateWaitTime } = require('../js/utils/time');

const WALKING_SPEED_KMH = 5;

describe('getWalkTime', () => {
    const homePoint = { lat: 55.7558, lon: 37.6173 };
    
    test('calculates walk time for nearby stop', () => {
        const stop = { stop_lat: '55.758', stop_lon: '37.619' };
        
        const walkTime = getWalkTime(stop, homePoint);
        
        expect(walkTime).toBeGreaterThan(0);
        expect(walkTime).toBeLessThan(10);
    });

    test('walk time increases with distance', () => {
        const nearStop = { stop_lat: '55.758', stop_lon: '37.619' };
        const farStop = { stop_lat: '55.80', stop_lon: '37.70' };
        
        const nearTime = getWalkTime(nearStop, homePoint);
        const farTime = getWalkTime(farStop, homePoint);
        
        expect(farTime).toBeGreaterThan(nearTime);
    });

    test('returns 0 when stop is same location', () => {
        const stop = { stop_lat: '55.7558', stop_lon: '37.6173' };
        
        const walkTime = getWalkTime(stop, homePoint);
        
        expect(walkTime).toBe(0);
    });
});

describe('timeToSeconds', () => {
    test('converts HH:MM:SS to seconds', () => {
        expect(timeToSeconds('08:30:15')).toBe(8 * 3600 + 30 * 60 + 15);
    });

    test('handles midnight (00:00:00)', () => {
        expect(timeToSeconds('00:00:00')).toBe(0);
    });

    test('handles times without leading zeros', () => {
        expect(timeToSeconds('9:5:5')).toBe(9 * 3600 + 5 * 60 + 5);
    });
});

describe('calculateWaitTime', () => {
    test('calculates wait time when bus is in future', () => {
        const arrivalSeconds = 8 * 3600 + 30 * 60;
        const currentTime = 8 * 3600 + 10 * 60;
        
        const waitTime = calculateWaitTime(arrivalSeconds, currentTime);
        
        expect(waitTime).toBe(20 * 60);
    });

    test('calculates wait time for next day when bus passed', () => {
        const arrivalSeconds = 8 * 3600;
        const currentTime = 23 * 3600;
        
        const waitTime = calculateWaitTime(arrivalSeconds, currentTime);
        
        expect(waitTime).toBe(9 * 3600);
    });

    test('returns next day wait when arrival time equals current time', () => {
        const arrivalSeconds = 8 * 3600;
        const currentTime = 8 * 3600;
        
        const waitTime = calculateWaitTime(arrivalSeconds, currentTime);
        
        expect(waitTime).toBe(24 * 3600);
    });
});
