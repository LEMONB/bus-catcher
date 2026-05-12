import type { Stop } from "../utils/time";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "";

export interface StopResponse {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

export interface RouteResponse {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string | null;
  route_text_color: string | null;
}

export interface BusOption {
  route: RouteResponse;
  trip_id: string;
  departure_time: string;
  waitTimeMinutes: number;
  walkTimeMinutes: number;
  canMakeIt: boolean;
  homeStop: Stop;
  destStop: Stop;
  stop_times: StopTimeResponse[];
}

export interface StopTimeResponse {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  arrival_time: string;
  departure_time: string;
  stop_sequence: number;
}

export interface TripResponse {
  trip_id: string;
  route_id: string;
  direction_id: number;
  route_short_name: string;
  route_long_name: string;
}

export interface TripTimesResponse {
  trip: TripResponse;
  stopTimes: StopTimeResponse[];
}

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function searchStops(query: string): Promise<StopResponse[]> {
  return apiFetch<StopResponse[]>(`/api/stops?q=${encodeURIComponent(query)}`);
}

export async function findNearestStop(
  lat: number,
  lon: number,
): Promise<StopResponse> {
  return apiFetch<StopResponse>(`/api/stops?lat=${lat}&lon=${lon}`);
}

export async function getStop(stopId: string): Promise<StopResponse> {
  return apiFetch<StopResponse>(`/api/stops/${stopId}`);
}

export async function findRoutes(
  fromStopId: string,
  toStopId: string,
): Promise<RouteResponse[]> {
  return apiFetch<RouteResponse[]>(
    `/api/routes?from=${fromStopId}&to=${toStopId}`,
  );
}

export async function getAvailableStops(
  fromStopId: string,
): Promise<StopResponse[]> {
  return apiFetch<StopResponse[]>(
    `/api/routes/available-stops?from=${fromStopId}`,
  );
}

export async function getTripTimes(tripId: string): Promise<TripTimesResponse> {
  return apiFetch<TripTimesResponse>(`/api/trips/${tripId}/times`);
}

export function stopResponseToStop(stop: StopResponse): Stop {
  return {
    stop_id: stop.stop_id,
    stop_name: stop.stop_name,
    stop_lat: stop.stop_lat,
    stop_lon: stop.stop_lon,
  };
}

export function stopToStopResponse(stop: Stop): StopResponse {
  return {
    stop_id: stop.stop_id,
    stop_name: stop.stop_name,
    stop_lat: stop.stop_lat,
    stop_lon: stop.stop_lon,
  };
}
