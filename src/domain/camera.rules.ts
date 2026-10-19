import { CameraNumberSchema, type PhoneRole, PhoneRoleSchema } from "./phone.schema";

// Les rôles d'une adresse `?role=` qui font filmer le téléphone dès l'ouverture : la Caméra (arrière) et le Selfie (avant). La Régie non.
export const hasCamera = (role: PhoneRole): boolean => role === "camera" || role === "selfie";

// Plus lu depuis R4 : tout téléphone reçoit l'état de la régie, qu'il filme ou non. Sort avec les rôles à R5.
export const hasControl = (role: PhoneRole): boolean => role === "control" || role === "selfie";

// Le plus petit numéro libre, à partir de 1.
export const toNextNumber = (taken: readonly number[]): number => {
  let next = 1;
  while (taken.includes(next)) next += 1;
  return next;
};

// Le numéro d'une adresse (`/camera/3`) ; rien quand ce n'est pas un numéro de caméra écrit simplement (pas « 03 » ni « 1e2 »).
export const toCameraNumber = (text: string): number | null => {
  const parsed = CameraNumberSchema.safeParse(Number(text));
  return parsed.success && String(parsed.data) === text ? parsed.data : null;
};

export const toCameraName = (number: number): string => `Caméra ${number}`;

// L'adresse de la source navigateur d'OBS : un hôte par caméra, car toutes les sources d'OBS se partagent 6 connexions par hôte.
export const toCameraAddress = (number: number, port: string): string =>
  `http://camera-${number}.localhost:${port}/camera/${number}`;

// Le numéro d'une source navigateur d'OBS d'après son adresse, l'inverse de `toCameraAddress` : le chemin `/camera/<numéro>` sur l'hôte
// de cette caméra (`camera-<numéro>.<hôte du serveur>`) ou sur un hôte du serveur ; `null` pour toute autre adresse.
export const toCameraOfAddress = (address: string | undefined, hosts: readonly string[]): number | null => {
  if (address === undefined || !URL.canParse(address)) return null;
  const { host, pathname } = new URL(address);
  const captured = /^\/camera\/([^/]+)\/?$/.exec(pathname)?.[1];
  const number = captured === undefined ? null : toCameraNumber(captured);
  if (number === null) return null;
  return hosts.some((own) => host === own || host === `camera-${number}.${own}`) ? number : null;
};

// L'adresse que porte le QR code d'un rôle : /mobile ouvre ce rôle sans le demander.
export const toRoleUrl = (origin: string, role: PhoneRole): string => `${origin}/mobile?role=${role}`;

const ROLE_LABELS: Record<PhoneRole, string> = { camera: "Caméra", control: "Régie", selfie: "Selfie" };

export const toRoleLabel = (role: PhoneRole): string => ROLE_LABELS[role];

// Le rôle gardé sur le téléphone, tel que le stockage le rend (n'importe quel texte, ou rien).
export const toSavedRole = (saved: string | null): PhoneRole | null => {
  const parsed = PhoneRoleSchema.safeParse(saved);
  return parsed.success ? parsed.data : null;
};
