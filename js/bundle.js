(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{"./gtfs/cache":2,"./gtfs/loader":3,"./gtfs/parser":4,"./map":5,"./routing/availability":6,"./routing/finder":7,"./state/favorites":8,"./state/store":9,"./ui/bus-list":10,"./ui/search":11}],2:[function(require,module,exports){
function buildCaches(tripsData, stopTimesData) {
    const routeTripIdsCache = {};
    const stopTripIdsCache = {};
    const tripToRouteCache = {};
    const tripStopTimesCache = {};
    
    for (const trip of tripsData) {
        const routeId = trip.route_id;
        tripToRouteCache[trip.trip_id] = trip;
        
        if (!routeTripIdsCache[routeId]) {
            routeTripIdsCache[routeId] = new Set();
        }
        routeTripIdsCache[routeId].add(trip.trip_id);
    }
    
    for (const st of stopTimesData) {
        const stopId = st.stop_id;
        const tripId = st.trip_id;
        
        if (!stopTripIdsCache[stopId]) {
            stopTripIdsCache[stopId] = new Set();
        }
        stopTripIdsCache[stopId].add(tripId);
        
        if (!tripStopTimesCache[tripId]) {
            tripStopTimesCache[tripId] = [];
        }
        tripStopTimesCache[tripId].push(st);
    }
    
    for (const tripId in tripStopTimesCache) {
        tripStopTimesCache[tripId].sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
    }
    
    return { routeTripIdsCache, stopTripIdsCache, tripToRouteCache, tripStopTimesCache };
}

module.exports = { buildCaches };

},{}],3:[function(require,module,exports){
const DB_NAME = 'BusCatcherDB';
const DB_VERSION = 2;
const STORE_NAME = 'gtfs';
const FILES_TO_STORE = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times_1.txt', 'stop_times_2.txt', 'stop_times_3.txt'];

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            db.createObjectStore(STORE_NAME);
        };
    });
}

async function hasGTFS() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get('stops.txt');
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

async function saveGTFSFile(filename, content) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(content, filename);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function loadGTFSFile(filename) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(filename);
        request.onsuccess = () => resolve(request.result || '');
        request.onerror = () => reject(request.error);
    });
}

async function downloadGTFS(onProgress) {
    onProgress('Загрузка GTFS данных из статических файлов...');
    
    const total = FILES_TO_STORE.length;
    for (let i = 0; i < FILES_TO_STORE.length; i++) {
        const filename = FILES_TO_STORE[i];
        const response = await fetch(`./data/gtfs/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.status}`);
        }
        const content = await response.text();
        await saveGTFSFile(filename, content);
        onProgress(`Сохранено ${filename} (${i + 1}/${total})`);
    }
}

async function loadStopsAndRoutes(onProgress) {
    const hasData = await hasGTFS();
    
    if (!hasData) {
        await downloadGTFS((progressText) => {
            onProgress(progressText);
        });
    } else {
        onProgress('Загрузка данных из кэша...');
    }
    
    const [stopsText, routesText] = await Promise.all([
        loadGTFSFile('stops.txt'),
        loadGTFSFile('routes.txt')
    ]);
    
    return { stopsText, routesText };
}

async function loadStopTimes(onProgress) {
    onProgress('Загрузка stop_times_1.txt из кэша...');
    const chunk1 = await loadGTFSFile('stop_times_1.txt');
    
    let stopTimesText = '';
    if (chunk1) {
        onProgress('Загрузка stop_times чанков из кэша...');
        const chunks = await Promise.all([
            loadGTFSFile('stop_times_1.txt'),
            loadGTFSFile('stop_times_2.txt'),
            loadGTFSFile('stop_times_3.txt')
        ]);
        stopTimesText = chunks.filter(c => c).join('\n');
    }
    
    onProgress('Загрузка trips.txt из кэша...');
    const tripsText = await loadGTFSFile('trips.txt');
    
    return { stopTimesText, tripsText };
}

