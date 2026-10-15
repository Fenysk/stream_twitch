import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RewardsSettingsTab } from "./rewards-settings-tab";

// Ce que les hooks rendent, par test : les sons, les récompenses de la chaîne, l'état de la connexion à Twitch.
const state = vi.hoisted(() => ({
  sounds: null as { id: string; title: string }[] | null,
  twitchStatus: { kind: "connected", login: "fenysk", missing: [] } as {
    kind: string;
    [key: string]: unknown;
  } | null,
  rewardsError: null as string | null,
  phrases: null as { id: string; title: string }[] | null,
}));

vi.mock("./use-sounds", () => ({
  useSounds: () => ({
    sounds:
      state.sounds === null
        ? null
        : state.sounds.map(({ id, title }) => ({
            id,
            title,
            cost: 100,
            pace: 0,
            fader: 100,
            version: "1",
            hasReward: true,
            isManaged: true,
          })),
    refresh: async () => undefined,
  }),
}));

vi.mock("./use-sound-preview", () => ({
  useSoundPreview: () => ({ playingId: null, error: null, toggle: () => undefined }),
}));

vi.mock("./use-twitch", () => ({
  useTwitch: () => ({
    status: state.twitchStatus,
    error: null,
    isBusy: false,
    disconnect: async () => undefined,
  }),
}));

vi.mock("./use-reward-choices", () => ({
  useRewardChoices: () => ({
    rewards: { choices: [], missing: [] },
    error: state.rewardsError,
    isLoading: false,
    refresh: async () => undefined,
  }),
}));

vi.mock("./use-reward-phrases", () => ({
  useRewardPhrases: () => ({
    rewards:
      state.phrases === null
        ? null
        : state.phrases.map(({ id, title }) => ({
            id,
            title,
            phrases: [],
            isOnTwitch: true,
            isFoxReward: false,
          })),
    error: null,
    isLoading: false,
    refresh: async () => undefined,
    save: async () => null,
    test: async () => null,
  }),
}));

beforeEach(() => {
  state.sounds = [];
  state.twitchStatus = { kind: "connected", login: "fenysk", missing: [] };
  state.rewardsError = null;
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

  it("range ses blocs en trois cartes, sous leurs titres : Sons, Ajouter un son, Phrases de Jean-Renard", () => {
    expect(toTitles(renderToStaticMarkup(<RewardsSettingsTab />))).toEqual([
      "Sons",
      "Ajouter un son",
      "Phrases de Jean-Renard",
    ]);
  });

  it("garde « Couper le son » et « Rafraîchir » dans la carte Sons, avec l'explication des récompenses", () => {
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Sons");
    expect(card).toContain("Couper le son");
    expect(card).toContain("Rafraîchir");
    expect(card).toContain("Chaque son a sa récompense de points de chaîne");
  });

  it("garde le formulaire dans la carte Ajouter un son", () => {
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Ajouter un son");
    expect(card).toContain("sound-form");
  });

  it("dit quand il n'y a aucun son, et pendant le chargement de la liste", () => {
    expect(toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Sons")).toContain(
      "Aucun son pour l&#x27;instant.",
    );
    state.sounds = null;
    expect(toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Sons")).toContain("Chargement…");
  });

  it("liste les sons dans la carte Sons", () => {
    state.sounds = [
      { id: "rire0001", title: "Rire" },
      { id: "prout002", title: "Prout" },
    ];
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Sons");
    expect(card).toContain("Rire");
    expect(card).toContain("Prout");
    expect(card.match(/class="sound-row"/g)).toHaveLength(2);
  });

  it("renvoie à l'onglet Twitch, pas à l'onglet Renard, quand Twitch n'est pas connecté", () => {
    state.twitchStatus = { kind: "disconnected", lastError: null };
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Sons");
    expect(card).toContain("connecte-le dans l&#x27;onglet Twitch");
    expect(card).not.toContain("onglet Renard");
  });

  it("n'écrit pas de rappel de connexion quand Twitch est connecté avec tous les droits", () => {
    expect(renderToStaticMarkup(<RewardsSettingsTab />)).not.toContain("onglet Twitch");
  });

  it("dit dans la carte Phrases que les récompenses du renard se règlent dans l'onglet Renard", () => {
    const card = toCard(renderToStaticMarkup(<RewardsSettingsTab />), "Phrases de Jean-Renard");
    expect(card).toContain("dans l&#x27;onglet Renard");
    expect(card).toContain("Aucune récompense sur la chaîne.");
  });
});
