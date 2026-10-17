import type { Settings } from "../domain/settings.schema";
import {
  DEFAULT_SHOW_CLIP_COUNT,
  LAUGH_PHRASE,
  toLaughSchedule,
  toLineup,
  toRecordedDay,
} from "../domain/show.rules";
import {
  IDLE_SHOW,
  type ShowLaugh,
  type ShowProgress,
  type ShowSpeakRequest,
  type ShowState,
} from "../domain/show.schema";
import type { SoundSummary } from "../domain/sound.schema";
import type { ClipLibrary, ConfirmedClip } from "./clip.usecase";
import type { Fox } from "./fox.usecase";
import type { FoxQueue } from "./fox-queue.usecase";
import type { ShowSpeakResult, ShowVoice } from "./show.usecase";

// La page /show à l'antenne ? OBS la dit quand une source navigateur vers /show devient visible dans la scène du programme (la
// scène passe à l'antenne, ou la source est rendue visible), et quand elle ne l'est plus. Chaque abonné reçoit les changements ;
// infra l'implémente avec les évènements d'OBS.
export type ShowScenePort = { subscribe(listener: (isVisible: boolean) => void): () => void };

export type ShowDirectorDeps = {
  scene: ShowScenePort;
  clips: Pick<ClipLibrary, "listConfirmed" | "notePlayed">;
  fox: Pick<Fox, "updateShow">;
  queue: Pick<FoxQueue, "hold" | "release">;
  // Ce que Jean-Renard dit dans /show.
  voice: Pick<ShowVoice, "sayLine" | "sayText">;
  // Les sounds de la soundboard : les rires d'un clip en sont, que la page joue elle-même (un sound supprimé depuis : ce rire est sauté).
  sounds: { get(id: string): Pick<SoundSummary, "id" | "version" | "fader"> | undefined };
  settings: Settings;
  random: () => number;
  createId: () => string;
  // Programme `callback` dans `ms` ; rend de quoi l'annuler.
  schedule: (callback: () => void, ms: number) => () => void;
  log: (message: string) => void;
};

export type ShowReportResult = { ok: true } | { ok: false; status: 400 | 409; message: string };

export type ShowDirector = {
  start(): void;
  stop(): void;
  update(settings: Settings): void;
  getState(): ShowState;
  // Chaque changement d'état part à l'abonné ; l'état de départ, il le lit par `getState`.
  subscribe(listener: (state: ShowState) => void): () => void;
  // Une page /show se connecte (rend de quoi la déconnecter) : sans page connectée, l'émission n'a personne pour la jouer.
  openPage(): () => void;
  // La page dit où elle en est (sa phase, son clip) ou que l'émission est finie. Une page d'une autre émission que la courante est
  // refusée.
  report(progress: ShowProgress): ShowReportResult;
  // La page demande une phrase de l'émission : Jean-Renard la dit dans /show, la réponse arrive quand la voix part. Le texte vient
  // du serveur (les listes de phrases, le JSON du clip), jamais de la page.
  speak(request: ShowSpeakRequest): Promise<ShowSpeakResult>;
};

// Une émission en cours dont aucune page /show n'est connectée depuis 20 s s'arrête : la source n'est pas chargée, ou la page a
// planté, et Jean-Renard ne doit pas rester absent de /fox.
export const PAGE_GRACE_MS = 20_000;

const STALE = { ok: false, status: 409, message: "cette émission n'est plus en cours" } as const;
const STALE_SPEECH: ShowSpeakResult = STALE;

