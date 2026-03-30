import { loadStopsAndRoutes, loadStopTimes } from './gtfs/loader';
import { parseCSV, parseCSVWithProgress, Record } from './gtfs/parser';
import { buildCaches, Caches } from './gtfs/cache';
import { findBuses, BusOption } from './routing/finder';
import { getAvailableStopIds } from './routing/availability';
import { getState, setStopA, setStopB, setHomePoint, reset as resetStore, loadFromURL, getStep } from './state/store';
import { 
    initMap, setStopsData, renderStops, highlightAvailableStops, 
    setHomeMarker, setStopAMarker, setStopBMarker, findNearestStop, 
    showRouteOnMap, clearMarkers, clearRoutes, setClickHandler 
} from './map';
import { renderBuses, updateUIForStep } from './ui/bus-list';
import { openSearchModal, handleKeyboardShortcut } from './ui/search';
import { getFavorites, saveFavorite, removeFavorite, Favorite } from './state/favorites';
import { Stop, Point } from './utils/time';

let stopsData: Record[] = [];
let routesData: Record[] = [];
let stopTimesData: Record[] = [];
let tripsData: Record[] = [];
let caches: Caches | null = null;
let loadingEl: HTMLElement | null = null;
let availableStopIds: Set<string> | null = null;
let loadingTimeout: ReturnType<typeof setTimeout> | null = null;

function showCornerLoader(text = 'Загрузка...'): void {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.remove('hidden', 'error');
        const textEl = loader.querySelector('.loader-text');
        if (textEl) textEl.textContent = text;
    }
}

function hideCornerLoader(): void {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
}

function showCornerError(text: string): void {
    const loader = document.getElementById('corner-loader');
    if (loader) {
        loader.classList.remove('hidden');
        loader.classList.add('error');
        const textEl = loader.querySelector('.loader-text');
        if (textEl) textEl.textContent = text;
    }
}

function setLoadingTimeout(onTimeout: () => void): void {
    if (loadingTimeout) clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
        onTimeout();
    }, 10000);
}

async function loadGTFS(): Promise<void> {
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
        showCornerError('Ошибка загрузки: ' + (e as Error).message);
    }
}

async function loadSchedule(): Promise<void> {
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
        
        caches = buildCaches(tripsData as any, stopTimesData as any);
        
        console.log('Schedule loaded:', {
            stopTimes: stopTimesData.length,
            trips: tripsData.length
        });
        
        hideCornerLoader();
    } catch (e) {
        console.error('Error loading schedule:', e);
        showCornerError('Ошибка загрузки расписания: ' + (e as Error).message);
        throw e;
    }
    
    hideLoading();
    loadingEl = null;
}

function handleMapClick(e: L.LeafletMouseEvent): void {
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

function setHomePointInternal(lat: number, lon: number): void {
    const point: Point = { lat, lon };
    setHomePoint(point);
    setHomeMarker(point);
    updateUIForStep(getStep());
}

function selectStopA(lat: number, lon: number): void {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    setStopA(stop as Stop);
    setStopAMarker(stop as Stop);
    
    if (stopTimesData.length === 0) {
        showCornerLoader('Загрузка расписания...');
        loadSchedule().then(() => {
            hideCornerLoader();
            updateUIForStepAfterStopA(stop as Stop);
        });
    } else {
        updateUIForStepAfterStopA(stop as Stop);
    }
}

function updateUIForStepAfterStopA(stop: Stop): void {
    if (!caches) {
        caches = buildCaches(tripsData as any, stopTimesData as any);
    }
    availableStopIds = getAvailableStopIds(stop.stop_id, caches);
    
    highlightAvailableStops(availableStopIds);
    
    updateUIForStep(getStep());
}

function selectStopB(lat: number, lon: number): void {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    const state = getState();
    if (stop.stop_id === state.stopA?.stop_id) {
        alert('Выберите другую остановку.');
        return;
    }
    
    if (!caches) {
        caches = buildCaches(tripsData as any, stopTimesData as any);
    }
    
    if (availableStopIds && !availableStopIds.has(stop.stop_id)) {
        alert('От этой остановки нельзя уехать на выбранном маршруте. Выберите другую остановку.');
        return;
    }
    
    setStopB(stop as Stop);
    setStopBMarker(stop as Stop);
    
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

function findAndDisplayBuses(): void {
    const state = getState();
    if (!state.stopA || !state.stopB || !state.homePoint) return;
    
    if (!caches) {
        caches = buildCaches(tripsData as any, stopTimesData as any);
    }
    
    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    const buses = findBuses(state.stopA, state.stopB, state.homePoint, caches, routesData as any, currentTime);
    
    if (buses.length > 0) {
        showRouteOnMap(buses[0], state.homePoint);
    }
    
    renderBuses(buses, state.stopA, state.stopB, state.homePoint, (bus: BusOption) => {
        showRouteOnMap(bus, state.homePoint!);
    }, (stopA: Stop | null, stopB: Stop | null, homePoint: Point | null) => {
        toggleFavorite(stopA, stopB, homePoint);
    });
}

function toggleFavorite(stopA: Stop | null, stopB: Stop | null, homePoint: Point | null): void {
    const favorites = getFavorites();
    const existingIndex = favorites.findIndex(f => f.stopA?.stop_id === stopA?.stop_id && f.stopB?.stop_id === stopB?.stop_id);
    
    if (existingIndex >= 0) {
        removeFavorite(favorites[existingIndex].id);
    } else {
        const name = `${stopA?.stop_name || '?'} → ${stopB?.stop_name || '?'}`;
        saveFavorite({
            id: 'fav_' + Date.now(),
            name: name,
            stopA: stopA!,
            stopB: stopB!,
            homePoint: homePoint!
        });
    }
    
    renderFavorites();
    findAndDisplayBuses();
}

function renderFavorites(): void {
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
        
        div.querySelector('.favorite-name')?.addEventListener('click', () => {
            loadFavoriteRoute(fav);
        });
        
        div.querySelector('.favorite-delete')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFavorite(fav.id);
            renderFavorites();
        });
        
        container.appendChild(div);
    });
}

function loadFavoriteRoute(fav: Favorite): void {
    const stopA = stopsData.find(s => s.stop_id === fav.stopA?.stop_id) as Stop | undefined;
    const stopB = stopsData.find(s => s.stop_id === fav.stopB?.stop_id) as Stop | undefined;
    
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

function openStopSearch(): void {
    openSearchModal(stopsData, (stop: Stop) => {
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

function selectStopAByStop(stop: Stop): void {
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

function selectStopBByStop(stop: Stop): void {
    const state = getState();
    
    if (stop.stop_id === state.stopA?.stop_id) {
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

function init(): void {
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
    
    document.getElementById('reset-btn')?.addEventListener('click', () => {
        reset();
    });
    
    renderFavorites();
}

function reset(): void {
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

export { init, loadGTFS, loadSchedule, findAndDisplayBuses, reset };