module.exports = {
    hasGTFS,
    saveGTFSFile,
    loadGTFSFile,
    downloadGTFS,
    loadStopsAndRoutes,
    loadStopTimes
};

},{}],4:[function(require,module,exports){
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
        if (!line.trim()) return null;
        
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.replace(/"/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.replace(/"/g, ''));
        
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i] || '');
        return obj;
    }).filter(Boolean);
}

function parseCSVWithProgress(text, onProgress) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
            const total = lines.length - 1;
            const result = [];
            
            for (let i = 1; i < lines.length; i++) {
                const values = [];
                let current = '';
                let inQuotes = false;
                
                for (const char of lines[i]) {
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(current.replace(/"/g, ''));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current.replace(/"/g, ''));
                
                const obj = {};
                headers.forEach((h, idx) => obj[h] = values[idx] || '');
                result.push(obj);
                
                if (i % 10000 === 0) {
                    onProgress(Math.round((i / total) * 100));
                }
            }
            
            onProgress(100);
            resolve(result);
        }, 0);
    });
}

module.exports = { parseCSV, parseCSVWithProgress };

},{}],5:[function(require,module,exports){
const Moscow_CENTER = [55.7558, 37.6173];

let map = null;
let stopsLayer = null;
let stopAMarker = null;
let stopBMarker = null;
let homeMarker = null;
let routeLines = [];
let stopsData = [];

function initMap(containerId = 'map') {
    if (map) return map;
    
    map = L.map(containerId).setView(Moscow_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    
    return map;
}

function getMap() {
    return map;
}

function setStopsData(data) {
    stopsData = data;
}

function highlightAvailableStops(availableStopIds) {
    if (!map || !stopsData) return;
    
    if (stopsLayer) map.removeLayer(stopsLayer);
    stopsLayer = L.layerGroup().addTo(map);
    
    let activeTooltip = null;
    
    stopsData.forEach(stop => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            const isAvailable = availableStopIds && availableStopIds.has(stop.stop_id);
            
            const marker = L.circleMarker([lat, lon], {
                radius: isAvailable ? 6 : 4,
                fillColor: isAvailable ? '#2E7D32' : '#9E9E9E',
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            });
            
            marker.on('mouseover', function(e) {
                if (activeTooltip) {
                    activeTooltip.remove();
                }
                const tooltip = document.createElement('div');
                tooltip.className = 'stop-tooltip';
                tooltip.textContent = stop.stop_name + (isAvailable ? '' : ' (недоступно)');
                tooltip.style.left = (e.containerPoint.x + 10) + 'px';
                tooltip.style.top = (e.containerPoint.y - 10) + 'px';
                document.body.appendChild(tooltip);
                activeTooltip = tooltip;
            });
            
            marker.on('mouseout', function() {
                if (activeTooltip) {
                    activeTooltip.remove();
                    activeTooltip = null;
                }
            });
            
            stopsLayer.addLayer(marker);
        }
    });
}

function renderStops() {
    if (!map) return;
    
    if (stopsLayer) map.removeLayer(stopsLayer);
    stopsLayer = L.layerGroup().addTo(map);
    
    let activeTooltip = null;
    
    stopsData.forEach(stop => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            const marker = L.circleMarker([lat, lon], {
                radius: 5,
                fillColor: '#1565C0',
                color: '#ffffff',
                weight: 2,
                fillOpacity: 1
            });
            
            marker.on('mouseover', function(e) {
                if (activeTooltip) {
                    activeTooltip.remove();
                }
                const tooltip = document.createElement('div');
                tooltip.className = 'stop-tooltip';
                tooltip.textContent = stop.stop_name;
                tooltip.style.left = (e.containerPoint.x + 10) + 'px';
                tooltip.style.top = (e.containerPoint.y - 10) + 'px';
                document.body.appendChild(tooltip);
                activeTooltip = tooltip;
            });
            
            marker.on('mouseout', function() {
                if (activeTooltip) {
                    activeTooltip.remove();
                    activeTooltip = null;
                }
            });
            
            stopsLayer.addLayer(marker);
        }
    });
}

