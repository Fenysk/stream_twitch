import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "src/app" }),
    // Le serveur local (flux SSE, expressions et leurs images, API des réglages, client OBS) est côté Nitro ; Start ne sert que les pages.
    nitro({
      plugins: ["./src/app/server/boot.plugin.ts"],
      routes: {
        "/api/head/events": "./src/app/server/head-events.ts",
        "/api/expressions": "./src/app/server/expressions-api.ts",
        "/api/expressions/:id": "./src/app/server/expression-api.ts",
        "/api/expressions/:id/image/:part": "./src/app/server/expression-image.ts",
        "/api/settings": "./src/app/server/settings-api.ts",
        "/api/mic/stream": "./src/app/server/mic-stream.ts",
      },
    }),
    viteReact(),
  ],
});
