import { describe, expect, it } from "vitest";
import { toRewardChange, toRewardCreation, toRewardRefusal } from "./reward.rules";

// Les corps de Twitch sont en snake_case : ils s'écrivent en JSON, et se lisent par `JSON.parse`.
const body = (json: string): unknown => JSON.parse(json);

describe("toRewardChange : le corps d'un changement de reward, avec les noms de Twitch", () => {
  it("ne met que les champs donnés", () => {
    expect(toRewardChange({ title: "Rire" })).toEqual({ title: "Rire" });
    expect(toRewardChange({ cost: 250 })).toEqual({ cost: 250 });
    expect(toRewardChange({ isPaused: true })).toEqual(body('{"is_paused":true}'));
    expect(toRewardChange({})).toEqual({});
  });

  it("allume le cooldown global quand la pace dépasse 0 s, et le coupe à 0", () => {
    expect(toRewardChange({ pace: 30 })).toEqual(
      body('{"is_global_cooldown_enabled":true,"global_cooldown_seconds":30}'),
    );
    expect(toRewardChange({ pace: 0 })).toEqual(body('{"is_global_cooldown_enabled":false}'));
  });
});

describe("toRewardCreation : un reward qui ne saute pas la file de Twitch", () => {
  it("porte le titre, le coût et le cooldown, et laisse ses rachats UNFULFILLED", () => {
    expect(toRewardCreation({ title: "Rire", cost: 100, pace: 30 })).toEqual(
      body(
        '{"title":"Rire","cost":100,"is_global_cooldown_enabled":true,"global_cooldown_seconds":30,"should_redemptions_skip_request_queue":false}',
      ),
    );
  });

  it("n'allume pas de cooldown pour une pace de 0", () => {
    const created = toRewardCreation({ title: "Rire", cost: 100, pace: 0 });
    expect(created).toEqual(
      body(
        '{"title":"Rire","cost":100,"is_global_cooldown_enabled":false,"should_redemptions_skip_request_queue":false}',
      ),
    );
    expect(Object.keys(created)).not.toContain("global_cooldown_seconds");
  });
});

describe("toRewardRefusal : ce que Twitch refuse, en français", () => {
  it("dit une chaîne non affiliée pour un 403", () => {
    expect(toRewardRefusal(403, "The broadcaster is not a partner or affiliate")).toBe(
      "Twitch refuse : la chaîne n'est pas affiliée (les points de chaîne demandent le statut d'affilié ou de partenaire).",
    );
    expect(toRewardRefusal(403, "")).toContain("n'est pas affiliée");
  });

  it("dit une récompense faite par une autre application quand le 403 parle du client", () => {
    expect(toRewardRefusal(403, "The Client-Id does not match the app that created the reward")).toBe(
      "Twitch refuse : cette récompense n'a pas été créée par cette application, elle seule peut la gérer.",
    );
  });

  it("dit un titre déjà pris", () => {
    expect(toRewardRefusal(400, "CREATE_CUSTOM_REWARD_DUPLICATE_REWARD")).toBe(
      "Twitch refuse ce titre : une récompense de la chaîne le porte déjà.",
    );
    expect(toRewardRefusal(400, "The title must be unique")).toContain("le porte déjà");
  });

  it("dit les 50 récompenses atteintes", () => {
    expect(toRewardRefusal(400, "CREATE_CUSTOM_REWARD_TOO_MANY_REWARDS")).toBe(
      "Twitch refuse : la chaîne a déjà 50 récompenses, le maximum. Supprime-en une.",
    );
  });

  it("dit un reward ou un rachat que Twitch ne connaît plus", () => {
    expect(toRewardRefusal(404, "")).toBe(
      "Twitch ne connaît plus ce reward ou ce rachat (supprimé à la main, ou déjà traité).",
    );
  });

  it("dit une connexion que Twitch ne reconnaît plus", () => {
    expect(toRewardRefusal(401, "Invalid OAuth token")).toContain("reconnecte-toi");
  });

  it("garde le code et une raison courte pour tout autre refus", () => {
    expect(toRewardRefusal(400, "The cost field must be 1 or more")).toBe(
      "Twitch a refusé (HTTP 400 : The cost field must be 1 or more).",
    );
    expect(toRewardRefusal(503, "")).toBe("Twitch a refusé (HTTP 503).");
    expect(toRewardRefusal(400, "x".repeat(500))).toBe(`Twitch a refusé (HTTP 400 : ${"x".repeat(120)}).`);
  });
});