function setHomeMarker(point) {
    if (!map) return;
    
    if (homeMarker) map.removeLayer(homeMarker);
    homeMarker = L.marker([point.lat, point.lon], {
        icon: L.divIcon({
            className: 'home-marker',
            html: '🏠',
            iconSize: [30, 30]
        })
    }).addTo(map);
    homeMarker.bindPopup('Отсюда выходите').openPopup();
}

function setStopAMarker(stop) {
    if (!map) return;
    
    if (stopAMarker) map.removeLayer(stopAMarker);
    stopAMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
        icon: L.divIcon({
            className: 'stop-a-marker',
            html: '🚌',
            iconSize: [30, 30]
        })
    }).addTo(map);
    stopAMarker.bindPopup('Остановка: ' + stop.stop_name).openPopup();
}

function setStopBMarker(stop) {
    if (!map) return;
    
    if (stopBMarker) map.removeLayer(stopBMarker);
    stopBMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
        icon: L.divIcon({
            className: 'stop-b-marker',
            html: '🏁',
            iconSize: [30, 30]
        })
    }).addTo(map);
    stopBMarker.bindPopup('Остановка: ' + stop.stop_name).openPopup();
}

function findNearestStop(lat, lon, maxDistanceKm = 0.5) {
    let nearest = null;
    let nearestDist = maxDistanceKm;
    
    for (const stop of stopsData) {
        const stopLat = parseFloat(stop.stop_lat);
        const stopLon = parseFloat(stop.stop_lon);
        const dist = getDistanceBetweenPoints(lat, lon, stopLat, stopLon);
        
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = stop;
        }
    }
    
    return nearest;
}

function showRouteOnMap(routeOption, homePoint) {
    if (!map) return;
    
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    
    const walkToStop = L.polyline([
        [homePoint.lat, homePoint.lon],
        [parseFloat(routeOption.homeStop.stop_lat), parseFloat(routeOption.homeStop.stop_lon)]
    ], {
        color: '#4CAF50',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10'
    }).addTo(map);
    routeLines.push(walkToStop);
    
    if (routeOption.allStopTimes) {
        const idxA = routeOption.allStopTimes.findIndex(st => st.stop_id === routeOption.homeStop.stop_id);
        const idxB = routeOption.allStopTimes.findIndex(st => st.stop_id === routeOption.destStop.stop_id);
        
        if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
            const relevantStops = routeOption.allStopTimes.slice(idxA, idxB + 1);
            
            const busCoords = relevantStops.map(st => {
                const stop = stopsData.find(s => s.stop_id === st.stop_id);
                if (!stop) return null;
                return [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)];
            }).filter(Boolean);
            
            if (busCoords.length > 0) {
                const busRoute = L.polyline(busCoords, {
                    color: '#2196F3',
                    weight: 4,
                    opacity: 0.8
                }).addTo(map);
                routeLines.push(busRoute);
            }
        }
    }
    
    const walkFromStop = L.polyline([
        [parseFloat(routeOption.destStop.stop_lat), parseFloat(routeOption.destStop.stop_lon)],
        [homePoint.lat, homePoint.lon]
    ], {
        color: '#FF9800',
        weight: 3,
        opacity: 0.6,
        dashArray: '5, 5'
    }).addTo(map);
    routeLines.push(walkFromStop);
    
    const allCoords = [
        [homePoint.lat, homePoint.lon],
        [parseFloat(routeOption.homeStop.stop_lat), parseFloat(routeOption.homeStop.stop_lon)],
        [parseFloat(routeOption.destStop.stop_lat), parseFloat(routeOption.destStop.stop_lon)],
        [homePoint.lat, homePoint.lon]
    ];
    
    map.fitBounds(L.latLngBounds(allCoords), { padding: [50, 50] });
}

function clearMarkers() {
    if (map) {
        if (stopAMarker) { map.removeLayer(stopAMarker); stopAMarker = null; }
        if (stopBMarker) { map.removeLayer(stopBMarker); stopBMarker = null; }
        if (homeMarker) { map.removeLayer(homeMarker); homeMarker = null; }
    }
}

