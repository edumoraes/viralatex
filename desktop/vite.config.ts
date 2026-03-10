/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "__vite-optional-peer-dep:@langchain/core/messages:@langchain/langgraph-sdk:false": "@langchain/core/messages"
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome105", "safari13"]
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: false
  }
});
