import { toFoxRules } from "../domain/fox.rules";
import type { Attitude, FoxEvent, FoxMode, FoxPlace, FoxRules, PresenceView } from "../domain/fox.schema";
import { IDLE_MODE, isSameMode } from "../domain/fox-mode.rules";
import { toPresenceView, toStartPresence } from "../domain/presence.rules";
import { toPronunciations, toSpokenText } from "../domain/pronunciation.rules";
import type { Settings } from "../domain/settings.schema";
import { toFrenchVoices, toSpeechText, toWavDuration } from "../domain/voice.rules";
import type { Voice } from "../domain/voice.schema";

// Les voix de Windows vues du usecase : infra l'implémente (PowerShell et WinRT). `synthesize` rend un WAV ; les deux
// peuvent lever.
export type VoicePort = {
  list(): Promise<Voice[]>;
  synthesize(request: { text: string; voice: string }): Promise<Uint8Array>;
};

// `durationMs` : la durée du WAV, de quoi savoir quand la phrase finit (la page ne le dit pas).
export type SpeakResult =
  | { ok: true; url: string; durationMs: number }
  | { ok: false; status: 400 | 409 | 502 | 503; message: string };

// `isCancelled` se relit une fois la synthèse faite : une phrase annulée entre-temps (le message du tchat vient d'être
// supprimé) ne part pas aux pages.
// `waitFor` : la phrase se synthétise tout de suite mais ne part qu'une fois ceci fini (le saut pour revenir, puis la
// réaction ou le coucou) ; `isCancelled` se relit ensuite.
export type SpeakPlan = { isCancelled?: () => boolean; waitFor?: Promise<void> };

export type VoicesResult = { ok: true; voices: Voice[] } | { ok: false; message: string };

export type FoxDeps = {
  voices: VoicePort;
  settings: Settings;
  clock: () => number;
  createId: () => string;
  toSpeechUrl: (id: string) => string;
  log: (message: string) => void;
};

export type Fox = {
  // Les règles appliquées ; absentes quand settings.json n'a pas les réglages du renard.
  getRules(): FoxRules | undefined;
  // Une page se connecte au flux. Chaque page `/fox` (place `screen`) compte : le nombre part à toutes les pages, à
  // la connexion et à la déconnexion. L'aperçu (`preview`) ne compte pas.
  subscribe(place: FoxPlace, listener: (event: FoxEvent) => void): () => void;
  // Le nombre de pages `/fox` connectées.
  getScreens(): number;
  // De nouveaux réglages, appliqués aussitôt : les règles changées partent aux pages, la voix sert au prochain texte.
  update(settings: Settings): void;
  listVoices(): Promise<VoicesResult>;
  // Dit le texte : le WAV est produit, gardé en mémoire, et son adresse part aux pages (l'aperçu et OBS). Refusé (409) pendant
  // l'émission : le renard n'est alors que dans `/show`.
  speak(text: string, options?: SpeakPlan): Promise<SpeakResult>;
  // La phrase en cours s'arrête dans les pages `/fox` et l'aperçu.
  stop(): void;
  // L'émission passe (`true`) ou s'arrête (`false`) : les pages `/fox` et l'aperçu cachent le renard et se taisent, `/show`
  // devient seule à le montrer. L'arrêt coupe aussi la phrase en cours dans `/show`.
  updateShow(isOn: boolean): void;
  isShowOn(): boolean;
  // Dit le texte dans les pages `/show` seulement (même synthèse que `speak`) ; refusé (409) hors émission.
  speakInShow(text: string): Promise<SpeakResult>;
  // Ce qu'il montre en plus de sa bouche : part aux pages quand il change.
  getMode(): FoxMode;
  updateMode(mode: FoxMode): void;
  // Sa présence : part aux pages quand sa phase change ; `elapsed` : depuis combien de ms il est dans cette phase.
  getPresence(): { kind: PresenceView; elapsed: number };
  updatePresence(kind: PresenceView): void;
  // Son humeur : part aux pages quand elle change.
  getAttitude(): Attitude;
  updateAttitude(attitude: Attitude): void;
  getSpeech(id: string): Uint8Array | undefined;
};

