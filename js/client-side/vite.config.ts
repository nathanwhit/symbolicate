import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";

export default defineConfig({
  plugins: [deno()],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext", // Needed for BigInt support
  },
});
