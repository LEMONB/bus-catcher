const { getFavorites, saveFavorite, removeFavorite } = require('../js/state/favorites');

const FAVORITES_KEY = 'buscatcher_favorites';

describe('favorites', () => {
    beforeEach(() => {
        global.localStorage = {
            data: {},
            getItem(key) {
                return this.data[key] || null;
            },
            setItem(key, value) {
                this.data[key] = value;
            },
            removeItem(key) {
                delete this.data[key];
            },
            clear() {
                this.data = {};
            }
        };
    });

    afterEach(() => {
        delete global.localStorage;
    });

    test('getFavorites returns empty array when no favorites', () => {
        const favorites = getFavorites();
        expect(favorites).toEqual([]);
    });

    test('saveFavorite adds a new favorite', () => {
        const favorite = {
            id: 'fav_1',
            name: 'Дом → Работа',
            stopA: { stop_id: 'stopA', stop_name: 'Остановка А' },
            stopB: { stop_id: 'stopB', stop_name: 'Остановка Б' },
            homePoint: { lat: 55.75, lon: 37.61 }
        };
        
        saveFavorite(favorite);
        
        const favorites = getFavorites();
        expect(favorites).toHaveLength(1);
        expect(favorites[0].id).toBe('fav_1');
    });

    test('saveFavorite adds multiple favorites', () => {
        saveFavorite({ id: 'fav_1', name: 'Route 1', stopA: {}, stopB: {}, homePoint: {} });
        saveFavorite({ id: 'fav_2', name: 'Route 2', stopA: {}, stopB: {}, homePoint: {} });
        
        const favorites = getFavorites();
        expect(favorites).toHaveLength(2);
    });

    test('removeFavorite removes a favorite by id', () => {
        saveFavorite({ id: 'fav_1', name: 'Route 1', stopA: {}, stopB: {}, homePoint: {} });
        saveFavorite({ id: 'fav_2', name: 'Route 2', stopA: {}, stopB: {}, homePoint: {} });
        
        removeFavorite('fav_1');
        
        const favorites = getFavorites();
        expect(favorites).toHaveLength(1);
        expect(favorites[0].id).toBe('fav_2');
    });

    test('removeFavorite handles non-existent id', () => {
        saveFavorite({ id: 'fav_1', name: 'Route 1', stopA: {}, stopB: {}, homePoint: {} });
        
        removeFavorite('nonexistent');
        
        const favorites = getFavorites();
        expect(favorites).toHaveLength(1);
    });
});
