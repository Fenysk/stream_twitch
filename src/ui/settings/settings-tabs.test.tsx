import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOX_SECTION_IDS, type FoxSectionId } from "../../domain/fox-section.schema";
import { ChatSettingsTab } from "./chat-settings-tab";
import { CutTab } from "./cut-tab";
import { FOX_SECTIONS } from "./fox-sections";
import { FoxSettingsTab } from "./fox-settings-tab";
import { HeadSettingsTab } from "./head-settings-tab";
import { LiveSettingsTab } from "./live-settings-tab";
import { TwitchSettingsTab } from "./twitch-settings-tab";

// Ce que les hooks rendent, par test : les réglages de settings.json, ce que l'utilisateur a changé, les erreurs du serveur.
const state = vi.hoisted(() => ({
  isLoaded: true,
  hasFoxSettings: true,
  local: {} as Record<string, unknown>,
  general: [] as string[],
  expressionCount: 3,
  voicesError: null as string | null,
  isMicLinked: false,
  isFoxMuted: false,
  twitchStatus: { kind: "disconnected", lastError: null } as { kind: string; [key: string]: unknown } | null,
  viewers: null as { kind: string; count?: number } | null,
  viewersError: null as string | null,
}));

vi.mock("./use-settings", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { EditableSettingsSchema } = await import("../../domain/settings.schema");
  const file: Record<string, unknown> = JSON.parse(
    readFileSync(join(process.cwd(), "settings.json"), "utf8"),
  );
  const editable = Object.entries(file).filter(([key]) => key in EditableSettingsSchema.shape);
  const saved = EditableSettingsSchema.parse(Object.fromEntries(editable));
  const answer = async () => undefined;
  return {
    useSettings: () => {
      const effective = state.hasFoxSettings ? saved : { ...saved, foxVoice: undefined };
      return {
        view: state.isLoaded ? { defaults: effective, local: state.local, effective } : null,
        drafts: {},
        errors: { byKey: {}, general: state.general },
        edit: () => undefined,
        choose: answer,
        change: async () => true,
        reset: answer,
      };
    },
  };
});

vi.mock("./use-expressions", () => ({
  useExpressions: () => ({
    expressions: Array.from({ length: state.expressionCount }, (_, rank) => ({
      id: `expression-${rank}`,
      name: `Visage ${rank}`,
      version: "1",
      isBuiltIn: rank === 0,
    })),
    refresh: async () => undefined,
  }),
}));

vi.mock("./use-mic-level", () => ({
  useMicLevel: () => ({ level: -50, isLinked: state.isMicLinked }),
}));

vi.mock("./use-viewers", () => ({
  useViewers: () => ({ viewers: state.viewers, error: state.viewersError }),
}));

