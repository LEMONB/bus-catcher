import { Stop, Point } from '../utils/time';
import { BusOption } from '../routing/finder';
import { getFavorites, Favorite } from '../state/favorites';

export function renderBuses(
    buses: BusOption[],
    stopA: Stop | null,
    stopB: Stop | null,
    homePoint: Point | null,
    onRouteClick: ((bus: BusOption) => void) | null,
    onFavoriteClick: (((stopA: Stop | null, stopB: Stop | null, homePoint: Point | null) => void) | null)
): void {
    const container = document.getElementById('routes-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (buses.length === 0) {
        container.innerHTML = '<p style="color:#999;">Маршруты не найдены</p>';
        return;
    }
    
    const favorites = getFavorites();
    const isFavorite = (fav: Favorite) => fav.stopA?.stop_id === stopA?.stop_id && fav.stopB?.stop_id === stopB?.stop_id;
    
    buses.forEach((bus) => {
        const div = document.createElement('div');
        div.className = 'bus-item';
        div.onclick = (e) => {
            if ((e.target as HTMLElement).classList.contains('favorite-btn')) return;
            if (onRouteClick) onRouteClick(bus);
        };
        
        const isFav = favorites.some(isFavorite);
        
        div.innerHTML = `
            <span class="bus-number">${bus.route?.route_short_name || '?'}</span>
            <span class="bus-time">через ${bus.waitTimeMinutes} мин</span>
            <span class="bus-walk">(${bus.walkTimeMinutes} мин пешком)</span>
            <span class="bus-status ${bus.canMakeIt ? 'success' : 'danger'}">${bus.canMakeIt ? '✓' : '✗'}</span>
            <span class="bus-destination">${stopA?.stop_name || ''} → ${stopB?.stop_name || ''}</span>
            <button class="favorite-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}">${isFav ? '★' : '☆'}</button>
        `;
        
        const favBtn = div.querySelector('.favorite-btn');
        favBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onFavoriteClick) onFavoriteClick(stopA, stopB, homePoint);
        });
        
        container.appendChild(div);
    });
}

export function updateUIForStep(step: number): void {
    const stepHome = document.getElementById('step-home');
    const stepStopA = document.getElementById('step-stopA');
    const stepStopB = document.getElementById('step-stopB');
    const routesList = document.getElementById('routes-list');
    
    if (step === 1) {
        if (stepHome) stepHome.classList.remove('hidden');
        if (stepStopA) stepStopA.classList.add('hidden');
        if (stepStopB) stepStopB.classList.add('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 2) {
        if (stepHome) stepHome.classList.add('hidden');
        if (stepStopA) stepStopA.classList.remove('hidden');
        if (stepStopB) stepStopB.classList.add('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 3) {
        if (stepHome) stepHome.classList.add('hidden');
        if (stepStopA) stepStopA.classList.add('hidden');
        if (stepStopB) stepStopB.classList.remove('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 4) {
        if (stepHome) stepHome.classList.add('hidden');
        if (stepStopA) stepStopA.classList.add('hidden');
        if (stepStopB) stepStopB.classList.add('hidden');
        if (routesList) routesList.classList.remove('hidden');
    }
}
