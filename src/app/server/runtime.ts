import { join } from "node:path";
import { getHeadFiles, type HeadImages } from "../../infra/head-files.repository";
import { createObsClient, createObsSocket } from "../../infra/obs.client";
import { getSettings } from "../../infra/settings.repository";
import { createHeadLoop, type HeadFeed } from "../../usecase/head.usecase";
import { log } from "./server-log";

export type Runtime = { feed: HeadFeed; images: HeadImages };

// Le plugin Nitro et les routes serveur partagent ce module : c'est le seul état du serveur.
let current: Runtime | undefined;

const exitServer = (reason: string): void => {
  log(reason);
  process.exit(0);
};

// Câblage : fichiers de la tête et réglages lus ici, une seule fois ; le mic d'OBS alimente la boucle de la tête.
export function startRuntime(): Runtime {
  const root = process.cwd();
  const port = process.env.PORT ?? "4747";
  const { head, images } = getHeadFiles(join(root, "tete-south-park"));
  const settings = getSettings(join(root, "settings.json"));
  const obs = createObsClient(
    {
      address: settings.obsAddress,
      micName: settings.micName,
      pageHosts: [`localhost:${port}`, `127.0.0.1:${port}`],
      log,
      onExit: exitServer,
    },
    // Le mot de passe vient de .env (OBS_PASSWORD) ; absent ou vide = connexion sans mot de passe.
    createObsSocket({ address: settings.obsAddress, password: process.env.OBS_PASSWORD || undefined, log }),
  );
  const loop = createHeadLoop({ mic: obs.mic, head, settings, clock: Date.now, random: Math.random });
  loop.start();
  obs.start();
  log(`Serveur démarré : http://localhost:${port}/head`);
  log(
    `Réglages : micro « ${settings.micName} », seuil ${settings.threshold} dB, délai ${settings.delay} ms.`,
  );
  current = { feed: loop.feed, images };
  return current;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error("Le serveur n'a pas fini de démarrer.");
  return current;
}
