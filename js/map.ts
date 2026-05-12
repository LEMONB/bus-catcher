import type { Stop, Point } from "./utils/time";
import type { Record } from "./gtfs/parser";
import { getDistanceBetweenPoints } from "./utils/distance";
import L from "leaflet";

const Moscow_CENTER: [number, number] = [55.7558, 37.6173];

let map: L.Map | null = null;
let stopsLayer: L.LayerGroup | null = null;
let stopAMarker: L.Marker | null = null;
let stopBMarker: L.Marker | null = null;
let homeMarker: L.Marker | null = null;
let routeLines: L.Polyline[] = [];
let stopsData: Record[] = [];

export function initMap(containerId = "map"): L.Map {
  if (map) return map;

  map = L.map(containerId).setView(Moscow_CENTER, 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  return map;
}

export function getMap(): L.Map | null {
  return map;
}

export function setStopsData(data: Record[]): void {
  stopsData = data;
}

export function highlightAvailableStops(
  availableStopIds: Set<string> | null,
): void {
  if (!map || !stopsData) return;

  if (stopsLayer) map.removeLayer(stopsLayer);
  stopsLayer = L.layerGroup().addTo(map);

  let activeTooltip: HTMLElement | null = null;

  stopsData.forEach((stop) => {
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);

    if (!isNaN(lat) && !isNaN(lon)) {
      const isAvailable =
        availableStopIds && availableStopIds.has(stop.stop_id);

      const marker = L.circleMarker([lat, lon], {
        radius: isAvailable ? 6 : 4,
        fillColor: isAvailable ? "#2E7D32" : "#9E9E9E",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 1,
      });

      marker.on("mouseover", function (e) {
        if (activeTooltip) {
          activeTooltip.remove();
        }
        const tooltip = document.createElement("div");
        tooltip.className = "stop-tooltip";
        tooltip.textContent =
          stop.stop_name + (isAvailable ? "" : " (недоступно)");
        tooltip.style.left = e.containerPoint.x + 10 + "px";
        tooltip.style.top = e.containerPoint.y - 10 + "px";
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;
      });

      marker.on("mouseout", function () {
        if (activeTooltip) {
          activeTooltip.remove();
          activeTooltip = null;
        }
      });

      stopsLayer!.addLayer(marker);
    }
  });
}

export function renderStops(): void {
  if (!map) return;

  if (stopsLayer) map.removeLayer(stopsLayer);
  stopsLayer = L.layerGroup().addTo(map);

  let activeTooltip: HTMLElement | null = null;

  stopsData.forEach((stop) => {
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);

    if (!isNaN(lat) && !isNaN(lon)) {
      const marker = L.circleMarker([lat, lon], {
        radius: 5,
        fillColor: "#1565C0",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 1,
      });

      marker.on("mouseover", function (e) {
        if (activeTooltip) {
          activeTooltip.remove();
        }
        const tooltip = document.createElement("div");
        tooltip.className = "stop-tooltip";
        tooltip.textContent = stop.stop_name;
        tooltip.style.left = e.containerPoint.x + 10 + "px";
        tooltip.style.top = e.containerPoint.y - 10 + "px";
        document.body.appendChild(tooltip);
        activeTooltip = tooltip;
      });

      marker.on("mouseout", function () {
        if (activeTooltip) {
          activeTooltip.remove();
          activeTooltip = null;
        }
      });

      stopsLayer!.addLayer(marker);
    }
  });
}

export function setHomeMarker(point: Point): void {
  if (!map) return;

  if (homeMarker) map.removeLayer(homeMarker);
  homeMarker = L.marker([point.lat, point.lon], {
    icon: L.divIcon({
      className: "home-marker",
      html: "🏠",
      iconSize: [30, 30],
    }),
  }).addTo(map);
  homeMarker.bindPopup("Отсюда выходите").openPopup();
}

export function setStopAMarker(stop: Stop): void {
  if (!map) return;

  if (stopAMarker) map.removeLayer(stopAMarker);
  stopAMarker = L.marker(
    [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)],
    {
      icon: L.divIcon({
        className: "stop-a-marker",
        html: "🚌",
        iconSize: [30, 30],
      }),
    },
  ).addTo(map);
  stopAMarker.bindPopup("Остановка: " + stop.stop_name).openPopup();
}

