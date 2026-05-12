import express from "express";
import cors from "cors";
import { initDb, closeDb, getDb } from "./db.js";
import { importGtfs } from "./gtfs-importer.js";
import { startGtfsScheduler, stopGtfsScheduler } from "./scheduler.js";
import stopsRouter from "./routes/stops.js";
import routesRouter from "./routes/routes.js";
import tripsRouter from "./routes/trips.js";
import adminRouter from "./routes/admin.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json());

app.use("/api/stops", stopsRouter);
app.use("/api/routes", routesRouter);
app.use("/api/trips", tripsRouter);
app.use("/api/admin", adminRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function startServer() {
  console.log("[BusCatcher API] Initializing database...");
  initDb();

  const database = getDb();
  const stopCount = database
    .prepare("SELECT COUNT(*) as count FROM stops")
    .get() as { count: number };

  if (stopCount.count === 0) {
    console.log("[BusCatcher API] No GTFS data found, importing...");
    try {
      await importGtfs((progress: { stage: string; message: string }) => {
        console.log(`[BusCatcher API] ${progress.stage}: ${progress.message}`);
      });
      console.log("[BusCatcher API] GTFS import completed");
    } catch (error) {
      console.error(
        "[BusCatcher API] GTFS import failed:",
        (error as Error).message,
      );
      console.error(
        "[BusCatcher API] Start server without data. Use POST /api/admin/refresh-gtfs to import.",
      );
    }
  } else {
    console.log(`[BusCatcher API] Database loaded: ${stopCount.count} stops`);
  }

  startGtfsScheduler();

  app.listen(PORT, () => {
    console.log(`[BusCatcher API] Server running on port ${PORT}`);
  });
}

process.on("SIGINT", () => {
  console.log("[BusCatcher API] Shutting down...");
  stopGtfsScheduler();
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[BusCatcher API] Shutting down...");
  stopGtfsScheduler();
  closeDb();
  process.exit(0);
});

startServer().catch((error: unknown) => {
  console.error("[BusCatcher API] Failed to start:", error);
  process.exit(1);
});

export default app;
