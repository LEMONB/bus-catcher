const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const BUSMAPS_API_URL = "https://api.busmaps.com/getGtfsFeedsDownloads";
const CACHE_FILE = path.join(__dirname, "..", "tmp", "gtfs-url-cache.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const GTFS_DIR = path.join(OUTPUT_DIR, "gtfs");

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(url) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const cache = { url, fetchedAt: new Date().toISOString() };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getCachedUrl() {
  const cached = readCache();
  if (!cached) return null;
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  if (age > CACHE_TTL_MS) return null;
  return cached.url;
}

function fetchGtfsUrl(apiKey) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(BUSMAPS_API_URL);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: {
        "capi-key": apiKey,
        "capi-host": "busmaps.com",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          const feeds = response.data || response.feeds || [];

          for (const feed of feeds) {
            const country = (feed.country || "").toLowerCase();
            const region = (feed.region || "").toLowerCase();
            const name = (feed.name || "").toLowerCase();

            if (
              country.includes("russia") ||
              country.includes("ru") ||
              region.includes("moscow") ||
              region.includes("moskva") ||
              name.includes("moscow") ||
              name.includes("moskva")
            ) {
              const downloads = feed.downloads || [];
              for (const dl of downloads) {
                if (dl.url && (dl.latest !== false || !dl.latest)) {
                  resolve(dl.url);
                  return;
                }
              }
              if (downloads.length > 0 && downloads[0].url) {
                resolve(downloads[0].url);
                return;
              }
            }
          }

          reject(
            new Error("Moscow GTFS feed not found in BusMaps API response"),
          );
        } catch (e) {
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

async function getGtfsUrl() {
  const cached = getCachedUrl();
  if (cached) {
    console.log("Using cached GTFS URL");
    return cached;
  }

  const apiKey = process.env.BUSMAPS_API_KEY;
  if (!apiKey) {
    throw new Error("BUSMAPS_API_KEY environment variable is not set");
  }

  console.log("Fetching GTFS URL from BusMaps API...");
  const url = await fetchGtfsUrl(apiKey);
  writeCache(url);
  return url;
}

async function downloadGTFS() {
  console.log("Downloading Moscow GTFS data...");

  // Create directories
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(GTFS_DIR)) {
    fs.mkdirSync(GTFS_DIR, { recursive: true });
  }

  const zipPath = path.join(OUTPUT_DIR, "moscow-gtfs.zip");
  const gtfsUrl = await getGtfsUrl();

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);

    function followRedirect(url) {
      https
        .get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            followRedirect(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            reject(
              new Error(`Download failed with status ${response.statusCode}`),
            );
            return;
          }
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            console.log("Download complete. Extracting...");
            extractZip(zipPath);
            resolve();
          });
        })
        .on("error", reject);
    }

    followRedirect(gtfsUrl);
  });
}

function extractZip(zipPath) {
  const AdmZip = require("adm-zip");
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(GTFS_DIR, true);
    console.log("GTFS data extracted to data/gtfs/");
    splitStopTimesIfNeeded(GTFS_DIR);
    console.log("Done!");
  } catch (e) {
    console.error("Error extracting:", e.message);
    console.log("Trying alternative method with unzipper...");
    extractWithUnzipper(zipPath);
  }
}

function extractWithUnzipper(zipPath) {
  const unzipper = require("unzipper");
  fs.createReadStream(zipPath)
    .pipe(unzipper.Parse())
    .on("entry", (entry) => {
      const fileName = path.basename(entry.path);
      if (fileName && !fileName.startsWith(".")) {
        const filePath = path.join(GTFS_DIR, fileName);
        entry.pipe(fs.createWriteStream(filePath));
      } else {
        entry.autodrain();
      }
    })
    .on("close", () => {
      console.log("GTFS data extracted!");
      splitStopTimesIfNeeded(GTFS_DIR);
    });
}

const MAX_CHUNK_SIZE = 90 * 1024 * 1024; // 90MB

function splitStopTimesIfNeeded(gtfsDir) {
  const stopTimesPath = path.join(gtfsDir, "stop_times.txt");

  if (!fs.existsSync(stopTimesPath)) {
    console.log("stop_times.txt not found, skipping split");
    return;
  }

  const stats = fs.statSync(stopTimesPath);
  console.log(
    `stop_times.txt size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
  );

  if (stats.size <= MAX_CHUNK_SIZE) {
    console.log("stop_times.txt is under 90MB, no split needed");
    return;
  }

  console.log("Splitting stop_times.txt into chunks...");

  const content = fs.readFileSync(stopTimesPath, "utf8");
  const lines = content.trim().split("\n");
  const header = lines[0];
  const dataLines = lines.slice(1);

  const numChunks = 3;
  const chunkSize = Math.ceil(dataLines.length / numChunks);

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, dataLines.length);
    const chunkContent = header + "\n" + dataLines.slice(start, end).join("\n");
    const chunkPath = path.join(gtfsDir, `stop_times_${i + 1}.txt`);
    fs.writeFileSync(chunkPath, chunkContent, "utf8");
    console.log(`Created stop_times_${i + 1}.txt with ${end - start} lines`);
  }

  fs.unlinkSync(stopTimesPath);
  console.log("Deleted original stop_times.txt");
  console.log("Split complete!");
}

downloadGTFS().catch(console.error);
