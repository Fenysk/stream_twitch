import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RewardSummary } from "../../domain/reward.schema";
import { RewardsSettingsTab } from "./rewards-settings-tab";

// Ce que les hooks rendent, par test : les récompenses de la chaîne, les sounds, les phrases, l'état de la connexion à Twitch.
const state = vi.hoisted(() => ({
  rewards: null as RewardSummary[] | null,
  sounds: [] as { id: string; title: string }[] | null,
  twitchStatus: { kind: "connected", login: "fenysk", missing: [] } as {
    kind: string;
    [key: string]: unknown;
  } | null,
  rewardsError: null as string | null,
  isLoading: false,
  phrases: [] as { id: string; title: string; isMissing: boolean }[] | null,
}));

vi.mock("./use-sounds", () => ({
  useSounds: () => ({
    sounds:
      state.sounds === null
        ? null
        : state.sounds.map(({ id, title }) => ({
            id,
            title,
            fader: 100,
            version: "1",
            rewardTitles: [],
            clipCount: 0,
          })),
    refresh: async () => undefined,
  }),
}));

vi.mock("./use-twitch", () => ({
  useTwitch: () => ({
    status: state.twitchStatus,
    error: null,
    isBusy: false,
    disconnect: async () => undefined,
  }),
}));

vi.mock("./use-rewards", () => ({
  useRewards: () => ({
    rewards: state.rewards,
    error: state.rewardsError,
    isLoading: state.isLoading,
    refresh: async () => undefined,
    createReward: async () => null,
    updateReward: async () => null,
    deleteReward: async () => null,
    updateRewardSound: async () => null,
  }),
}));

vi.mock("./use-reward-phrases", () => ({
  useRewardPhrases: () => ({
    rewards:
      state.phrases === null
        ? null
        : state.phrases.map(({ id, title, isMissing }) => ({
            id,
            title,
            isMissing,
            isReserved: false,
            phrases: [],
          })),
    error: null,
    isLoading: false,
    refresh: async () => undefined,
    save: async () => null,
    test: async () => null,
  }),
}));

const reward = (id: string, title: string, overrides: Partial<RewardSummary> = {}): RewardSummary => ({
  id,
  title,
  cost: 100,
  pace: 30,
  isManaged: true,
  isMissing: false,
  sound: null,
  ...overrides,
});

beforeEach(() => {
  state.rewards = [];
  state.sounds = [];
  state.twitchStatus = { kind: "connected", login: "fenysk", missing: [] };
  state.rewardsError = null;
  state.isLoading = false;
  state.phrases = [];
});

const toTitles = (html: string): string[] =>
  [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, title]) => title ?? "");
const toHeader = (html: string): string => html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
const toCard = (html: string, title: string): string => {
  const start = html.indexOf(`>${title}</h2>`);
  return start === -1 ? "" : html.slice(start, html.indexOf("</section>", start));
};

