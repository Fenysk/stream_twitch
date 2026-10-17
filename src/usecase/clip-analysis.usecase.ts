import { toStoredConfirmation } from "../domain/clip.rules";
import { DEFAULT_CHAT_LEAD_MS, toChatSchedule } from "../domain/show.rules";
import { LEVEL_STEP_MS, toSpikes, toStartleRules } from "../domain/startle.rules";
import type {
  ClipAnalysis,
  ClipFailure,
  ClipLevels,
  ClipProbe,
  ClipSettings,
  ClipStore,
  ConfirmedClip,
} from "./clip.usecase";

export type ClipAnalysisDeps = {
  store: Pick<ClipStore, "listConfirmed" | "pathOf" | "getChat" | "updateConfirmation">;
  probe: ClipProbe;
  levels: ClipLevels;
  log: (message: string) => void;
};

// La durée d'un sursaut quand les réglages du renard ne la disent pas : celle d'une réaction (foxReactionDuration).
const DEFAULT_STARTLE_MS = 1000;

const NOT_FOUND: ClipFailure = { ok: false, status: 404, message: "clip introuvable" };
const STALE: ClipFailure = { ok: false, status: 404, message: "cette version du clip n'existe plus" };

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Ce que `/show` demande d'un clip avant de le jouer : ses spikes (le son d'un clip d'avant les spikes se mesure à ce moment-là, une fois,
// puis se garde dans son JSON) et son tchat placé sur le clip.
export function createClipAnalysis({ store, probe, levels, log }: ClipAnalysisDeps): ClipAnalysis {
  let settings: ClipSettings = {};
  // Une mesure par clip à la fois : la page et une validation qui la demandent ensemble n'en lancent pas deux.
  const measuring = new Map<string, Promise<number[] | undefined>>();

  const find = (folder: string, name: string): ConfirmedClip | undefined =>
    store.listConfirmed(folder).find((candidate) => candidate.name === name);

  const measure = async (folder: string, clip: ConfirmedClip): Promise<number[] | undefined> => {
    const rules = toStartleRules(settings);
    const path = store.pathOf(folder, "confirmed", clip.name);
    if (!rules || !path) return undefined;
    const measured = await levels.listLevels(path);
    return measured && toSpikes(measured, LEVEL_STEP_MS, rules);
  };

  // Mesure le son du clip puis garde ses spikes dans son JSON, sauf si la vidéo a été remplacée pendant ce temps (ses spikes seraient
  // ceux de l'ancienne).
  const refresh = async (folder: string, name: string): Promise<number[] | undefined> => {
    const clip = find(folder, name);
    if (!clip) return undefined;
    const spikes = await measure(folder, clip);
    const current = find(folder, name);
    if (!spikes || current?.version !== clip.version) return undefined;
    store.updateConfirmation(folder, name, { ...toStoredConfirmation(current), spikes });
    log(`Clips : « ${name} » : ${spikes.length} sursaut(s) dans le son.`);
    return spikes;
  };

  const shared = (folder: string, name: string): Promise<number[] | undefined> => {
    const key = `${folder}|${name}`;
    const known = measuring.get(key);
    if (known) return known;
    const running = refresh(folder, name)
      .catch((error: unknown) => {
        log(`Clips : « ${name} » : son non mesuré, ${toMessage(error)}`);
        return undefined;
      })
      .finally(() => measuring.delete(key));
    measuring.set(key, running);
    return running;
  };

  // La durée du clip brut, gardée dans le JSON quand elle manque (un clip validé avant que le serveur la garde) : le clip brut de
  // Traités la donne. Rien sans lui.
  const getRawDuration = async (folder: string, clip: ConfirmedClip): Promise<number | undefined> => {
    if (clip.rawDuration !== undefined) return clip.rawDuration;
    const path =
      clip.processedName === null ? undefined : store.pathOf(folder, "processed", clip.processedName);
    const duration = path === undefined ? undefined : await probe.probe(path);
    if (duration === undefined || duration <= 0) return undefined;
    const current = find(folder, clip.name);
    if (current)
      store.updateConfirmation(folder, clip.name, {
        ...toStoredConfirmation(current),
        rawDuration: duration,
      });
    return duration;
  };

  const listChat = async (folder: string, clip: ConfirmedClip) => {
    const saved = store.getChat(folder, clip.name);
    const rawDuration = saved && (await getRawDuration(folder, clip));
    if (!saved || rawDuration === undefined) return [];
    const leadMs = settings.showChatLead ?? DEFAULT_CHAT_LEAD_MS;
    return toChatSchedule(saved, { start: clip.start, end: clip.end, rawDuration }, leadMs);
  };

  return {
    update(next) {
      settings = next;
    },
    async refreshSpikes(folder, name) {
      await shared(folder, name);
    },
    async getShowCues(folder, name, version) {
      try {
        const clip = find(folder, name);
        if (!clip) return NOT_FOUND;
        if (version !== undefined && clip.version !== version) return STALE;
        const spikes = clip.spikes ?? (await shared(folder, name)) ?? [];
        const chat = await listChat(folder, clip);
        return {
          ok: true,
          value: { chat, spikes, startleMs: settings.foxReactionDuration ?? DEFAULT_STARTLE_MS },
        };
      } catch (error) {
        log(`Clips : « ${name} » : données de l'émission illisibles, ${toMessage(error)}`);
        return { ok: false, status: 502, message: `le clip n'a pas pu être lu : ${toMessage(error)}` };
      }
    },
  };
}
