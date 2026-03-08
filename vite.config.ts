import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { youtubeDevPlugin } from "./src/vite-plugin-youtube";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    youtubeDevPlugin(),
    cloudflare({
      inspectorPort: false,
      persistState: process.env.APP_PERSIST_TO
        ? {
            path: process.env.APP_PERSIST_TO,
          }
        : undefined,
    }),
  ],
});
