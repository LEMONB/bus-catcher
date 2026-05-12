import {
  searchStops as apiSearchStops,
  getAvailableStops as apiGetAvailableStops,
  findRoutes as apiFindRoutes,
  getTripTimes as apiGetTripTimes,
  stopResponseToStop,
  type StopResponse,
  type BusOption as ApiBusOption,
} from "./gtfs/api-client";
import {
  getState,
  setStopA,
  setStopB,
  setHomePoint,
  reset as resetStore,
  loadFromURL,
  getStep,
} from "./state/store";
import {
  initMap,
  setStopsData,
  renderStops,
  highlightAvailableStops,
  setHomeMarker,
  setStopAMarker,
  setStopBMarker,
  findNearestStop as mapFindNearestStop,
  showRouteOnMap,
  clearMarkers,
  clearRoutes,
  setClickHandler,
} from "./map";
import { renderBuses, updateUIForStep } from "./ui/bus-list";
import { openSearchModal, handleKeyboardShortcut } from "./ui/search";
import {
  getFavorites,
  saveFavorite,
  removeFavorite,
  type Favorite,
} from "./state/favorites";
import { type Stop, type Point } from "./utils/time";
import { getDistanceBetweenPoints } from "./utils/distance";

let stopsData: StopResponse[] = [];
let availableStopIds: Set<string> | null = null;
let loadingTimeout: ReturnType<typeof setTimeout> | null = null;
const WALKING_SPEED_KMH = 5;

function showCornerLoader(text = "Загрузка..."): void {
  const loader = document.getElementById("corner-loader");
  if (loader) {
    loader.classList.remove("hidden", "error");
    const textEl = loader.querySelector(".loader-text");
    if (textEl) textEl.textContent = text;
  }
}

function hideCornerLoader(): void {
  const loader = document.getElementById("corner-loader");
  if (loader) {
    loader.classList.add("hidden");
  }
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
}

function showCornerError(text: string): void {
  const loader = document.getElementById("corner-loader");
  if (loader) {
    loader.classList.remove("hidden");
    loader.classList.add("error");
    const textEl = loader.querySelector(".loader-text");
    if (textEl) textEl.textContent = text;
  }
}

function setLoadingTimeout(onTimeout: () => void): void {
  if (loadingTimeout) clearTimeout(loadingTimeout);
  loadingTimeout = setTimeout(() => {
    onTimeout();
  }, 10000);
}

async function loadStops(): Promise<void> {
  showCornerLoader("Загрузка остановок...");

  setLoadingTimeout(() => {
    showCornerError("Ошибка загрузки. Проверьте соединение.");
  });

  try {
    stopsData = await apiSearchStops("");
    setStopsData(stopsData.map((s) => stopResponseToStop(s)));
    renderStops();
    hideCornerLoader();
  } catch (e) {
    console.error("Error loading stops:", e);
    showCornerError("Ошибка загрузки: " + (e as Error).message);
  }
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
  const stop = mapFindNearestStop(lat, lon);

  if (!stop) {
    alert("Рядом нет остановки. Кликните ближе к остановке.");
    return;
  }

  setStopA(stop as Stop);
  setStopAMarker(stop as Stop);

  showCornerLoader("Загрузка доступных остановок...");
  apiGetAvailableStops(stop.stop_id)
    .then((availableStops) => {
      availableStopIds = new Set(availableStops.map((s) => s.stop_id));
      highlightAvailableStops(availableStopIds);
      hideCornerLoader();
      updateUIForStep(getStep());
    })
    .catch((e) => {
      console.error("Error loading available stops:", e);
      showCornerError("Ошибка загрузки: " + (e as Error).message);
    });
}

function selectStopB(lat: number, lon: number): void {
  const stop = mapFindNearestStop(lat, lon);

  if (!stop) {
    alert("Рядом нет остановки. Кликните ближе к остановке.");
    return;
  }

  const state = getState();
  if (stop.stop_id === state.stopA?.stop_id) {
    alert("Выберите другую остановку.");
    return;
  }

  if (availableStopIds && !availableStopIds.has(stop.stop_id)) {
    alert(
      "От этой остановки нельзя уехать на выбранном маршруте. Выберите другую остановку.",
    );
    return;
  }

  setStopB(stop as Stop);
  setStopBMarker(stop as Stop);

  highlightAvailableStops(availableStopIds);

  updateUIForStep(getStep());
  findAndDisplayBuses();
}

