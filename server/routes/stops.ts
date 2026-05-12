import { Router, type Request, type Response } from "express";
import { getDb } from "../db.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const database = getDb();
  const q = req.query.q as string | undefined;

  if (q && q.length >= 2) {
    const stops = database
      .prepare(
        `SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops
             WHERE stop_name LIKE ?
             ORDER BY stop_name
             LIMIT 50`,
      )
      .all(`%${q}%`);
    return res.json(stops);
  }

  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (!isNaN(lat) && !isNaN(lon)) {
    const stops = database
      .prepare(
        `SELECT stop_id, stop_name, stop_lat, stop_lon FROM (
                SELECT stop_id, stop_name, stop_lat, stop_lon,
                    (6371 * acos(
                        sin(?) * sin(stop_lat * 3.14159265 / 180) +
                        cos(?) * cos(stop_lat * 3.14159265 / 180) *
                        cos((stop_lon - ?) * 3.14159265 / 180)
                    )) as distance
                FROM stops
                WHERE location_type = 0
            ) WHERE distance < 1
            ORDER BY distance
            LIMIT 1`,
      )
      .all((lat * 3.14159265) / 180, (lat * 3.14159265) / 180, lon);

    if (stops.length > 0) {
      return res.json(stops[0]);
    }
    return res.status(404).json({ error: "No stops found nearby" });
  }

  res
    .status(400)
    .json({ error: "Provide q (search query) or lat/lon (coordinates)" });
});

router.get("/:id", (req: Request, res: Response) => {
  const database = getDb();
  const stop = database
    .prepare(
      "SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_id = ?",
    )
    .get(req.params.id);

  if (!stop) {
    return res.status(404).json({ error: "Stop not found" });
  }

  res.json(stop);
});

export default router;
