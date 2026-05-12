import type { Stop, Point } from "../utils/time";
import type { Record } from "../gtfs/parser";

interface State {
  stopA: Stop | null;
  stopB: Stop | null;
  homePoint: Point | null;
  step: number;
}

let state: State = {
  stopA: null,
  stopB: null,
  homePoint: null,
  step: 1,
};

const onStateChange: ((state: State) => void) | null = null;

export function getState(): State {
  return { ...state };
}

function setState(changes: Partial<State>): State {
  state = { ...state, ...changes };
  if (onStateChange) {
    onStateChange(state);
  }
  return state;
}

export function setStopA(stop: Stop | null): void {
  const newStep = stop ? 3 : state.homePoint ? 2 : 1;
  setState({ stopA: stop, step: newStep });
  updateURL();
}

export function setStopB(stop: Stop | null): void {
  const newStep = stop ? 4 : state.stopA ? 3 : state.homePoint ? 2 : 1;
  setState({ stopB: stop, step: newStep });
  updateURL();
}

export function setHomePoint(point: Point | null): void {
  setState({ homePoint: point, step: point ? 2 : 1 });
  updateURL();
}

export function reset(): void {
  state = {
    stopA: null,
    stopB: null,
    homePoint: null,
    step: 1,
  };
  if (onStateChange) {
    onStateChange(state);
  }
  history.replaceState(null, "", window.location.pathname);
}

function updateURL(): void {
  const params = new URLSearchParams();

  if (state.stopA) {
    params.set("stopA", state.stopA.stop_id);
  }
  if (state.stopB) {
    params.set("stopB", state.stopB.stop_id);
  }
  if (state.homePoint) {
    params.set("home", `${state.homePoint.lat},${state.homePoint.lon}`);
  }

  const newURL = params.toString()
    ? `?${params.toString()}`
    : window.location.pathname;
  history.replaceState(null, "", newURL);
}

interface Callbacks {
  onHomePointChange?: (point: Point) => void;
  onStopAChange?: (stop: Stop) => void;
  onStopBChange?: (stop: Stop) => void;
}

export function loadFromURL(stopsData: Record[], callbacks: Callbacks): State {
  const params = new URLSearchParams(window.location.search);
  const stopAParam = params.get("stopA");
  const stopBParam = params.get("stopB");
  const homeParam = params.get("home");

  const newState = { ...state };

  if (stopAParam) {
    const stop = stopsData.find((s) => s.stop_id === stopAParam) as
      | Stop
      | undefined;
    if (stop) {
      newState.stopA = stop;
      if (callbacks.onStopAChange) callbacks.onStopAChange(stop);
    }
  }

  if (stopBParam) {
    const stop = stopsData.find((s) => s.stop_id === stopBParam) as
      | Stop
      | undefined;
    if (stop) {
      newState.stopB = stop;
      if (callbacks.onStopBChange) callbacks.onStopBChange(stop);
    }
  }

  if (homeParam) {
    const [lat, lon] = homeParam.split(",").map(Number);
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

export function getStep(): number {
  if (state.homePoint && state.stopA && state.stopB) return 4;
  if (state.homePoint && state.stopA) return 3;
  if (state.homePoint) return 2;
  return 1;
}
