import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  cacheDir: "/private/tmp/str-intelligence-week-3-vite-cache",
  build: {
    outDir: "/private/tmp/str-intelligence-week-3-dist",
  },
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.STR_API_PROXY_TARGET ?? "http://127.0.0.1:8787",
    },
  },
});