function timeToSeconds(timeStr: string): number {
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}

function calculateWaitTime(
  arrivalSeconds: number,
  currentTime: number,
): number {
  if (arrivalSeconds > currentTime) {
    return arrivalSeconds - currentTime;
  }
  return 24 * 3600 - currentTime + arrivalSeconds;
}

function calculateWalkTime(stop: Stop, homePt: Point): number {
  const dist = getDistanceBetweenPoints(
    homePt.lat,
    homePt.lon,
    stop.stop_lat,
    stop.stop_lon,
  );
  return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

async function findAndDisplayBuses(): Promise<void> {
  const state = getState();
  if (!state.stopA || !state.stopB || !state.homePoint) return;

  showCornerLoader("Поиск автобусов...");

  try {
    const routes = await apiFindRoutes(
      state.stopA.stop_id,
      state.stopB.stop_id,
    );

    const now = new Date();
    const currentTime =
      now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const buses: ApiBusOption[] = [];

    for (const route of routes) {
      const tripTimes = await apiGetTripTimes(route.route_id);
      const bestTrip = findBestTripForRoute(
        tripTimes.stopTimes,
        state.stopA.stop_id,
        state.stopB.stop_id,
        currentTime,
      );

      if (bestTrip) {
        const walkTimeMinutes = calculateWalkTime(state.stopA, state.homePoint);
        const canMakeIt = bestTrip.waitTimeMinutes > walkTimeMinutes;

        buses.push({
          route,
          trip_id: bestTrip.tripId,
          departure_time: bestTrip.departureTime,
          waitTimeMinutes: bestTrip.waitTimeMinutes,
          walkTimeMinutes,
          canMakeIt,
          homeStop: state.stopA,
          destStop: state.stopB,
          stop_times: tripTimes.stopTimes,
        });
      }
    }

    buses.sort((a, b) => a.waitTimeMinutes - b.waitTimeMinutes);

    if (buses.length > 0) {
      showRouteOnMap(buses[0], state.homePoint);
    }

    hideCornerLoader();
    renderBuses(
      buses,
      state.stopA,
      state.stopB,
      state.homePoint,
      (bus: ApiBusOption) => {
        showRouteOnMap(bus, state.homePoint!);
      },
      (stopA: Stop | null, stopB: Stop | null, homePoint: Point | null) => {
        toggleFavorite(stopA, stopB, homePoint);
      },
    );
  } catch (e) {
    console.error("Error finding buses:", e);
    showCornerError("Ошибка поиска автобусов: " + (e as Error).message);
  }
}

function findBestTripForRoute(
  stopTimes: Array<{
    stop_id: string;
    arrival_time: string;
    departure_time: string;
  }>,
  fromStopId: string,
  toStopId: string,
  currentTime: number,
): { tripId: string; departureTime: string; waitTimeMinutes: number } | null {
  const idxA = stopTimes.findIndex((st) => st.stop_id === fromStopId);
  const idxB = stopTimes.findIndex((st) => st.stop_id === toStopId);

  if (idxA < 0 || idxB < 0 || idxA >= idxB) return null;

  const departureTime = stopTimes[idxA].departure_time;
  const departureSecs = timeToSeconds(departureTime);
  const waitTimeSecs = calculateWaitTime(departureSecs, currentTime);
  const waitTimeMinutes = Math.floor(waitTimeSecs / 60);

  return {
    tripId: String(idxA),
    departureTime,
    waitTimeMinutes,
  };
}

function toggleFavorite(
  stopA: Stop | null,
  stopB: Stop | null,
  homePoint: Point | null,
): void {
  const favorites = getFavorites();
  const existingIndex = favorites.findIndex(
    (f) =>
      f.stopA?.stop_id === stopA?.stop_id &&
      f.stopB?.stop_id === stopB?.stop_id,
  );

  if (existingIndex >= 0) {
    removeFavorite(favorites[existingIndex].id);
  } else {
    const name = `${stopA?.stop_name || "?"} → ${stopB?.stop_name || "?"}`;
    saveFavorite({
      id: "fav_" + Date.now(),
      name: name,
      stopA: stopA!,
      stopB: stopB!,
      homePoint: homePoint!,
    });
  }

  renderFavorites();
  findAndDisplayBuses();
}

function renderFavorites(): void {
  const container = document.getElementById("favorites-container");
  const section = document.getElementById("favorites-section");
  if (!container || !section) return;

  const favorites = getFavorites();

  if (favorites.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  container.innerHTML = "";

  favorites.forEach((fav) => {
    const div = document.createElement("div");
    div.className = "favorite-item";
    div.innerHTML = `
            <span class="favorite-name">${fav.name}</span>
            <button class="favorite-delete" title="Удалить">✕</button>
        `;

    div.querySelector(".favorite-name")?.addEventListener("click", () => {
      loadFavoriteRoute(fav);
    });

    div.querySelector(".favorite-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFavorite(fav.id);
      renderFavorites();
    });

    container.appendChild(div);
  });
}

function loadFavoriteRoute(fav: Favorite): void {
  const stopA = stopsData.find((s) => s.stop_id === fav.stopA?.stop_id);
  const stopB = stopsData.find((s) => s.stop_id === fav.stopB?.stop_id);

  if (!stopA || !stopB) {
    alert("Остановки из избранного больше не доступны");
    return;
  }

  if (fav.homePoint) {
    setHomePointInternal(fav.homePoint.lat, fav.homePoint.lon);
  }

  selectStopAByStop(stopResponseToStop(stopA));
  selectStopBByStop(stopResponseToStop(stopB));
}

function openStopSearch(): void {
  openSearchModal(
    stopsData.map((s) => stopResponseToStop(s)),
    (stop: Stop) => {
      const state = getState();

      if (!state.homePoint) {
        alert("Сначала выберите домашнюю точку на карте");
        return;
      }

      if (!state.stopA) {
        selectStopAByStop(stop);
      } else if (!state.stopB) {
        selectStopBByStop(stop);
      }
    },
  );
}

function selectStopAByStop(stop: Stop): void {
  setStopA(stop);
  setStopAMarker(stop);

  showCornerLoader("Загрузка доступных остановок...");
  apiGetAvailableStops(stop.stop_id)
    .then((availableStops) => {
      availableStopIds = new Set(availableStops.map((s) => s.stop_id));
      highlightAvailableStops(availableStopIds);
      hideCornerLoader();
      updateUIForStep(getStep());
    })
    .catch((e) => {
      console.error("Error loading available stops:", e);
      showCornerError("Ошибка загрузки: " + (e as Error).message);
    });
}

function selectStopBByStop(stop: Stop): void {
  const state = getState();

  if (stop.stop_id === state.stopA?.stop_id) {
    alert("Выберите другую остановку.");
    return;
  }

  if (availableStopIds && !availableStopIds.has(stop.stop_id)) {
    alert(
      "От этой остановки нельзя уехать на выбранном маршруте. Выберите другую остановку.",
    );
    return;
  }

  setStopB(stop);
  setStopBMarker(stop);

  highlightAvailableStops(availableStopIds);

  updateUIForStep(getStep());
  findAndDisplayBuses();
}

function init(): void {
  initMap("map");
  setClickHandler(handleMapClick);

  document.addEventListener("keydown", (e) => {
    if (handleKeyboardShortcut(e)) {
      if (stopsData.length > 0) {
        openStopSearch();
      }
    }
  });

  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", openStopSearch);
  }

  loadStops().then(() => {
    const state = loadFromURL(
      stopsData.map((s) => stopResponseToStop(s)),
      {
        onHomePointChange: setHomeMarker,
        onStopAChange: setStopAMarker,
        onStopBChange: setStopBMarker,
      },
    );

    updateUIForStep(state.step);
    if (state.step === 4) {
      findAndDisplayBuses();
    }
  });

  document.getElementById("reset-btn")?.addEventListener("click", () => {
    reset();
  });

  renderFavorites();
}

function reset(): void {
  resetStore();
  clearMarkers();
  clearRoutes();
  availableStopIds = null;

  renderStops();
  renderFavorites();

  updateUIForStep(1);

  const container = document.getElementById("routes-container");
  if (container) container.innerHTML = "";
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", init);
}

export { init, loadStops, findAndDisplayBuses, reset };