// Un WAV ne sert qu'aux pages qui viennent de recevoir son adresse : il ne reste pas en mémoire au-delà d'une minute.
const SPEECH_KEPT_MS = 60_000;
const SPEECH_KEPT_MAX = 8;

// 16 kHz, 16 bits, mono : 32 octets par ms, le WAV de WinRT quand son en-tête n'est pas lisible.
const SAMPLE_BYTES_PER_MS = 32;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Les pages qui montrent le renard hors émission, et celles de l'émission.
const STAGE_PLACES: readonly FoxPlace[] = ["screen", "preview"];
const SHOW_PLACES: readonly FoxPlace[] = ["show"];
const ALL_PLACES: readonly FoxPlace[] = [...STAGE_PLACES, ...SHOW_PLACES];

type Refusal = Extract<SpeakResult, { ok: false }>;

const IN_SHOW: Refusal = {
  ok: false,
  status: 409,
  message: "Jean-Renard est dans l'émission : il parlera quand elle sera finie",
};
const NOT_IN_SHOW: Refusal = { ok: false, status: 409, message: "l'émission n'est pas en cours" };

export function createFox({ voices, settings: initial, clock, createId, toSpeechUrl, log }: FoxDeps): Fox {
  let settings = initial;
  let rules = toFoxRules(initial);
  let pronunciations = toPronunciations(initial.foxPronunciations ?? []);
  const listeners = new Set<{ place: FoxPlace; send: (event: FoxEvent) => void }>();
  let screens = 0;
  let isShow = false;
  let mode: FoxMode = IDLE_MODE;
  let attitude: Attitude = "plain";
  const start = toStartPresence(clock());
  let presence: { kind: PresenceView; since: number } = { kind: toPresenceView(start), since: start.since };
  // Map garde l'ordre d'insertion : le premier est le plus ancien.
  const speeches = new Map<string, { bytes: Uint8Array; expiresAt: number }>();
  let installed: Promise<Voice[]> | undefined;

  // L'évènement part aux pages de ces places seulement (par défaut, aux pages hors émission).
  const publish = (event: FoxEvent, places: readonly FoxPlace[] = STAGE_PLACES) => {
    for (const { place, send } of listeners) if (places.includes(place)) send(event);
  };

  const forgetExpired = () => {
    const now = clock();
    for (const [id, { expiresAt }] of speeches) if (expiresAt <= now) speeches.delete(id);
    while (speeches.size > SPEECH_KEPT_MAX) {
      const oldest = speeches.keys().next().value;
      if (oldest === undefined) return;
      speeches.delete(oldest);
    }
  };

  // Le texte nettoyé et prononcé, puis son WAV ; sans voix choisie ou si la synthèse échoue, le refus dit pourquoi.
  const synthesize = async (
    raw: string,
  ): Promise<{ ok: true; bytes: Uint8Array; text: string; voice: string } | Refusal> => {
    const cleaned = toSpeechText(raw);
    if (cleaned === null) return { ok: false, status: 400, message: "le texte est vide" };
    // La prononciation : les abréviations et les noms se disent par leur forme parlée, pour tout ce que dit le renard.
    const text = toSpokenText(cleaned, pronunciations);
    const voice = settings.foxVoice;
    if (voice === undefined) {
      return {
        ok: false,
        status: 503,
        message: "aucune voix choisie : settings.json n'a pas les réglages du renard",
      };
    }
    try {
      return { ok: true, bytes: await voices.synthesize({ text, voice }), text, voice };
    } catch (error) {
      log(`Renard : synthèse impossible avec « ${voice} », ${toMessage(error)}`);
      return { ok: false, status: 502, message: `la synthèse a échoué : ${toMessage(error)}` };
    }
  };

  // Hors émission, l'émission refuse ; pour la voix de l'émission (`isInShow`), c'est l'absence d'émission qui refuse.
  const toShowRefusal = (isInShow: boolean): Refusal | undefined => {
    if (isShow === isInShow) return undefined;
    return isInShow ? NOT_IN_SHOW : IN_SHOW;
  };

  // Le texte devient un WAV gardé en mémoire dont l'adresse part aux pages hors émission, ou, pour la voix de l'émission
  // (`isInShow`), aux pages `/show` seules. L'état de l'émission se relit après la synthèse : une émission finie entre-temps
  // ne laisse rien partir.
  const say = async (raw: string, options: SpeakPlan, isInShow: boolean): Promise<SpeakResult> => {
    const refused = toShowRefusal(isInShow);
    if (refused) return refused;
    const startedAt = clock();
    const made = await synthesize(raw);
    if (!made.ok) return made;
    await options.waitFor;
    if (options.isCancelled?.()) return { ok: false, status: 409, message: "la phrase a été annulée" };
    const refusedNow = toShowRefusal(isInShow);
    if (refusedNow) return refusedNow;
    const id = createId();
    speeches.set(id, { bytes: made.bytes, expiresAt: clock() + SPEECH_KEPT_MS });
    forgetExpired();
    const url = toSpeechUrl(id);
    log(
      `Renard : ${Array.from(made.text).length} caractères dits par « ${made.voice} », WAV prêt en ${clock() - startedAt} ms.`,
    );
    publish({ kind: "speech", url }, isInShow ? SHOW_PLACES : STAGE_PLACES);
    return {
      ok: true,
      url,
      durationMs: toWavDuration(made.bytes) ?? Math.round(made.bytes.length / SAMPLE_BYTES_PER_MS),
    };
  };

  return {
    getRules: () => rules,
    subscribe(place, listener) {
      // Chaque connexion a son propre abonnement : se désabonner deux fois ne retranche qu'une page.
      const entry = { place, send: listener };
      listeners.add(entry);
      if (place === "screen") {
        screens += 1;
        publish({ kind: "screens", count: screens });
      }
      return () => {
        if (!listeners.delete(entry)) return;
        if (place === "screen") {
          screens -= 1;
          publish({ kind: "screens", count: screens });
        }
      };
    },
    getScreens: () => screens,
    update(next) {
      settings = next;
      pronunciations = toPronunciations(next.foxPronunciations ?? []);
      const nextRules = toFoxRules(next);
      const isChanged = JSON.stringify(nextRules) !== JSON.stringify(rules);
      rules = nextRules;
      if (nextRules !== undefined && isChanged) publish({ kind: "rules", rules: nextRules }, ALL_PLACES);
    },
    async listVoices() {
      installed ??= voices.list();
      try {
        return { ok: true, voices: toFrenchVoices(await installed) };
      } catch (error) {
        installed = undefined;
        log(`Voix : liste impossible, ${toMessage(error)}`);
        return { ok: false, message: `voix introuvables : ${toMessage(error)}` };
      }
    },
    speak: (raw, options = {}) => say(raw, options, false),
    speakInShow: (raw) => say(raw, {}, true),
    stop: () => publish({ kind: "stop" }),
    isShowOn: () => isShow,
    updateShow(isOn) {
      if (isShow === isOn) return;
      isShow = isOn;
      publish({ kind: "show", isOn });
      // La voix de l'émission en cours se coupe avec elle.
      if (!isOn) publish({ kind: "stop" }, SHOW_PLACES);
    },
    getMode: () => mode,
    updateMode(next) {
      if (isSameMode(mode, next)) return;
      mode = next;
      publish({ kind: "mode", mode });
    },
    getPresence: () => ({ kind: presence.kind, elapsed: clock() - presence.since }),
    updatePresence(kind) {
      if (presence.kind === kind) return;
      presence = { kind, since: clock() };
      publish({ kind: "presence", presence: kind, elapsed: 0 });
    },
    getAttitude: () => attitude,
    updateAttitude(next) {
      if (attitude === next) return;
      attitude = next;
      publish({ kind: "attitude", attitude });
    },
    getSpeech(id) {
      forgetExpired();
      return speeches.get(id)?.bytes;
    },
  };
}
