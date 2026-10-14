import type { Settings } from "./settings.schema";

// La relance : le silence total (ms) après lequel le renard caché revient piquer Fenysk, et l'écart (ms) entre deux piques.
export type JabRules = { after: number; gap: number };

// Sans les réglages du renard (tous ou aucun), pas de relance.
export function toJabRules({ foxJabAfter, foxJabGap }: Settings): JabRules | undefined {
  if (foxJabAfter === undefined || foxJabGap === undefined) return undefined;
  return { after: foxJabAfter, gap: foxJabGap };
}

// Ce que le silence donne : une pique (tournée vers Fenysk) ou un rappel (tourné vers le chat).
export type SilenceKind = "jab" | "reminder";

// Tour à tour une pique puis un rappel, en commençant par la pique. Quand une seule sorte a quelque chose à dire, c'est toujours
// elle ; `null` : rien à dire. `last` : ce qu'il a dit la fois d'avant (`null` : rien encore).
export function toNextSilenceKind(
  last: SilenceKind | null,
  { hasJab, hasReminder }: { hasJab: boolean; hasReminder: boolean },
): SilenceKind | null {
  if (hasJab && hasReminder) return last === "jab" ? "reminder" : "jab";
  if (hasJab) return "jab";
  return hasReminder ? "reminder" : null;
}

// Depuis combien de ms (infini : jamais) il est parti, Fenysk ne dit rien, le tchat ne dit rien, et la dernière pique a été
// dite. `awayFor` est `null` tant qu'il n'est pas parti.
export type JabSilence = {
  awayFor: number | null;
  voiceSilentFor: number;
  chatSilentFor: number;
  sinceLastJab: number;
};

// Il revient piquer quand il est parti et que Fenysk, le tchat et son départ datent tous de `after` au moins (le silence se
// compte donc depuis son départ au plus tôt : il ne revient pas dès qu'il est parti), et que l'écart `gap` est écoulé.
export const isJabDue = (
  { awayFor, voiceSilentFor, chatSilentFor, sinceLastJab }: JabSilence,
  rules: JabRules,
): boolean =>
  awayFor !== null &&
  Math.min(awayFor, voiceSilentFor, chatSilentFor) >= rules.after &&
  sinceLastJab >= rules.gap;
