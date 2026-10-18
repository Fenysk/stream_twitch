import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundSummary } from "../../domain/sound.schema";
import { SoundsSettingsTab } from "./sounds-settings-tab";

// Ce que les hooks rendent, par test : les sounds du serveur.
const state = vi.hoisted(() => ({ sounds: null as SoundSummary[] | null }));

vi.mock("./use-sounds", () => ({
  useSounds: () => ({ sounds: state.sounds, refresh: async () => undefined }),
}));

vi.mock("./use-sound-preview", () => ({
  useSoundPreview: () => ({ playingId: null, error: null, toggle: () => undefined }),
}));

const sound = (id: string, title: string, overrides: Partial<SoundSummary> = {}): SoundSummary => ({
  id,
  title,
  fader: 80,
  version: "1",
  rewardTitles: [],
  clipCount: 0,
  ...overrides,
});

beforeEach(() => {
  state.sounds = [];
});

const toTitles = (html: string): string[] =>
  [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, title]) => title ?? "");
const toHeader = (html: string): string => html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
const toCard = (html: string, title: string): string => {
  const start = html.indexOf(`>${title}</h2>`);
  return start === -1 ? "" : html.slice(start, html.indexOf("</section>", start));
};

describe("l'onglet Sons", () => {
  it("pose son titre en h1, sur une seule colonne sans aperçu", () => {
    const html = renderToStaticMarkup(<SoundsSettingsTab />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Sons<\/h1>/);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
  });

  it("range ses blocs en deux cartes, sous leurs titres : Sons, Ajouter un son", () => {
    expect(toTitles(renderToStaticMarkup(<SoundsSettingsTab />))).toEqual(["Sons", "Ajouter un son"]);
  });

  it("garde « Couper le son » dans la carte Sons, avec la source navigateur OBS /sounds", () => {
    const card = toCard(renderToStaticMarkup(<SoundsSettingsTab />), "Sons");
    expect(card).toContain("Couper le son");
    expect(card).toContain("/sounds");
    expect(card).toContain("Contrôler l&#x27;audio via OBS");
  });

  it("ne parle de récompense nulle part hors de la liste : ni explication, ni formulaire, ni « Pas sur Twitch »", () => {
    const html = renderToStaticMarkup(<SoundsSettingsTab />);
    expect(html).not.toContain("écompense");
    expect(html).not.toContain("Twitch");
    expect(html).not.toContain("Rafraîchir");
    expect(html).not.toContain("cooldown");
  });

  it("dit quand il n'y a aucun sound, et pendant le chargement de la liste", () => {
    expect(toCard(renderToStaticMarkup(<SoundsSettingsTab />), "Sons")).toContain(
      "Aucun son pour l&#x27;instant.",
    );
    state.sounds = null;
    expect(toCard(renderToStaticMarkup(<SoundsSettingsTab />), "Sons")).toContain("Chargement…");
  });

  it("liste les sounds dans la carte Sons, chacun avec son volume et qui l'utilise", () => {
    state.sounds = [
      sound("prout002", "Prout.", { rewardTitles: ["Prout."], clipCount: 3 }),
      sound("rire0001", "Rire"),
    ];
    const card = toCard(renderToStaticMarkup(<SoundsSettingsTab />), "Sons");
    expect(card).toContain("Prout.");
    expect(card).toContain("Rire");
    expect(card.match(/class="sound-row"/g)).toHaveLength(2);
    expect(card).toContain("volume 80 %");
    expect(card).toContain("Joué par « Prout. »");
    expect(card).toContain("Rires de 3 clips");
    expect(card).toContain("Pas utilisé");
  });

  it("garde le formulaire dans la carte Ajouter un son : fichier, titre, volume, sans coût ni cooldown", () => {
    const card = toCard(renderToStaticMarkup(<SoundsSettingsTab />), "Ajouter un son");
    expect(card).toContain("sound-form");
    expect(card).toContain("Choisir un fichier audio");
    expect(card).toContain("Titre du son");
    expect(card).toContain("Volume");
    expect(card).not.toContain("Coût");
    expect(card).not.toContain("Cooldown");
    expect(card).toContain("Ajouter le son");
  });
});
