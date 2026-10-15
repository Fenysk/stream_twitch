import { z } from "zod";

// La part « points de chaîne » du faux Twitch : les rewards (créer, modifier, supprimer) et leurs redemptions (lister celles
// qui attendent, les marquer), avec les refus que Twitch donne vraiment (chaîne non affiliée, titre pris, 50 rewards au plus).
export const REWARDS_PATH = "/helix/channel_points/custom_rewards";
const REDEMPTIONS_PATH = `${REWARDS_PATH}/redemptions`;
const NOT_CREATED_BY_APP = "The Client-Id does not match the app that created the reward";

export type FakeReward = {
  id: string;
  title: string;
  cost: number;
  isPaused: boolean;
  // `undefined` : pas de pace (cooldown global coupé).
  cooldownSeconds: number | undefined;
  // `true` : les redemptions sautent la file de Twitch (FULFILLED d'office, aucun point ne peut être rendu).
  isSkippingQueue: boolean;
  // `true` : l'application l'a créé, elle peut le gérer (le modifier, le supprimer, le mettre en pause, marquer ses rachats).
  // `false` : Alexis l'a fait à la main, Twitch répond 403 à tout ce qui le change.
  isManageable: boolean;
};

export type FakeSpend = {
  id: string;
  rewardId: string;
  status: "UNFULFILLED" | "FULFILLED" | "CANCELED";
  user: string;
  input: string;
};

export type RewardCall = { method: string; path: string; query: URLSearchParams; body: string };
export type RewardReply = { status: number; body: string };

export type FakeRewards = {
  rewards: Map<string, FakeReward>;
  redemptions: Map<string, FakeSpend>;
  setAffiliate(isAffiliate: boolean): void;
  setMaxRewards(count: number): void;
  // Un reward fait à la main ou par une autre application : il compte parmi les 50 et son titre est pris, et l'application ne
  // peut pas le gérer.
  addForeignReward(title: string, options?: { cost?: number; cooldownSeconds?: number }): string;
  // Twitch retire un reward sans que l'application le sache.
  removeReward(id: string): void;
  createRedemption(rewardId: string, user: string, input: string): FakeSpend;
  // La réponse à un appel de l'API des points de chaîne ; `undefined` : ce n'est pas un de ses chemins.
  answer(call: RewardCall): RewardReply | undefined;
};

const ObjectSchema = z.record(z.string(), z.unknown());

