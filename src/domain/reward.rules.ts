import type { RewardRecord, RewardRecordsFile } from "./reward.schema";
import type { RewardChange, RewardFields } from "./reward.types";
import type { LegacySoundFile } from "./sound.schema";

// Twitch écrit les champs d'un reward en snake_case (`global_cooldown_seconds`) : le corps se compose depuis des paires.
const toRecord = (entries: [string, unknown][]): Record<string, unknown> => Object.fromEntries(entries);

// Le corps d'un changement de reward : seuls les champs donnés y sont. Une pace de 0 coupe le cooldown global.
export function toRewardChange({ title, cost, pace, isPaused }: RewardChange): Record<string, unknown> {
  const entries: [string, unknown][] = [];
  if (title !== undefined) entries.push(["title", title]);
  if (cost !== undefined) entries.push(["cost", cost]);
  if (pace !== undefined) {
    entries.push(["is_global_cooldown_enabled", pace > 0]);
    if (pace > 0) entries.push(["global_cooldown_seconds", pace]);
  }
  if (isPaused !== undefined) entries.push(["is_paused", isPaused]);
  return toRecord(entries);
}

// Le corps d'une création : le reward ne saute pas la file de Twitch. Ses rachats restent UNFULFILLED jusqu'à ce que l'app
// les marque, et c'est ce qui permet de rendre les points d'un son qui n'a pas joué.
export const toRewardCreation = (fields: RewardFields): Record<string, unknown> =>
  toRecord([...Object.entries(toRewardChange(fields)), ["should_redemptions_skip_request_queue", false]]);

const MAX_REASON_LENGTH = 120;

// Le refus de Twitch (son code HTTP, et sa raison s'il en donne une) dit en français, pour l'onglet.
export function toRewardRefusal(status: number, reason: string): string {
  if (status === 401) return "Twitch ne reconnaît plus la connexion : reconnecte-toi depuis l'onglet Twitch.";
  if (status === 403 && /client/i.test(reason)) {
    return "Twitch refuse : cette récompense n'a pas été créée par cette application, elle seule peut la gérer.";
  }
  if (status === 403) {
    return "Twitch refuse : la chaîne n'est pas affiliée (les points de chaîne demandent le statut d'affilié ou de partenaire).";
  }
  if (status === 404)
    return "Twitch ne connaît plus ce reward ou ce rachat (supprimé à la main, ou déjà traité).";
  if (status === 400 && /duplicate|unique/i.test(reason)) {
    return "Twitch refuse ce titre : une récompense de la chaîne le porte déjà.";
  }
  if (status === 400 && /too_many|too many|maximum/i.test(reason)) {
    return "Twitch refuse : la chaîne a déjà 50 récompenses, le maximum. Supprime-en une.";
  }
  const detail = reason ? ` : ${reason.slice(0, MAX_REASON_LENGTH)}` : "";
  return `Twitch a refusé (HTTP ${status}${detail}).`;
}

// Un enregistrement de data/rewards.json existe si le reward a un sound, ou si l'app l'a créé ; sinon il n'a plus de raison d'être.
export const isRecordKept = ({ sound, isManaged }: RewardRecord): boolean => sound !== null || isManaged;

// Un ancien sound.json et l'identifiant de son dossier : la conversion en tire le reward qu'il portait.
export type LegacySound = { id: string; file: LegacySoundFile };

// data/rewards.json une fois les sounds d'avant convertis : le reward de chaque ancien sound.json y entre (son titre est celui du
// sound, `isManaged` vrai quand sound.json ne le disait pas) s'il n'y a pas déjà un enregistrement pour lui. Le même fichier quand
// il n'y a rien à ajouter.
export function toUpgradedRecords(
  file: RewardRecordsFile,
  sounds: readonly LegacySound[],
): RewardRecordsFile {
  const added: RewardRecordsFile = {};
  for (const { id, file: sound } of sounds) {
    const rewardId = sound.rewardId ?? null;
    if (rewardId === null || rewardId in file || rewardId in added) continue;
    added[rewardId] = { title: sound.title, sound: id, isManaged: sound.isManaged ?? true };
  }
  return Object.keys(added).length === 0 ? file : { ...file, ...added };
}
