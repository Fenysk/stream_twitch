import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "src/app" }),
    // Le serveur local (flux SSE, images, client OBS) est côté Nitro ; Start ne sert que la page.
    nitro({
      plugins: ["./src/app/server/boot.plugin.ts"],
      routes: {
        "/api/head/events": "./src/app/server/head-events.ts",
        "/api/head/image/:part": "./src/app/server/head-image.ts",
      },
    }),
    viteReact(),
  ],
});
