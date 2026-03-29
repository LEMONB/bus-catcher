const { searchStops } = require('../js/ui/search');

const mockStops = [
    { stop_id: '1', stop_name: 'Метро «Владыкино»', stop_lat: '55.8', stop_lon: '37.6' },
    { stop_id: '2', stop_name: 'Метро «Отрадное»', stop_lat: '55.85', stop_lon: '37.65' },
    { stop_id: '3', stop_name: 'Владыкино', stop_lat: '55.81', stop_lon: '37.61' },
    { stop_id: '4', stop_name: 'Остановка 1', stop_lat: '55.75', stop_lon: '37.62' },
    { stop_id: '5', stop_name: 'Метро Черкизовская', stop_lat: '55.80', stop_lon: '37.74' }
];

describe('searchStops', () => {
    test('finds stops by exact name', () => {
        const results = searchStops(mockStops, 'Метро «Владыкино»');
        
        expect(results).toHaveLength(1);
        expect(results[0].stop_id).toBe('1');
    });

    test('finds stops by partial name', () => {
        const results = searchStops(mockStops, 'Владыкино');
        
        expect(results.length).toBeGreaterThan(0);
    });

    test('finds stops case insensitively', () => {
        const results = searchStops(mockStops, 'метро');
        
        expect(results.length).toBe(3);
    });

    test('returns empty array for no matches', () => {
        const results = searchStops(mockStops, 'несуществующая');
        
        expect(results).toHaveLength(0);
    });

    test('returns limited results', () => {
        const results = searchStops(mockStops, 'метро', 2);
        
        expect(results).toHaveLength(2);
    });

    test('filters out stops without required fields', () => {
        const stopsWithBad = [
            { stop_id: '1', stop_name: 'Valid', stop_lat: '55.8', stop_lon: '37.6' },
            { stop_id: '2', stop_name: 'No coords' },
            { stop_id: '3', stop_name: 'Valid 2', stop_lat: '55.9', stop_lon: '37.7' }
        ];
        
        const results = searchStops(stopsWithBad, 'valid');
        
        expect(results).toHaveLength(2);
    });
});
