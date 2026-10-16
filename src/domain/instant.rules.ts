const INSTANT =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

// L'instant (ms) d'un texte ISO complet (« 2026-10-16T13:00:00.000Z », ou avec un décalage) ; `null` pour le texte vide ou autre.
export function toInstant(text: string): number | null {
  if (!INSTANT.test(text)) return null;
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : at;
}

// Le texte ISO en UTC d'un instant, le texte vide pour `null`.
export const toInstantText = (at: number | null): string => (at === null ? "" : new Date(at).toISOString());
