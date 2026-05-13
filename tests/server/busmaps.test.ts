import fs from "node:fs";
import * as busmaps from "../../server/busmaps.js";

vi.mock("node:fs");

const mockFs = vi.mocked(fs);
const TEST_API_KEY = "test-api-key";

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync.mockReturnValue(false);
});

describe("findMoscowGtfsUrl", () => {
  test("returns URL for Moscow feed by countryIso", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "moscow-official",
            feedGroupName: "open-data-portal-moscow",
            derivatives: [
              {
                type: "processed_data",
                path: "https://example.com/moscow.zip",
                fileName: "improved_gtfs.zip",
              },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/moscow.zip");
  });

  test("returns URL when countryIso is 'RU'", () => {
    const response = [
      {
        countryIso: "RU",
        countryName: "Russia",
        feeds: [
          {
            feedName: "moscow-official",
            derivatives: [
              { type: "processed_data", path: "https://example.com/ru.zip" },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/ru.zip");
  });

  test("returns URL when countryName contains 'russia'", () => {
    const response = [
      {
        countryIso: "",
        countryName: "Russian Federation",
        feeds: [
          {
            feedName: "moscow-official",
            derivatives: [
              {
                type: "processed_data",
                path: "https://example.com/russia-name.zip",
              },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/russia-name.zip");
  });

  test("matches feed by feedName containing 'moscow'", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "Moscow Official GTFS",
            feedGroupName: "other",
            derivatives: [
              { type: "processed_data", path: "https://example.com/name.zip" },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/name.zip");
  });

  test("matches feed by feedGroupName containing 'moscow'", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "other-feed",
            feedGroupName: "open-data-portal-moscow",
            derivatives: [
              { type: "processed_data", path: "https://example.com/group.zip" },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/group.zip");
  });

  test("prefers processed_data derivative over source_data", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "moscow-official",
            derivatives: [
              { type: "source_data", path: "https://example.com/source.zip" },
              {
                type: "processed_data",
                path: "https://example.com/processed.zip",
              },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/processed.zip");
  });

  test("falls back to first derivative if no processed_data", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "moscow-official",
            derivatives: [
              { type: "source_data", path: "https://example.com/first.zip" },
            ],
          },
        ],
      },
    ];

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/first.zip");
  });

  test("throws when Moscow feed not found", () => {
    const response = [
      {
        countryIso: "USA",
        countryName: "United States",
        feeds: [
          {
            feedName: "new-york",
            derivatives: [
              { type: "processed_data", path: "https://example.com/ny.zip" },
            ],
          },
        ],
      },
    ];

    expect(() => busmaps.findMoscowGtfsUrl(response)).toThrow(
      "Moscow GTFS feed not found",
    );
  });

  test("throws when no derivatives available", () => {
    const response = [
      {
        countryIso: "RUS",
        countryName: "Russia",
        feeds: [
          {
            feedName: "moscow-official",
            derivatives: [],
          },
        ],
      },
    ];

    expect(() => busmaps.findMoscowGtfsUrl(response)).toThrow(
      "Moscow GTFS feed not found",
    );
  });
});

describe("getCachedGtfsUrl", () => {
  test("returns cached URL if valid", async () => {
    const recentDate = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        url: "https://cached.example.com/moscow.zip",
        fetchedAt: recentDate,
      }),
    );

    const url = await busmaps.getCachedGtfsUrl(TEST_API_KEY);
    expect(url).toBe("https://cached.example.com/moscow.zip");
  });

  test("fetches new URL if cache expired and caches result", async () => {
    const oldDate = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        url: "https://old.example.com/moscow.zip",
        fetchedAt: oldDate,
      }),
    );

    const mockFetch = vi
      .fn()
      .mockResolvedValue("https://new.example.com/moscow.zip");

    mockFs.existsSync.mockImplementation(() => true);

    const url = await busmaps.getCachedGtfsUrl(TEST_API_KEY, mockFetch);
    expect(url).toBe("https://new.example.com/moscow.zip");
    expect(mockFetch).toHaveBeenCalledWith(TEST_API_KEY);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  test("fetches and caches if no cache exists", async () => {
    mockFs.existsSync.mockReturnValue(false);

    const mockFetch = vi
      .fn()
      .mockResolvedValue("https://fresh.example.com/moscow.zip");

    mockFs.existsSync.mockImplementation(() => true);

    const url = await busmaps.getCachedGtfsUrl(TEST_API_KEY, mockFetch);
    expect(url).toBe("https://fresh.example.com/moscow.zip");
    expect(mockFetch).toHaveBeenCalled();
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });
});

describe("clearCache", () => {
  test("removes cache file if exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    busmaps.clearCache();
    expect(mockFs.unlinkSync).toHaveBeenCalled();
  });

  test("does nothing if cache does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    busmaps.clearCache();
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("fetchGtfsUrl", () => {
  test("adds Bearer prefix if missing", async () => {
    const mockRequest = vi.fn().mockResolvedValue([
      {
        countryIso: "RUS",
        feeds: [
          {
            feedName: "moscow",
            derivatives: [{ path: "https://example.com/m.zip" }],
          },
        ],
      },
    ]);

    await busmaps.fetchGtfsUrl("test-key-123", mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ "capi-key": "Bearer test-key-123" }),
    );
  });

  test("does not double Bearer prefix", async () => {
    const mockRequest = vi.fn().mockResolvedValue([
      {
        countryIso: "RUS",
        feeds: [
          {
            feedName: "moscow",
            derivatives: [{ path: "https://example.com/m.zip" }],
          },
        ],
      },
    ]);

    await busmaps.fetchGtfsUrl("Bearer test-key-123", mockRequest);

    expect(mockRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ "capi-key": "Bearer test-key-123" }),
    );
  });
});
