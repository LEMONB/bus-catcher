import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import crypto from "node:crypto";
import { initDb, getDb, setGtfsVersion } from "./db.js";
import { getCachedGtfsUrl } from "./busmaps.js";

export interface ImportProgress {
  stage: string;
  percent?: number;
  message: string;
}

type ProgressCallback = (progress: ImportProgress) => void;

function parseCSVLine(line: string, headers: string[]): Record<string, string> {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.replace(/"/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.replace(/"/g, ""));

  const obj: Record<string, string> = {};
  headers.forEach((h, i) => {
    obj[h] = values[i] ?? "";
  });
  return obj;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, ""));
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => parseCSVLine(line, headers));
}

function downloadZip(destPath: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function followRedirect(currentUrl: string) {
      https
        .get(currentUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            followRedirect(response.headers.location!);
            return;
          }
          if (response.statusCode !== 200) {
            reject(
              new Error(`Download failed with status ${response.statusCode}`),
            );
            return;
          }

          const file = fs.createWriteStream(destPath);
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        })
        .on("error", reject);
    }
    followRedirect(url);
  });
}

function extractZip(zipPath: string, destDir: string): void {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

function importStops(text: string): number {
  const database = getDb();
  const records = parseCSV(text);
  const stmt = database.prepare(
    "INSERT OR REPLACE INTO stops (stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station) VALUES (?, ?, ?, ?, ?, ?)",
  );

  const insertMany = database.transaction(
    (rows: Array<[string, string, number, number, number, string | null]>) => {
      for (const row of rows) {
        stmt.run(row);
      }
    },
  );

  const rows: Array<[string, string, number, number, number, string | null]> =
    records.map((r) => [
      r.stop_id,
      r.stop_name,
      parseFloat(r.stop_lat),
      parseFloat(r.stop_lon),
      parseInt(r.location_type ?? "0"),
      r.parent_station ?? null,
    ]);

  insertMany(rows);
  return records.length;
}

function importRoutes(text: string): number {
  const database = getDb();
  const records = parseCSV(text);
  const stmt = database.prepare(
    "INSERT OR REPLACE INTO routes (route_id, route_short_name, route_long_name, route_type, route_color, route_text_color) VALUES (?, ?, ?, ?, ?, ?)",
  );

  const insertMany = database.transaction(
    (
      rows: Array<
        [string, string, string | null, number, string | null, string | null]
      >,
    ) => {
      for (const row of rows) {
        stmt.run(row);
      }
    },
  );

  const rows: Array<
    [string, string, string | null, number, string | null, string | null]
  > = records.map((r) => [
    r.route_id,
    r.route_short_name,
    r.route_long_name ?? null,
    parseInt(r.route_type ?? "3"),
    r.route_color ?? null,
    r.route_text_color ?? null,
  ]);

  insertMany(rows);
  return records.length;
}

function importTrips(text: string): number {
  const database = getDb();
  const records = parseCSV(text);
  const stmt = database.prepare(
    "INSERT OR REPLACE INTO trips (trip_id, route_id, direction_id) VALUES (?, ?, ?)",
  );

  const insertMany = database.transaction(
    (rows: Array<[string, string, number]>) => {
      for (const row of rows) {
        stmt.run(row);
      }
    },
  );

  const rows: Array<[string, string, number]> = records.map((r) => [
    r.trip_id,
    r.route_id,
    parseInt(r.direction_id ?? "0"),
  ]);

  insertMany(rows);
  return records.length;
}

function importStopTimes(text: string, onProgress: ProgressCallback): number {
  const database = getDb();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return 0;

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, ""));
  const total = lines.length - 1;
  const batchSize = 50000;

  const stmt = database.prepare(
    "INSERT OR REPLACE INTO stop_times (trip_id, stop_id, arrival_time, departure_time, stop_sequence) VALUES (?, ?, ?, ?, ?)",
  );

  const insertMany = database.transaction(
    (rows: Array<[string, string, string, string, number]>) => {
      for (const row of rows) {
        stmt.run(row);
      }
    },
  );

  let batch: Array<[string, string, string, string, number]> = [];
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.replace(/"/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.replace(/"/g, ""));

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });

    batch.push([
      obj.trip_id,
      obj.stop_id,
      obj.arrival_time,
      obj.departure_time,
      parseInt(obj.stop_sequence),
    ]);

    if (batch.length >= batchSize) {
      insertMany(batch);
      count += batch.length;
      batch = [];

      if (i % 100000 === 0) {
        onProgress({
          stage: "importing_stop_times",
          percent: Math.round((i / total) * 100),
          message: `Importing stop_times: ${count} rows`,
        });
      }
    }
  }

  if (batch.length > 0) {
    insertMany(batch);
    count += batch.length;
  }

  return count;
}

