import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(process.env.DATA_DIR ?? "./data", "buscatcher.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(): Database.Database {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000");

  db.exec(`
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY,
            stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL,
            stop_lon REAL NOT NULL,
            location_type INTEGER DEFAULT 0,
            parent_station TEXT
        );

        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY,
            route_short_name TEXT NOT NULL,
            route_long_name TEXT,
            route_type INTEGER DEFAULT 3,
            route_color TEXT,
            route_text_color TEXT
        );

        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY,
            route_id TEXT NOT NULL,
            direction_id INTEGER DEFAULT 0,
            FOREIGN KEY (route_id) REFERENCES routes(route_id)
        );

        CREATE TABLE IF NOT EXISTS stop_times (
            trip_id TEXT NOT NULL,
            stop_id TEXT NOT NULL,
            arrival_time TEXT NOT NULL,
            departure_time TEXT NOT NULL,
            stop_sequence INTEGER NOT NULL,
            PRIMARY KEY (trip_id, stop_sequence),
            FOREIGN KEY (trip_id) REFERENCES trips(trip_id),
            FOREIGN KEY (stop_id) REFERENCES stops(stop_id)
        );

        CREATE TABLE IF NOT EXISTS gtfs_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_stop_times_stop ON stop_times(stop_id);
        CREATE INDEX IF NOT EXISTS idx_stop_times_trip ON stop_times(trip_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(route_id);
        CREATE INDEX IF NOT EXISTS idx_stops_name ON stops(stop_name);
    `);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function setGtfsVersion(version: string): void {
  const database = getDb();
  database
    .prepare("INSERT OR REPLACE INTO gtfs_meta (key, value) VALUES (?, ?)")
    .run("version", version);
  database
    .prepare("INSERT OR REPLACE INTO gtfs_meta (key, value) VALUES (?, ?)")
    .run("updated_at", new Date().toISOString());
}

export function getGtfsVersion(): {
  version: string | null;
  updatedAt: string | null;
} {
  const database = getDb();
  const rows = database
    .prepare("SELECT key, value FROM gtfs_meta WHERE key IN (?, ?)")
    .all("version", "updated_at") as Array<{ key: string; value: string }>;
  const result: { version: string | null; updatedAt: string | null } = {
    version: null,
    updatedAt: null,
  };
  for (const row of rows) {
    if (row.key === "version") result.version = row.value;
    if (row.key === "updated_at") result.updatedAt = row.value;
  }
  return result;
}
