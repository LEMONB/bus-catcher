const { getDistanceBetweenPoints } = require('../js/utils/distance');

describe('getDistanceBetweenPoints', () => {
    test('returns 0 for same coordinates', () => {
        const result = getDistanceBetweenPoints(55.7558, 37.6173, 55.7558, 37.6173);
        expect(result).toBeLessThan(0.01);
    });

    test('calculates distance between Moscow center and outskirts', () => {
        const result = getDistanceBetweenPoints(55.7558, 37.6173, 55.802164, 37.745018);
        
        expect(result).toBeGreaterThan(5);
        expect(result).toBeLessThan(15);
    });

    test('distance is symmetric', () => {
        const d1 = getDistanceBetweenPoints(55.7558, 37.6173, 55.80, 37.70);
        const d2 = getDistanceBetweenPoints(55.80, 37.70, 55.7558, 37.6173);
        
        expect(Math.abs(d1 - d2)).toBeLessThan(0.01);
    });

    test('distance is approximately 1km for close points', () => {
        const result = getDistanceBetweenPoints(55.7558, 37.6173, 55.7648, 37.6173);
        
        expect(result).toBeGreaterThan(0.9);
        expect(result).toBeLessThan(1.1);
    });
});
