import { getState, setStopA, setStopB, setHomePoint, reset, loadFromURL, getStep } from '../js/state/store';
import { Stop, Point } from '../js/utils/time';

const mockStopA: Stop = { stop_id: 'stopA', stop_name: 'Остановка А', stop_lat: '55.0', stop_lon: '37.0' };
const mockStopB: Stop = { stop_id: 'stopB', stop_name: 'Остановка Б', stop_lat: '55.1', stop_lon: '37.1' };
const mockHomePoint: Point = { lat: 55.5, lon: 37.5 };

describe('getState', () => {
    beforeEach(() => {
        reset();
    });

    test('returns initial state', () => {
        const state = getState();
        expect(state.stopA).toBeNull();
        expect(state.stopB).toBeNull();
        expect(state.homePoint).toBeNull();
        expect(state.step).toBe(1);
    });

    test('returns copy of state (not reference)', () => {
        const state1 = getState();
        state1.step = 999;
        const state2 = getState();
        expect(state2.step).toBe(1);
    });
});

describe('setHomePoint', () => {
    beforeEach(() => {
        reset();
    });

    test('sets homePoint and updates step to 2', () => {
        setHomePoint(mockHomePoint);
        const state = getState();
        expect(state.homePoint).toEqual(mockHomePoint);
        expect(state.step).toBe(2);
    });

    test('clears homePoint when null and resets step to 1', () => {
        setHomePoint(mockHomePoint);
        setHomePoint(null);
        const state = getState();
        expect(state.homePoint).toBeNull();
        expect(state.step).toBe(1);
    });
});

describe('setStopA', () => {
    beforeEach(() => {
        reset();
    });

    test('sets stopA and updates step to 3', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        const state = getState();
        expect(state.stopA).toEqual(mockStopA);
        expect(state.step).toBe(3);
    });

    test('clears stopA when null and resets step to 2', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        setStopA(null);
        const state = getState();
        expect(state.stopA).toBeNull();
        expect(state.step).toBe(2);
    });

    test('allows setting stopA without homePoint (UI responsibility)', () => {
        setStopA(mockStopA);
        const state = getState();
        expect(state.stopA).toEqual(mockStopA);
    });
});

describe('setStopB', () => {
    beforeEach(() => {
        reset();
    });

    test('sets stopB and updates step to 4', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        setStopB(mockStopB);
        const state = getState();
        expect(state.stopB).toEqual(mockStopB);
        expect(state.step).toBe(4);
    });

    test('clears stopB when null and resets step to 3', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        setStopB(mockStopB);
        setStopB(null);
        const state = getState();
        expect(state.stopB).toBeNull();
        expect(state.step).toBe(3);
    });
});

describe('getStep', () => {
    beforeEach(() => {
        reset();
    });

    test('returns 1 when nothing set', () => {
        expect(getStep()).toBe(1);
    });

    test('returns 2 when only homePoint set', () => {
        setHomePoint(mockHomePoint);
        expect(getStep()).toBe(2);
    });

    test('returns 3 when homePoint and stopA set', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        expect(getStep()).toBe(3);
    });

    test('returns 4 when all set', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        setStopB(mockStopB);
        expect(getStep()).toBe(4);
    });
});

describe('reset', () => {
    test('resets state to initial values', () => {
        setHomePoint(mockHomePoint);
        setStopA(mockStopA);
        setStopB(mockStopB);
        reset();
        const state = getState();
        expect(state).toEqual({
            stopA: null,
            stopB: null,
            homePoint: null,
            step: 1
        });
    });
});

describe('loadFromURL', () => {
    beforeEach(() => {
        reset();
    });

    test('loads stopA from URL', () => {
        const originalSearch = window.location.search;
        Object.defineProperty(window, 'location', {
            value: { search: '?stopA=stopA' },
            writable: true
        });

        const stopsData: Stop[] = [mockStopA];
        loadFromURL(stopsData, {});

        expect(getState().stopA).toEqual(mockStopA);

        Object.defineProperty(window, 'location', {
            value: { search: originalSearch },
            writable: true
        });
    });

    test('loads homePoint from URL', () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?home=55.5,37.5' },
            writable: true
        });

        loadFromURL([], {});

        expect(getState().homePoint).toEqual({ lat: 55.5, lon: 37.5 });

        Object.defineProperty(window, 'location', {
            value: { search: '' },
            writable: true
        });
    });

    test('loads all params and sets correct step', () => {
        Object.defineProperty(window, 'location', {
            value: { search: '?stopA=stopA&stopB=stopB&home=55.5,37.5' },
            writable: true
        });

        const stopsData: Stop[] = [mockStopA, mockStopB];
        loadFromURL(stopsData, {});

        const state = getState();
        expect(state.stopA).toEqual(mockStopA);
        expect(state.stopB).toEqual(mockStopB);
        expect(state.homePoint).toEqual({ lat: 55.5, lon: 37.5 });
        expect(state.step).toBe(4);

        Object.defineProperty(window, 'location', {
            value: { search: '' },
            writable: true
        });
    });

    test('does nothing when no params in URL', () => {
        Object.defineProperty(window, 'location', {
            value: { search: '' },
            writable: true
        });

        const state = loadFromURL([], {});

        expect(state.step).toBe(1);

        Object.defineProperty(window, 'location', {
            value: { search: '' },
            writable: true
        });
    });
});
