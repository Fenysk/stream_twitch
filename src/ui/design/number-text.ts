// Le texte d'un champ nombre : ce qu'on tape (la virgule française comprise) et ce qu'on affiche.

export type NumberText = { isValid: true; value: number | null } | { isValid: false };

// Vide : pas de valeur. Un texte qui n'est pas un nombre fini : refusé, le champ garde ce qu'on a tapé.
export const toNumberText = (text: string): NumberText => {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return { isValid: true, value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { isValid: true, value } : { isValid: false };
};

export const toText = (value: number | null): string => (value === null ? "" : String(value));

// Une flèche du clavier change la valeur d'un pas ; l'arrondi au nombre de décimales du pas évite 0.30000000000000004.
export const stepNumber = (current: number | null, direction: 1 | -1, step: number): number => {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(((current ?? 0) + direction * step).toFixed(decimals));
};
