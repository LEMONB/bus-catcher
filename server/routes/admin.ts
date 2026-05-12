import { Router, type Request, type Response } from "express";
import { importGtfs, type ImportProgress } from "../gtfs-importer.js";
import { getGtfsVersion } from "../db.js";

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "buscatcher-admin";

router.post("/refresh-gtfs", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const progressLog: ImportProgress[] = [];

  try {
    const result = await importGtfs((progress: ImportProgress) => {
      progressLog.push(progress);
      console.log(`[GTFS Import] ${progress.stage}: ${progress.message}`);
    });

    res.json({
      success: true,
      result,
      progress: progressLog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
      progress: progressLog,
    });
  }
});

router.get("/gtfs-status", (_req: Request, res: Response) => {
  const meta = getGtfsVersion();
  res.json(meta);
});

export default router;
