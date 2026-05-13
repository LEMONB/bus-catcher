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
  test("returns URL for Moscow feed by country", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          country: "Russia",
          name: "Moscow GTFS",
          downloads: [{ url: "https://example.com/moscow.zip", latest: true }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/moscow.zip");
  });

  test("returns URL when country is 'ru'", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          country: "RU",
          downloads: [{ url: "https://example.com/ru.zip" }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/ru.zip");
  });

  test("returns URL when region is 'Moscow'", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          region: "Moscow",
          downloads: [{ url: "https://example.com/moscow-region.zip" }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/moscow-region.zip");
  });

  test("returns URL when name contains 'moscow'", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          name: "Moscow Official GTFS",
          downloads: [{ url: "https://example.com/name-match.zip" }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/name-match.zip");
  });

  test("throws when Moscow feed not found", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          country: "USA",
          name: "New York",
          downloads: [{ url: "https://example.com/ny.zip" }],
        },
      ],
    };

    expect(() => busmaps.findMoscowGtfsUrl(response)).toThrow(
      "Moscow GTFS feed not found",
    );
  });

  test("returns first download if no latest flag", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          country: "Russia",
          downloads: [{ url: "https://example.com/moscow.zip" }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/moscow.zip");
  });

  test("skips feed with latest: false, uses next", () => {
    const response = {
      data: [
        {
          id: "feed-1",
          country: "Russia",
          downloads: [
            { url: "https://example.com/old.zip", latest: false },
            { url: "https://example.com/new.zip", latest: true },
          ],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/new.zip");
  });

  test("uses feeds array when data is absent", () => {
    const response = {
      feeds: [
        {
          id: "feed-1",
          country: "Russia",
          downloads: [{ url: "https://example.com/feeds-array.zip" }],
        },
      ],
    };

    const url = busmaps.findMoscowGtfsUrl(response);
    expect(url).toBe("https://example.com/feeds-array.zip");
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
