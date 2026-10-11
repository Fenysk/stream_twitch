import { join } from "node:path";
import type { Settings } from "../../domain/settings.schema";
import { getHeadFiles, type HeadImages } from "../../infra/head-files.repository";
import {
  deleteLocalSettings,
  getLocalSettings,
  updateLocalSettings,
} from "../../infra/local-settings.repository";
import { createObsClient, createObsSocket, type ObsClient } from "../../infra/obs.client";
import { getSettings } from "../../infra/settings.repository";
import { createHeadLoop, type HeadFeed } from "../../usecase/head.usecase";
import { createSettingsStore, type SettingsStore } from "../../usecase/settings.usecase";
import { log } from "./server-log";

export type Runtime = { feed: HeadFeed; images: HeadImages; settings: SettingsStore; obs: ObsClient };

// Le plugin Nitro et les routes serveur partagent ce module : c'est le seul état du serveur.
let current: Runtime | undefined;

const exitServer = (reason: string): void => {
  log(reason);
  process.exit(0);
};

// Câblage : fichiers de la tête et réglages lus ici, une seule fois ; le mic d'OBS alimente la boucle de la tête, et
// chaque réglage changé depuis l'interface s'applique à la boucle et au client OBS sans relancer le serveur.
export function startRuntime(): Runtime {
  const root = process.cwd();
  const port = process.env.PORT ?? "4747";
  const localPath = join(root, "settings.local.json");
  const { head, images } = getHeadFiles(join(root, "tete-south-park"));
  const settings = createSettingsStore({
    defaults: getSettings(join(root, "settings.json")),
    local: getLocalSettings(localPath, log),
    port: {
      updateLocal: (local) => updateLocalSettings(localPath, local),
      deleteLocal: () => deleteLocalSettings(localPath),
    },
    onChange: (effective: Settings) => {
      loop.update(effective);
      obs.updateMicName(effective.micName);
    },
    log,
  });
  const initial = settings.getState().effective;
  const obs = createObsClient(
    {
      address: initial.obsAddress,
      micName: initial.micName,
      // Seules les sources qui pointent vers CE port sont rafraîchies : un serveur d'essai sur un autre port ne touche pas à celle du stream.
      pageHosts: [`localhost:${port}`, `127.0.0.1:${port}`],
      log,
      onExit: exitServer,
    },
    // Le mot de passe vient de .env (OBS_PASSWORD) ; absent ou vide = connexion sans mot de passe.
    createObsSocket({ address: initial.obsAddress, password: process.env.OBS_PASSWORD || undefined, log }),
  );
  const loop = createHeadLoop({
    mic: obs.mic,
    head,
    settings: initial,
    clock: Date.now,
    random: Math.random,
  });
  loop.start();
  obs.start();
  log(`Serveur démarré : http://localhost:${port}/head (réglages : http://localhost:${port}/)`);
  log(`Réglages : micro « ${initial.micName} », seuil ${initial.threshold} dB, délai ${initial.delay} ms.`);
  current = { feed: loop.feed, images, settings, obs };
  return current;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error("Le serveur n'a pas fini de démarrer.");
  return current;
}
