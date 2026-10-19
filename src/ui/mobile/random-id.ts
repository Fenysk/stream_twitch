// Un identifiant au hasard (24 caractères hexadécimaux) pour un téléphone, une page OBS ou une session de mise en relation.
// `getRandomValues` existe aussi hors HTTPS, contrairement à `randomUUID`.
export const createRandomId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
