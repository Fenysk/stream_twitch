import { defineConfig } from "vite";

// Même règle que tools/start.mjs : 4747 par défaut, la variable PORT en choisit un autre.
const port = Number(process.env.PORT ?? 4747);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error(`PORT n'est pas un port valide : ${process.env.PORT}`);

// Le bundle contient toutes ses dépendances (SDK, ws, zod) : le dossier du plugin est copié tel quel par Stream Deck, sans node_modules.
export default defineConfig({
  publicDir: false,
  define: { serverPortAtBuild: String(port) },
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "streamdeck/src/plugin.ts",
    outDir: "streamdeck/com.fenysk.stream-twitch.sdPlugin/bin",
    emptyOutDir: true,
    copyPublicDir: false,
    target: "node20",
    rollupOptions: { output: { format: "es", entryFileNames: "plugin.js" } },
  },
  plugins: [
    {
      name: "emit-module-package-file",
      // Sans ce fichier, Node lirait bin/plugin.js comme du CommonJS.
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "package.json", source: '{ "type": "module" }' });
      },
    },
  ],
});
