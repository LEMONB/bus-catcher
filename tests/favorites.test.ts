import {
  getFavorites,
  saveFavorite,
  removeFavorite,
  type Favorite,
} from "../js/state/favorites";

const createMockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (i: number): string | null => Object.keys(store)[i] || null,
  } as Storage;
};

describe("favorites", () => {
  beforeEach(() => {
    global.localStorage = createMockStorage();
  });

  test("getFavorites returns empty array when no favorites", () => {
    const favorites = getFavorites();
    expect(favorites).toEqual([]);
  });

  test("saveFavorite adds a new favorite", () => {
    const favorite: Favorite = {
      id: "fav_1",
      name: "Дом → Работа",
      stopA: {
        stop_id: "stopA",
        stop_name: "Остановка А",
        stop_lat: "55.0",
        stop_lon: "37.0",
      },
      stopB: {
        stop_id: "stopB",
        stop_name: "Остановка Б",
        stop_lat: "55.1",
        stop_lon: "37.1",
      },
      homePoint: { lat: 55.75, lon: 37.61 },
    };

    saveFavorite(favorite);

    const favorites = getFavorites();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe("fav_1");
  });

  test("saveFavorite adds multiple favorites", () => {
    const fav1: Favorite = {
      id: "fav_1",
      name: "Route 1",
      stopA: { stop_id: "1", stop_name: "A", stop_lat: "55", stop_lon: "37" },
      stopB: { stop_id: "2", stop_name: "B", stop_lat: "55", stop_lon: "37" },
      homePoint: { lat: 55, lon: 37 },
    };
    const fav2: Favorite = {
      id: "fav_2",
      name: "Route 2",
      stopA: { stop_id: "3", stop_name: "C", stop_lat: "55", stop_lon: "37" },
      stopB: { stop_id: "4", stop_name: "D", stop_lat: "55", stop_lon: "37" },
      homePoint: { lat: 55, lon: 37 },
    };
    saveFavorite(fav1);
    saveFavorite(fav2);

    const favorites = getFavorites();
    expect(favorites).toHaveLength(2);
  });

  test("removeFavorite removes a favorite by id", () => {
    const fav1: Favorite = {
      id: "fav_1",
      name: "Route 1",
      stopA: { stop_id: "1", stop_name: "A", stop_lat: "55", stop_lon: "37" },
      stopB: { stop_id: "2", stop_name: "B", stop_lat: "55", stop_lon: "37" },
      homePoint: { lat: 55, lon: 37 },
    };
    const fav2: Favorite = {
      id: "fav_2",
      name: "Route 2",
      stopA: { stop_id: "3", stop_name: "C", stop_lat: "55", stop_lon: "37" },
      stopB: { stop_id: "4", stop_name: "D", stop_lat: "55", stop_lon: "37" },
      homePoint: { lat: 55, lon: 37 },
    };
    saveFavorite(fav1);
    saveFavorite(fav2);

    removeFavorite("fav_1");

    const favorites = getFavorites();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe("fav_2");
  });

  test("removeFavorite handles non-existent id", () => {
    const fav1: Favorite = {
      id: "fav_1",
      name: "Route 1",
      stopA: { stop_id: "1", stop_name: "A", stop_lat: "55", stop_lon: "37" },
      stopB: { stop_id: "2", stop_name: "B", stop_lat: "55", stop_lon: "37" },
      homePoint: { lat: 55, lon: 37 },
    };
    saveFavorite(fav1);

    removeFavorite("nonexistent");

    const favorites = getFavorites();
    expect(favorites).toHaveLength(1);
  });
});
