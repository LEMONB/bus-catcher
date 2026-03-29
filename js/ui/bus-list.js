let getFavorites = null;
let saveFavoriteFn = null;
let removeFavoriteFn = null;

try {
    const favoritesModule = require('../state/favorites');
    getFavorites = favoritesModule.getFavorites;
    saveFavoriteFn = favoritesModule.saveFavorite;
    removeFavoriteFn = favoritesModule.removeFavorite;
} catch (e) {
    console.warn('Favorites module not available');
}

function renderBuses(buses, stopA, stopB, homePoint, onRouteClick, onFavoriteClick) {
    const container = document.getElementById('routes-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (buses.length === 0) {
        container.innerHTML = '<p style="color:#999;">Маршруты не найдены</p>';
        return;
    }
    
    const favorites = getFavorites ? getFavorites() : [];
    const isFavorite = (fav) => fav.stopA?.stop_id === stopA?.stop_id && fav.stopB?.stop_id === stopB?.stop_id;
    
    buses.forEach((bus, index) => {
        const div = document.createElement('div');
        div.className = 'bus-item';
        div.onclick = (e) => {
            if (e.target.classList.contains('favorite-btn')) return;
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
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onFavoriteClick) onFavoriteClick(stopA, stopB, homePoint);
        });
        
        container.appendChild(div);
    });
}

function showEmptyMessage(message = 'Маршруты не найдены') {
    const container = document.getElementById('routes-container');
    if (!container) return;
    container.innerHTML = `<p style="color:#999;">${message}</p>`;
}

function updateUIForStep(step) {
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

function showLoading(msg) {
    const div = document.createElement('div');
    div.id = 'loading';
    div.innerHTML = msg;
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:18px;z-index:1000;';
    document.body.appendChild(div);
    return div;
}

function updateProgress(processed, total) {
    const el = document.getElementById('loading');
    if (!el) return;
    const percent = Math.round((processed / total) * 100);
    el.innerHTML = `
        <div>Поиск маршрутов...</div>
        <div style="margin-top:10px;font-size:14px;color:#666;">Обработано ${processed} из ${total} (${percent}%)</div>
        <div style="margin-top:10px;width:200px;height:8px;background:#eee;border-radius:4px;overflow:hidden;">
            <div style="width:${percent}%;height:100%;background:#4CAF50;transition:width 0.2s;"></div>
        </div>
    `;
}

function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.remove();
}

module.exports = {
    renderBuses,
    showEmptyMessage,
    updateUIForStep,
    showLoading,
    updateProgress,
    hideLoading
};
