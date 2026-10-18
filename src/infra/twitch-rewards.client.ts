import { z } from "zod";
import { toRewardChange, toRewardCreation, toRewardRefusal } from "../domain/reward.rules";
import type { RewardChoice, RewardStatus } from "../domain/reward.types";
import type { RewardPort, RewardResult } from "../usecase/reward.usecase";

export type RewardsClientSettings = {
  clientId: string;
  // L'identifiant Twitch de la chaîne ; sans lui, rien ne se gère.
  broadcasterId: string | undefined;
  // Le jeton d'accès pour gérer les rewards ; `null` : la connexion n'est pas prête (pas connecté, ou droit manquant).
  getAccessToken: (isForced: boolean) => Promise<string | null>;
  // Le réseau et l'adresse de Twitch sont injectés : les tests parlent à un faux Twitch, jamais au vrai.
  fetcher?: typeof fetch;
  apiUrl?: string;
  delayMs?: number;
};

const DEFAULT_API_URL = "https://api.twitch.tv";
const DEFAULT_DELAY_MS = 10_000;
const REWARDS_PATH = "/helix/channel_points/custom_rewards";
const REDEMPTIONS_PATH = `${REWARDS_PATH}/redemptions`;
// Twitch rend 50 redemptions au plus par page : un reward qui en a plus sera remboursé au démarrage suivant.
const PENDING_PAGE_SIZE = "50";
const NOT_READY = "Twitch n'est pas prêt : connecte-toi (ou reconnecte-toi) depuis l'onglet Twitch.";
const MISSING_CHANNEL = "l'identifiant de la chaîne (chatChannelId) manque dans settings.json.";

// Twitch écrit `broadcaster_id`, `reward_id`, `global_cooldown_seconds`… en snake_case : ces champs se lisent dans l'objet,
// sans être déclarés.
const ObjectSchema = z.record(z.string(), z.unknown());
type Fields = z.infer<typeof ObjectSchema>;

type Call = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query: [string, string][];
  body?: Record<string, unknown>;
};

