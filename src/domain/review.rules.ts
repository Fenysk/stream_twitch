import { toCount } from "./phrase.rules";
import type { Settings } from "./settings.schema";

// Les réglages du bilan : le dire tout seul juste après l'annonce de la fin prévue.
export type ReviewRules = { shouldReviewAtEnd: boolean };

// Sans les réglages du renard (tous ou aucun), pas de bilan tout seul.
export function toReviewRules({ foxShouldReviewAtEnd }: Settings): ReviewRules | undefined {
  return foxShouldReviewAtEnd === undefined ? undefined : { shouldReviewAtEnd: foxShouldReviewAtEnd };
}

// Un viewer et ses messages acceptés depuis le démarrage du serveur.
export type ReviewViewer = { nickname: string; messages: number };

// Le bilan du live, dit au tchat : le total, le plus bavard, le premier arrivé. `viewers` est dans l'ordre d'arrivée ; à égalité,
// le plus bavard est celui qui est arrivé le premier. Une partie qui n'a rien à dire est sautée, comme celle d'un pseudo que le
// filtre d'insultes refuse. Rien du tout (personne n'a écrit) : `null`.
export function toReviewText(
  viewers: readonly ReviewViewer[],
  isRefused: (nickname: string) => boolean,
): string | null {
  const [first] = viewers;
  if (first === undefined) return null;
  const total = viewers.reduce((sum, { messages }) => sum + messages, 0);
  const top = viewers.reduce((best, viewer) => (viewer.messages > best.messages ? viewer : best), first);
  const parts = [
    `Ce live : ${toCount(total, "message")}, de ${toCount(viewers.length, "personne")}.`,
    isRefused(top.nickname)
      ? null
      : `Le plus bavard : ${top.nickname}, avec ${toCount(top.messages, "message")}.`,
    isRefused(first.nickname) ? null : `Premier arrivé : ${first.nickname}.`,
  ];
  return parts.filter((part) => part !== null).join(" ");
}
