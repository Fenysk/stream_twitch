import { toNextPick } from "../domain/pick.rules";
import type { Settings } from "../domain/settings.schema";
import type { SpeakResult } from "./fox.usecase";

export type ShowVoiceDeps = {
  // Jean-Renard dit le texte dans les pages /show (Fox.speakInShow) ; la réponse arrive quand la voix part.
  say: (text: string) => Promise<SpeakResult>;
  settings: Pick<Settings, "showOpeningPhrases" | "showClosingPhrases">;
  random: () => number;
  log: (message: string) => void;
};

// La durée de la phrase en ms (0 : rien à dire), ou pourquoi elle n'a pas été dite : 400 pour un clip hors de l'émission, 409 si l'émission
// n'est plus là, 502 sinon.
export type ShowSpeakResult =
  | { ok: true; durationMs: number }
  | { ok: false; status: 400 | 409 | 502; message: string };

// Ce que Jean-Renard dit dans l'émission, hors de sa file de parole (il est seul dans /show).
export type ShowVoice = {
  update(settings: Pick<Settings, "showOpeningPhrases" | "showClosingPhrases">): void;
  // L'ouverture ou la clôture : une phrase de la liste, tirée sans répétition avant d'avoir tout dit, d'une émission à l'autre.
  sayLine(kind: "opening" | "closing"): Promise<ShowSpeakResult>;
  // Un texte donné (la phrase d'un clip, les rires) ; `label` le nomme dans le journal. Vide : il se tait, durée 0.
  sayText(text: string, label: string): Promise<ShowSpeakResult>;
};

const LINE_LABELS = { opening: "l'ouverture", closing: "la clôture" } as const;

export function createShowVoice({ say, settings: initial, random, log }: ShowVoiceDeps): ShowVoice {
  let lists = initial;
  // Les phrases déjà dites de chaque liste depuis son dernier tour.
  const said: Record<"opening" | "closing", string[]> = { opening: [], closing: [] };

  const speak = async (text: string, label: string): Promise<ShowSpeakResult> => {
    const result = await say(text);
    if (result.ok) return { ok: true, durationMs: result.durationMs };
    // L'émission qui s'est arrêtée en route (409) n'est pas une panne : rien à écrire.
    if (result.status === 409) return { ok: false, status: 409, message: result.message };
    log(`Émission : ${label} n'a pas été dite : ${result.message}`);
    return { ok: false, status: 502, message: result.message };
  };

  return {
    update(next) {
      lists = next;
    },
    async sayLine(kind) {
      const phrases = (kind === "opening" ? lists.showOpeningPhrases : lists.showClosingPhrases) ?? [];
      const pick = toNextPick(phrases, said[kind], random);
      if (!pick) return { ok: true, durationMs: 0 };
      said[kind] = pick.said;
      return speak(pick.phrase, LINE_LABELS[kind]);
    },
    async sayText(text, label) {
      return text === "" ? { ok: true, durationMs: 0 } : speak(text, label);
    },
  };
}
