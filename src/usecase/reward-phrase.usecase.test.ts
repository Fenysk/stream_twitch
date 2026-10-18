import { describe, expect, it } from "vitest";
import type { RewardChoice } from "../domain/reward.types";
import type { RewardPhrasesFile } from "../domain/reward-phrase.schema";
import type { RewardResult } from "./reward.usecase";
import { createRewardPhraseLibrary } from "./reward-phrase.usecase";

const choice = (id: string, title: string): RewardChoice => ({
  id,
  title,
  cost: 100,
  pace: 0,
  isManageable: false,
});

const DRINK = choice("reward-drink", "À boire !");
const STRETCH = choice("reward-stretch", "Étirement !");
const CLASH = choice("reward-clash", "Clasher Fenysk");

const setup = (
  stored: RewardPhrasesFile = {},
  listed: RewardResult<RewardChoice[]> = { ok: true, value: [STRETCH, DRINK, CLASH] },
) => {
  const state = { file: stored, writes: 0, lists: 0, isDiskFull: false, listed };
  const logs: string[] = [];
  const library = createRewardPhraseLibrary({
    store: {
      get: () => state.file,
      update(next) {
        if (state.isDiskFull) throw new Error("disque plein");
        state.file = next;
        state.writes += 1;
      },
    },
    rewards: {
      async list() {
        state.lists += 1;
        return state.listed;
      },
    },
    isReserved: (title) => title === "Clasher Fenysk",
    log: (line) => logs.push(line),
  });
  return { library, state, logs };
};

describe("createRewardPhraseLibrary : lire les phrases", () => {
  it("rend les phrases d'une récompense, ou une liste vide quand elle n'en a pas", () => {
    const { library } = setup({ "reward-drink": { title: "À boire !", phrases: ["Bois, {user} !"] } });
    expect(library.get("reward-drink")).toEqual(["Bois, {user} !"]);
    expect(library.get("reward-stretch")).toEqual([]);
  });

  it("liste toutes les récompenses de la chaîne par titre, avec leurs phrases, même celles qui n'en ont pas", async () => {
    const { library } = setup({ "reward-drink": { title: "À boire !", phrases: ["Bois, {user} !"] } });
    expect(await library.list()).toEqual({
      ok: true,
      value: [
        {
          id: "reward-drink",
          title: "À boire !",
          isMissing: false,
          isReserved: false,
          phrases: ["Bois, {user} !"],
        },
        { id: "reward-clash", title: "Clasher Fenysk", isMissing: false, isReserved: true, phrases: [] },
        { id: "reward-stretch", title: "Étirement !", isMissing: false, isReserved: false, phrases: [] },
      ],
    });
  });

  it("garde, après celles de la chaîne, une récompense disparue de Twitch avec ses phrases et son dernier titre", async () => {
    const { library } = setup({
      "reward-gone": { title: "Hydrate-toi", phrases: ["Un verre, {user} ?"] },
      "reward-drink": { title: "À boire !", phrases: ["Bois, {user} !"] },
    });
    const listed = await library.list();
    expect(listed.ok && listed.value.map(({ id, isMissing }) => `${id}:${isMissing}`)).toEqual([
      "reward-drink:false",
      "reward-clash:false",
      "reward-stretch:false",
      "reward-gone:true",
    ]);
    expect(listed.ok && listed.value.at(-1)).toEqual({
      id: "reward-gone",
      title: "Hydrate-toi",
      isMissing: true,
      isReserved: false,
      phrases: ["Un verre, {user} ?"],
    });
  });

  it("suit le titre que Twitch a changé, et n'écrit rien quand rien n'a changé", async () => {
    const { library, state } = setup({ "reward-drink": { title: "Boire", phrases: ["Bois, {user} !"] } });
    await library.list();
    expect(state.file["reward-drink"]).toEqual({ title: "À boire !", phrases: ["Bois, {user} !"] });
    expect(state.writes).toBe(1);
    await library.list();
    expect(state.writes).toBe(1);
  });

  it("garde l'ancien titre et le dit au journal quand le disque refuse la mise à jour", async () => {
    const { library, state, logs } = setup({
      "reward-drink": { title: "Boire", phrases: ["Bois, {user} !"] },
    });
    state.isDiskFull = true;
    const listed = await library.list();
    expect(listed.ok).toBe(true);
    expect(logs).toContain("Phrases des récompenses : titres de Twitch non relus (disque plein).");
  });

  it("dit pourquoi Twitch ne donne pas la liste : injoignable (502) ou refus (422)", async () => {
    const unreachable = setup({}, { ok: false, status: 0, message: "Twitch ne répond pas" });
    expect(await unreachable.library.list()).toEqual({
      ok: false,
      status: 502,
      issues: [{ path: "", message: "Twitch ne répond pas" }],
    });
    const refused = setup({}, { ok: false, status: 403, message: "refusé" });
    expect(await refused.library.list()).toMatchObject({ ok: false, status: 422 });
  });
});

