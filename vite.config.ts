import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const buildStamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

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
      plugins: () => [{
        name: 'patch-scribe-worker-standard-simd',
        transform(code, id) {
          if (!id.includes('scribe.js-ocr/tess/worker-script')) return null;

          return code.replace(
            'const relaxedSimdSupport = await relaxedSimd();',
            'const relaxedSimdSupport = false;'
          );
        },
      }],
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
    plugins: [
      {
        name: "patch-scribe-lstm-only",
        enforce: "pre",
        transform(code, id) {
          if (!id.includes("scribe.js-ocr")) return null;

          return code.replace(
            "let oemCurrent = 2;",
            "let oemCurrent = 1; // Patched for local tessdata_best/fast LSTM-only assets."
          ).replace(
            "legacyCore: true,\n  legacyLang: true,",
            "legacyCore: false,\n  legacyLang: false,"
          ).replace(
            "const relaxedSimdSupport = await relaxedSimd();",
            // Scribe 0.15's relaxed-SIMD LSTM core aborts on DotProductSSE in
            // browsers that advertise relaxed SIMD. Its standard SIMD core is
            // compatible with the same LSTM tessdata and browser worker API.
            "const relaxedSimdSupport = false;"
          );
        },
        renderChunk(code, chunk) {
          if (!chunk.fileName.endsWith("generalWorker.js")) return null;

          return code
            .replace(
              "let oemCurrent = 2;",
              "let oemCurrent = 1; // Patched for local tessdata_best/fast LSTM-only assets."
            )
            .replace(
              "legacyCore: true,\n  legacyLang: true,",
              "legacyCore: false,\n  legacyLang: false,"
            )
            .replace(
              /legacyCore:!0,legacyLang:!0,workerBlobURL:!1/,
              "legacyCore:!1,legacyLang:!1,workerBlobURL:!1"
            )
            .replace(
              /(let\s+[\w$]+\s*=\s*)2(\s*,\s*[\w$]+\s*=\s*\["eng"\]\s*,\s*[\w$]+\s*=\s*!1\s*;)/,
              (_match, prefix, suffix) => `${prefix}1${suffix}`
            );
        },
        generateBundle(_options, bundle) {
          for (const item of Object.values(bundle)) {
            if (item.type !== "chunk" || !item.fileName.endsWith("generalWorker.js")) continue;

            item.code = item.code
              .replace(
                "let oemCurrent = 2;",
                "let oemCurrent = 1; // Patched for local tessdata_best/fast LSTM-only assets."
              )
              .replace(
                /(let\s+[\w$]+\s*=\s*)2(\s*,\s*[\w$]+\s*=\s*\["eng"\]\s*,\s*[\w$]+\s*=\s*!1\s*;)/,
                (_match, prefix, suffix) => `${prefix}1${suffix}`
              );
          }
        },
        writeBundle(options) {
          const outDir = options.dir || "docs";
          const assetsDir = path.resolve(outDir, "assets");
          const workerFileName = `generalWorker-${buildStamp}.js`;
          const workerPath = path.resolve(assetsDir, "generalWorker.js");
          const versionedWorkerPath = path.resolve(assetsDir, workerFileName);
          if (!fs.existsSync(workerPath)) return;

          for (const fileName of fs.readdirSync(assetsDir)) {
            if (/^generalWorker-\d+\.js$/.test(fileName) && fileName !== workerFileName) {
              fs.unlinkSync(path.resolve(assetsDir, fileName));
            }
          }

          const code = fs.readFileSync(workerPath, "utf8");
          const patched = code
            .replace(
              "let oemCurrent = 2;",
              "let oemCurrent = 1; // Patched for local tessdata_best/fast LSTM-only assets."
            )
            .replace(
              "legacyCore: true,\n  legacyLang: true,",
              "legacyCore: false,\n  legacyLang: false,"
            )
            .replace(
              /legacyCore:!0,legacyLang:!0,workerBlobURL:!1/,
              "legacyCore:!1,legacyLang:!1,workerBlobURL:!1"
            )
            .replace(
              /(let\s+[\w$]+\s*=\s*)2(\s*,\s*[\w$]+\s*=\s*\["eng"\]\s*,\s*[\w$]+\s*=\s*!1\s*;)/,
              (_match, prefix, suffix) => `${prefix}1${suffix}`
            );

          if (patched !== code) {
            fs.writeFileSync(workerPath, patched);
          }

          fs.writeFileSync(versionedWorkerPath, patched);

          for (const fileName of fs.readdirSync(assetsDir)) {
            if (!fileName.endsWith(".js") || fileName === workerFileName) continue;

            const filePath = path.resolve(assetsDir, fileName);
            const content = fs.readFileSync(filePath, "utf8");
            const rewritten = content
              .replace(/generalWorker\.js/g, workerFileName)
              .replace(/new URL\("generalWorker-[^"]+\.js"/g, `new URL("${workerFileName}"`);

            if (rewritten !== content) {
              fs.writeFileSync(filePath, rewritten);
            }
          }
        },
      },
      react(),
      tailwindcss(),
    ],
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
