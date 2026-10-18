import type { RewardRecord } from "../domain/reward.schema";
import type { RewardEvent, RewardStatus } from "../domain/reward.types";
import type { SoundEvent } from "../domain/sound.schema";
import type { RewardPort } from "./reward.usecase";
import type { PlayableSound } from "./sound.usecase";

// Un son que la page n'a pas fini au bout de 10 min est tenu pour raté : la queue ne reste pas bloquée derrière lui.
export const MAX_PLAY_MS = 10 * 60_000;

export type SoundScreen = (event: SoundEvent) => void;

export type PlayResult = { ok: true } | { ok: false; status: 404 | 409; message: string };

// Ce que le renard dit après le son d'un rachat : rend vrai quand la phrase a été dite.
export type AfterSound = () => Promise<boolean>;

export type SoundQueueDeps = {
  library: {
    get(id: string): PlayableSound | undefined;
    // Le fichier du son ; `undefined` : il a disparu du disque.
    getAudio(id: string): unknown;
  };
  // Le sound d'un reward et si l'app le gère (data/rewards.json) : ce qu'un rachat doit jouer.
  records: { getRecord(rewardId: string): Pick<RewardRecord, "sound" | "isManaged"> | undefined };
  rewards: Pick<RewardPort, "settle">;
  createId: () => string;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type SoundQueue = {
  // Une page /sounds se connecte ; rend de quoi la déconnecter.
  subscribe(screen: SoundScreen): () => void;
  // « Jouer dans OBS » : le son rejoint la queue.
  play(soundId: string): PlayResult;
  // Une redemption : le sound de son reward rejoint la queue, et ses points sont gardés (FULFILLED) s'il joue jusqu'au bout,
  // rendus (CANCELED) sinon. Avec `afterSound`, la queue le lance dès que le son est passé (fini ou raté, jamais coupé) : le
  // son raté garde alors les points si la phrase est dite. Avec `onPlay`, la queue l'appelle une fois, quand elle envoie le son à
  // la page /sounds : jamais si le son ne joue pas (pas de page, fichier manquant, son supprimé, coupé avant). Rend faux, sans
  // rien faire, pour un reward qui n'a pas de son.
  redeem(redemption: RewardEvent, afterSound?: AfterSound, onPlay?: () => void): boolean;
  // « Couper le son » : le son en cours s'arrête dans la page, la queue se vide.
  stop(): void;
  // La réponse de la page : le son a fini, ou n'a pas pu jouer.
  finish(playId: string, outcome: "ended" | "failed", reason?: string): void;
  // Le son est supprimé : ses redemptions en attente sont remboursées, et il se tait s'il joue.
  forget(soundId: string): Promise<void>;
  // Le reward est supprimé : ses redemptions en attente sont remboursées, et son sound se tait s'il joue pour l'une d'elles.
  forgetReward(rewardId: string): Promise<void>;
};

// Une demande de lecture : un son, avec la redemption à marquer quand il a joué (aucune pour « Jouer dans OBS ») et `isManaged` :
// l'app a créé la récompense et peut marquer ses rachats. Sinon (une récompense qu'Alexis a faite sur Twitch), Twitch le refuse :
// le son joue, aucun statut n'est demandé. `afterSound` : la phrase du renard qui suit le son. `onPlay` : appelé quand le son part.
type Request = {
  soundId: string;
  redemption?: RewardEvent;
  isManaged?: boolean;
  afterSound?: AfterSound;
  onPlay?: () => void;
};

// La fin d'une demande : le son a joué jusqu'au bout, n'a pas pu jouer, ou on l'a coupé (« Couper le son », son supprimé).
type Ending = "ended" | "failed" | "cut";

type Playing = {
  playId: string;
  request: Request;
  title: string;
  screen: SoundScreen;
  cancelWatch: () => void;
};

export function createSoundQueue({
  library,
  records,
  rewards,
  createId,
  schedule,
  log,
}: SoundQueueDeps): SoundQueue {
  const screens: SoundScreen[] = [];
  const pending: Request[] = [];
  let playing: Playing | undefined;

  // Marque la redemption (le journal le dit) ; sans redemption, rien à faire. Ne lève jamais : Twitch répond par un résultat.
  const settleOwn = async (redemption: RewardEvent, status: RewardStatus): Promise<void> => {
    const result = await rewards.settle({ id: redemption.id, rewardId: redemption.rewardId }, status);
    const what = `Rachat « ${redemption.title} » de ${redemption.user}`;
    const isKept = status === "FULFILLED";
    if (result.ok) log(`${what} : points ${isKept ? "gardés" : "rendus"}.`);
    else log(`${what} : points ${isKept ? "non marqués" : "non rendus"} (${result.message}).`);
  };

  // Une récompense que l'app ne gère pas : aucun statut n'est demandé à Twitch, seul le journal dit un son qui n'a pas joué.
  const settle = async ({ redemption, isManaged }: Request, status: RewardStatus): Promise<void> => {
    if (!redemption) return;
    if (isManaged !== false) return settleOwn(redemption, status);
    if (status === "CANCELED") {
      const what = `Rachat « ${redemption.title} » de ${redemption.user}`;
      log(
        `${what} : le son n'a pas joué, les points ne sont pas rendus (récompense faite sur Twitch : l'app ne peut pas).`,
      );
    }
  };

  // Fini : les points sont gardés, la phrase suit. Raté : la phrase prend la place du son, les points ne sont rendus que si elle
  // n'est pas dite non plus. Coupé : les points sont rendus, aucune phrase (couper le son demande le silence).
  const conclude = async (request: Request, ending: Ending): Promise<void> => {
    const { afterSound } = request;
    if (ending === "cut") return settle(request, "CANCELED");
    if (ending === "ended") {
      void afterSound?.();
      return settle(request, "FULFILLED");
    }
    const isSaid = (await afterSound?.()) ?? false;
    return settle(request, isSaid ? "FULFILLED" : "CANCELED");
  };

  const end = (outcome: string, ending: Ending): Promise<void> => {
    const current = playing;
    if (!current) return Promise.resolve();
    current.cancelWatch();
    log(`Son « ${current.title} » : ${outcome}.`);
    playing = undefined;
    return conclude(current.request, ending);
  };

  // Un seul son à la fois, donné à une seule page (la plus ancienne) : sinon OBS et un onglet le joueraient tous les deux.
  const next = () => {
    const screen = screens[0];
    while (!playing && screen) {
      const request = pending.shift();
      if (request === undefined) return;
      const sound = library.get(request.soundId);
      if (!sound) {
        log("Son supprimé pendant son attente : passé.");
        void conclude(request, "failed");
        continue;
      }
      const playId = createId();
      playing = {
        playId,
        request,
        title: sound.title,
        screen,
        cancelWatch: schedule(() => {
          screen({ kind: "stop" });
          void end("raté (la page n'a pas répondu en 10 min)", "failed");
          next();
        }, MAX_PLAY_MS),
      };
      log(`Son « ${sound.title} » : envoyé à la page /sounds.`);
      screen({ kind: "play", playId, soundId: sound.id, version: sound.version, fader: sound.fader });
      request.onPlay?.();
    }
  };

  // Le sound du reward d'un rachat et si l'app gère ce reward ; rien s'il n'a pas de sound, ou si son sound a disparu.
  const getSoundOf = (rewardId: string): { sound: PlayableSound; isManaged: boolean } | undefined => {
    const record = records.getRecord(rewardId);
    const sound = record?.sound ? library.get(record.sound) : undefined;
    return record && sound ? { sound, isManaged: record.isManaged } : undefined;
  };

  // Les demandes qui répondent à `matches` sont retirées : leurs points sont rendus, et le son en cours se tait.
  const forgetWhere = async (matches: (request: Request) => boolean, why: string): Promise<void> => {
    const dropped = pending.filter(matches);
    pending.splice(0, pending.length, ...pending.filter((request) => !matches(request)));
    const settled = dropped.map((request) => conclude(request, "cut"));
    if (playing && matches(playing.request)) {
      playing.screen({ kind: "stop" });
      settled.push(end(`coupé (${why})`, "cut"));
      next();
    }
    await Promise.all(settled);
  };

  const closeScreen = (screen: SoundScreen) => {
    const index = screens.indexOf(screen);
    if (index === -1) return;
    screens.splice(index, 1);
    if (playing?.screen === screen) void end("raté (la page /sounds s'est fermée)", "failed");
    if (screens.length === 0 && pending.length > 0) {
      log(`Sons en attente retirés : ${pending.length} (plus aucune page /sounds).`);
      for (const request of pending.splice(0)) void conclude(request, "failed");
    }
    next();
  };

  return {
    subscribe(screen) {
      screens.push(screen);
      return () => closeScreen(screen);
    },
    play(soundId) {
      if (!library.get(soundId)) return { ok: false, status: 404, message: "son introuvable" };
      if (screens.length === 0) {
        return {
          ok: false,
          status: 409,
          message: "aucune page /sounds n'est connectée : ajoute la source navigateur dans OBS",
        };
      }
      pending.push({ soundId });
      next();
      return { ok: true };
    },
    redeem(redemption, afterSound, onPlay) {
      const found = getSoundOf(redemption.rewardId);
      if (!found) return false;
      const { sound, isManaged } = found;
      const request: Request = {
        soundId: sound.id,
        redemption,
        isManaged,
        ...(afterSound ? { afterSound } : {}),
        ...(onPlay ? { onPlay } : {}),
      };
      const what = `Rachat « ${redemption.title} » de ${redemption.user}`;
      if (screens.length === 0) {
        log(`${what} : aucune page /sounds n'est connectée.`);
        void conclude(request, "failed");
        return true;
      }
      if (!library.getAudio(sound.id)) {
        log(`${what} : le fichier du son « ${sound.title} » manque.`);
        void conclude(request, "failed");
        return true;
      }
      log(`${what} : son « ${sound.title} » mis en attente.`);
      pending.push(request);
      next();
      return true;
    },
    stop() {
      log(`Sons coupés : ${playing ? 1 : 0} en cours, ${pending.length} en attente.`);
      for (const request of pending.splice(0)) void conclude(request, "cut");
      void end("coupé", "cut");
      for (const screen of screens) screen({ kind: "stop" });
    },
    finish(playId, outcome, reason) {
      if (playing?.playId !== playId) return;
      if (outcome === "ended") void end("fini", "ended");
      else void end(`raté (${reason ?? "raison inconnue"})`, "failed");
      next();
    },
    forget: (soundId) => forgetWhere((request) => request.soundId === soundId, "son supprimé"),
    forgetReward: (rewardId) =>
      forgetWhere((request) => request.redemption?.rewardId === rewardId, "récompense supprimée"),
  };
}
