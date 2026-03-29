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
