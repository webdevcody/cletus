import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, rmSync } from "fs";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-manifest-and-fix-html",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");

        // Copy manifest
        copyFileSync(
          resolve(__dirname, "src/manifest.json"),
          resolve(distDir, "manifest.json")
        );

        // Move HTML files to root if they're nested
        const popupSrc = resolve(distDir, "src/popup/popup.html");
        const optionsSrc = resolve(distDir, "src/options/options.html");

        if (existsSync(popupSrc)) {
          copyFileSync(popupSrc, resolve(distDir, "popup.html"));
        }
        if (existsSync(optionsSrc)) {
          copyFileSync(optionsSrc, resolve(distDir, "options.html"));
        }

        // Clean up nested src directory
        if (existsSync(resolve(distDir, "src"))) {
          rmSync(resolve(distDir, "src"), { recursive: true, force: true });
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    open: "/src/index.html", // Open the dev guide
    hmr: {
      port: 5173,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        options: resolve(__dirname, "src/options/options.html"),
        content: resolve(__dirname, "src/content/content.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "content" ? "content.js" : "[name].js";
        },
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || "";
          if (name.endsWith(".html")) {
            return name;
          }
          return "assets/[name][extname]";
        },
      },
    },
    // Watch mode for development
    watch: process.env.NODE_ENV === "development" ? {} : null,
  },
  define: {
    "process.env": {},
  },
});
