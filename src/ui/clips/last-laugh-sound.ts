// Le dernier sound choisi pour un rire, retenu par le navigateur d'un clip à l'autre. Jamais lu au rendu serveur ; refusé (fenêtre privée) : sans.

const STORAGE_KEY = "clip-last-laugh-sound";

export const getLastLaughSound = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Clips : le dernier sound d'un rire n'a pas pu être lu", error);
    return null;
  }
};

export const updateLastLaughSound = (id: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.error("Clips : le dernier sound d'un rire n'a pas pu être retenu", error);
  }
};
