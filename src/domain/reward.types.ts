import type { LiveEvent } from "./live.types";

// Un viewer a dépensé ses points sur une récompense (EventSub `channel.channel_points_custom_reward_redemption.add`) : c'est
// l'évènement `reward` du live, que le renard lit aussi (pseudo et titre). La soundboard y prend l'identifiant du rachat et celui
// de la récompense ; le texte que le viewer y joint n'est jamais lu.
export type RewardEvent = Extract<LiveEvent, { kind: "reward" }>;

// Ce que l'app répond à un rachat en attente : FULFILLED garde les points au viewer qui les a dépensés, CANCELED les lui rend.
export type RewardStatus = "FULFILLED" | "CANCELED";

// Ce qu'un reward demande à Twitch : son titre, son coût en points, et sa pace en secondes (0 = aucune).
export type RewardFields = { title: string; cost: number; pace: number };

// Ce qu'on change sur un reward : des champs, ou sa pause (hors stream, les viewers ne peuvent plus le dépenser).
export type RewardChange = Partial<RewardFields> & { isPaused?: boolean };
