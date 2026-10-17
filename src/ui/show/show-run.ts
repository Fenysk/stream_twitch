// Le déroulé d'une émission côté page `/show`, sans rien savoir du navigateur : l'écran, la voix, le serveur et l'horloge lui sont donnés.
// Ouverture (un bandeau, Jean-Renard grand à droite dit une phrase) ; pour chaque clip : le carton (le début du clip, flou en fond, un
// bandeau avec son jour et son titre, Jean-Renard dit la phrase du clip), le flou se lève et le clip joue (Jean-Renard petit dans un
// coin) ; clôture (comme l'ouverture) ; la page redevient transparente. Le clip suivant se charge dans l'autre <video> pendant que
// celui-ci joue, et c'est sa première image qui sert de fond au carton.

import { toCardMs, toLaughMs, toLineMs } from "../../domain/show.rules";
import type { ShowClip, ShowCues, ShowLaugh, ShowProgress } from "../../domain/show.schema";
import { type ShowView, type Slot, toSlot } from "./show-view";

export type ShowScreen = {
  setView(view: ShowView): void;
  // Charge le clip dans l'emplacement, prêt à jouer ; `false` quand le fichier ne se lit pas.
  load(slot: Slot, clip: ShowClip): Promise<boolean>;
  // Joue le clip de l'emplacement depuis le début, son tchat et ses sursauts au rythme de la vidéo (`cues`, rien quand le serveur ne
  // l'a pas donné), et ses rires chacun à son instant, par-dessus son son. Rend la main quand la vidéo est finie (ou qu'elle a échoué
  // en route) ET que chaque rire parti est fini : un rire qui dépasse la fin garde la dernière image à l'écran. Rend `true` si au
  // moins un rire a joué jusqu'au bout ; l'arrêt de l'émission coupe tout et rend `false`.
  play(slot: Slot, cues: ShowCues | null, laughs: readonly ShowLaugh[]): Promise<boolean>;
};

// Ce que Jean-Renard dit : l'ouverture, la clôture, les rires, ou la phrase du clip n° `index` de l'émission (le serveur choisit le texte).
export type Speech =
  | { kind: "opening" }
  | { kind: "closing" }
  | { kind: "laugh" }
  | { kind: "clip"; index: number };

// Ce qui se charge pour un clip : sa vidéo (`false` : elle ne se lit pas) et ses données (`null` : le serveur ne les a pas données).
type Loading = { video: Promise<boolean>; cues: Promise<ShowCues | null> };

export type EpisodeDeps = {
  screen: ShowScreen;
  // Les données du clip (tchat, sursauts) ; ne lève jamais.
  loadCues(clip: ShowClip): Promise<ShowCues | null>;
  // Fait dire la phrase à Jean-Renard ; rend sa durée en ms (0 : rien à dire), ou lève quand la voix échoue.
  speak(speech: Speech): Promise<number>;
  // Dit au serveur où l'émission en est (sans attendre sa réponse).
  report(progress: Omit<ShowProgress, "runId">): void;
  sleep(ms: number): Promise<void>;
  now(): number;
  // L'émission s'est arrêtée (la source n'est plus visible, la page se ferme) : le déroulé s'interrompt au prochain pas.
  isStopped(): boolean;
  log(message: string): void;
};

// Le fondu d'un clip vers le noir dure autant en CSS (show-stage.css, --show-fade).
export const FADE_MS = 800;
// La synthèse prend 1 à 2 s, le retour du renard 1 s de plus : au-delà de 15 s, le temps se passe de phrase.
const SPEECH_WAIT_MAX_MS = 15_000;

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// La durée de la phrase, ou 0 quand la voix échoue ou tarde trop.
const waitSpeech = async (deps: EpisodeDeps, speech: Speech): Promise<number> => {
  const limit = deps.sleep(SPEECH_WAIT_MAX_MS).then(() => 0);
  const said = deps.speak(speech).catch((error: unknown) => {
    deps.log(`Émission : la phrase (${speech.kind}) n'est pas partie : ${toMessage(error)}`);
    return 0;
  });
  return Promise.race([said, limit]);
};

// Jean-Renard dit sa phrase, et le temps dure jusqu'à la fin de la phrase plus un instant (au moins un minimum, que `toMs` donne).
const holdSpeech = async (
  deps: EpisodeDeps,
  speech: Speech,
  toMs: (timing: { repliedAt: number; durationMs: number } | null) => number,
): Promise<void> => {
  const startedAt = deps.now();
  const durationMs = await waitSpeech(deps, speech);
  const repliedAt = deps.now() - startedAt;
  const total = toMs(durationMs > 0 ? { repliedAt, durationMs } : null);
  await deps.sleep(Math.max(0, total - repliedAt));
};

export async function runEpisode(deps: EpisodeDeps, lineup: readonly ShowClip[]): Promise<void> {
  const { screen } = deps;
  // Chaque clip se charge une fois, dans son emplacement, avec ses données, avant qu'on en ait besoin.
  const loadings = new Map<number, Loading>();
  const preload = (index: number): Loading | undefined => {
    const clip = lineup[index];
    if (!clip) return undefined;
    const known = loadings.get(index);
    if (known) return known;
    const loading = { video: screen.load(toSlot(index), clip), cues: deps.loadCues(clip) };
    loadings.set(index, loading);
    return loading;
  };

  // Le carton du clip, puis le clip et ses rires jusqu'à leur fin, puis la phrase des rires (une seule) si au moins un a joué.
  const showClip = async (index: number, clip: ShowClip, loading: Loading): Promise<void> => {
    deps.report({ phase: "card", index });
    screen.setView({ kind: "card", slot: toSlot(index), title: clip.title, day: clip.day });
    await holdSpeech(deps, { kind: "clip", index }, toCardMs);
    if (deps.isStopped()) return;
    deps.report({ phase: "clip", index });
    screen.setView({ kind: "clip", slot: toSlot(index), title: clip.title });
    const playing = screen.play(toSlot(index), await loading.cues, clip.laughs);
    void preload(index + 1);
    const hasLaughed = await playing;
    if (hasLaughed && !deps.isStopped()) await holdSpeech(deps, { kind: "laugh" }, toLaughMs);
  };

  deps.report({ phase: "opening", index: 0 });
  screen.setView({ kind: "opening" });
  void preload(0);
  await holdSpeech(deps, { kind: "opening" }, toLineMs);
  for (const [index, clip] of lineup.entries()) {
    if (deps.isStopped()) return;
    const loading = preload(index);
    if (loading && (await loading.video)) await showClip(index, clip, loading);
    else deps.log(`Émission : « ${clip.name} » ne se lit pas, il est passé.`);
  }
  if (deps.isStopped()) return;
  deps.report({ phase: "closing", index: 0 });
  screen.setView({ kind: "closing" });
  await holdSpeech(deps, { kind: "closing" }, toLineMs);
  if (deps.isStopped()) return;
  deps.report({ phase: "ended", index: 0 });
  screen.setView({ kind: "none" });
}