describe("l'onglet Points de chaîne", () => {
  it("pose son titre en h1, sur une seule colonne sans aperçu", () => {
    const html = renderToStaticMarkup(<RewardsSettingsTab />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Points de chaîne<\/h1>/);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
    expect(html).not.toContain("settings-tab");
  });

  it("range ses blocs en deux cartes, sous leurs titres : Récompenses, Créer une récompense", () => {
    expect(toTitles(renderToStaticMarkup(<RewardsSettingsTab />))).toEqual([
      "Récompenses",
      "Créer une récompense",
    ]);
  });

  it("garde « Rafraîchir » et l'explication dans la carte Récompenses, sans « Couper le son »", () => {
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("Rafraîchir");
    expect(card).toContain("Chaque récompense joue le son que tu lui choisis");
    expect(card).toContain("devient le nickname du viewer");
    expect(card).not.toContain("Couper le son");
  });

  it("n'a plus aucune carte de sounds : ni liste de sounds, ni formulaire d'ajout, ni « Pas sur Twitch »", () => {
    state.rewards = [reward("mien", "Rire", { sound: "rire0001" })];
    state.sounds = [{ id: "rire0001", title: "Rire" }];
    const html = renderToStaticMarkup(<RewardsSettingsTab />);
    expect(html).not.toContain("Ajouter un son");
    expect(html).not.toContain("Jouer dans OBS");
    expect(html).not.toContain("Pas sur Twitch");
    expect(html).not.toContain("Choisir un fichier audio");
  });

  it("dit quand Twitch n'a aucune récompense, et pendant le chargement", () => {
    expect(toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses")).toContain(
      "Aucune récompense sur la chaîne.",
    );
    state.rewards = null;
    state.isLoading = true;
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("Chargement…");
    expect(card).not.toContain("Aucune récompense");
  });

  it("liste une ligne par récompense : son titre, son coût et son cooldown, qui l'a créée, et le menu de son sound", () => {
    state.rewards = [
      reward("mien", "Rire", { sound: "rire0001" }),
      reward("clash", "Clasher Fenysk", { isManaged: false, cost: 500, pace: 0 }),
    ];
    state.sounds = [{ id: "rire0001", title: "Rire" }];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card.match(/class="sound-row"/g)).toHaveLength(2);
    expect(card).toContain("Créée par l&#x27;application");
    expect(card).toContain("Faite sur Twitch");
    expect(card).toContain("100 points · cooldown 30 s");
    expect(card).toContain("500 points · sans cooldown");
    expect(card).toContain('<option value="">Aucun</option>');
    expect(card).toContain('<option value="rire0001" selected="">Rire</option>');
  });

  it("dit pour chaque récompense ce qui arrive aux points si le son ne joue pas", () => {
    state.rewards = [reward("mien", "Rire"), reward("clash", "Clasher Fenysk", { isManaged: false })];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("Points rendus si le son ne joue pas");
    expect(card).toContain("Se règle sur Twitch. Points non rendus si le son ne joue pas.");
  });

  it("ne propose Modifier et Supprimer que pour les récompenses que l'application a créées", () => {
    state.rewards = [reward("clash", "Clasher Fenysk", { isManaged: false })];
    const fromTwitch = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(fromTwitch).not.toContain('title="Modifier"');
    expect(fromTwitch).not.toContain('title="Supprimer"');
    state.rewards = [reward("mien", "Rire")];
    const own = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(own).toContain('title="Modifier"');
    expect(own).toContain('title="Supprimer"');
  });

  it("montre à la fin la récompense que Twitch ne connaît plus, badgée, sans coût, avec son menu", () => {
    state.rewards = [
      reward("vivant", "Vivante"),
      reward("perdu", "Disparue", { isMissing: true, isManaged: false, cost: 0, pace: 0, sound: "rire0001" }),
    ];
    state.sounds = [{ id: "rire0001", title: "Rire" }];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card.indexOf("Disparue")).toBeGreaterThan(card.indexOf("Vivante"));
    expect(card).toContain("N&#x27;existe plus sur Twitch");
    expect(card).not.toMatch(/(?<!\d)0 points/);
    expect(card).toContain('<option value="rire0001" selected="">Rire</option>');
  });

  it("garde les phrases d'une récompense disparue de Twitch qui n'a plus d'enregistrement : sa ligne reste", () => {
    state.phrases = [{ id: "ancienne", title: "Hydrate-toi", isMissing: true }];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("Hydrate-toi");
    expect(card).toContain("N&#x27;existe plus sur Twitch");
    expect(card).toContain("Phrases de Jean-Renard");
  });

  it("dit pourquoi la liste manque quand Twitch ne l'a pas donnée, sans rien lister", () => {
    state.rewards = null;
    state.rewardsError = "la connexion à Twitch n'est pas prête";
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("la connexion à Twitch n&#x27;est pas prête");
    expect(card).not.toContain("<ul");
  });

  it("renvoie à l'onglet Twitch, pas à l'onglet Renard, quand Twitch n'est pas connecté", () => {
    state.twitchStatus = { kind: "disconnected", lastError: null };
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("connecte-le dans l&#x27;onglet Twitch");
    expect(card).not.toContain("onglet Renard</p>");
  });

  it("n'écrit pas de rappel de connexion quand Twitch est connecté avec tous les droits", () => {
    expect(renderToStaticMarkup(<RewardsSettingsTab />)).not.toContain("connecte-le dans");
  });

  it("dit que les récompenses du renard se règlent dans l'onglet Renard", () => {
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Récompenses");
    expect(card).toContain("dans l&#x27;onglet Renard");
  });

  it("propose, pour créer une récompense, un titre, un coût de 100 points, un cooldown de 30 s et un sound facultatif", () => {
    state.sounds = [{ id: "rire0001", title: "Rire" }];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Créer une récompense");
    expect(card).toContain("Titre de la récompense");
    expect(card).toContain('value="100"');
    expect(card).toContain('value="30"');
    expect(card).toContain('<option value="" selected="">Aucun</option>');
    expect(card).toContain('<option value="rire0001">Rire</option>');
    expect(card).toContain("Créer la récompense");
  });
});
