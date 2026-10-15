import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "src/app" }),
    // Le serveur local (flux SSE, expressions et leurs images, API des réglages, clients OBS et Twitch) est côté Nitro ; Start ne sert que les pages.
    nitro({
      plugins: ["./src/app/server/boot.plugin.ts"],
      routes: {
        "/api/head/events": "./src/app/server/head-events.ts",
        "/api/chat/events": "./src/app/server/chat-events.ts",
        "/api/expressions": "./src/app/server/expressions-api.ts",
        "/api/expressions/:id": "./src/app/server/expression-api.ts",
        "/api/expressions/:id/image/:part": "./src/app/server/expression-image.ts",
        "/api/settings": "./src/app/server/settings-api.ts",
        "/api/mic/stream": "./src/app/server/mic-stream.ts",
        "/api/fox/events": "./src/app/server/fox-events.ts",
        "/api/fox/voices": "./src/app/server/fox-voices.ts",
        "/api/fox/speak": "./src/app/server/fox-speak.ts",
        "/api/fox/review": "./src/app/server/fox-review.ts",
        "/api/fox/speech/:id": "./src/app/server/fox-speech.ts",
        "/api/rewards": "./src/app/server/rewards-api.ts",
        "/api/reward-phrases": "./src/app/server/reward-phrases-api.ts",
        "/api/reward-phrases/:id": "./src/app/server/reward-phrase-api.ts",
        "/api/reward-phrases/:id/test": "./src/app/server/reward-phrase-test.ts",
        "/api/sounds": "./src/app/server/sounds-api.ts",
        "/api/sounds/events": "./src/app/server/sounds-events.ts",
        "/api/sounds/stop": "./src/app/server/sounds-stop.ts",
        "/api/sounds/played": "./src/app/server/sounds-played.ts",
        "/api/sounds/:id": "./src/app/server/sound-api.ts",
        "/api/sounds/:id/file": "./src/app/server/sound-file.ts",
        "/api/sounds/:id/play": "./src/app/server/sound-play.ts",
        "/api/twitch/status": "./src/app/server/twitch-status.ts",
        "/api/twitch/viewers": "./src/app/server/twitch-viewers.ts",
        "/api/twitch/disconnect": "./src/app/server/twitch-disconnect.ts",
        "/auth/twitch/start": "./src/app/server/twitch-start.ts",
        "/auth/twitch/callback": "./src/app/server/twitch-callback.ts",
      },
    }),
    viteReact(),
  ],
});
