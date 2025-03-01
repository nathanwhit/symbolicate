import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [deno(), ...preact()],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext", // Needed for BigInt support
  },
});
