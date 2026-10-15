import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const PAGE = "inspector.html";

// Stream Deck ouvre le panneau depuis le disque (file://) : le navigateur y refuse les scripts module, le CORS et les polices
// voisines. Le panneau est donc un seul fichier, script classique, styles et police dedans, sans aucune requête.
const inlineEverything = (): Plugin => ({
  name: "inline-inspector",
  enforce: "post",
  generateBundle(_options, bundle) {
    const page = bundle[PAGE];
    if (page?.type !== "asset") throw new Error(`${PAGE} manque à la construction du panneau.`);
    let html = String(page.source);
    for (const [fileName, file] of Object.entries(bundle)) {
      if (file.type === "chunk") {
        // Un « </script » dans le code fermerait la balise : on l'échappe.
        const code = file.code.replace(/<\/script/gi, "<\\/script");
        html = html
          .replace(/<script\b[^>]*><\/script>\s*/, "")
          .replace("</body>", () => `<script>${code}</script>\n</body>`);
        delete bundle[fileName];
      } else if (fileName.endsWith(".css")) {
        html = html.replace(
          /<link\b[^>]*rel="stylesheet"[^>]*>/,
          () => `<style>${String(file.source)}</style>`,
        );
        delete bundle[fileName];
      }
    }
    page.source = html;
  },
});

// Le panneau est construit à côté du plugin, dans le dossier que Stream Deck copie (`ui/`, hors de git comme `bin/`).
export default defineConfig({
  root: "streamdeck",
  base: "./",
  publicDir: false,
  plugins: [viteReact(), inlineEverything()],
  build: {
    outDir: "com.fenysk.stream-twitch.sdPlugin/ui",
    emptyOutDir: true,
    target: "chrome105",
    // Toute la police dans le CSS (data:), pas un fichier à côté.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: { inspector: "streamdeck/inspector.html" },
      output: { format: "iife" },
    },
  },
});
