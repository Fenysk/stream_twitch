import { type InsultList, toInsultMatch } from "../domain/chat-insults.rules";
import { type ReviewRules, toReviewRules, toReviewText } from "../domain/review.rules";
import type { Settings } from "../domain/settings.schema";
import type { FoxQueue } from "./fox-queue.usecase";
import type { FoxTally } from "./fox-tally.usecase";

export type FoxReviewDeps = {
  tally: Pick<FoxTally, "list">;
  queue: Pick<FoxQueue, "push">;
  settings: Settings;
  insults: InsultList;
  log: (message: string) => void;
};

// `text` : ce qu'il va dire ; sinon pourquoi il ne dit rien.
export type ReviewResult = { ok: true; text: string } | { ok: false; message: string };

export type FoxReview = {
  update(settings: Settings): void;
  // « Faire le bilan » : le bilan part dans la file, devant les messages.
  say(): ReviewResult;
  // La fin prévue vient d'être annoncée : le bilan suit, si la case « Bilan à la fin prévue » est cochée.
  sayAtEnd(): void;
};

const NOTHING_TO_SAY = "personne n'a écrit depuis le démarrage du serveur : rien à dire";

// Le bilan du live : le total des messages acceptés depuis le démarrage du serveur et des personnes qui les ont écrits, le plus
// bavard, le premier arrivé. Tourné vers le tchat, il passe par la file comme une annonce : il attend le silence de Fenysk, sa voix
// ne le coupe pas. Un pseudo refusé par le filtre d'insultes n'est jamais dit (sa partie est sautée), une partie vide non plus.
export function createFoxReview({ tally, queue, settings: initial, insults, log }: FoxReviewDeps): FoxReview {
  let rules: ReviewRules | undefined = toReviewRules(initial);

  const say = (): ReviewResult => {
    const text = toReviewText(tally.list(), (nickname) => toInsultMatch(nickname, insults) !== null);
    if (text === null) return { ok: false, message: NOTHING_TO_SAY };
    log(`Renard : bilan du live : « ${text} »`);
    queue.push({
      kind: "review",
      label: "bilan du live",
      text,
      isCuttable: false,
      isUrgent: true,
      toShow: () => null,
    });
    return { ok: true, text };
  };

  return {
    update(next) {
      rules = toReviewRules(next);
    },
    say,
    sayAtEnd() {
      if (!rules?.shouldReviewAtEnd) return;
      const result = say();
      if (!result.ok) log(`Renard : pas de bilan à la fin prévue, ${result.message}.`);
    },
  };
}