function readGtfsFile(gtfsDir: string, filename: string): string | null {
  const filePath = path.join(gtfsDir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function computeFileHash(filePath: string): string {
  const hash = crypto.createHash("md5");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

export async function importGtfs(
  onProgress: ProgressCallback = () => {},
): Promise<{
  stops: number;
  routes: number;
  trips: number;
  stopTimes: number;
}> {
  const tmpDir = path.join(process.env.TMP_DIR ?? "./tmp", "gtfs-import");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const zipPath = path.join(tmpDir, "moscow-gtfs.zip");
  const gtfsDir = path.join(tmpDir, "gtfs");

  try {
    const apiKey = process.env.BUSMAPS_API_KEY;
    if (!apiKey) {
      throw new Error("BUSMAPS_API_KEY environment variable is not set");
    }

    onProgress({
      stage: "fetching_url",
      message: "Fetching GTFS URL from BusMaps API...",
    });
    const gtfsUrl = await getCachedGtfsUrl(apiKey);

    onProgress({ stage: "downloading", message: "Downloading GTFS data..." });
    await downloadZip(zipPath, gtfsUrl);

    const fileHash = computeFileHash(zipPath);

    onProgress({ stage: "extracting", message: "Extracting GTFS files..." });
    if (fs.existsSync(gtfsDir)) {
      fs.rmSync(gtfsDir, { recursive: true });
    }
    fs.mkdirSync(gtfsDir, { recursive: true });
    extractZip(zipPath, gtfsDir);

    initDb();
    const database = getDb();

    onProgress({ stage: "clearing", message: "Clearing old data..." });
    database.exec("DELETE FROM stop_times");
    database.exec("DELETE FROM trips");
    database.exec("DELETE FROM routes");
    database.exec("DELETE FROM stops");

    const stopsText = readGtfsFile(gtfsDir, "stops.txt");
    if (!stopsText) throw new Error("stops.txt not found in GTFS");
    onProgress({ stage: "importing_stops", message: "Importing stops..." });
    const stopsCount = importStops(stopsText);

    const routesText = readGtfsFile(gtfsDir, "routes.txt");
    if (!routesText) throw new Error("routes.txt not found in GTFS");
    onProgress({ stage: "importing_routes", message: "Importing routes..." });
    const routesCount = importRoutes(routesText);

    const tripsText = readGtfsFile(gtfsDir, "trips.txt");
    if (!tripsText) throw new Error("trips.txt not found in GTFS");
    onProgress({ stage: "importing_trips", message: "Importing trips..." });
    const tripsCount = importTrips(tripsText);

    let stopTimesText: string | null = null;
    const stopTimesPath = path.join(gtfsDir, "stop_times.txt");
    if (fs.existsSync(stopTimesPath)) {
      stopTimesText = fs.readFileSync(stopTimesPath, "utf8");
    } else {
      const chunks = [
        "stop_times_1.txt",
        "stop_times_2.txt",
        "stop_times_3.txt",
      ];
      const parts: string[] = [];
      for (const chunk of chunks) {
        const chunkText = readGtfsFile(gtfsDir, chunk);
        if (chunkText) {
          const chunkLines = chunkText.trim().split("\n");
          if (parts.length === 0) {
            parts.push(chunkLines.join("\n"));
          } else {
            parts.push(chunkLines.slice(1).join("\n"));
          }
        }
      }
      if (parts.length > 0) {
        stopTimesText = parts.join("\n");
      }
    }

    if (!stopTimesText) throw new Error("stop_times data not found in GTFS");
    onProgress({
      stage: "importing_stop_times",
      message: "Importing stop_times...",
    });
    const stopTimesCount = importStopTimes(stopTimesText, onProgress);

    setGtfsVersion(fileHash);

    onProgress({
      stage: "done",
      message: `Import complete: ${stopsCount} stops, ${routesCount} routes, ${tripsCount} trips, ${stopTimesCount} stop_times`,
    });

    return {
      stops: stopsCount,
      routes: routesCount,
      trips: tripsCount,
      stopTimes: stopTimesCount,
    };
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(gtfsDir)) fs.rmSync(gtfsDir, { recursive: true });
  }
}
