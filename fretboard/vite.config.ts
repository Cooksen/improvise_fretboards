import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./"：用相對路徑，放在 GitHub Pages 的任何 repo 子路徑下都能跑
export default defineConfig({
  base: "./",
  plugins: [react()],
});
