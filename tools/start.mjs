// Lanceur de `pnpm start` : sort si le port est pris, sinon construit puis démarre le serveur dans ce processus.
// `--open` (passé par obs/start-server.lua) ouvre ensuite les réglages dans le navigateur par défaut.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 4747 par défaut ; la variable PORT en choisit un autre (un serveur d'essai à côté de celui du stream).
const PORT = Number(process.env.PORT ?? 4747);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`PORT n'est pas un port valide : ${process.env.PORT}`);
  process.exit(1);
}
const HOST = "127.0.0.1";
const SERVER_WAIT_MS = 15_000;
const shouldOpenSettings = process.argv.includes("--open");
const settingsUrl = `http://localhost:${PORT}/`;
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

async function waitForPort() {
  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    if (await isPortTaken()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

// explorer.exe ouvre l'URL dans le navigateur par défaut, sans fenêtre de console.
function openSettings() {
  spawn("explorer.exe", [settingsUrl], { detached: true, stdio: "ignore" }).unref();
  console.log(`Réglages ouverts dans le navigateur : ${settingsUrl}`);
}

// Avant le build : un `vite build` écraserait `.output/` sous le serveur qui tourne.
if (await isPortTaken()) {
  console.log(
    `Un serveur écoute déjà sur http://localhost:${PORT} : ce lancement s'arrête, l'autre continue.`,
  );
  if (shouldOpenSettings) openSettings();
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

if (shouldOpenSettings) {
  if (await waitForPort()) openSettings();
  else
    console.error(
      `Le serveur ne répond pas sur le port ${PORT} après ${SERVER_WAIT_MS / 1000} s : réglages non ouverts.`,
    );
}
