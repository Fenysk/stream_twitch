import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { toChatChannel } from "../../domain/chat-settings.rules";
import type { ExpressionRef } from "../../domain/head.types";
import type { Settings } from "../../domain/settings.schema";
import { createChatClient } from "../../infra/chat.client";
import { createExpressionStore } from "../../infra/expression.repository";
import { getHeadFiles } from "../../infra/head-files.repository";
import {
  deleteLocalSettings,
  getLocalSettings,
  updateLocalSettings,
} from "../../infra/local-settings.repository";
import { createObsClient, createObsSocket, type ObsClient } from "../../infra/obs.client";
import { getSettings } from "../../infra/settings.repository";
import { type Chat, createChat } from "../../usecase/chat.usecase";
import { createExpressionLibrary, type ExpressionLibrary } from "../../usecase/expression.usecase";
import { createHeadLoop, type HeadFeed } from "../../usecase/head.usecase";
import { createSettingsStore, type SettingsStore } from "../../usecase/settings.usecase";
import { log } from "./server-log";

export type Runtime = {
  feed: HeadFeed;
  expressions: ExpressionLibrary;
  settings: SettingsStore;
  obs: ObsClient;
  chat: Chat;
};

// Le plugin Nitro et les routes serveur partagent ce module : c'est le seul état du serveur.
let current: Runtime | undefined;

const exitServer = (reason: string): void => {
  log(reason);
  process.exit(0);
};

const isSame = (a: ExpressionRef, b: ExpressionRef): boolean => a.id === b.id && a.version === b.version;

// Câblage : la photo et les réglages sont lus ici, une seule fois ; le mic d'OBS alimente la boucle de la tête, et
// chaque réglage changé depuis l'interface (curseurs, expression active, allure du tchat) s'applique à la boucle, au
// client OBS et au tchat sans relancer le serveur. Les expressions enregistrées vivent dans data/heads/ ; une expression
// retouchée s'applique aussitôt. Le tchat se lit sans OBS : il démarre même quand OBS est fermé.
export function startRuntime(): Runtime {
  const root = process.cwd();
  const port = process.env.PORT ?? "4747";
  const localPath = join(root, "settings.local.json");
  // La version de la photo change à chaque démarrage : OBS ne garde pas l'ancienne image de la photo en cache.
  const { head, geometry, images } = getHeadFiles(join(root, "tete-south-park"), String(Date.now()));
  const store = createExpressionStore(join(root, "data", "heads"), log);
  const expressions: ExpressionLibrary = createExpressionLibrary({
    builtIn: { head, geometry, images },
    store,
    createId: () => {
      let id = randomBytes(4).toString("hex");
      while (store.get(id)) id = randomBytes(4).toString("hex");
      return id;
    },
    onChange: () => applyExpression(settings.getState().effective),
  });
  let shown: ExpressionRef = head.expression;
  // L'expression choisie dans les réglages devient celle de la boucle ; si elle a disparu (supprimée), la photo reprend
  // et le choix est effacé de settings.local.json.
  const applyExpression = (effective: Settings): void => {
    const active = expressions.getActive(effective.expression);
    if (!active.found) {
      log(`Expression « ${effective.expression} » introuvable : la photo reprend.`);
      settings.update({ expression: null });
      return;
    }
    if (isSame(active.head.expression, shown)) return;
    shown = active.head.expression;
    loop.updateHead(active.head);
    log(`Expression active : ${shown.id}.`);
  };
  const settings = createSettingsStore({
    defaults: getSettings(join(root, "settings.json")),
    local: getLocalSettings(localPath, log),
    port: {
      updateLocal: (local) => updateLocalSettings(localPath, local),
      deleteLocal: () => deleteLocalSettings(localPath),
    },
    onChange: (effective: Settings) => {
      loop.update(effective);
      applyExpression(effective);
      obs.updateMicName(effective.micName);
      chat.update(effective);
    },
    log,
  });
  const initial = settings.getState().effective;
  // Au démarrage : l'expression choisie la dernière fois, ou la photo si elle n'existe plus (l'ancien choix est effacé).
  const start = expressions.getActive(initial.expression);
  if (!start.found) log(`Expression « ${initial.expression} » introuvable au démarrage : la photo reprend.`);
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
    head: start.head,
    settings: initial,
    clock: Date.now,
    random: Math.random,
  });
  const chat = createChat({
    source: createChatClient({ channel: toChatChannel(initial), log }),
    settings: initial,
    clock: Date.now,
  });
  shown = start.head.expression;
  loop.start();
  if (!start.found) settings.update({ expression: null });
  obs.start();
  chat.start();
  log(`Serveur démarré : http://localhost:${port}/head et /chat (réglages : http://localhost:${port}/)`);
  log(`Réglages : micro « ${initial.micName} », seuil ${initial.threshold} dB, délai ${initial.delay} ms.`);
  current = { feed: loop.feed, expressions, settings, obs, chat };
  return current;
}

export function getRuntime(): Runtime {
  if (!current) throw new Error("Le serveur n'a pas fini de démarrer.");
  return current;
}
