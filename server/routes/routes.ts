import { Router, type Request, type Response } from "express";
import { getDb } from "../db.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  const database = getDb();
  const fromStopId = req.query.from as string | undefined;
  const toStopId = req.query.to as string | undefined;

  if (!fromStopId || !toStopId) {
    return res.status(400).json({ error: "Provide from and to stop IDs" });
  }

  const routes = database
    .prepare(
      `SELECT DISTINCT r.route_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color, r.route_text_color
         FROM routes r
         INNER JOIN trips t ON r.route_id = t.route_id
         INNER JOIN stop_times st_from ON t.trip_id = st_from.trip_id
         INNER JOIN stop_times st_to ON t.trip_id = st_to.trip_id
         WHERE st_from.stop_id = ?
           AND st_to.stop_id = ?
           AND st_from.stop_sequence < st_to.stop_sequence`,
    )
    .all(fromStopId, toStopId);

  res.json(routes);
});

router.get("/available-stops", (req: Request, res: Response) => {
  const database = getDb();
  const fromStopId = req.query.from as string | undefined;

  if (!fromStopId) {
    return res.status(400).json({ error: "Provide from stop ID" });
  }

  const stops = database
    .prepare(
      `SELECT DISTINCT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon
         FROM stops s
         INNER JOIN stop_times st_to ON s.stop_id = st_to.stop_id
         INNER JOIN stop_times st_from ON st_to.trip_id = st_from.trip_id
         WHERE st_from.stop_id = ?
           AND st_from.stop_sequence < st_to.stop_sequence`,
    )
    .all(fromStopId);

  res.json(stops);
});

export default router;
