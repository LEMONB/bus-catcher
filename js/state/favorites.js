const FAVORITES_KEY = 'buscatcher_favorites';

function getFavorites() {
    if (typeof localStorage === 'undefined') return [];
    
    const data = localStorage.getItem(FAVORITES_KEY);
    if (!data) return [];
    
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveFavorite(favorite) {
    const favorites = getFavorites();
    
    const existingIndex = favorites.findIndex(f => f.id === favorite.id);
    if (existingIndex >= 0) {
        favorites[existingIndex] = favorite;
    } else {
        favorites.push(favorite);
    }
    
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function removeFavorite(id) {
    const favorites = getFavorites();
    const filtered = favorites.filter(f => f.id !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
}

module.exports = { getFavorites, saveFavorite, removeFavorite };