describe("createRewardPhraseLibrary : écrire les phrases", () => {
  it("garde les phrases d'une récompense de la chaîne avec son titre de Twitch, sans espace aux bords ni ligne vide", async () => {
    const { library, state, logs } = setup();
    const saved = await library.update("reward-drink", [
      "  Bois un coup de la part de {user} !  ",
      "",
      "Santé !",
    ]);
    expect(saved).toEqual({ ok: true, value: ["Bois un coup de la part de {user} !", "Santé !"] });
    expect(state.file).toEqual({
      "reward-drink": { title: "À boire !", phrases: ["Bois un coup de la part de {user} !", "Santé !"] },
    });
    expect(library.get("reward-drink")).toEqual(["Bois un coup de la part de {user} !", "Santé !"]);
    expect(logs).toContain("Récompense « À boire ! » : 2 phrase(s) enregistrée(s).");
  });

  it("modifie les phrases d'une récompense qui en a déjà, sans rien demander à Twitch", async () => {
    const { library, state } = setup({ "reward-gone": { title: "Hydrate-toi", phrases: ["Un verre ?"] } });
    const saved = await library.update("reward-gone", ["Un verre, {user} ?"]);
    expect(saved.ok).toBe(true);
    expect(state.lists).toBe(0);
    expect(state.file["reward-gone"]).toEqual({ title: "Hydrate-toi", phrases: ["Un verre, {user} ?"] });
  });

  it("retire les phrases d'une liste vide, même d'une récompense disparue, sans rien demander à Twitch", async () => {
    const { library, state, logs } = setup({
      "reward-gone": { title: "Hydrate-toi", phrases: ["Un verre ?"] },
      "reward-drink": { title: "À boire !", phrases: ["Bois !"] },
    });
    expect(await library.update("reward-gone", ["", "  "])).toEqual({ ok: true, value: [] });
    expect(state.file).toEqual({ "reward-drink": { title: "À boire !", phrases: ["Bois !"] } });
    expect(state.lists).toBe(0);
    expect(library.get("reward-gone")).toEqual([]);
    expect(logs).toContain("Récompense « Hydrate-toi » : phrases retirées.");
  });

  it("n'écrit rien en retirant les phrases d'une récompense qui n'en a pas", async () => {
    const { library, state } = setup();
    expect(await library.update("reward-drink", [])).toEqual({ ok: true, value: [] });
    expect(state.writes).toBe(0);
  });

  it("refuse une variable que le rachat ne donne pas, et dit laquelle", async () => {
    const { library, state } = setup();
    expect(await library.update("reward-drink", ["Bois, {user} ! {boisson}"])).toEqual({
      ok: false,
      status: 422,
      issues: [
        { path: "phrases", message: "la variable {boisson} n'existe pas ici : seule {user} est permise" },
      ],
    });
    expect(state.writes).toBe(0);
  });

  it("refuse la récompense du renard : ses phrases se règlent dans l'onglet Renard", async () => {
    const { library, state } = setup();
    expect(await library.update("reward-clash", ["Salut"])).toEqual({
      ok: false,
      status: 422,
      issues: [
        {
          path: "phrases",
          message: "cette récompense est celle du renard : ses phrases se règlent dans l'onglet Renard",
        },
      ],
    });
    expect(state.writes).toBe(0);
  });

  it("refuse une récompense que Twitch ne connaît pas (404), ou injoignable (502)", async () => {
    const { library } = setup();
    expect(await library.update("reward-inconnue", ["Salut"])).toEqual({
      ok: false,
      status: 404,
      issues: [{ path: "", message: "cette récompense n'existe pas sur Twitch" }],
    });
    const down = setup({}, { ok: false, status: 0, message: "Twitch ne répond pas" });
    expect(await down.library.update("reward-drink", ["Salut"])).toMatchObject({ ok: false, status: 502 });
  });

  it("ne change rien quand le disque refuse : la mémoire garde les anciennes phrases", async () => {
    const { library, state } = setup({ "reward-drink": { title: "À boire !", phrases: ["Avant"] } });
    state.isDiskFull = true;
    expect(await library.update("reward-drink", ["Après"])).toEqual({
      ok: false,
      status: 422,
      issues: [{ path: "phrases", message: "rien n'est enregistré : disque plein" }],
    });
    expect(library.get("reward-drink")).toEqual(["Avant"]);
  });
});
