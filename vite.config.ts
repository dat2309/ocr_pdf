import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const buildTime = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    base: "./",
    define: {
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'index') {
              return 'assets/worker-index.js';
            }
            return 'assets/[name].js';
          },
        },
      },
    },
    build: {
      target: 'esnext',
      outDir: "docs", // Build thẳng vào thư mục docs
      emptyOutDir: false,
      rollupOptions: {
        output: {
          entryFileNames: "assets/index.js",
          chunkFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'index') {
              return 'assets/app-[name].js';
            }
            return 'assets/[name].js';
          },
          assetFileNames: (assetInfo) => {
            if (assetInfo.names?.some((name) => name.endsWith(".css"))) {
              return "assets/index.css";
            }
            if (assetInfo.names?.some((name) => name.endsWith(".js") || name.endsWith(".mjs"))) {
              return "assets/raw-[name][extname]";
            }
            return "assets/[name][extname]";
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "@scribe.js/canvas": path.resolve(__dirname, "./src/utils/emptyMock.ts"),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === "true" ? null : {},
    },
  };
});