const getObject = (text: string): Record<string, unknown> => {
  try {
    const parsed = ObjectSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

const refuse = (status: number, message: string): RewardReply => ({
  status,
  body: JSON.stringify({ error: "refus", status, message }),
});

// Twitch écrit les champs en snake_case : la réponse se compose en texte.
const toRewardJson = ({ id, title, cost, isPaused, cooldownSeconds }: FakeReward): string => {
  const paceJson = `{"is_enabled":${cooldownSeconds !== undefined},"global_cooldown_seconds":${cooldownSeconds ?? 0}}`;
  return `{"id":"${id}","title":${JSON.stringify(title)},"cost":${cost},"is_paused":${isPaused},"global_cooldown_setting":${paceJson}}`;
};

const toSpendJson = ({ id, rewardId, status, user, input }: FakeSpend): string =>
  `{"id":"${id}","status":"${status}","user_name":"${user}","user_input":${JSON.stringify(input)},"reward":{"id":"${rewardId}"}}`;

export function createFakeRewards(): FakeRewards {
  const rewards = new Map<string, FakeReward>();
  const redemptions = new Map<string, FakeSpend>();
  let isAffiliate = true;
  let maxRewards = 50;
  let rewardCount = 0;
  let spendCount = 0;

  const isTitleTaken = (title: string, exceptId: string | undefined): boolean =>
    [...rewards.values()].some(
      (reward) => reward.id !== exceptId && reward.title.toLowerCase() === title.toLowerCase(),
    );

  const updateFields = (reward: FakeReward, body: Record<string, unknown>): void => {
    if (typeof body.title === "string") reward.title = body.title;
    if (typeof body.cost === "number") reward.cost = body.cost;
    if (typeof body.is_paused === "boolean") reward.isPaused = body.is_paused;
    if (typeof body.is_global_cooldown_enabled === "boolean") {
      const seconds = body.global_cooldown_seconds;
      reward.cooldownSeconds =
        body.is_global_cooldown_enabled && typeof seconds === "number" ? seconds : undefined;
    }
  };

  const createReward = (body: Record<string, unknown>): RewardReply => {
    const title = typeof body.title === "string" ? body.title : "";
    if (title === "") return refuse(400, "The title field is required");
    if (rewards.size >= maxRewards) return refuse(400, "CREATE_CUSTOM_REWARD_TOO_MANY_REWARDS");
    if (isTitleTaken(title, undefined)) return refuse(400, "CREATE_CUSTOM_REWARD_DUPLICATE_REWARD");
    rewardCount += 1;
    const reward: FakeReward = {
      id: `reward-${rewardCount}`,
      title,
      cost: 1,
      isPaused: false,
      cooldownSeconds: undefined,
      isSkippingQueue: body.should_redemptions_skip_request_queue === true,
      isManageable: true,
    };
    updateFields(reward, body);
    rewards.set(reward.id, reward);
    return { status: 200, body: `{"data":[${toRewardJson(reward)}]}` };
  };

  const updateReward = (id: string, body: Record<string, unknown>): RewardReply => {
    const reward = rewards.get(id);
    if (!reward) return refuse(404, "The custom reward was not found");
    if (!reward.isManageable) return refuse(403, NOT_CREATED_BY_APP);
    if (typeof body.title === "string" && isTitleTaken(body.title, id)) {
      return refuse(400, "UPDATE_CUSTOM_REWARD_DUPLICATE_REWARD");
    }
    updateFields(reward, body);
    return { status: 200, body: `{"data":[${toRewardJson(reward)}]}` };
  };

  // Comme Twitch : supprimer un reward marque FULFILLED ses redemptions en attente (aucun point rendu).
  const deleteReward = (id: string): RewardReply => {
    const reward = rewards.get(id);
    if (!reward) return refuse(404, "The custom reward was not found");
    if (!reward.isManageable) return refuse(403, NOT_CREATED_BY_APP);
    rewards.delete(id);
    for (const spend of redemptions.values()) {
      if (spend.rewardId === id && spend.status === "UNFULFILLED") spend.status = "FULFILLED";
    }
    return { status: 204, body: "" };
  };

  // Tous les rewards de la chaîne, ou seulement ceux que l'application peut gérer (`only_manageable_rewards=true`).
  const listRewards = (query: URLSearchParams): RewardReply => {
    const isOnlyManageable = query.get("only_manageable_rewards") === "true";
    const rows = [...rewards.values()].filter((reward) => !isOnlyManageable || reward.isManageable);
    return { status: 200, body: `{"data":[${rows.map(toRewardJson).join(",")}]}` };
  };

  const answerReward = (call: RewardCall): RewardReply => {
    const id = call.query.get("id") ?? "";
    if (call.method === "GET") return listRewards(call.query);
    if (call.method === "POST") return createReward(getObject(call.body));
    if (call.method === "PATCH") return updateReward(id, getObject(call.body));
    return call.method === "DELETE" ? deleteReward(id) : refuse(405, "méthode non permise");
  };

  const listRedemptions = (query: URLSearchParams): RewardReply => {
    const rows = [...redemptions.values()].filter(
      (spend) => spend.rewardId === query.get("reward_id") && spend.status === query.get("status"),
    );
    return { status: 200, body: `{"data":[${rows.map(toSpendJson).join(",")}]}` };
  };

  const settleSpend = (query: URLSearchParams, body: Record<string, unknown>): RewardReply => {
    const spend = redemptions.get(query.get("id") ?? "");
    const status = body.status;
    if (status !== "FULFILLED" && status !== "CANCELED") return refuse(400, "The status is invalid");
    // Seule une spend UNFULFILLED se change : une déjà marquée n'existe plus pour Twitch.
    if (!spend || spend.rewardId !== query.get("reward_id") || spend.status !== "UNFULFILLED") {
      return refuse(404, "The spend was not found or is not UNFULFILLED");
    }
    if (!rewards.get(spend.rewardId)?.isManageable) return refuse(403, NOT_CREATED_BY_APP);
    spend.status = status;
    return { status: 200, body: `{"data":[${toSpendJson(spend)}]}` };
  };

  return {
    rewards,
    redemptions,
    setAffiliate(next) {
      isAffiliate = next;
    },
    setMaxRewards(count) {
      maxRewards = count;
    },
    addForeignReward(title, { cost = 50, cooldownSeconds } = {}) {
      rewardCount += 1;
      const id = `reward-${rewardCount}`;
      rewards.set(id, {
        id,
        title,
        cost,
        isPaused: false,
        cooldownSeconds,
        isSkippingQueue: false,
        isManageable: false,
      });
      return id;
    },
    removeReward(id) {
      rewards.delete(id);
    },
    createRedemption(rewardId, user, input) {
      spendCount += 1;
      const spend: FakeSpend = {
        id: `spend-${spendCount}`,
        rewardId,
        status: "UNFULFILLED",
        user,
        input,
      };
      redemptions.set(spend.id, spend);
      return spend;
    },
    answer(call) {
      const isReward = call.path === REWARDS_PATH;
      const isSpend = call.path === REDEMPTIONS_PATH;
      if (!isReward && !isSpend) return undefined;
      if (!isAffiliate) return refuse(403, "The broadcaster is not a partner or affiliate");
      if (isReward) return answerReward(call);
      if (call.method === "GET") return listRedemptions(call.query);
      return call.method === "PATCH"
        ? settleSpend(call.query, getObject(call.body))
        : refuse(405, "méthode non permise");
    },
  };
}
