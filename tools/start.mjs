// Lanceur de `pnpm start` : sort si le port est pris, sinon construit puis démarre le serveur dans ce processus.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 4747;
const HOST = "127.0.0.1";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function isPortTaken() {
  return new Promise((resolve) => {
    const socket = connect({ port: PORT, host: HOST });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// Avant le build : un `vite build` écraserait `.output/` sous le serveur qui tourne.
if (await isPortTaken()) {
  console.log(
    `Un serveur écoute déjà sur http://localhost:${PORT} : ce lancement s'arrête, l'autre continue.`,
  );
  process.exit(0);
}

if (existsSync(".env")) process.loadEnvFile(".env");

console.log("Construction du serveur…");
const build = spawnSync(
  process.execPath,
  [join(root, "node_modules/vite/bin/vite.js"), "build", "--logLevel", "error"],
  {
    stdio: "inherit",
  },
);
if (build.status !== 0) {
  console.error("La construction a échoué : le serveur n'est pas lancé.");
  process.exit(build.status ?? 1);
}

process.env.PORT = String(PORT);
process.env.HOST = HOST;
await import(pathToFileURL(join(root, ".output/server/index.mjs")).href);