export function setStopBMarker(stop: Stop): void {
  if (!map) return;

  if (stopBMarker) map.removeLayer(stopBMarker);
  stopBMarker = L.marker(
    [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)],
    {
      icon: L.divIcon({
        className: "stop-b-marker",
        html: "🏁",
        iconSize: [30, 30],
      }),
    },
  ).addTo(map);
  stopBMarker.bindPopup("Остановка: " + stop.stop_name).openPopup();
}

export function findNearestStop(
  lat: number,
  lon: number,
  maxDistanceKm = 0.5,
): Stop | null {
  let nearest: Stop | null = null;
  let nearestDist = maxDistanceKm;

  for (const stop of stopsData) {
    const stopLat = parseFloat(stop.stop_lat);
    const stopLon = parseFloat(stop.stop_lon);
    const dist = getDistanceBetweenPoints(lat, lon, stopLat, stopLon);

    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = stop as Stop;
    }
  }

  return nearest;
}

export function showRouteOnMap(
  routeOption: {
    homeStop: Stop;
    destStop: Stop;
    allStopTimes?: { stop_id: string }[];
  },
  homePoint: Point,
): void {
  if (!map) return;

  routeLines.forEach((l) => map!.removeLayer(l));
  routeLines = [];

  const walkToStop = L.polyline(
    [
      [homePoint.lat, homePoint.lon],
      [
        parseFloat(routeOption.homeStop.stop_lat),
        parseFloat(routeOption.homeStop.stop_lon),
      ],
    ],
    {
      color: "#4CAF50",
      weight: 4,
      opacity: 0.8,
      dashArray: "10, 10",
    },
  ).addTo(map);
  routeLines.push(walkToStop);

  if (routeOption.allStopTimes) {
    const idxA = routeOption.allStopTimes.findIndex(
      (st) => st.stop_id === routeOption.homeStop.stop_id,
    );
    const idxB = routeOption.allStopTimes.findIndex(
      (st) => st.stop_id === routeOption.destStop.stop_id,
    );

    if (idxA >= 0 && idxB >= 0 && idxA < idxB) {
      const relevantStops = routeOption.allStopTimes.slice(idxA, idxB + 1);

      const busCoords: [number, number][] = relevantStops
        .map((st) => {
          const stop = stopsData.find((s) => s.stop_id === st.stop_id);
          if (!stop) return null;
          return [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)];
        })
        .filter((c): c is [number, number] => c !== null);

      if (busCoords.length > 0) {
        const busRoute = L.polyline(busCoords, {
          color: "#2196F3",
          weight: 4,
          opacity: 0.8,
        }).addTo(map);
        routeLines.push(busRoute);
      }
    }
  }

  const walkFromStop = L.polyline(
    [
      [
        parseFloat(routeOption.destStop.stop_lat),
        parseFloat(routeOption.destStop.stop_lon),
      ],
      [homePoint.lat, homePoint.lon],
    ],
    {
      color: "#FF9800",
      weight: 3,
      opacity: 0.6,
      dashArray: "5, 5",
    },
  ).addTo(map);
  routeLines.push(walkFromStop);

  const allCoords: [number, number][] = [
    [homePoint.lat, homePoint.lon],
    [
      parseFloat(routeOption.homeStop.stop_lat),
      parseFloat(routeOption.homeStop.stop_lon),
    ],
    [
      parseFloat(routeOption.destStop.stop_lat),
      parseFloat(routeOption.destStop.stop_lon),
    ],
    [homePoint.lat, homePoint.lon],
  ];

  map.fitBounds(L.latLngBounds(allCoords), { padding: [50, 50] });
}

export function clearMarkers(): void {
  if (map) {
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
  }
}

export function clearRoutes(): void {
  if (map) {
    routeLines.forEach((l) => map!.removeLayer(l));
    routeLines = [];
  }
}

export function setClickHandler(
  handler: (e: L.LeafletMouseEvent) => void,
): void {
  if (map) {
    map.on("click", handler);
  }
}
