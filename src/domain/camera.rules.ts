import { CameraNumberSchema, type PhoneRole, PhoneRoleSchema, type ScreenKind } from "./phone.schema";

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

// L'adresse de la source navigateur d'OBS qui porte l'image : un hôte par caméra, car toutes les sources d'OBS se partagent 6 connexions
// par hôte.
export const toCameraAddress = (number: number, port: string): string =>
  `http://camera-${number}.localhost:${port}/camera/${number}`;

// L'adresse de la source navigateur d'OBS qui ne porte que le son de la caméra, sur le même hôte : OBS ne mixe pas le son d'une source
// cachée, le mic a donc sa propre source, dans une scène présente partout.
export const toCameraMicAddress = (number: number, port: string): string =>
  `${toCameraAddress(number, port)}/mic`;

export type ScreenOfAddress = { number: number; kind: ScreenKind };

// Le numéro et la sorte d'une source navigateur d'OBS d'après son adresse, l'inverse de `toCameraAddress` et `toCameraMicAddress` : le
// chemin `/camera/<numéro>` (image) ou `/camera/<numéro>/mic` (mic) sur l'hôte de cette caméra (`camera-<numéro>.<hôte du serveur>`) ou sur
// un hôte du serveur ; `null` pour toute autre adresse.
export const toScreenOfAddress = (
  address: string | undefined,
  hosts: readonly string[],
): ScreenOfAddress | null => {
  if (address === undefined || !URL.canParse(address)) return null;
  const { host, pathname } = new URL(address);
  const matched = /^\/camera\/([^/]+)(\/mic)?\/?$/.exec(pathname);
  const number = matched === null ? null : toCameraNumber(matched[1] ?? "");
  if (number === null || !hosts.some((own) => host === own || host === `camera-${number}.${own}`))
    return null;
  return { number, kind: matched?.[2] === undefined ? "image" : "mic" };
};

// Le numéro d'une source navigateur d'OBS qui est la page image d'une caméra (`/camera/<numéro>`) ; `null` pour toute autre adresse, une
// page mic comprise.
export const toCameraOfAddress = (address: string | undefined, hosts: readonly string[]): number | null => {
  const screen = toScreenOfAddress(address, hosts);
  return screen?.kind === "image" ? screen.number : null;
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
