beforeAll(() => {
  (globalThis as any).window = {};
  (globalThis as any).history = { replaceState: () => {} };

  Object.defineProperty(window, "location", {
    value: { search: "", pathname: "/", href: "http://localhost/" },
    writable: true,
  });
  Object.defineProperty(window, "history", {
    value: { replaceState: () => {} },
    writable: true,
  });
});
