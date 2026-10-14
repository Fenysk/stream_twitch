import { z } from "zod";
import { type Slot, toSlotTitle } from "../domain/timetable.rules";
import type { TimetablePort } from "../usecase/timetable.usecase";
import {
  type AppTokenSettings,
  createAppToken,
  DEFAULT_DELAY_MS,
  getJsonObject,
} from "./twitch-app-token.client";

export type TimetableClientSettings = AppTokenSettings & {
  // L'identifiant Twitch de la chaîne ; sans lui, il n'y a jamais de slot.
  channelId: string | undefined;
};

const SCHEDULE_URL = "https://api.twitch.tv/helix/schedule";

// Twitch écrit ses champs en snake_case (`start_time`, `canceled_until`, `end_time`) : ils se lisent dans l'objet, sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());
const FieldsSchema = z.object({ data: ObjectSchema });
const ListSchema = z.array(z.unknown()).nullish();

type Period = { from: number; to: number };

// Les vacances de la chaîne, quand elles sont réglées : un slot qui y tombe n'a pas lieu.
function toVacation(value: unknown): Period | null {
  const vacation = ObjectSchema.safeParse(value);
  if (!vacation.success) return null;
  const from = Date.parse(String(vacation.data.start_time));
  const to = Date.parse(String(vacation.data.end_time));
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

// Un créneau de la timetable, ou `null` : sa date est illisible, il est annulé (`canceled_until` n'est alors pas nul), ou il tombe
// pendant les vacances.
function toSlot(value: unknown, vacation: Period | null): Slot | null {
  const entry = ObjectSchema.safeParse(value);
  if (!entry.success) return null;
  const start = Date.parse(String(entry.data.start_time));
  const isCanceled = typeof entry.data.canceled_until === "string";
  const isOnVacation = vacation !== null && start >= vacation.from && start < vacation.to;
  if (!Number.isFinite(start) || isCanceled || isOnVacation) return null;
  const title = z.string().safeParse(entry.data.title);
  return { start, title: toSlotTitle(title.success ? title.data : null) };
}

// Les slots du corps d'une réponse ; lève « réponse illisible » quand sa forme n'est pas celle de Twitch.
function toSlots(body: Record<string, unknown>): Slot[] {
  const fields = FieldsSchema.safeParse(body);
  if (!fields.success) throw new Error("réponse illisible");
  const segments = ListSchema.safeParse(fields.data.data.segments);
  if (!segments.success) throw new Error("réponse illisible");
  const vacation = toVacation(fields.data.data.vacation);
  return (segments.data ?? []).flatMap((item) => toSlot(item, vacation) ?? []);
}

// La timetable de la chaîne par l'API Helix, avec un jeton d'application (« client credentials ») : elle marche sans la connexion
// d'Alexis. Une chaîne sans timetable répond 404 : pas de slot, sans erreur. Les messages d'erreur ne portent jamais le jeton ni
// le secret : seulement un code HTTP ou « illisible ».
export function createTimetableClient({
  channelId,
  fetcher = fetch,
  delayMs = DEFAULT_DELAY_MS,
  ...appSettings
}: TimetableClientSettings): TimetablePort {
  const token = createAppToken({ ...appSettings, fetcher, delayMs });
  const { clientId } = appSettings;

  const getSchedule = async (value: string): Promise<Response> =>
    fetcher(`${SCHEDULE_URL}?broadcaster_id=${encodeURIComponent(channelId ?? "")}`, {
      headers: { authorization: `Bearer ${value}`, "client-id": clientId },
      signal: AbortSignal.timeout(delayMs),
    });

  return {
    async get() {
      if (channelId === undefined) return [];
      let response = await getSchedule(await token.get());
      // Le jeton a été révoqué avant sa fin : on en demande un autre, une fois.
      if (response.status === 401) {
        token.forget();
        response = await getSchedule(await token.get());
      }
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return toSlots(await getJsonObject(response));
    },
  };
}
