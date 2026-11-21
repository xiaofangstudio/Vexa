import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 需要固定端口；devUrl 与 tauri.conf.json 保持一致。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "chrome105",
    minify: "esbuild",
    sourcemap: false,
  },
});
