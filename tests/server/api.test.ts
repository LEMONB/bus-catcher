import request from "supertest";
import express from "express";
import stopsRouter from "../../server/routes/stops.js";
import routesRouter from "../../server/routes/routes.js";
import tripsRouter from "../../server/routes/trips.js";
import "./setup.js";

const app = express();
app.use(express.json());
app.use("/api/stops", stopsRouter);
app.use("/api/routes", routesRouter);
app.use("/api/trips", tripsRouter);

describe("GET /api/stops", () => {
  test("search stops by query", async () => {
    const res = await request(app).get("/api/stops").query({ q: "Test" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].stop_name).toContain("Test");
  });

  test("search stops returns empty for non-matching query", async () => {
    const res = await request(app)
      .get("/api/stops")
      .query({ q: "nonexistent" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("find nearest stop by coordinates", async () => {
    const res = await request(app)
      .get("/api/stops")
      .query({ lat: 55.7558, lon: 37.6173 });
    expect(res.status).toBe(200);
    expect(res.body.stop_id).toBe("stop_1");
  });

  test("returns 404 when no stops nearby", async () => {
    const res = await request(app).get("/api/stops").query({ lat: 0, lon: 0 });
    expect(res.status).toBe(404);
  });

  test("returns 400 when no params provided", async () => {
    const res = await request(app).get("/api/stops");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/stops/:id", () => {
  test("get stop by ID", async () => {
    const res = await request(app).get("/api/stops/stop_1");
    expect(res.status).toBe(200);
    expect(res.body.stop_id).toBe("stop_1");
    expect(res.body.stop_name).toBe("Test Stop 1");
  });

  test("returns 404 for non-existent stop", async () => {
    const res = await request(app).get("/api/stops/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/routes", () => {
  test("find routes from stop_1 to stop_2", async () => {
    const res = await request(app)
      .get("/api/routes")
      .query({ from: "stop_1", to: "stop_2" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].route_id).toBe("route_1");
  });

  test("find routes from stop_1 to stop_3", async () => {
    const res = await request(app)
      .get("/api/routes")
      .query({ from: "stop_1", to: "stop_3" });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].route_id).toBe("route_1");
  });

  test("no routes from stop_3 to stop_1", async () => {
    const res = await request(app)
      .get("/api/routes")
      .query({ from: "stop_3", to: "stop_1" });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  test("returns 400 when missing params", async () => {
    const res = await request(app).get("/api/routes").query({ from: "stop_1" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/routes/available-stops", () => {
  test("get available stops from stop_1", async () => {
    const res = await request(app)
      .get("/api/routes/available-stops")
      .query({ from: "stop_1" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const stopIds = res.body.map((s: { stop_id: string }) => s.stop_id);
    expect(stopIds).toContain("stop_2");
    expect(stopIds).toContain("stop_3");
  });

  test("returns 400 when missing from param", async () => {
    const res = await request(app).get("/api/routes/available-stops");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/trips/:id/times", () => {
  test("get trip times", async () => {
    const res = await request(app).get("/api/trips/trip_1/times");
    expect(res.status).toBe(200);
    expect(res.body.trip).toBeDefined();
    expect(res.body.trip.trip_id).toBe("trip_1");
    expect(res.body.trip.route_id).toBe("route_1");
    expect(Array.isArray(res.body.stopTimes)).toBe(true);
    expect(res.body.stopTimes.length).toBe(3);
    expect(res.body.stopTimes[0].stop_id).toBe("stop_1");
    expect(res.body.stopTimes[1].stop_id).toBe("stop_2");
  });

  test("returns 404 for non-existent trip", async () => {
    const res = await request(app).get("/api/trips/nonexistent/times");
    expect(res.status).toBe(404);
  });
});
