const { loadStopsAndRoutes, loadStopTimes } = require('./gtfs/loader');
const { parseCSV, parseCSVWithProgress } = require('./gtfs/parser');
const { buildCaches } = require('./gtfs/cache');
const { findBuses } = require('./routing/finder');
const { getAvailableStopIds, routeGoesFromAToB } = require('./routing/availability');
const { getState, setStopA, setStopB, setHomePoint, reset: resetStore, loadFromURL, getStep } = require('./state/store');
const { initMap, setStopsData, renderStops, highlightAvailableStops, setHomeMarker, setStopAMarker, setStopBMarker, findNearestStop, showRouteOnMap, clearMarkers, clearRoutes, setClickHandler } = require('./map');
const { renderBuses, updateUIForStep, showLoading, hideLoading } = require('./ui/bus-list');
const { openSearchModal, handleKeyboardShortcut, closeSearchModal } = require('./ui/search');
const { getFavorites, saveFavorite, removeFavorite } = require('./state/favorites');

let stopsData = [];
let routesData = [];
let stopTimesData = [];
let tripsData = [];
let caches = null;
let loadingEl = null;
let availableStopIds = null;
let loadingTimeout = null;

function showCornerLoader(text = 'Загрузка...') {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.remove('hidden', 'error');
        const textEl = loader.querySelector('.loader-text');
        if (textEl) textEl.textContent = text;
    }
}

function hideCornerLoader() {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
}

function showCornerError(text) {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.remove('hidden');
        loader.classList.add('error');
        const textEl = loader.querySelector('.loader-text');
        if (textEl) textEl.textContent = text;
    }
}

function setLoadingTimeout(onTimeout) {
    if (loadingTimeout) clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
        onTimeout();
    }, 10000);
}

async function loadGTFS(onProgress) {
    showCornerLoader('Загрузка данных...');
    
    setLoadingTimeout(() => {
        showCornerError('Ошибка загрузки. Проверьте соединение.');
    });
    
    try {
        const { stopsText, routesText } = await loadStopsAndRoutes((text) => {
            const loader = document.getElementById('corner-loader');
            if (loader) {
                const textEl = loader.querySelector('.loader-text');
                if (textEl) textEl.textContent = text;
            }
        });
        
        stopsData = parseCSV(stopsText);
        routesData = parseCSV(routesText);
        
        setStopsData(stopsData);
        renderStops();
        hideCornerLoader();
    } catch (e) {
        console.error('Error loading GTFS:', e);
        showCornerError('Ошибка загрузки: ' + e.message);
    }
}

async function loadSchedule(onProgress) {
    if (stopTimesData.length > 0) return;
    
    showCornerLoader('Загрузка расписания...');
    
    setLoadingTimeout(() => {
        showCornerError('Ошибка загрузки. Проверьте соединение.');
    });
    
    try {
        const { stopTimesText, tripsText } = await loadStopTimes((text) => {
            const loader = document.getElementById('corner-loader');
            if (loader) {
                const textEl = loader.querySelector('.loader-text');
                if (textEl) textEl.textContent = text;
            }
        });
        
        showCornerLoader('Обработка stop_times.txt...');
        stopTimesData = await parseCSVWithProgress(stopTimesText, (percent) => {
            const loader = document.getElementById('corner-loader');
            if (loader) {
                const textEl = loader.querySelector('.loader-text');
                if (textEl) textEl.textContent = `Обработка stop_times.txt... ${percent}%`;
            }
        });
        
        showCornerLoader('Обработка trips.txt...');
        tripsData = await parseCSVWithProgress(tripsText, (percent) => {
            const loader = document.getElementById('corner-loader');
            if (loader) {
                const textEl = loader.querySelector('.loader-text');
                if (textEl) textEl.textContent = `Обработка trips.txt... ${percent}%`;
            }
        });
        
        caches = buildCaches(tripsData, stopTimesData);
        
        console.log('Schedule loaded:', {
            stopTimes: stopTimesData.length,
            trips: tripsData.length
        });
        
        hideCornerLoader();
    } catch (e) {
        console.error('Error loading schedule:', e);
        showCornerError('Ошибка загрузки расписания: ' + e.message);
        throw e;
    }
    
    hideLoading();
    loadingEl = null;
}