const getFields = (value: unknown): Fields => {
  const parsed = ObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

// La raison que Twitch donne à un refus (`message`) : elle ne porte jamais un jeton, seulement « Invalid OAuth token ».
const toReason = async (response: Response): Promise<string> => {
  const message = getFields(await response.json().catch(() => undefined)).message;
  return typeof message === "string" ? message : "";
};

// Les `data` d'une réponse de Twitch : une liste d'objets (vide si la réponse n'en a pas, comme un 204).
const getRows = (body: Fields): Fields[] => {
  const rows = z.array(ObjectSchema).safeParse(body.data);
  return rows.success ? rows.data : [];
};

// Un reward de la liste de Twitch : son identifiant, son titre et son coût sont indispensables ; son cooldown global, en
// secondes, vaut 0 quand il est coupé. `manageable` : les identifiants que l'app a créés.
const toChoice = (row: Fields, manageable: ReadonlySet<string>): RewardChoice[] => {
  const { id, title, cost } = row;
  if (typeof id !== "string" || id === "" || typeof title !== "string" || typeof cost !== "number") return [];
  const setting = getFields(row.global_cooldown_setting);
  const seconds = setting.global_cooldown_seconds;
  const pace = setting.is_enabled === true && typeof seconds === "number" ? seconds : 0;
  return [{ id, title, cost, pace, isManageable: manageable.has(id) }];
};

const fail = (status: number, message: string): RewardResult<never> => ({ ok: false, status, message });

// Les rewards et leurs redemptions par l'API Helix, avec le jeton d'Alexis. Ils ne se gèrent que par l'application qui les a
// créés (le `client-id` de chaque appel). Les messages d'erreur ne portent jamais le jeton : le refus de Twitch, dit en
// français, ou « Twitch ne répond pas ».
export function createRewardsClient({
  clientId,
  broadcasterId,
  getAccessToken,
  fetcher = fetch,
  apiUrl = DEFAULT_API_URL,
  delayMs = DEFAULT_DELAY_MS,
}: RewardsClientSettings): RewardPort {
  // Un appel avec le jeton demandé ; `undefined` : pas de jeton, rien n'est parti.
  const sendOnce = async (isForced: boolean, call: Call, channel: string): Promise<Response | undefined> => {
    const access = await getAccessToken(isForced);
    if (!access) return undefined;
    const url = new URL(`${apiUrl}${call.path}`);
    url.searchParams.set("broadcaster_id", channel);
    for (const [name, value] of call.query) url.searchParams.set(name, value);
    return fetcher(url, {
      method: call.method,
      headers: {
        authorization: `Bearer ${access}`,
        "client-id": clientId,
        ...(call.body ? { "content-type": "application/json" } : {}),
      },
      ...(call.body ? { body: JSON.stringify(call.body) } : {}),
      signal: AbortSignal.timeout(delayMs),
    });
  };

  // Twitch ne reconnaît plus ce jeton (401) : un autre, une fois.
  const sendWithRetry = async (call: Call, channel: string): Promise<Response | undefined> => {
    const response = await sendOnce(false, call, channel);
    return response?.status === 401 ? sendOnce(true, call, channel) : response;
  };

  const toResult = async (response: Response | undefined): Promise<RewardResult<Fields>> => {
    if (!response) return fail(401, NOT_READY);
    if (!response.ok)
      return fail(response.status, toRewardRefusal(response.status, await toReason(response)));
    return { ok: true, value: getFields(await response.json().catch(() => undefined)) };
  };

  const send = async (call: Call): Promise<RewardResult<Fields>> => {
    if (broadcasterId === undefined) return fail(0, MISSING_CHANNEL);
    try {
      return await toResult(await sendWithRetry(call, broadcasterId));
    } catch (error) {
      return fail(0, `Twitch ne répond pas (${error instanceof Error ? error.message : "réseau"}).`);
    }
  };

  // Une demande sans valeur à rendre : réussie ou refusée.
  const done = async (call: Call): Promise<RewardResult<null>> => {
    const result = await send(call);
    return result.ok ? { ok: true, value: null } : result;
  };

  return {
    // Tous les rewards de la chaîne, puis ceux que l'app peut gérer (`only_manageable_rewards=true`) : ce sont ceux qu'elle a créés.
    async list() {
      const all = await send({ method: "GET", path: REWARDS_PATH, query: [] });
      if (!all.ok) return all;
      const own = await send({
        method: "GET",
        path: REWARDS_PATH,
        query: [["only_manageable_rewards", "true"]],
      });
      if (!own.ok) return own;
      const manageable = new Set(
        getRows(own.value).flatMap(({ id }) => (typeof id === "string" ? [id] : [])),
      );
      return { ok: true, value: getRows(all.value).flatMap((row) => toChoice(row, manageable)) };
    },
    async create(fields) {
      const result = await send({
        method: "POST",
        path: REWARDS_PATH,
        query: [],
        body: toRewardCreation(fields),
      });
      if (!result.ok) return result;
      const id = getRows(result.value)[0]?.id;
      return typeof id === "string" && id !== ""
        ? { ok: true, value: id }
        : fail(502, "réponse de Twitch illisible");
    },
    update: (rewardId, change) =>
      done({ method: "PATCH", path: REWARDS_PATH, query: [["id", rewardId]], body: toRewardChange(change) }),
    delete: (rewardId) => done({ method: "DELETE", path: REWARDS_PATH, query: [["id", rewardId]] }),
    async listPending(rewardId) {
      const result = await send({
        method: "GET",
        path: REDEMPTIONS_PATH,
        query: [
          ["reward_id", rewardId],
          ["status", "UNFULFILLED"],
          ["first", PENDING_PAGE_SIZE],
        ],
      });
      if (!result.ok) return result;
      const ids = getRows(result.value).flatMap(({ id }) => (typeof id === "string" ? [id] : []));
      return { ok: true, value: ids };
    },
    settle: ({ id, rewardId }, status: RewardStatus) =>
      done({
        method: "PATCH",
        path: REDEMPTIONS_PATH,
        query: [
          ["id", id],
          ["reward_id", rewardId],
        ],
        body: { status },
      }),
  };
}
