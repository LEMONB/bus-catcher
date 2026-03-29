const { parseCSV } = require('../js/gtfs/parser');

describe('parseCSV', () => {
    test('parses simple CSV', () => {
        const csv = '"id","name"\n"1","Test"';
        const result = parseCSV(csv);
        
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
        expect(result[0].name).toBe('Test');
    });

    test('parses CSV with quoted fields containing commas', () => {
        const csv = '"id","name"\n"1","Test, Name"';
        const result = parseCSV(csv);
        
        expect(result[0].name).toBe('Test, Name');
    });

    test('handles empty values', () => {
        const csv = '"id","name","desc"\n"1","Test",""';
        const result = parseCSV(csv);
        
        expect(result[0].desc).toBe('');
    });

    test('handles GTFS stops format', () => {
        const csv = '"stop_id","stop_name","stop_lat","stop_lon"\n"100457-1009734","Метро «Черкизовская»","55.802164","37.745018"';
        const result = parseCSV(csv);
        
        expect(result).toHaveLength(1);
        expect(result[0].stop_id).toBe('100457-1009734');
        expect(result[0].stop_lat).toBe('55.802164');
    });

    test('parses multiple rows', () => {
        const csv = '"id","name"\n"1","First"\n"2","Second"\n"3","Third"';
        const result = parseCSV(csv);
        
        expect(result).toHaveLength(3);
        expect(result[1].name).toBe('Second');
    });

    test('handles empty CSV', () => {
        const csv = '"id","name"\n';
        const result = parseCSV(csv);
        
        expect(result).toHaveLength(0);
    });

    test('handles Russian text', () => {
        const csv = '"stop_id","stop_name"\n"1","Остановка"';
        const result = parseCSV(csv);
        
        expect(result[0].stop_name).toBe('Остановка');
    });
});
