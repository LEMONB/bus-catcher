import { getDistanceBetweenPoints } from "./distance";

export interface Point {
  lat: number;
  lon: number;
}

export interface Stop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

export function stopLat(stop: Stop): number {
  return typeof stop.stop_lat === "number"
    ? stop.stop_lat
    : parseFloat(stop.stop_lat);
}

export function stopLon(stop: Stop): number {
  return typeof stop.stop_lon === "number"
    ? stop.stop_lon
    : parseFloat(stop.stop_lon);
}

const WALKING_SPEED_KMH = 5;

export function getWalkTime(stop: Stop, homePoint: Point): number {
  const dist = getDistanceBetweenPoints(
    homePoint.lat,
    homePoint.lon,
    stopLat(stop),
    stopLon(stop),
  );
  return Math.round((dist / WALKING_SPEED_KMH) * 60);
}

export function timeToSeconds(timeStr: string): number {
  const [hours, minutes, seconds] = timeStr.split(":").map(Number);
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}

export function calculateWaitTime(
  arrivalSeconds: number,
  currentTime: number,
): number {
  if (arrivalSeconds > currentTime) {
    return arrivalSeconds - currentTime;
  }
  return 24 * 3600 - currentTime + arrivalSeconds;
}
