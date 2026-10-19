// L'instant où cette page a demandé l'arrêt du live (appui sur « Arrêter »), `null` : jamais. La feuille qui l'envoie et l'alerte « Live
// arrêté » qui l'écoute n'ont rien à se passer d'autre : il reste ici plutôt que dans trois props.
let askedAt: number | null = null;

export const updateStopAskedAt = (now: number): void => {
  askedAt = now;
};

export const getStopAskedAt = (): number | null => askedAt;