// Le démarrage et l'arrêt de l'émission : elle commence quand la page /show passe à l'antenne, s'arrête dès qu'elle n'y est plus.
// Au début, Jean-Renard quitte /fox (la file de parole se tient) et ne revient qu'à la fin, quand la page le dit ou que la source
// disparaît. Le déroulé (ouverture, clips, clôture) est celui de la page, le serveur garde l'état et compte les passages.
export function createShowDirector({
  scene,
  clips,
  fox,
  queue,
  voice,
  sounds,
  settings: initial,
  random,
  createId,
  schedule,
  log,
}: ShowDirectorDeps): ShowDirector {
  let count = initial.showClipCount ?? DEFAULT_SHOW_CLIP_COUNT;
  let state: ShowState = IDLE_SHOW;
  const listeners = new Set<(state: ShowState) => void>();
  let pages = 0;
  let cancelWatch: (() => void) | undefined;
  // Les clips de l'émission déjà comptés comme passés (un clip se compte une fois, au début de son passage).
  let counted = new Set<number>();
  // La phrase de chaque clip de l'émission, dans l'ordre de passage : elle reste sur le serveur.
  let phrases: readonly string[] = [];
  let unsubscribeScene: (() => void) | undefined;

  const publish = (next: ShowState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  // Jean-Renard revient sur /fox, puis la file lit ce qu'elle a gardé.
  const leaveShow = () => {
    cancelWatch?.();
    cancelWatch = undefined;
    fox.updateShow(false);
    queue.release();
  };

  // `over` : finie, la source reste visible (elle ne repart qu'après avoir été cachée) ; `idle` : la source a disparu.
  const end = (status: "idle" | "over", reason: string) => {
    if (state.status === "running") {
      leaveShow();
      log(`Émission : ${reason}.`);
    }
    publish({ ...IDLE_SHOW, status });
  };

  // Sans page connectée, un délai de grâce, puis la fin.
  const watch = () => {
    cancelWatch?.();
    cancelWatch = undefined;
    if (state.status !== "running" || pages > 0) return;
    cancelWatch = schedule(() => {
      cancelWatch = undefined;
      if (state.status === "running" && pages === 0) {
        end("over", `arrêtée, aucune page /show connectée depuis ${PAGE_GRACE_MS / 1000} s`);
      }
    }, PAGE_GRACE_MS);
  };

  const toLineupClips = (): ConfirmedClip[] | undefined => {
    const listed = clips.listConfirmed();
    if (!listed.ok) {
      log(`Émission : clips illisibles, ${listed.message}.`);
      return undefined;
    }
    const names = toLineup(
      listed.value.map(({ name, playCount }) => ({ name, playCount: playCount ?? 0 })),
      count,
      random,
    );
    return names.flatMap((name) => listed.value.find((candidate) => candidate.name === name) ?? []);
  };

  // Les rires du clip qui jouent dans l'émission, chacun avec son sound tel que la soundboard l'a aujourd'hui ; un sound supprimé depuis est
  // sauté.
  const toLaughs = (clip: ConfirmedClip): ShowLaugh[] =>
    toLaughSchedule(clip.laughs ?? [], clip).flatMap(({ at, sound: id }) => {
      const sound = sounds.get(id);
      return sound ? [{ id: sound.id, version: sound.version, fader: sound.fader, at }] : [];
    });

  const begin = () => {
    const chosen = toLineupClips();
    if (chosen === undefined || chosen.length === 0) {
      if (chosen) log("Émission : aucun clip confirmé, rien à passer.");
      publish({ ...IDLE_SHOW, status: "over" });
      return;
    }
    // La file se tient avant que /fox se vide : aucune phrase n'est refusée par le renard absent.
    queue.hold();
    fox.updateShow(true);
    counted = new Set();
    phrases = chosen.map((clip) => clip.phrase);
    const lineup = chosen.map((clip) => ({
      name: clip.name,
      title: clip.title,
      version: clip.version,
      day: toRecordedDay(clip),
      laughs: toLaughs(clip),
    }));
    publish({ status: "running", runId: createId(), lineup, phase: "opening", index: 0 });
    log(
      `Émission : démarrée, ${lineup.length} clip(s) : ${lineup.map(({ name }) => `« ${name} »`).join(", ")}.`,
    );
    watch();
  };

  const onVisible = (isVisible: boolean) => {
    if (isVisible && state.status === "idle") begin();
    else if (!isVisible && state.status !== "idle")
      end("idle", "arrêtée, la source /show n'est plus visible");
  };

  const noteClip = (index: number) => {
    const clip = state.lineup[index];
    if (!clip || counted.has(index)) return;
    counted.add(index);
    clips.notePlayed(clip.name);
    log(`Émission : clip ${index + 1} sur ${state.lineup.length}, « ${clip.title} ».`);
  };

  return {
    start() {
      unsubscribeScene ??= scene.subscribe(onVisible);
    },
    stop() {
      unsubscribeScene?.();
      unsubscribeScene = undefined;
      if (state.status !== "idle") end("idle", "arrêtée, le serveur s'arrête");
    },
    update(next) {
      count = next.showClipCount ?? DEFAULT_SHOW_CLIP_COUNT;
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openPage() {
      pages += 1;
      watch();
      let isOpen = true;
      return () => {
        if (!isOpen) return;
        isOpen = false;
        pages -= 1;
        watch();
      };
    },
    report({ runId, phase, index }) {
      if (state.status !== "running" || runId !== state.runId) return STALE;
      if (phase === "ended") {
        end("over", "finie");
        return { ok: true };
      }
      if ((phase === "card" || phase === "clip") && index >= state.lineup.length) {
        return { ok: false, status: 400, message: "ce clip n'est pas dans l'émission" };
      }
      publish({ ...state, phase, index });
      if (phase === "clip") noteClip(index);
      return { ok: true };
    },
    async speak(request) {
      if (state.status !== "running" || request.runId !== state.runId) return STALE_SPEECH;
      if (request.kind === "laugh") return voice.sayText(LAUGH_PHRASE, "la phrase des rires");
      if (request.kind !== "clip") return voice.sayLine(request.kind);
      const clip = state.lineup[request.index];
      if (!clip) return { ok: false, status: 400, message: "ce clip n'est pas dans l'émission" };
      return voice.sayText(phrases[request.index] ?? "", `la phrase de « ${clip.title} »`);
    },
  };
}
