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
