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