function clearRoutes() {
    if (map) {
        routeLines.forEach(l => map.removeLayer(l));
        routeLines = [];
    }
}

function setClickHandler(handler) {
    if (map) {
        map.on('click', handler);
    }
}

function getDistanceBetweenPoints(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = {
    initMap,
    getMap,
    setStopsData,
    renderStops,
    highlightAvailableStops,
    setHomeMarker,
    setStopAMarker,
    setStopBMarker,
    findNearestStop,
    showRouteOnMap,
    clearMarkers,
    clearRoutes,
    setClickHandler
};

},{}],6:[function(require,module,exports){
function getAvailableStopIds(stopAId, caches) {
    const { stopTripIdsCache, tripStopTimesCache } = caches;
    const availableStops = new Set();
    
    const tripIds = stopTripIdsCache[stopAId];
    if (!tripIds) return availableStops;
    
    for (const tripId of tripIds) {
        const tripStops = tripStopTimesCache[tripId];
        if (!tripStops) continue;
        
        const idxA = tripStops.findIndex(st => st.stop_id === stopAId);
        if (idxA < 0) continue;
        
        for (let i = idxA + 1; i < tripStops.length; i++) {
            availableStops.add(tripStops[i].stop_id);
        }
    }
    
    return availableStops;
}

function routeGoesFromAToB(stopAId, stopBId, caches) {
    if (stopAId === stopBId) return false;
    
    const { stopTripIdsCache, tripStopTimesCache } = caches;
    
    const tripIds = stopTripIdsCache[stopAId];
    if (!tripIds) return false;
    
    for (const tripId of tripIds) {
        const tripStops = tripStopTimesCache[tripId];
        if (!tripStops) continue;
        
        const idxA = tripStops.findIndex(st => st.stop_id === stopAId);
        const idxB = tripStops.findIndex(st => st.stop_id === stopBId);
        
        if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
            return true;
        }
    }
    
    return false;
}

module.exports = { getAvailableStopIds, routeGoesFromAToB };

},{}],7:[function(require,module,exports){
const { getWalkTime, timeToSeconds, calculateWaitTime } = require('../utils/time');

const WALKING_SPEED_KMH = 5;

function findBuses(stopA, stopB, homePoint, caches, routesData, currentTime) {
    const { stopTripIdsCache, tripToRouteCache, tripStopTimesCache } = caches;
    
    const stopATripIds = stopTripIdsCache[stopA.stop_id];
    if (!stopATripIds) return [];
    
    const tripsByRoute = {};
    for (const tripId of stopATripIds) {
        const trip = tripToRouteCache[tripId];
        if (!trip) continue;
        
        if (!tripsByRoute[trip.route_id]) {
            tripsByRoute[trip.route_id] = [];
        }
        tripsByRoute[trip.route_id].push(tripId);
    }
    
    const buses = [];
    
    for (const routeId in tripsByRoute) {
        const tripIds = tripsByRoute[routeId];
        let bestTrip = null;
        let bestWaitTime = Infinity;
        
        for (const tripId of tripIds) {
            const tripStops = tripStopTimesCache[tripId];
            if (!tripStops) continue;
            
            const idxA = tripStops.findIndex(st => st.stop_id === stopA.stop_id);
            const idxB = tripStops.findIndex(st => st.stop_id === stopB.stop_id);
            
            if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
                const departureTime = tripStops[idxA].arrival_time;
                const departureSecs = timeToSeconds(departureTime);
                
                const waitTimeSecs = calculateWaitTime(departureSecs, currentTime);
                
                if (waitTimeSecs < bestWaitTime) {
                    bestWaitTime = waitTimeSecs;
                    bestTrip = { tripId, tripStops, departureSecs };
                }
            }
        }
        
        if (bestTrip) {
            const walkTimeMinutes = calculateWalkTime(stopA, homePoint);
            const waitTimeMinutes = Math.floor(bestWaitTime / 60);
            const canMakeIt = waitTimeMinutes > walkTimeMinutes;
            
            const trip = tripToRouteCache[bestTrip.tripId];
            const route = routesData.find(r => r.route_id === routeId);
            
            buses.push({
                route,
                waitTimeMinutes,
                walkTimeMinutes,
                canMakeIt,
                homeStop: stopA,
                destStop: stopB,
                tripId: bestTrip.tripId,
                allStopTimes: bestTrip.tripStops
            });
        }
    }
    
    buses.sort((a, b) => a.waitTimeMinutes - b.waitTimeMinutes);
    
    return buses;
}

function calculateWalkTime(stop, homePt) {
    const R = 6371;
    const dLat = (parseFloat(stop.stop_lat) - homePt.lat) * Math.PI / 180;
    const dLon = (parseFloat(stop.stop_lon) - homePt.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(homePt.lat * Math.PI / 180) * Math.cos(parseFloat(stop.stop_lat) * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = R * c;
    
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

module.exports = { findBuses };

},{"../utils/time":13}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
let state = {
    stopA: null,
    stopB: null,
    homePoint: null,
    step: 1
};

let onStateChange = null;

function getState() {
    return { ...state };
}

function setState(changes) {
    state = { ...state, ...changes };
    if (onStateChange) {
        onStateChange(state);
    }
    return state;
}

function setStopA(stop) {
    setState({ stopA: stop, step: stop ? 3 : state.step });
    updateURL();
}

function setStopB(stop) {
    setState({ stopB: stop, step: stop ? 4 : state.step });
    updateURL();
}

function setHomePoint(point) {
    setState({ homePoint: point, step: point ? 2 : state.step });
    updateURL();
}

function reset() {
    state = {
        stopA: null,
        stopB: null,
        homePoint: null,
        step: 1
    };
    if (onStateChange) {
        onStateChange(state);
    }
    history.replaceState(null, '', window.location.pathname);
}

function updateURL() {
    const params = new URLSearchParams();
    
    if (state.stopA) {
        params.set('stopA', state.stopA.stop_id);
    }
    if (state.stopB) {
        params.set('stopB', state.stopB.stop_id);
    }
    if (state.homePoint) {
        params.set('home', `${state.homePoint.lat},${state.homePoint.lon}`);
    }
    
    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    history.replaceState(null, '', newURL);
}

function loadFromURL(stopsData, callbacks) {
    const params = new URLSearchParams(window.location.search);
    const stopAParam = params.get('stopA');
    const stopBParam = params.get('stopB');
    const homeParam = params.get('home');
    
    let newState = { ...state };
    
    if (stopAParam) {
        const stop = stopsData.find(s => s.stop_id === stopAParam);
        if (stop) {
            newState.stopA = stop;
            if (callbacks.onStopAChange) callbacks.onStopAChange(stop);
        }
    }
    
    if (stopBParam) {
        const stop = stopsData.find(s => s.stop_id === stopBParam);
        if (stop) {
            newState.stopB = stop;
            if (callbacks.onStopBChange) callbacks.onStopBChange(stop);
        }
    }
    
    if (homeParam) {
        const [lat, lon] = homeParam.split(',').map(Number);
        newState.homePoint = { lat, lon };
        if (callbacks.onHomePointChange) callbacks.onHomePointChange({ lat, lon });
    }
    
    if (newState.homePoint && newState.stopA && newState.stopB) newState.step = 4;
    else if (newState.homePoint && newState.stopA) newState.step = 3;
    else if (newState.homePoint) newState.step = 2;
    
    state = newState;
    if (onStateChange) {
        onStateChange(state);
    }
    
    return state;
}

function subscribe(callback) {
    onStateChange = callback;
}

function getStep() {
    if (state.homePoint && state.stopA && state.stopB) return 4;
    if (state.homePoint && state.stopA) return 3;
    if (state.homePoint) return 2;
    return 1;
}

module.exports = {
    getState,
    setState,
    setStopA,
    setStopB,
    setHomePoint,
    reset,
    updateURL,
    loadFromURL,
    subscribe,
    getStep
};

},{}],10:[function(require,module,exports){
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

},{"../state/favorites":8}],11:[function(require,module,exports){
function searchStops(stopsData, query, limit = 10) {
    if (!query || query.trim().length === 0) return [];
    
    const normalizedQuery = query.toLowerCase().trim();
    
    const results = stopsData
        .filter(stop => {
            if (!stop.stop_name) return false;
            const lat = parseFloat(stop.stop_lat);
            const lon = parseFloat(stop.stop_lon);
            return !isNaN(lat) && !isNaN(lon);
        })
        .filter(stop => {
            return stop.stop_name.toLowerCase().includes(normalizedQuery);
        })
        .slice(0, limit);
    
    return results;
}

let modalElement = null;
let inputElement = null;
let resultsElement = null;
let onSelectCallback = null;
let currentStopsData = [];

function createModal() {
    if (modalElement) return;
    
    modalElement = document.createElement('div');
    modalElement.id = 'search-modal';
    modalElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 100px;
        z-index: 2000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        width: 90%;
        max-width: 500px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Поиск остановки';
    title.style.margin = '0 0 15px 0';
    
    inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.placeholder = 'Введите название остановки...';
    inputElement.style.cssText = `
        width: 100%;
        padding: 12px;
        font-size: 16px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
    `;
    
    resultsElement = document.createElement('div');
    resultsElement.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
        margin-top: 10px;
    `;
    
    modalContent.appendChild(title);
    modalContent.appendChild(inputElement);
    modalContent.appendChild(resultsElement);
    modalElement.appendChild(modalContent);
    
    document.body.appendChild(modalElement);
    
    let debounceTimer;
    inputElement.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderResults(inputElement.value);
        }, 200);
    });
    
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearchModal();
        }
    });
    
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) {
            closeSearchModal();
        }
    });
    
    inputElement.focus();
}

function renderResults(query) {
    if (!resultsElement) return;
    
    resultsElement.innerHTML = '';
    
    const results = searchStops(currentStopsData, query);
    
    if (results.length === 0) {
        resultsElement.innerHTML = '<p style="color:#999;padding:10px;">Остановки не найдены</p>';
        return;
    }
    
    results.forEach(stop => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 10px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
        `;
        item.textContent = stop.stop_name;
        
        item.addEventListener('mouseover', () => {
            item.style.background = '#f5f5f5';
        });
        
        item.addEventListener('mouseout', () => {
            item.style.background = 'white';
        });
        
        item.addEventListener('click', () => {
            if (onSelectCallback) {
                onSelectCallback(stop);
            }
            closeSearchModal();
        });
        
        resultsElement.appendChild(item);
    });
}

function openSearchModal(stopsData, onSelect) {
    currentStopsData = stopsData;
    onSelectCallback = onSelect;
    
    createModal();
    inputElement.value = '';
    renderResults('');
}

function closeSearchModal() {
    if (modalElement) {
        modalElement.remove();
        modalElement = null;
        inputElement = null;
        resultsElement = null;
        onSelectCallback = null;
    }
}

function handleKeyboardShortcut(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        return true;
    }
    return false;
}

module.exports = {
    searchStops,
    openSearchModal,
    closeSearchModal,
    handleKeyboardShortcut
};

},{}],12:[function(require,module,exports){
function getDistanceBetweenPoints(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = { getDistanceBetweenPoints };

},{}],13:[function(require,module,exports){
const { getDistanceBetweenPoints } = require('./distance');

const WALKING_SPEED_KMH = 5;

function getWalkTime(stop, homePoint) {
    const dist = getDistanceBetweenPoints(
        homePoint.lat, homePoint.lon,
        parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)
    );
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

function timeToSeconds(timeStr) {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}

function calculateWaitTime(arrivalSeconds, currentTime) {
    if (arrivalSeconds > currentTime) {
        return arrivalSeconds - currentTime;
    }
    return (24 * 3600 - currentTime) + arrivalSeconds;
}

module.exports = { getWalkTime, timeToSeconds, calculateWaitTime };

},{"./distance":12}]},{},[1]);