function handleMapClick(e) {
    const state = getState();
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    if (!state.homePoint) {
        setHomePointInternal(lat, lon);
        return;
    }
    
    if (!state.stopA) {
        selectStopA(lat, lon);
        return;
    }
    
    if (!state.stopB) {
        selectStopB(lat, lon);
        return;
    }
}

function setHomePointInternal(lat, lon) {
    const point = { lat, lon };
    setHomePoint(point);
    setHomeMarker(point);
    updateUIForStep(getStep());
}

function selectStopA(lat, lon) {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    setStopA(stop);
    setStopAMarker(stop);
    
    if (stopTimesData.length === 0) {
        showCornerLoader('Загрузка расписания...');
        loadSchedule().then(() => {
            hideCornerLoader();
            updateUIForStepAfterStopA(stop);
        });
    } else {
        updateUIForStepAfterStopA(stop);
    }
}

function updateUIForStepAfterStopA(stop) {
    if (!caches) {
        caches = buildCaches(tripsData, stopTimesData);
    }
    availableStopIds = getAvailableStopIds(stop.stop_id, caches);
    
    highlightAvailableStops(availableStopIds);
    
    updateUIForStep(getStep());
}

function selectStopB(lat, lon) {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    const state = getState();
    if (stop.stop_id === state.stopA.stop_id) {
        alert('Выберите другую остановку.');
        return;
    }
    
    if (!caches) {
        caches = buildCaches(tripsData, stopTimesData);
    }
    
    if (availableStopIds && !availableStopIds.has(stop.stop_id)) {
        alert('От этой остановки нельзя уехать на выбранном маршруте. Выберите другую остановку.');
        return;
    }
    
    setStopB(stop);
    setStopBMarker(stop);
    
    renderStops();
    
    if (stopTimesData.length === 0) {
        showCornerLoader('Загрузка расписания...');
        loadSchedule().then(() => {
            hideCornerLoader();
            updateUIForStep(getStep());
            findAndDisplayBuses();
        });
    } else {
        updateUIForStep(getStep());
        findAndDisplayBuses();
    }
}

function findAndDisplayBuses() {
    const state = getState();
    if (!state.stopA || !state.stopB || !state.homePoint) return;
    
    if (!caches) {
        caches = buildCaches(tripsData, stopTimesData);
    }
    
    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    const buses = findBuses(state.stopA, state.stopB, state.homePoint, caches, routesData, currentTime);
    
    if (buses.length > 0) {
        showRouteOnMap(buses[0], state.homePoint);
    }
    
    renderBuses(buses, state.stopA, state.stopB, state.homePoint, (bus) => {
        showRouteOnMap(bus, state.homePoint);
    }, (stopA, stopB, homePoint) => {
        toggleFavorite(stopA, stopB, homePoint);
    });
}

function handleRouteClick(bus) {
    const state = getState();
    showRouteOnMap(bus, state.homePoint);
}

function toggleFavorite(stopA, stopB, homePoint) {
    const favorites = getFavorites();
    const existingIndex = favorites.findIndex(f => f.stopA?.stop_id === stopA?.stop_id && f.stopB?.stop_id === stopB?.stop_id);
    
    if (existingIndex >= 0) {
        removeFavorite(favorites[existingIndex].id);
    } else {
        const name = `${stopA?.stop_name || '?'} → ${stopB?.stop_name || '?'}`;
        saveFavorite({
            id: 'fav_' + Date.now(),
            name: name,
            stopA: stopA,
            stopB: stopB,
            homePoint: homePoint
        });
    }
    
    renderFavorites();
    findAndDisplayBuses();
}

function renderFavorites() {
    const container = document.getElementById('favorites-container');
    const section = document.getElementById('favorites-section');
    if (!container || !section) return;
    
    const favorites = getFavorites();
    
    if (favorites.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    section.classList.remove('hidden');
    container.innerHTML = '';
    
    favorites.forEach(fav => {
        const div = document.createElement('div');
        div.className = 'favorite-item';
        div.innerHTML = `
            <span class="favorite-name">${fav.name}</span>
            <button class="favorite-delete" title="Удалить">✕</button>
        `;
        
        div.querySelector('.favorite-name').addEventListener('click', () => {
            loadFavoriteRoute(fav);
        });
        
        div.querySelector('.favorite-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFavorite(fav.id);
            renderFavorites();
        });
        
        container.appendChild(div);
    });
}

