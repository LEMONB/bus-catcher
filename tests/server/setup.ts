import Database from "better-sqlite3";

let testDb: Database.Database;

beforeAll(async () => {
  process.env.DATA_DIR = "./tmp/test-data";

  const dbModule = await import("../../server/db.js");
  dbModule.initDb();
  testDb = dbModule.getDb();

  testDb.exec("DELETE FROM stop_times");
  testDb.exec("DELETE FROM trips");
  testDb.exec("DELETE FROM routes");
  testDb.exec("DELETE FROM stops");

  testDb.exec(`
        INSERT INTO stops (stop_id, stop_name, stop_lat, stop_lon) VALUES
        ('stop_1', 'Test Stop 1', 55.7558, 37.6173),
        ('stop_2', 'Test Stop 2', 55.7560, 37.6180),
        ('stop_3', 'Other Stop', 55.7570, 37.6190)
    `);

  testDb.exec(`
        INSERT INTO routes (route_id, route_short_name, route_long_name) VALUES
        ('route_1', 'M1', 'Route M1'),
        ('route_2', 'M2', 'Route M2')
    `);

  testDb.exec(`
        INSERT INTO trips (trip_id, route_id) VALUES
        ('trip_1', 'route_1'),
        ('trip_2', 'route_1'),
        ('trip_3', 'route_2')
    `);

  testDb.exec(`
        INSERT INTO stop_times (trip_id, stop_id, arrival_time, departure_time, stop_sequence) VALUES
        ('trip_1', 'stop_1', '08:00:00', '08:00:00', 1),
        ('trip_1', 'stop_2', '08:05:00', '08:05:00', 2),
        ('trip_1', 'stop_3', '08:10:00', '08:10:00', 3),
        ('trip_2', 'stop_1', '08:30:00', '08:30:00', 1),
        ('trip_2', 'stop_2', '08:35:00', '08:35:00', 2),
        ('trip_3', 'stop_2', '09:00:00', '09:00:00', 1),
        ('trip_3', 'stop_1', '09:05:00', '09:05:00', 2)
    `);
});

afterAll(async () => {
  const dbModule = await import("../../server/db.js");
  dbModule.closeDb();
});

export { testDb };
