// Le fichier audio d'un son : l'adresse porte sa version, elle change à chaque modification (le cache garde les autres).
export const toSoundFileUrl = (id: string, version: string): string =>
  `/api/sounds/${encodeURIComponent(id)}/file?v=${encodeURIComponent(version)}`;

// Le flux de la page /sounds.
export const SOUND_EVENTS_URL = "/api/sounds/events";
