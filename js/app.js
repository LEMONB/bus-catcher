const WALKING_SPEED_KMH = 5;
const Moscow_CENTER = [55.7558, 37.6173];
const STOP_CLICK_RADIUS_PX = 30;

let map;
let stopsLayer = null;
let stopAMarker = null;
let stopBMarker = null;
let homeMarker = null;
let routeLines = [];

let stopA = null;
let stopB = null;
let homePoint = null;
let loadingEl = null;

let stopsData = [];
let routesData = [];
let stopTimesData = [];
let tripsData = [];

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

async function downloadAndExtractGTFS(onProgress) {
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

async function init() {
    map = L.map('map').setView(Moscow_CENTER, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', handleMapClick);

    await loadGTFS();
    loadFromURL();
    
    updateUIForStep(1);
    
    document.getElementById('reset-btn').addEventListener('click', reset);
}

async function loadGTFS() {
    loadingEl = showLoading('Проверка данных...');
    
    try {
        const hasData = await hasGTFS();
        
        if (!hasData) {
            await downloadAndExtractGTFS((progressText) => {
                updateProgressText(progressText);
            });
        } else {
            updateProgressText('Загрузка данных из кэша...');
        }
        
        const [stopsText, routesText] = await Promise.all([
            loadGTFSFile('stops.txt'),
            loadGTFSFile('routes.txt')
        ]);

        stopsData = await parseCSV(stopsText);
        routesData = await parseCSV(routesText);

        renderStops();
    } catch (e) {
        console.error('Error loading GTFS:', e);
        alert('Ошибка загрузки данных: ' + e.message);
    }
    
    hideLoading();
}

async function loadStopTimesWithChunks() {
    updateProgressText('Загрузка stop_times_1.txt из кэша...');
    const chunk1 = await loadGTFSFile('stop_times_1.txt');
    
    if (chunk1) {
        updateProgressText('Загрузка stop_times чанков из кэша...');
        const chunks = await Promise.all([
            loadGTFSFile('stop_times_1.txt'),
            loadGTFSFile('stop_times_2.txt'),
            loadGTFSFile('stop_times_3.txt')
        ]);
        return chunks.filter(c => c).join('\n');
    }
    
    return '';
}

async function loadSchedule() {
    if (stopTimesData.length > 0) return;
    
    try {
        updateProgressText('Загрузка stop_times.txt из кэша...');
        const stopTimesText = await loadStopTimesWithChunks();
        
        updateProgressText('Обработка stop_times.txt...');
        stopTimesData = await parseCSVWithProgress(stopTimesText, (percent) => {
            updateProgressText(`Обработка stop_times.txt... ${percent}%`);
        });
        
        updateProgressText('Загрузка trips.txt из кэша...');
        const tripsText = await loadGTFSFile('trips.txt');
        
        updateProgressText('Обработка trips.txt...');
        tripsData = await parseCSVWithProgress(tripsText, (percent) => {
            updateProgressText(`Обработка trips.txt... ${percent}%`);
        });
        
        console.log('Schedule loaded:', {
            stopTimes: stopTimesData.length,
            trips: tripsData.length
        });
    } catch (e) {
        console.error('Error loading schedule:', e);
        alert('Ошибка загрузки расписания: ' + e.message);
        throw e;
    }
}

async function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
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
    });
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

function updateProgressText(text) {
    if (!loadingEl) return;
    loadingEl.innerHTML = `
        <div>${text}</div>
    `;
}

function renderStops() {
    if (stopsLayer) map.removeLayer(stopsLayer);
    stopsLayer = L.layerGroup().addTo(map);
    
    let activeTooltip = null;
    
    stopsData.forEach(stop => {
        const lat = parseFloat(stop.stop_lat);
        const lon = parseFloat(stop.stop_lon);
        
        if (!isNaN(lat) && !isNaN(lon)) {
            const marker = L.circleMarker([lat, lon], {
                radius: 3,
                fillColor: '#2196F3',
                color: '#fff',
                weight: 1,
                fillOpacity: 0.5
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

function handleMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    // Step 1: Select home point
    if (!homePoint) {
        selectHomePoint(lat, lon);
        return;
    }
    
    // Step 2: Select stop A (boarding)
    if (!stopA) {
        selectStopA(lat, lon);
        return;
    }
    
    // Step 3: Select stop B (alighting)
    if (!stopB) {
        selectStopB(lat, lon);
        return;
    }
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

function selectStopA(lat, lon) {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    stopA = stop;
    
    if (stopAMarker) map.removeLayer(stopAMarker);
    stopAMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
        icon: L.divIcon({
            className: 'stop-a-marker',
            html: '🚌',
            iconSize: [30, 30]
        })
    }).addTo(map);
    stopAMarker.bindPopup('Остановка: ' + stop.stop_name).openPopup();
    
    updateUIForStep(3);
    updateURL();
}

function selectStopB(lat, lon) {
    const stop = findNearestStop(lat, lon);
    
    if (!stop) {
        alert('Рядом нет остановки. Кликните ближе к остановке.');
        return;
    }
    
    if (stop.stop_id === stopA.stop_id) {
        alert('Выберите другую остановку.');
        return;
    }
    
    stopB = stop;
    
    if (stopBMarker) map.removeLayer(stopBMarker);
    stopBMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
        icon: L.divIcon({
            className: 'stop-b-marker',
            html: '🏁',
            iconSize: [30, 30]
        })
    }).addTo(map);
    stopBMarker.bindPopup('Остановка: ' + stop.stop_name).openPopup();
    
    // Load schedule if not loaded, then find buses
    if (stopTimesData.length === 0) {
        loadingEl = showLoading('Загрузка расписания...');
        loadSchedule().then(() => {
            hideLoading();
            loadingEl = null;
            updateUIForStep(4);
            findAndDisplayBuses();
            updateURL();
        });
    } else {
        updateUIForStep(4);
        findAndDisplayBuses();
        updateURL();
    }
}

function selectHomePoint(lat, lon) {
    homePoint = { lat, lon };
    
    if (homeMarker) map.removeLayer(homeMarker);
    homeMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'home-marker',
            html: '🏠',
            iconSize: [30, 30]
        })
    }).addTo(map);
    homeMarker.bindPopup('Отсюда выходите').openPopup();
    
    updateUIForStep(2);
    updateURL();
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

