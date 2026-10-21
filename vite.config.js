import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const rootDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { host, port, strictPort: true },
  preview: { host, port, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        home: resolve(rootDirectory, "index.html"),
        imposteur: resolve(rootDirectory, "imposteur/index.html"),
      },
    },
  },
});