function loadFavoriteRoute(fav) {
    const stopA = stopsData.find(s => s.stop_id === fav.stopA?.stop_id);
    const stopB = stopsData.find(s => s.stop_id === fav.stopB?.stop_id);
    
    if (!stopA || !stopB) {
        alert('Остановки из избранного больше не доступны');
        return;
    }
    
    if (fav.homePoint) {
        setHomePointInternal(fav.homePoint.lat, fav.homePoint.lon);
    }
    
    selectStopAByStop(stopA);
    selectStopBByStop(stopB);
}

function openStopSearch() {
    openSearchModal(stopsData, (stop) => {
        const state = getState();
        
        if (!state.homePoint) {
            alert('Сначала выберите домашнюю точку на карте');
            return;
        }
        
        if (!state.stopA) {
            selectStopAByStop(stop);
        } else if (!state.stopB) {
            selectStopBByStop(stop);
        }
    });
}

function selectStopByStop(stop) {
    const state = getState();
    
    if (!state.stopA) {
        selectStopAByStop(stop);
    } else if (!state.stopB) {
        selectStopBByStop(stop);
    }
}

function selectStopAByStop(stop) {
    setStopA(stop);
    setStopAMarker(stop);
    
    if (stopTimesData.length === 0) {
        showCornerLoader('Загрузка расписания...');
        loadSchedule().then(() => {
            hideCornerLoader();
            updateUIForStepAfterStopA(stop);
        });
    } else {
        updateUIForStepAfterStopA(stop);
    }
}

function selectStopBByStop(stop) {
    const state = getState();
    
    if (stop.stop_id === state.stopA.stop_id) {
        alert('Выберите другую остановку.');
        return;
    }
    
    if (availableStopIds && !availableStopIds.has(stop.stop_id)) {
        alert('От этой остановки нельзя уехать на выбранном маршруте. Выберите другую остановку.');
        return;
    }
    
    setStopB(stop);
    setStopBMarker(stop);
    
    renderStops();
    
    if (stopTimesData.length === 0) {
        showCornerLoader('Загрузка расписания...');
        loadSchedule().then(() => {
            hideCornerLoader();
            updateUIForStep(getStep());
            findAndDisplayBuses();
        });
    } else {
        updateUIForStep(getStep());
        findAndDisplayBuses();
    }
}

function init() {
    initMap('map');
    setClickHandler(handleMapClick);
    
    document.addEventListener('keydown', (e) => {
        if (handleKeyboardShortcut(e)) {
            if (stopsData.length > 0) {
                openStopSearch();
            }
        }
    });
    
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', openStopSearch);
    }
    
    loadGTFS().then(() => {
        const state = loadFromURL(stopsData, {
            onHomePointChange: setHomeMarker,
            onStopAChange: setStopAMarker,
            onStopBChange: setStopBMarker
        });
        
        if (state.step === 4 && stopTimesData.length === 0) {
            showCornerLoader('Загрузка расписания...');
            loadSchedule().then(() => {
                hideCornerLoader();
                updateUIForStep(state.step);
                findAndDisplayBuses();
            });
        } else {
            updateUIForStep(state.step);
            if (state.step === 4) {
                findAndDisplayBuses();
            }
        }
    });
    
    document.getElementById('reset-btn').addEventListener('click', () => {
        reset();
    });
    
    renderFavorites();
}

function reset() {
    resetStore();
    clearMarkers();
    clearRoutes();
    caches = null;
    availableStopIds = null;
    stopTimesData = [];
    tripsData = [];
    
    renderStops();
    renderFavorites();
    
    updateUIForStep(1);
    
    const container = document.getElementById('routes-container');
    if (container) container.innerHTML = '';
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', init);
}

module.exports = { init, loadGTFS, loadSchedule, findAndDisplayBuses, reset };
