import { Router, type Request, type Response } from "express";
import { getDb } from "../db.js";

const router = Router();

router.get("/:id/times", (req: Request, res: Response) => {
  const database = getDb();
  const tripId = req.params.id;

  const stopTimes = database
    .prepare(
      `SELECT st.trip_id, st.stop_id, st.arrival_time, st.departure_time, st.stop_sequence,
                s.stop_name, s.stop_lat, s.stop_lon
         FROM stop_times st
         INNER JOIN stops s ON st.stop_id = s.stop_id
         WHERE st.trip_id = ?
         ORDER BY st.stop_sequence`,
    )
    .all(tripId);

  if (stopTimes.length === 0) {
    return res
      .status(404)
      .json({ error: "Trip not found or has no stop times" });
  }

  const trip = database
    .prepare(
      `SELECT t.trip_id, t.route_id, t.direction_id,
                r.route_short_name, r.route_long_name
         FROM trips t
         INNER JOIN routes r ON t.route_id = r.route_id
         WHERE t.trip_id = ?`,
    )
    .get(tripId);

  res.json({
    trip,
    stopTimes,
  });
});

export default router;