vi.mock("./use-voices", () => ({
  useVoices: () => ({
    voices: [{ name: "Microsoft Claude", language: "fr-CA" }],
    error: state.voicesError,
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

vi.mock("../use-fox", () => ({
  useFox: () => ({ image: null, bodyRef: { current: null }, isMuted: state.isFoxMuted }),
}));

beforeEach(() => {
  state.isLoaded = true;
  state.hasFoxSettings = true;
  state.local = {};
  state.general = [];
  state.expressionCount = 3;
  state.voicesError = null;
  state.isMicLinked = false;
  state.isFoxMuted = false;
  state.twitchStatus = { kind: "disconnected", lastError: null };
  state.viewers = null;
  state.viewersError = null;
});

const RESET = "Revenir aux valeurs par défaut";
const toTitles = (html: string): string[] =>
  [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, title]) => title ?? "");
const toHeader = (html: string): string => html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
const toAside = (html: string): string => html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
const escapeApostrophes = (text: string): string => text.replaceAll("'", "&#x27;");

describe("l'onglet Tête South Park", () => {
  it("pose son titre en h1, un aperçu à gauche, et deux cartes : Expression, puis Micro et mouvements", () => {
    const html = renderToStaticMarkup(<HeadSettingsTab />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Tête South Park<\/h1>/);
    expect(toAside(html)).toContain("Aperçu de la tête");
    expect(toTitles(html)).toEqual(["Expression", "Micro et mouvements"]);
  });

  it("met les vignettes dans la carte Expression, le vumètre et les six curseurs dans l'autre", () => {
    const html = renderToStaticMarkup(<HeadSettingsTab />);
    const [expression = "", micAndMoves = ""] = html
      .split(/(?=<section)/)
      .filter((part) => part.startsWith("<section"));
    expect(expression).toContain("expression-thumbs");
    expect(expression).not.toContain("lp-slider");
    expect(micAndMoves).toContain("lp-meter");
    expect(micAndMoves.match(/lp-slider"/g)).toHaveLength(6);
  });

  it("n'écrit pas la carte Expression quand il n'y a qu'un visage", () => {
    state.expressionCount = 1;
    expect(toTitles(renderToStaticMarkup(<HeadSettingsTab />))).toEqual(["Micro et mouvements"]);
  });

  it("garde « Revenir aux valeurs par défaut » dans l'en-tête, éteint tant que rien n'a changé", () => {
    const html = renderToStaticMarkup(<HeadSettingsTab />);
    expect(html.match(new RegExp(RESET, "g"))).toHaveLength(1);
    expect(toHeader(html)).toMatch(
      new RegExp(`<button[^>]*disabled[^>]*>(?:(?!</button>)[\\s\\S])*${RESET}`),
    );
    expect(html.indexOf(RESET)).toBeLessThan(html.indexOf("<aside"));
  });

  it("allume « Revenir aux valeurs par défaut » dès qu'un réglage de la tête est changé", () => {
    state.local = { threshold: -30 };
    const header = toHeader(renderToStaticMarkup(<HeadSettingsTab />));
    expect(header).toContain(RESET);
    expect(header).not.toMatch(/<button[^>]*disabled/);
  });

  it("ne s'allume pas pour un réglage d'un autre onglet", () => {
    state.local = { chatOpacity: 0.5 };
    expect(toHeader(renderToStaticMarkup(<HeadSettingsTab />))).toMatch(/<button[^>]*disabled/);
  });

  it("écrit les erreurs du serveur en haut des réglages", () => {
    state.general = ["le serveur ne répond pas"];
    const html = renderToStaticMarkup(<HeadSettingsTab />);
    expect(html.indexOf("le serveur ne répond pas")).toBeGreaterThan(html.indexOf("</aside>"));
    expect(html.indexOf("le serveur ne répond pas")).toBeLessThan(html.indexOf("Expression"));
  });

  it("garde son titre pendant le chargement", () => {
    state.isLoaded = false;
    const html = renderToStaticMarkup(<HeadSettingsTab />);
    expect(html).toMatch(/<h1[^>]*>Tête South Park<\/h1>/);
    expect(html).toContain("Chargement…");
  });
});

describe("l'onglet Tchat", () => {
  it("pose son titre en h1, un aperçu à gauche, et une seule carte : Allure", () => {
    const html = renderToStaticMarkup(<ChatSettingsTab />);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Tchat<\/h1>/);
    expect(toAside(html)).toContain("Aperçu du tchat");
    expect(toTitles(html)).toEqual(["Allure"]);
  });

  it("met le style, les curseurs, l'animation et la case dans la carte Allure", () => {
    const html = renderToStaticMarkup(<ChatSettingsTab />);
    const card = html.slice(html.indexOf("<section"));
    expect(card).toContain("Style");
    expect(card.match(/lp-slider"/g)).toHaveLength(4);
    expect(card).toContain("Animation d&#x27;apparition");
    expect(card).toContain("Afficher les commandes et les bots");
  });

  it("n'a pas de « Revenir aux valeurs par défaut »", () => {
    expect(renderToStaticMarkup(<ChatSettingsTab />)).not.toContain(RESET);
  });

  it("n'emprunte plus les classes de l'onglet de la tête", () => {
    const html = renderToStaticMarkup(<ChatSettingsTab />);
    for (const name of ["head-tab-body", 'class="head-preview"', "head-controls", "settings-tab"]) {
      expect(html).not.toContain(name);
    }
  });
});

const renderFox = (sectionId: FoxSectionId = "voice") =>
  renderToStaticMarkup(<FoxSettingsTab sectionId={sectionId} onSelectSection={() => undefined} />);

describe("l'onglet Renard", () => {
  it("pose son titre en h1 et « Revenir aux valeurs par défaut » dans l'en-tête, pas en bas", () => {
    const html = renderFox();
    expect(toHeader(html)).toMatch(/<h1[^>]*>Renard<\/h1>/);
    expect(toHeader(html)).toContain(RESET);
    expect(html.match(new RegExp(RESET, "g"))).toHaveLength(1);
  });

  it("garde l'aperçu et « Faire parler » à gauche, sous l'aperçu", () => {
    const aside = toAside(renderFox());
    expect(aside).toContain("Aperçu du renard");
    expect(aside).toContain("Faire parler");
    expect(aside.indexOf("Aperçu du renard")).toBeLessThan(aside.indexOf("Faire parler"));
  });

  it("garde la colonne de gauche telle quelle d'un sous-onglet à l'autre : aperçu, « Faire parler », « Faire le bilan »", () => {
    for (const id of FOX_SECTION_IDS) {
      const aside = toAside(renderFox(id));
      expect(aside.match(/Aperçu du renard|Faire parler|Faire le bilan/g)).toHaveLength(3);
    }
  });

  it("ne montre que les cartes de son sous-onglet : la voix puis la prononciation pour Voix, sans la connexion à Twitch", () => {
    expect(toTitles(renderFox("voice"))).toEqual(["Voix", "Prononciation"]);
    expect(renderFox("voice")).not.toContain("Connexion à Twitch");
  });

  it("montre, pour chaque sous-onglet, les cartes qui lui sont rangées, dans l'ordre", () => {
    for (const id of FOX_SECTION_IDS) {
      expect(toTitles(renderFox(id))).toEqual(FOX_SECTIONS[id].cards.map(escapeApostrophes));
    }
  });

  it("range « Quand tu reviens » dans Réactions : la case cochée, la durée d'absence à 5 min, les deux listes de phrases", () => {
    const card = toCard(renderFox("reactions"), "Quand tu reviens");
    expect(card).toContain("Saluer mon retour");
    expect(card.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]).toContain('checked=""');
    expect(card).toContain(escapeApostrophes("Durée d'absence"));
    expect(card).toContain("5 min");
    expect(card).toContain("Phrases pour Fenysk");
    expect(card).toContain("Phrases pour le tchat");
    expect(card).toContain("Ah, il est de retour le boug !");
    expect(card).toContain("{absence}");
  });

  it("propose les cinq sous-onglets en haut des réglages, celui d'adresse coché", () => {
    const html = renderFox("events");
    const start = html.indexOf('class="fox-sections"');
    const tabs = html.slice(start, html.indexOf("<section", start));
    expect(tabs.match(/type="radio"/g)).toHaveLength(5);
    for (const label of ["Voix", "Corps", "Écoute", "Évènements", "Réactions"]) expect(tabs).toContain(label);
    expect(tabs.match(/checked=""/g)).toHaveLength(1);
    expect(tabs.match(/<input[^>]*value="events"[^>]*>/)?.[0]).toContain('checked=""');
  });

  it("met le choix du sous-onglet après les erreurs et avant les cartes", () => {
    state.voicesError = "aucune voix";
    state.general = ["le serveur ne répond pas"];
    const html = renderFox("body");
    expect(html.indexOf("le serveur ne répond pas")).toBeLessThan(html.indexOf("fox-sections"));
    expect(html.indexOf("fox-sections")).toBeLessThan(html.indexOf("Quand il parle"));
  });

  it("garde « Revenir aux valeurs par défaut » éteint tant que rien n'a changé, sur chaque sous-onglet", () => {
    for (const id of FOX_SECTION_IDS) expect(toHeader(renderFox(id))).toMatch(/<button[^>]*disabled/);
  });

  it("allume « Revenir aux valeurs par défaut » pour un réglage d'un autre sous-onglet : il vaut pour tout le renard", () => {
    state.local = { foxBounce: 0.05 };
    expect(toHeader(renderFox("events"))).not.toMatch(/<button[^>]*disabled/);
  });

  it("met les erreurs de voix et du serveur en haut des réglages, avant les cartes", () => {
    state.voicesError = "aucune voix";
    state.general = ["le serveur ne répond pas"];
    const html = renderFox();
    expect(html.indexOf("aucune voix")).toBeGreaterThan(html.indexOf("</aside>"));
    expect(html.indexOf("le serveur ne répond pas")).toBeLessThan(html.indexOf(">Voix<"));
  });

  it("dit que les réglages du renard manquent, sans cartes", () => {
    state.hasFoxSettings = false;
    const html = renderFox();
    expect(html).toContain("manquent dans settings.json");
    expect(toTitles(html)).toEqual([]);
    expect(html).toMatch(/<h1[^>]*>Renard<\/h1>/);
  });

  it("garde son titre pendant le chargement", () => {
    state.isLoaded = false;
    expect(renderFox()).toMatch(/<h1[^>]*>Renard<\/h1>/);
  });
});

describe("l'onglet Twitch", () => {
  it("pose son titre en h1 et la connexion dans une seule carte, sur une colonne, sans aperçu", () => {
    const html = renderToStaticMarkup(<TwitchSettingsTab />);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Twitch<\/h1>/);
    expect(toTitles(html)).toEqual(["Connexion à Twitch"]);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
  });

  it("dit où en est la connexion, et propose de se connecter", () => {
    const html = renderToStaticMarkup(<TwitchSettingsTab />);
    expect(html).toContain("Non connecté.");
    expect(html).toContain("Se connecter à Twitch");
  });

  it("n'a pas de « Revenir aux valeurs par défaut » : la connexion n'est pas un réglage", () => {
    expect(renderToStaticMarkup(<TwitchSettingsTab />)).not.toContain(RESET);
  });
});

const toCard = (html: string, title: string): string => {
  const start = html.indexOf(`>${title}</h2>`);
  const end = html.indexOf("</section>", start);
  return start === -1 ? "" : html.slice(start, end);
};

describe("l'onglet Direct", () => {
  it("pose son titre en h1, sur une seule colonne sans aperçu ni « Revenir aux valeurs par défaut »", () => {
    const html = renderToStaticMarkup(<LiveSettingsTab />);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Direct<\/h1>/);
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
    expect(html).not.toContain(RESET);
  });

  it("range quatre cartes d'état, puis l'expression de la tête, puis « Faire parler le renard »", () => {
    expect(toTitles(renderToStaticMarkup(<LiveSettingsTab />))).toEqual([
      "Micro",
      "Twitch",
      "Live",
      "Renard",
      "Expression de la tête",
      "Faire parler le renard",
    ]);
  });

  it("met les quatre états dans une grille, avant les deux cartes d'action", () => {
    const html = renderToStaticMarkup(<LiveSettingsTab />);
    const grid = html.slice(html.indexOf('class="live-states"'), html.indexOf("Expression de la tête"));
    expect(toTitles(grid)).toEqual(["Micro", "Twitch", "Live", "Renard"]);
    expect(html.indexOf('class="live-states"')).toBeLessThan(html.indexOf("Expression de la tête"));
  });

  it("montre le vumètre du micro, et dit que OBS n'est pas joint ou donne le niveau", () => {
    const card = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Micro");
    expect(card).toContain("lp-meter");
    expect(card).toContain("OBS non joint");
    state.isMicLinked = true;
    const linked = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Micro");
    expect(linked).toContain("-50.0 dB");
    expect(linked).not.toContain("OBS non joint");
  });

  it("dit où en est Twitch en une ligne, et renvoie vers l'onglet Twitch sans bouton de connexion", () => {
    const card = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Twitch");
    expect(card).toContain("Non connecté.");
    expect(card).toMatch(/<a[^>]*href="\/settings\/twitch"/);
    expect(card).not.toContain("Se connecter à Twitch");
    expect(card).not.toContain("/auth/twitch/start");
    state.twitchStatus = { kind: "connected", login: "fenysk", missing: [] };
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Twitch")).toContain(
      "Connecté en tant que fenysk.",
    );
  });

  it("dit le nombre de viewers, hors ligne, inconnu, ou chargement", () => {
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Live")).toContain("Chargement…");
    state.viewers = { kind: "live", count: 12 };
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Live")).toContain("12 viewers");
    state.viewers = { kind: "offline" };
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Live")).toContain("Hors ligne");
    state.viewers = { kind: "unknown" };
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Live")).toContain("Inconnu");
  });

  it("écrit le refus du serveur sous le nombre de viewers quand il ne répond pas", () => {
    state.viewersError = "le serveur ne répond pas";
    const card = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Live");
    expect(card).toContain("le serveur ne répond pas");
    expect(card).toContain('role="alert"');
  });

  it("dit si la source OBS du renard est ouverte, et d'où sort le son", () => {
    const closed = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Renard");
    expect(closed).toContain("Source OBS non ouverte");
    expect(closed).toContain("cette page");
    state.isFoxMuted = true;
    const open = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Renard");
    expect(open).toContain("Source OBS ouverte");
    expect(open).not.toContain("non ouverte");
  });

  it("dit chaque état par du texte, jamais par une couleur seule", () => {
    state.viewers = { kind: "live", count: 3 };
    const html = renderToStaticMarkup(<LiveSettingsTab />);
    const tones = html.match(/class="[^"]*lp-(?:success|warning)[^"]*"[^>]*>[^<]+</g) ?? [];
    expect(tones.length).toBeGreaterThan(0);
    for (const tone of tones) expect(tone.replace(/^[^>]*>/, "").trim().length).toBeGreaterThan(3);
  });

  it("choisit l'expression de la tête comme l'onglet Tête : une vignette par visage", () => {
    const card = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Expression de la tête");
    expect(card).toContain("expression-thumbs");
    expect(card.match(/class="expression-thumb[ "]/g)).toHaveLength(3);
  });

  it("n'écrit pas la carte de l'expression quand il n'y a qu'un visage", () => {
    state.expressionCount = 1;
    expect(toTitles(renderToStaticMarkup(<LiveSettingsTab />))).not.toContain("Expression de la tête");
  });

  it("met « Faire parler » et « Faire le bilan » dans leur carte, et dit quand le son sort d'OBS", () => {
    const card = toCard(renderToStaticMarkup(<LiveSettingsTab />), "Faire parler le renard");
    expect(card).toContain("Faire parler");
    expect(card).toContain("Faire le bilan");
    expect(card).not.toContain("aperçu reste muet");
    state.isFoxMuted = true;
    expect(toCard(renderToStaticMarkup(<LiveSettingsTab />), "Faire parler le renard")).toContain(
      "aperçu reste muet",
    );
  });

  it("écrit les erreurs du serveur en haut, avant les cartes", () => {
    state.general = ["le serveur ne répond pas"];
    const html = renderToStaticMarkup(<LiveSettingsTab />);
    expect(html.indexOf("le serveur ne répond pas")).toBeLessThan(html.indexOf(">Micro<"));
  });

  it("garde son titre pendant le chargement", () => {
    state.isLoaded = false;
    const html = renderToStaticMarkup(<LiveSettingsTab />);
    expect(html).toMatch(/<h1[^>]*>Direct<\/h1>/);
    expect(html).toContain("Chargement…");
  });
});

describe("l'onglet Découpe", () => {
  it("pose son titre en h1 et le contenu sur une seule colonne pleine largeur, sans aperçu", () => {
    const html = renderToStaticMarkup(<CutTab />);
    expect(toHeader(html)).toMatch(/<h1[^>]*>Découpe<\/h1>/);
    expect(html).toContain("Importer une image");
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("settings-layout");
    expect(html).not.toContain(RESET);
  });
});
