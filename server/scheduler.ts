import cron from "node-cron";
import { importGtfs } from "./gtfs-importer.js";
import { getGtfsVersion } from "./db.js";

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

export function startGtfsScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  console.log(
    "[Scheduler] GTFS auto-update scheduled for every Sunday at 3:00 AM",
  );

  scheduledTask = cron.schedule("0 3 * * 0", async () => {
    console.log("[Scheduler] Running scheduled GTFS update...");
    try {
      const currentVersion = getGtfsVersion();
      console.log(
        `[Scheduler] Current GTFS version: ${currentVersion.version ?? "unknown"} (updated: ${currentVersion.updatedAt ?? "never"})`,
      );

      await importGtfs((progress: { stage: string; message: string }) => {
        console.log(`[Scheduler] ${progress.stage}: ${progress.message}`);
      });

      console.log("[Scheduler] GTFS update completed successfully");
    } catch (error) {
      console.error(
        "[Scheduler] GTFS update failed:",
        (error as Error).message,
      );
    }
  });

  scheduledTask.start();
}

export function stopGtfsScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
