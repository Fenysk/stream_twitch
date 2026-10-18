import type { SoundSummary } from "../../domain/sound.schema";

const toQuoted = (title: string): string => `« ${title} »`;

const toClipsText = (count: number): string => `${count} clip${count > 1 ? "s" : ""}`;

// Qui utilise un sound, en une ligne : les récompenses qui le jouent, les clips qui l'ont en rire. Le nombre de clips n'est pas
// montré quand le dossier des clips est illisible : sans lui, « Pas utilisé » serait peut-être faux.
export function toUsageText({
  rewardTitles,
  clipCount,
}: Pick<SoundSummary, "rewardTitles" | "clipCount">): string {
  const parts = [
    ...(rewardTitles.length > 0 ? [`Joué par ${rewardTitles.map(toQuoted).join(", ")}`] : []),
    ...(clipCount !== null && clipCount > 0 ? [`Rires de ${toClipsText(clipCount)}`] : []),
  ];
  if (parts.length > 0) return parts.join(" · ");
  return clipCount === null ? "Rires des clips non comptés (dossier des clips illisible)" : "Pas utilisé";
}

// Ce que la confirmation d'une suppression redit : qui perd ce sound. `null` : personne ne l'utilise, ou pas à notre connaissance.
export function toDeletionText({
  rewardTitles,
  clipCount,
}: Pick<SoundSummary, "rewardTitles" | "clipCount">): string | null {
  const clips = clipCount ?? 0;
  const users = [...rewardTitles.map(toQuoted), ...(clips > 0 ? [toClipsText(clips)] : [])];
  if (users.length === 0) return null;
  const names = users.length > 1 ? `${users.slice(0, -1).join(", ")} et ${users.at(-1)}` : users.join("");
  const pronoun = rewardTitles.length + clips > 1 ? "ils n'auront" : "il n'aura";
  return `Utilisé par ${names} : ${pronoun} plus ce son.`;
}
