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
    showLoading('Загрузка данных...');
    
    try {
        const [stopsRes, routesRes] = await Promise.all([
            fetch('data/gtfs/stops.txt'),
            fetch('data/gtfs/routes.txt')
        ]);

        stopsData = await parseCSV(await stopsRes.text());
        routesData = await parseCSV(await routesRes.text());

        renderStops();
    } catch (e) {
        console.error('Error loading GTFS:', e);
        alert('Ошибка загрузки данных');
    }
    
    hideLoading();
}

async function loadSchedule() {
    if (stopTimesData.length > 0) return;
    
    try {
        updateProgressText('Загрузка stop_times.txt...');
        const stopTimesRes = await fetch('data/gtfs/stop_times.txt');
        
        if (!stopTimesRes.ok) {
            throw new Error(`HTTP error! status: ${stopTimesRes.status}`);
        }
        
        const stopTimesText = await stopTimesRes.text();
        updateProgressText('Обработка stop_times.txt...');
        stopTimesData = await parseCSVWithProgress(stopTimesText, (percent) => {
            updateProgressText(`Обработка stop_times.txt... ${percent}%`);
        });
        
        updateProgressText('Загрузка trips.txt...');
        const tripsRes = await fetch('data/gtfs/trips.txt');
        
        if (!tripsRes.ok) {
            throw new Error(`HTTP error! status: ${tripsRes.status}`);
        }
        
        const tripsText = await tripsRes.text();
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
            stopsLayer.addLayer(marker);
        }
    });
}

function handleMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    // Step 1: Select stop A
    if (!stopA) {
        selectStopA(lat, lon);
        return;
    }
    
    // Step 2: Select stop B
    if (!stopB) {
        selectStopB(lat, lon);
        return;
    }
    
    // Step 3: Select home point
    if (!homePoint) {
        selectHomePoint(lat, lon);
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
    
    updateUIForStep(2);
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
    
    updateUIForStep(3);
    updateURL();
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

function updateUIForStep(step) {
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const routesList = document.getElementById('routes-list');
    
    if (step === 1) {
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
        if (step3) step3.classList.add('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 2) {
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');
        if (step3) step3.classList.add('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 3) {
        if (step1) step1.classList.add('hidden');
        if (step2) step1.classList.add('hidden');
        if (step2) step2.classList.add('hidden');
        if (step3) step3.classList.remove('hidden');
        if (routesList) routesList.classList.add('hidden');
    } else if (step === 4) {
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.add('hidden');
        if (step3) step3.classList.add('hidden');
        if (routesList) routesList.classList.remove('hidden');
    }
}

function findAndDisplayBuses() {
    if (!stopA || !stopB || !homePoint) return;
    
    buildCaches();
    
    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    
    // Find all trips that go from stopA to stopB (correct direction)
    const buses = [];
    const seenRoutes = new Set();
    
    const stopATripIds = stopTripIdsCache[stopA.stop_id] || new Set();
    
    for (const tripId of stopATripIds) {
        const trip = tripToRouteCache[tripId];
        if (!trip) continue;
        
        // Skip if already processed this route
        if (seenRoutes.has(trip.route_id)) continue;
        
        const tripStops = tripStopTimesCache[tripId];
        if (!tripStops) continue;
        
        const idxA = tripStops.findIndex(st => st.stop_id === stopA.stop_id);
        const idxB = tripStops.findIndex(st => st.stop_id === stopB.stop_id);
        
        // Must have both stops and A before B
        if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
            seenRoutes.add(trip.route_id);
            
            const departureTime = tripStops[idxA].arrival_time;
            const departureHour = parseInt(departureTime.split(':')[0]);
            let departureSecs = departureHour * 3600 +
                               parseInt(departureTime.split(':')[1]) * 60 +
                               parseInt(departureTime.split(':')[2]);
            
            // Calculate wait time - if bus already passed today, show tomorrow
            let waitTimeMinutes;
            if (departureSecs > currentTime) {
                // Bus comes today
                waitTimeMinutes = Math.floor((departureSecs - currentTime) / 60);
            } else {
                // Bus comes tomorrow
                waitTimeMinutes = Math.floor(((24 * 3600 - currentTime) + departureSecs) / 60);
            }
            const walkTimeMinutes = getWalkTime(stopA, homePoint);
            const canMakeIt = waitTimeMinutes > walkTimeMinutes;
            
            const route = routesData.find(r => r.route_id === trip.route_id);
            
            buses.push({
                route,
                waitTimeMinutes,
                walkTimeMinutes,
                canMakeIt,
                homeStop: stopA,
                destStop: stopB,
                tripId: tripId,
                allStopTimes: tripStops
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

// Keep old function for compatibility
function selectHome(lat, lon) {
    homePoint = { lat, lon };
    
    if (homeMarker) map.removeLayer(homeMarker);
    homeMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'home-marker',
            html: '🏠',
            iconSize: [30, 30]
        })
    }).addTo(map);
    homeMarker.bindPopup('Дом').openPopup();
    
    document.getElementById('step-home').classList.add('hidden');
    document.getElementById('step-destination').classList.remove('hidden');
    
    updateURL();
}

async function selectDestination(lat, lon) {
    destinationPoint = { lat, lon };
    
    if (destinationMarker) map.removeLayer(destinationMarker);
    destinationMarker = L.marker([lat, lon], {
        icon: L.divIcon({
            className: 'dest-marker',
            html: '🎯',
            iconSize: [30, 30]
        })
    }).addTo(map);
    destinationMarker.bindPopup('Назначение').openPopup();
    
    document.getElementById('step-destination').classList.add('hidden');
    document.getElementById('routes-list').classList.remove('hidden');
    
    loadingEl = showLoading('Загрузка расписания...');
    await loadSchedule();
    loadingEl.innerHTML = '<div>Поиск маршрутов...</div>';
    
    const routes = findBestRoutes();
    renderRoutes(routes);
    
    hideLoading();
    loadingEl = null;
    updateURL();
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

function findBestRoutes() {
    buildCaches();
    
    const homeStops = findNearestStops(homePoint.lat, homePoint.lon, 1);
    const destStops = findNearestStops(destinationPoint.lat, destinationPoint.lon, 1);
    
    console.log('Home point:', homePoint);
    console.log('Dest point:', destinationPoint);
    console.log('Home stops:', homeStops.map(s => ({ id: s.stop_id, name: s.stop_name })));
    console.log('Dest stops:', destStops.map(s => ({ id: s.stop_id, name: s.stop_name })));
    
    const now = new Date();
    const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    console.log('Current time (seconds):', currentTime);
    
    const options = [];
    const homeStopIds = new Set(homeStops.map(s => s.stop_id));
    const destStopIds = new Set(destStops.map(s => s.stop_id));
    console.log('Home stop IDs:', Array.from(homeStopIds));
    console.log('Dest stop IDs:', Array.from(destStopIds));
    
    const homeStopTrips = new Set();
    for (const hs of homeStops) {
        if (stopTripIdsCache[hs.stop_id]) {
            for (const tripId of stopTripIdsCache[hs.stop_id]) {
                homeStopTrips.add(tripId);
            }
        }
    }
    console.log('Trips at home stops:', homeStopTrips.size);
    
    const candidateTrips = [];
    const seenRoutes = new Set();
    const MAX_ROUTES = 5;
    const totalTrips = homeStopTrips.size;
    let processed = 0;
    
    for (const tripId of homeStopTrips) {
        if (candidateTrips.length >= MAX_ROUTES) break;
        
        processed++;
        if (processed % 100 === 0 || processed === totalTrips) {
            updateProgress(processed, totalTrips);
        }
        
        const trip = tripToRouteCache[tripId];
        if (!trip) continue;
        
        if (seenRoutes.has(trip.route_id)) continue;
        
        const tripStopTimes = tripStopTimesCache[tripId];
        if (!tripStopTimes) continue;
        
        const homeIdx = tripStopTimes.findIndex(st => homeStopIds.has(st.stop_id));
        const destIdx = tripStopTimes.findIndex(st => destStopIds.has(st.stop_id));
        
        if (homeIdx >= 0 && destIdx >= 0 && homeIdx < destIdx) {
            seenRoutes.add(trip.route_id);
            candidateTrips.push({
                trip,
                homeStop: tripStopTimes[homeIdx],
                destStop: tripStopTimes[destIdx],
                stopTimes: tripStopTimes
            });
        }
    }
    
    for (const ct of candidateTrips) {
        const route = routesData.find(r => r.route_id === ct.trip.route_id);
        if (!route) continue;
        
        const arrivalSecs = parseInt(ct.homeStop.arrival_time.split(':')[0]) * 3600 +
                          parseInt(ct.homeStop.arrival_time.split(':')[1]) * 60 +
                          parseInt(ct.homeStop.arrival_time.split(':')[2]);
        
        if (arrivalSecs <= currentTime) continue;
        
        const walkTimeMinutes = getWalkTime(ct.homeStop.stop_id, homeStops);
        const waitTimeMinutes = Math.floor((arrivalSecs - currentTime) / 60);
        const totalTime = walkTimeMinutes + waitTimeMinutes;
        const canMakeIt = waitTimeMinutes > walkTimeMinutes;
        
        const homeStopObj = stopsData.find(s => s.stop_id === ct.homeStop.stop_id);
        const destStopObj = stopsData.find(s => s.stop_id === ct.destStop.stop_id);
        
        options.push({
            route,
            homeStop: homeStopObj,
            destStop: destStopObj,
            waitTimeMinutes,
            walkTimeMinutes,
            totalTime,
            canMakeIt,
            tripId: ct.trip.trip_id,
            allStopTimes: ct.stopTimes
        });
    }
    
    options.sort((a, b) => a.totalTime - b.totalTime);
    
    const uniqueRoutes = [];
    const seenRouteIds = new Set();
    for (const opt of options) {
        const key = opt.route.route_id;
        if (!seenRouteIds.has(key)) {
            seenRouteIds.add(key);
            uniqueRoutes.push(opt);
        }
    }
    
    console.log('Found routes:', uniqueRoutes.length);
    return uniqueRoutes.slice(0, 5);
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
    if (stopA && stopB && homePoint) step = 4;
    else if (stopA && stopB) step = 3;
    else if (stopA) step = 2;
    
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
