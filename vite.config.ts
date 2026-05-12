import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "js/index.ts",
      name: "BusCatcher",
      fileName: () => "bundle.js",
      formats: ["iife"],
    },
    rollupOptions: {
      external: ["leaflet"],
      output: {
        globals: {
          leaflet: "L",
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": "/js",
    },
  },
});