function findAndDisplayBuses() {
    if (!stopA || !stopB || !homePoint) return;
    
    buildCaches();
    
    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    const stopATripIds = stopTripIdsCache[stopA.stop_id] || new Set();
    
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
                const [hours, minutes, seconds] = departureTime.split(':').map(Number);
                let departureSecs = hours * 3600 + minutes * 60 + seconds;
                
                let waitTimeSecs;
                if (departureSecs > currentTime) {
                    waitTimeSecs = departureSecs - currentTime;
                } else {
                    waitTimeSecs = (24 * 3600 - currentTime) + departureSecs;
                }
                
                if (waitTimeSecs < bestWaitTime) {
                    bestWaitTime = waitTimeSecs;
                    bestTrip = { tripId, tripStops, departureSecs };
                }
            }
        }
        
        if (bestTrip) {
            const walkTimeMinutes = getWalkTime(stopA, homePoint);
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
    
    // Sort by wait time
    buses.sort((a, b) => a.waitTimeMinutes - b.waitTimeMinutes);
    
    // Draw route on map
    if (buses.length > 0) {
        showRouteOnMap(buses[0]);
    }
    
    // Render bus list
    renderBuses(buses);
}

function getWalkTime(stop, homePt) {
    const dist = getDistanceBetweenPoints(
        homePt.lat, homePt.lon,
        parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)
    );
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

function renderBuses(buses) {
    const container = document.getElementById('routes-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (buses.length === 0) {
        container.innerHTML = '<p style="color:#999;">Маршруты не найдены</p>';
        return;
    }
    
    buses.forEach((bus, index) => {
        const div = document.createElement('div');
        div.className = 'bus-item';
        div.onclick = () => showRouteOnMap(bus);
        div.innerHTML = `
            <span class="bus-number">${bus.route?.route_short_name || '?'}</span>
            <span class="bus-time">через ${bus.waitTimeMinutes} мин</span>
            <span class="bus-walk">(${bus.walkTimeMinutes} мин пешком)</span>
            <span class="bus-status ${bus.canMakeIt ? 'success' : 'danger'}">${bus.canMakeIt ? '✓' : '✗'}</span>
            <span class="bus-destination">${stopA?.stop_name || ''} → ${stopB?.stop_name || ''}</span>
        `;
        container.appendChild(div);
    });
}

let routeTripIdsCache = null;
let stopTripIdsCache = null;
let tripToRouteCache = null;
let tripStopTimesCache = null;

function buildCaches() {
    if (routeTripIdsCache) return;
    
    routeTripIdsCache = {};
    stopTripIdsCache = {};
    tripToRouteCache = {};
    tripStopTimesCache = {};
    
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
    
    console.log('Caches built:', {
        trips: tripsData.length,
        routeTripIds: Object.keys(routeTripIdsCache).length,
        stopTripIds: Object.keys(stopTripIdsCache).length,
        tripToRoute: Object.keys(tripToRouteCache).length,
        tripStopTimes: Object.keys(tripStopTimesCache).length
    });
}

function findNearestStops(lat, lon, count) {
    const stopsWithDist = stopsData.map(stop => {
        const sLat = parseFloat(stop.stop_lat);
        const sLon = parseFloat(stop.stop_lon);
        const dist = getDistanceBetweenPoints(lat, lon, sLat, sLon);
        return { stop, dist };
    });
    
    stopsWithDist.sort((a, b) => a.dist - b.dist);
    return stopsWithDist.slice(0, count).map(s => s.stop);
}

