import { Stop, Point } from '../utils/time';

export interface Favorite {
    id: string;
    name: string;
    stopA: Stop;
    stopB: Stop;
    homePoint: Point;
}

const FAVORITES_KEY = 'buscatcher_favorites';

export function getFavorites(): Favorite[] {
    if (typeof localStorage === 'undefined') return [];
    
    const data = localStorage.getItem(FAVORITES_KEY);
    if (!data) return [];
    
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
}

export function saveFavorite(favorite: Favorite): void {
    const favorites = getFavorites();
    
    const existingIndex = favorites.findIndex(f => f.id === favorite.id);
    if (existingIndex >= 0) {
        favorites[existingIndex] = favorite;
    } else {
        favorites.push(favorite);
    }
    
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function removeFavorite(id: string): void {
    const favorites = getFavorites();
    const filtered = favorites.filter(f => f.id !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
}
