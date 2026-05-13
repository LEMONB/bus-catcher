import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const BUSMAPS_API_URL = "https://api.busmaps.com/getGtfsFeedsDownloads";
const CACHE_FILE = path.join(process.cwd(), "tmp", "gtfs-url-cache.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface UrlCache {
  url: string;
  fetchedAt: string;
}

interface BusMapsDerivative {
  type?: string;
  path?: string;
  fileName?: string;
}

interface BusMapsFeed {
  feedId?: number;
  feedName?: string;
  feedGroupId?: number;
  feedGroupName?: string;
  derivatives?: BusMapsDerivative[];
}

interface BusMapsCountry {
  countryUrl?: string;
  countryRegion?: string;
  countryName?: string;
  countryIso?: string;
  feeds?: BusMapsFeed[];
}

type BusMapsResponse = BusMapsCountry[];

export function requestJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

export function findMoscowGtfsUrl(response: unknown): string {
  const countries = response as BusMapsResponse;
  if (!Array.isArray(countries)) {
    const snippet = JSON.stringify(response).slice(0, 200);
    throw new Error(
      `Unexpected BusMaps API response (expected array): ${snippet}`,
    );
  }

  for (const country of countries) {
    const countryIso = (country.countryIso ?? "").toLowerCase();
    const countryName = (country.countryName ?? "").toLowerCase();

    if (
      countryIso === "rus" ||
      countryIso === "ru" ||
      countryName.includes("russia")
    ) {
      const feeds = country.feeds ?? [];
      for (const feed of feeds) {
        const feedName = (feed.feedName ?? "").toLowerCase();
        const feedGroupName = (feed.feedGroupName ?? "").toLowerCase();

        if (
          feedName.includes("moscow") ||
          feedName.includes("moskva") ||
          feedGroupName.includes("moscow") ||
          feedGroupName.includes("moskva")
        ) {
          const derivatives = feed.derivatives ?? [];
          for (const d of derivatives) {
            if (d.type === "processed_data" && d.path) {
              return d.path;
            }
          }
          if (derivatives.length > 0 && derivatives[0].path) {
            return derivatives[0].path;
          }
        }
      }
    }
  }

  throw new Error("Moscow GTFS feed not found in BusMaps API response");
}

export async function fetchGtfsUrl(apiKey: string): Promise<string> {
  const response = await requestJson(BUSMAPS_API_URL, {
    "capi-key": apiKey,
    "capi-host": "busmaps.com",
  });
  return findMoscowGtfsUrl(response);
}

function readCache(): UrlCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    let raw = fs.readFileSync(CACHE_FILE, "utf8");
    raw = raw.replace(/^\uFEFF/, ""); // strip BOM
    return JSON.parse(raw) as UrlCache;
  } catch {
    return null;
  }
}

function writeCache(url: string): void {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const cache: UrlCache = { url, fetchedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function isCacheValid(): UrlCache | null {
  const cached = readCache();
  if (!cached) return null;
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  if (age > CACHE_TTL_MS) return null;
  return cached;
}

export async function getCachedGtfsUrl(
  apiKey: string,
  fetchFn: (key: string) => Promise<string> = fetchGtfsUrl,
): Promise<string> {
  const cached = isCacheValid();
  if (cached) {
    return cached.url;
  }

  const url = await fetchFn(apiKey);
  writeCache(url);
  return url;
}

export function clearCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
    }
  } catch {
    // ignore
  }
}
