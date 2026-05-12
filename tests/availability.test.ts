import {
  getAvailableStopIds,
  routeGoesFromAToB,
} from "../js/routing/availability";
import type { Caches, StopTime } from "../js/gtfs/cache";

const mockStopTimes: StopTime[] = [
  {
    trip_id: "trip_1",
    stop_id: "stopA",
    arrival_time: "08:00",
    departure_time: "08:00",
    stop_sequence: "1",
  },
  {
    trip_id: "trip_1",
    stop_id: "stopB",
    arrival_time: "08:10",
    departure_time: "08:10",
    stop_sequence: "2",
  },
  {
    trip_id: "trip_1",
    stop_id: "stopC",
    arrival_time: "08:20",
    departure_time: "08:20",
    stop_sequence: "3",
  },
  {
    trip_id: "trip_1",
    stop_id: "stopE",
    arrival_time: "08:30",
    departure_time: "08:30",
    stop_sequence: "4",
  },
  {
    trip_id: "trip_2",
    stop_id: "stopA",
    arrival_time: "09:00",
    departure_time: "09:00",
    stop_sequence: "1",
  },
  {
    trip_id: "trip_2",
    stop_id: "stopC",
    arrival_time: "09:10",
    departure_time: "09:10",
    stop_sequence: "2",
  },
  {
    trip_id: "trip_3",
    stop_id: "stopD",
    arrival_time: "10:00",
    departure_time: "10:00",
    stop_sequence: "1",
  },
  {
    trip_id: "trip_3",
    stop_id: "stopE",
    arrival_time: "10:10",
    departure_time: "10:10",
    stop_sequence: "2",
  },
];

const mockCaches: Caches = {
  routeTripIdsCache: {
    route_1: new Set(["trip_1"]),
    route_2: new Set(["trip_2"]),
    route_3: new Set(["trip_3"]),
  },
  stopTripIdsCache: {
    stopA: new Set(["trip_1", "trip_2"]),
    stopB: new Set(["trip_1"]),
    stopC: new Set(["trip_1", "trip_2"]),
    stopD: new Set(["trip_3"]),
    stopE: new Set(["trip_1", "trip_3"]),
  },
  tripToRouteCache: {
    trip_1: { trip_id: "trip_1", route_id: "route_1" },
    trip_2: { trip_id: "trip_2", route_id: "route_2" },
    trip_3: { trip_id: "trip_3", route_id: "route_3" },
  },
  tripStopTimesCache: {
    trip_1: mockStopTimes.filter((st) => st.trip_id === "trip_1"),
    trip_2: mockStopTimes.filter((st) => st.trip_id === "trip_2"),
    trip_3: mockStopTimes.filter((st) => st.trip_id === "trip_3"),
  },
};

describe("getAvailableStopIds", () => {
  test("returns stops reachable from stopA via any trip", () => {
    const availableStops = getAvailableStopIds("stopA", mockCaches);

    expect(availableStops.has("stopB")).toBe(true);
    expect(availableStops.has("stopC")).toBe(true);
    expect(availableStops.has("stopE")).toBe(true);
    expect(availableStops.has("stopA")).toBe(false);
  });

  test("does not return stops reachable only before stopA", () => {
    const availableStops = getAvailableStopIds("stopB", mockCaches);

    expect(availableStops.has("stopA")).toBe(false);
  });

  test("returns empty set for stop with no trips", () => {
    const availableStops = getAvailableStopIds("nonexistent", mockCaches);

    expect(availableStops.size).toBe(0);
  });
});

describe("routeGoesFromAToB", () => {
  test("returns true when A comes before B in trip", () => {
    const result = routeGoesFromAToB("stopA", "stopC", mockCaches);

    expect(result).toBe(true);
  });

  test("returns true when A and B are adjacent", () => {
    const result = routeGoesFromAToB("stopA", "stopB", mockCaches);

    expect(result).toBe(true);
  });

  test("returns false when B comes before A in trip", () => {
    const result = routeGoesFromAToB("stopC", "stopA", mockCaches);

    expect(result).toBe(false);
  });

  test("returns false when stops are on different trips", () => {
    const result = routeGoesFromAToB("stopA", "stopD", mockCaches);

    expect(result).toBe(false);
  });

  test("returns false for same stop", () => {
    const result = routeGoesFromAToB("stopA", "stopA", mockCaches);

    expect(result).toBe(false);
  });
});