function getWalkTime(stopOrStopId, stopsArray) {
    let stop;
    if (typeof stopOrStopId === 'string') {
        stop = stopsArray.find(s => s.stop_id === stopOrStopId);
    } else {
        stop = stopOrStopId;
    }
    if (!stop) return 0;
    const dist = getDistanceBetweenPoints(
        homePoint.lat, homePoint.lon,
        parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)
    );
    return Math.round((dist / WALKING_SPEED_KMH) * 60);
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

function renderRoutes(routes) {
    console.log('renderRoutes called with:', routes.length, 'routes');
    console.log('First route:', routes[0]);
    
    const container = document.getElementById('routes-container');
    container.innerHTML = '';
    
    if (routes.length === 0) {
        container.innerHTML = '<p style="color:#999;">Маршруты не найдены</p>';
        return;
    }
    
    routes.forEach((r, index) => {
        const div = document.createElement('div');
        div.className = 'bus-item';
        div.onclick = () => showRouteOnMap(r);
        div.innerHTML = `
            <span class="bus-number">${r.route.route_short_name || '?'}</span>
            <span class="bus-time">через ${r.waitTimeMinutes} мин</span>
            <span class="bus-walk">(${r.walkTimeMinutes} мин пешком)</span>
            <span class="bus-status ${r.canMakeIt ? 'success' : 'danger'}">${r.canMakeIt ? '✓' : '✗'}</span>
            <span class="bus-destination">${r.homeStop.stop_name} → ${r.destStop.stop_name}</span>
        `;
        container.appendChild(div);
    });
}

function showRouteOnMap(routeOption) {
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
        const homeIdx = routeOption.allStopTimes.findIndex(st => st.stop_id === routeOption.homeStop.stop_id);
        const relevantStops = routeOption.allStopTimes.slice(homeIdx);
        
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

function showViewMode() {
    document.getElementById('setup-mode').classList.add('hidden');
    document.getElementById('view-mode').classList.remove('hidden');
}

function updateURL() {
    const params = new URLSearchParams();
    
    if (stopA) {
        params.set('stopA', stopA.stop_id);
    }
    if (stopB) {
        params.set('stopB', stopB.stop_id);
    }
    if (homePoint) {
        params.set('home', `${homePoint.lat},${homePoint.lon}`);
    }
    
    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    history.replaceState(null, '', newURL);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    const stopAParam = params.get('stopA');
    const stopBParam = params.get('stopB');
    const homeParam = params.get('home');
    
    if (stopAParam) {
        const stop = stopsData.find(s => s.stop_id === stopAParam);
        if (stop) {
            stopA = stop;
            if (stopAMarker) map.removeLayer(stopAMarker);
            stopAMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
                icon: L.divIcon({ className: 'stop-a-marker', html: '🚌', iconSize: [30, 30] })
            }).addTo(map);
        }
    }
    
    if (stopBParam) {
        const stop = stopsData.find(s => s.stop_id === stopBParam);
        if (stop) {
            stopB = stop;
            if (stopBMarker) map.removeLayer(stopBMarker);
            stopBMarker = L.marker([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)], {
                icon: L.divIcon({ className: 'stop-b-marker', html: '🏁', iconSize: [30, 30] })
            }).addTo(map);
        }
    }
    
    if (homeParam) {
        const [lat, lon] = homeParam.split(',').map(Number);
        homePoint = { lat, lon };
        if (homeMarker) map.removeLayer(homeMarker);
        homeMarker = L.marker([lat, lon], {
            icon: L.divIcon({ className: 'home-marker', html: '🏠', iconSize: [30, 30] })
        }).addTo(map);
    }
    
    // Determine current step based on what's selected
    let step = 1;
    if (homePoint && stopA && stopB) step = 4;
    else if (homePoint && stopA) step = 3;
    else if (homePoint) step = 2;
    
    if (step === 4 && stopTimesData.length === 0) {
        // Need to load schedule first
        loadingEl = showLoading('Загрузка расписания...');
        loadSchedule().then(() => {
            hideLoading();
            loadingEl = null;
            updateUIForStep(step);
            findAndDisplayBuses();
        });
    } else {
        updateUIForStep(step);
        if (step === 4) findAndDisplayBuses();
    }
}

function reset() {
    stopA = null;
    stopB = null;
    homePoint = null;
    
    if (stopAMarker) {
        map.removeLayer(stopAMarker);
        stopAMarker = null;
    }
    if (stopBMarker) {
        map.removeLayer(stopBMarker);
        stopBMarker = null;
    }
    if (homeMarker) {
        map.removeLayer(homeMarker);
        homeMarker = null;
    }
    routeLines.forEach(l => map.removeLayer(l));
    routeLines = [];
    
    routeTripIdsCache = null;
    stopTripIdsCache = null;
    tripToRouteCache = null;
    tripStopTimesCache = null;
    stopTimesData = [];
    tripsData = [];
    
    history.replaceState(null, '', window.location.pathname);
    
    updateUIForStep(1);
    
    const container = document.getElementById('routes-container');
    if (container) container.innerHTML = '';
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
    if (!loadingEl) return;
    const percent = Math.round((processed / total) * 100);
    loadingEl.innerHTML = `
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

init();
