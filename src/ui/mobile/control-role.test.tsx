import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import type { BannerMenu } from "./banner-menus";
import { ChatComposer } from "./chat-composer";
import { ChatViewersPanel } from "./chat-viewers-panel";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlDock } from "./control-dock";
import { ControlGrid } from "./control-grid";
import { ControlKeyButton } from "./control-key";
import { ControlToast } from "./control-toast";
import { LiveSheet } from "./live-sheet";
import { MicMenu } from "./mic-menu";
import { MonitorSheet } from "./monitor-sheet";
import { PhoneScreen } from "./phone-screen";
import { StopLiveSheet } from "./stop-live-sheet";
import type { BannerMenuState } from "./use-banner-menu";
import { ViewersSheet } from "./viewers-sheet";

const noop = () => undefined;
const START = Date.parse("2026-10-19T20:00:00.000Z");

// Le micro du PC et ceux de deux caméras connectées, aucun d'ouvert : chaque test ouvre celui qu'il veut.
const MICS = [
  { id: "pc", label: "Micro du PC", isOpen: false, isAvailable: true },
  { id: "camera-1", label: "Caméra 1", isOpen: false, isAvailable: true },
  { id: "camera-2", label: "Caméra 2", isOpen: false, isAvailable: true },
];

// La place caméra d'Alexis : le PC, deux caméras (la 2 dont le téléphone ne filme pas vers OBS) et la tête, avec celui qui est à l'image.
const pictureOf = (currentId: string | null): ControlState["picture"] => ({
  members: [
    { id: "pc", label: "PC", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isAvailable: true },
    { id: "camera-2", label: "Caméra 2", isAvailable: false },
    { id: "head", label: "Tête", isAvailable: true },
  ],
  currentId,
});

const STATE: ControlState = {
  ...IDLE_CONTROL,
  isLinked: true,
  scene: "Jeu",
  scenes: ["Jeu", "Pause"],
  viewers: { kind: "live", count: 12 },
  broadcast: { isLive: true, durationMs: 100_000 },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PhoneScreen : le téléphone ne filme pas", () => {
  it("montre de haut en bas le bandeau, le chat avec « Écrire », puis la grille de sons, avec le coin qui change de rôle", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    expect(html).toContain("control-role");
    const order = ["control-banner", "control-chat", "control-grid"].map((name) => html.indexOf(name));
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Changer de rôle");
  });

  it("n'a aucun champ de saisie au départ : « Écrire » est un bouton, le champ n'existe qu'ouvert", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    expect(html).toContain("Écrire");
    expect(html).not.toContain('<input type="text"');
    expect(html).not.toContain("Envoyer");
  });

  it("garde les feuilles Antenne, Live et Micro fermées au départ, après la grille : le bandeau et la barre du bas les ouvrent", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(html).toContain("Fermer le menu des micros");
    expect(html).toContain("Fermer le live");
    expect(html).toContain('data-open="false"');
    expect(html.indexOf("control-grid")).toBeLessThan(html.indexOf("Fermer l&#x27;antenne"));
    expect(html).not.toContain('data-open="true"');
    expect(html).not.toContain("Fermer le menu des scènes");
    expect(html).not.toContain("Fermer le menu du plan");
  });

  it("dit tout sobrement avant le premier état du serveur : hors ligne, un tiret pour la scène, et « OBS non joint » nulle part (l'alerte le dit)", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    expect(html).toContain("Hors ligne");
    expect(html).not.toContain("OBS non joint");
    expect(html).not.toContain("OBS n&#x27;est pas connecté");
    expect(html).toContain("Aucune scène à choisir.");
    expect(html).toContain("<span>–</span>");
  });

  it("met la vignette de l'antenne en tête du bandeau, avant « Hors ligne », sans aucun texte dedans avant le premier état", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner).toContain("monitor-thumbnail");
    expect(banner.indexOf("monitor-thumbnail")).toBeLessThan(banner.indexOf("Hors ligne"));
    expect(banner).toContain("Voir l&#x27;antenne en grand");
    expect(html).toMatch(/class="monitor-thumbnail"[^>]*>(?:(?!<\/button>)[\s\S])*monitor-empty/);
    expect(banner).not.toMatch(/class="monitor-empty[^"]*"[^>]*>[^<]/);
  });

  it("n'a que deux éléments dans le bandeau : la vignette avec sa légende de deux lignes, et le coin qui change de rôle", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner.match(/<button/g)).toHaveLength(4);
    expect(banner.match(/banner-legend/g)).toHaveLength(1);
    expect(banner.match(/role-corner/g)).toHaveLength(1);
    for (const gone of ["control-menu-pill", "Choisir la scène", "Choisir le plan", "Plan :"]) {
      expect(banner).not.toContain(gone);
    }
    expect(banner.indexOf("monitor-thumbnail")).toBeLessThan(banner.indexOf("banner-legend"));
    expect(banner.indexOf("banner-legend")).toBeLessThan(banner.indexOf("role-corner"));
  });

  it("garde la feuille de l'antenne fermée au départ, avec la vignette qui dit qu'elle l'est", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(html).toMatch(/class="monitor-thumbnail"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('data-open="true"');
  });

  it("met sous le chat la barre du bas avec « Sons », un bouton primary que le tiroir fermé n'a pas encore ouvert", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const order = ["control-banner", "control-chat", "control-bar", "control-drawer"].map((name) =>
      html.indexOf(name),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const bar = html.slice(html.indexOf("control-bar"), html.indexOf("control-drawer"));
    expect(bar).toMatch(
      /<button[^>]*lp-btn--primary[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Sons</,
    );
  });

  it("garde la grille de sons dans le tiroir « Sons », fermé, et plus à l'écran avant lui", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const drawer = html.slice(html.indexOf('class="control-drawer"'), html.indexOf("Fermer l&#x27;antenne"));
    expect(drawer).toContain('data-open="false"');
    expect(drawer).toContain("Fermer les sons");
    for (const text of ["control-grid", "Couper le son", "Chargement…"]) {
      expect(drawer).toContain(text);
    }
    expect(drawer).not.toContain("Jean-Renard");
    expect(html.match(/class="control-grid"/g)).toHaveLength(1);
    expect(html.indexOf("control-bar")).toBeLessThan(html.indexOf("control-grid"));
  });

  it("met « Micro : – » en premier dans la barre du bas, puis « Filmer », puis « Sons », et plus de pastille micro dans le bandeau", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const bar = html.slice(html.indexOf("control-bar"), html.indexOf("control-drawer"));
    expect(bar.match(/<button/g)).toHaveLength(3);
    expect(bar.indexOf("Micro : –")).toBeGreaterThan(0);
    expect(bar.indexOf("Micro : –")).toBeLessThan(bar.indexOf("Filmer"));
    expect(bar.indexOf("Filmer")).toBeLessThan(bar.indexOf("Sons"));
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner).not.toContain("Micro");
    expect(html).not.toContain("Choisir le micro du live");
  });

  it("pose les feuilles du bandeau, l'antenne et le live compris, après le tiroir « Sons » : une feuille fixe dans l'autre serait rognée", () => {
    const html = renderToStaticMarkup(<PhoneScreen initialFilm={null} onUpdateRole={noop} />);
    const positions = [
      "Fermer les sons",
      "Fermer l&#x27;antenne",
      "Fermer le live",
      "Fermer la liste des viewers",
      "Fermer sans arrêter le live",
      "Fermer le menu des micros",
    ].map((text) => html.indexOf(text));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe("ControlBanner", () => {
  const banner = (view: { state: ControlState; receivedAt: number }, openMenu: BannerMenu | null = null) =>
    renderToStaticMarkup(<ControlBanner view={view} openMenu={openMenu} onOpenMenu={noop} />);

  it("Quand OBS diffuse, le système doit montrer le point rouge et « Live 1:40 · 12 » (la durée, puis les viewers), et la scène à l'antenne", () => {
    const html = banner({ state: STATE, receivedAt: START });
    expect(html).toContain("control-live-dot");
    expect(html).toContain("Live 1:40 · 12");
    expect(html).toContain(">Jeu<");
  });

  it("fait avancer la durée du live depuis l'instant où l'état est arrivé", () => {
    const html = banner({ state: STATE, receivedAt: START - 5000 });
    expect(html).toContain("Live 1:45 · 12");
  });

  it("dit « Hors ligne » seul, sans point rouge, quand OBS ne diffuse pas, et un tiret à la place du nombre de viewers inconnu en live", () => {
    const offline = banner({
      state: { ...STATE, broadcast: { isLive: false, durationMs: 0 }, viewers: { kind: "unknown" } },
      receivedAt: START,
    });
    expect(offline).toContain("Hors ligne");
    expect(offline).not.toContain("control-live-dot");
    expect(offline).not.toContain("Live 0:00");
    const unknown = banner({ state: { ...STATE, viewers: { kind: "unknown" } }, receivedAt: START });
    expect(unknown).toContain("Live 1:40 · –");
  });

  it("fait de la première ligne « {Scène} · {Plan} » un bouton qui ouvre la feuille Antenne, et dit si elle est ouverte", () => {
    const closed = banner({ state: STATE, receivedAt: START });
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu/);
    expect(closed).toContain("Antenne : choisir la scène et le plan");
    const open = banner({ state: STATE, receivedAt: START }, "monitor");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu/);
  });

  it("n'a plus de pastille micro : le micro est dans la barre du bas, un seul endroit pour ce geste", () => {
    const withOpen = (open: string) => ({
      state: { ...STATE, mics: MICS.map((mic) => ({ ...mic, isOpen: mic.id === open })) },
      receivedAt: START,
    });
    for (const open of ["pc", "camera-1"]) {
      const html = banner(withOpen(open));
      expect(html).not.toContain("Micro :");
      expect(html).not.toContain("Choisir le micro");
    }
    expect(banner(withOpen("camera-1"), "mics")).not.toContain('aria-expanded="true"');
    expect(banner({ state: { ...STATE, mics: MICS }, receivedAt: START })).not.toContain("Micro");
    expect(banner({ state: IDLE_CONTROL, receivedAt: START })).not.toContain("Micro");
  });

  it("n'ouvre qu'une feuille à la fois : le bouton de l'autre ligne reste fermé", () => {
    const html = banner({ state: { ...STATE, mics: MICS }, receivedAt: START }, "monitor");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  });

  it("ajoute le plan à la première ligne quand OBS a une place caméra : « Jeu · PC » ou « Jeu · Caméra 1 »", () => {
    const pc = banner({ state: { ...STATE, picture: pictureOf("pc") }, receivedAt: START });
    expect(pc).toContain("Jeu · PC");
    expect(pc).toContain("Antenne : choisir la scène et le plan");
    expect(pc).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu · PC/);
    expect(banner({ state: { ...STATE, picture: pictureOf("camera-1") }, receivedAt: START })).toContain(
      "Jeu · Caméra 1",
    );
    expect(banner({ state: { ...STATE, picture: pictureOf("head") }, receivedAt: START })).toContain(
      "Jeu · Tête",
    );
    expect(
      banner({ state: { ...STATE, picture: pictureOf("camera-1") }, receivedAt: START }, "monitor"),
    ).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu · Caméra 1/);
  });

  it("met un tiret quand aucun membre n'occupe le plan, et n'écrit que la scène sans place caméra", () => {
    expect(banner({ state: { ...STATE, picture: pictureOf(null) }, receivedAt: START })).toContain("Jeu · –");
    expect(banner({ state: STATE, receivedAt: START })).not.toContain("Jeu ·");
    expect(banner({ state: IDLE_CONTROL, receivedAt: START })).not.toContain("Choisir le plan");
  });

  it("garde une seule feuille ouverte avec le plan à la première ligne : l'autre ligne reste fermée", () => {
    const html = banner({ state: { ...STATE, picture: pictureOf("pc") }, receivedAt: START }, "monitor");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  });

  it("fait de la deuxième ligne « Live 1:40 · 12 » un bouton qui ouvre la feuille Live, et dit si elle est ouverte", () => {
    const closed = banner({ state: STATE, receivedAt: START });
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Live 1:40 · 12</);
    expect(closed).toContain("Live : fin prévue, bilan, viewers");
    const open = banner({ state: STATE, receivedAt: START }, "live");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Live 1:40 · 12</);
  });

  it("garde le tiret du nombre inconnu dans le bouton de la deuxième ligne, sans pastille des viewers à part", () => {
    const html = banner({ state: { ...STATE, viewers: { kind: "offline" } }, receivedAt: START });
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Live 1:40 · –</);
    expect(html).not.toContain("voir qui est dans le tchat");
  });

  it("ne dit plus « Arrêter le live » dans le bandeau : l'arrêt est dans la feuille Live", () => {
    const html = banner({ state: STATE, receivedAt: START });
    expect(html).not.toContain("Arrêter le live");
    expect(html).not.toContain("Arrêter");
  });

  it("pose ce qui ouvre le bandeau (`lead`) avant la légende, et rien sans lui", () => {
    const view = { state: STATE, receivedAt: START };
    const withLead = renderToStaticMarkup(
      <ControlBanner view={view} openMenu={null} onOpenMenu={noop} lead={<i className="test-lead" />} />,
    );
    expect(withLead.indexOf("test-lead")).toBeGreaterThan(0);
    expect(withLead.indexOf("test-lead")).toBeLessThan(withLead.indexOf("Live 1:40"));
    expect(banner(view)).not.toContain("test-lead");
  });

  it("fait de « Hors ligne » un bouton aussi : la fin prévue et le bilan sont dans la feuille Live, même hors live", () => {
    const html = banner({
      state: { ...STATE, broadcast: { isLive: false, durationMs: 0 } },
      receivedAt: START,
    });
    expect(html).toContain("Hors ligne");
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Hors ligne/);
    expect(html).not.toContain("Arrêter le live");
  });

  it("n'a que la légende à deux lignes, deux boutons, sans pastille ni icône de scène ou de plan, sans attribut style", () => {
    const html = banner({ state: { ...STATE, picture: pictureOf("pc") }, receivedAt: START });
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/banner-legend/g)).toHaveLength(1);
    expect(html).not.toContain("lp-pill");
    expect(html).not.toContain("lucide-clapperboard");
    expect(html).not.toContain("lucide-video");
    expect(html).not.toContain("lucide-eye");
    expect(html).not.toContain("style=");
  });

  it("n'écrit « OBS non joint » nulle part sans OBS : un tiret en première ligne, « Hors ligne » en seconde", () => {
    const html = banner({ state: IDLE_CONTROL, receivedAt: START });
    expect(html).not.toContain("OBS non joint");
    expect(html).toContain("<span>–</span>");
    expect(html).toContain("Hors ligne");
  });
});

describe("ControlDock", () => {
  const withOpen = (open: string | null): ControlState => ({
    ...STATE,
    mics: MICS.map((mic) => ({ ...mic, isOpen: mic.id === open })),
  });
  const dock = (
    openMenu: BannerMenu | null = null,
    state: ControlState = STATE,
    ownNumber: number | null = null,
  ) => {
    const menu: BannerMenuState = { openMenu, monitorUrl: null, onOpenMenu: noop, onCloseMenu: noop };
    return renderToStaticMarkup(
      <ControlDock state={state} menu={menu} ownNumber={ownNumber} onToast={noop} />,
    );
  };
  const bar = (html: string) => html.slice(html.indexOf("control-bar"), html.indexOf("control-drawer"));

  it("met la barre, puis le tiroir « Sons » avec la grille, puis les feuilles du bandeau, toutes fermées au départ", () => {
    const html = dock();
    const order = [
      "control-bar",
      "control-drawer",
      "control-grid",
      "Fermer l&#x27;antenne",
      "Fermer le live",
    ].map((text) => html.indexOf(text));
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).not.toContain('data-open="true"');
    expect(html).not.toContain("style=");
  });

  it("met « Micro : X » en premier dans la barre, avant « Sons », deux boutons seulement", () => {
    const html = bar(dock(null, withOpen("pc")));
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.indexOf("Micro : PC")).toBeGreaterThan(0);
    expect(html.indexOf("Micro : PC")).toBeLessThan(html.indexOf("Sons"));
    expect(html).not.toContain("Touches");
  });

  it("fait de « Micro : X » un bouton qui ouvre la feuille Micro, et dit si elle est ouverte", () => {
    expect(bar(dock(null, withOpen("pc")))).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Micro : PC/,
    );
    expect(bar(dock("mics", withOpen("pc")))).toMatch(
      /<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Micro : PC/,
    );
    expect(bar(dock(null, withOpen("pc")))).toContain('title="Choisir le micro"');
    const open = dock("mics", withOpen("pc"));
    expect(open.match(/data-open="true"/g)).toHaveLength(1);
    expect(open).toMatch(/data-open="true"><button[^>]*aria-label="Fermer le menu des micros"/);
  });

  it("dit le micro entendu : « Micro : Caméra 1 », ou « Micro : ce tél. » quand c'est la caméra de ce téléphone", () => {
    expect(bar(dock(null, withOpen("camera-1")))).toContain("Micro : Caméra 1");
    expect(bar(dock(null, withOpen("camera-1"), 1))).toContain("Micro : ce tél.");
    expect(bar(dock(null, withOpen("camera-1"), 2))).toContain("Micro : Caméra 1");
    expect(bar(dock(null, withOpen("pc"), 1))).toContain("Micro : PC");
  });

  it("dit « Micro : Muet » avec le micro barré quand aucun micro n'est ouvert, et un tiret sans OBS, sans micro barré", () => {
    const muted = bar(dock(null, withOpen(null)));
    expect(muted).toContain("Micro : Muet");
    expect(muted).toContain("lucide-mic-off");
    const unknown = bar(dock(null, IDLE_CONTROL));
    expect(unknown).toContain("Micro : –");
    expect(unknown).not.toContain("lucide-mic-off");
    expect(unknown).not.toContain("Muet");
  });

  it("n'a aucun bouton en variante danger dans la barre du bas : ni le micro des autres ni Muet ne sont du rouge", () => {
    for (const open of ["pc", "camera-1", null]) {
      expect(bar(dock(null, withOpen(open)))).not.toContain("lp-btn--danger");
    }
    expect(bar(dock(null, IDLE_CONTROL))).not.toContain("lp-btn--danger");
  });

  it("n'ouvre que la feuille que le menu dit ouverte, l'antenne par exemple, et jamais le tiroir des sons avec elle", () => {
    const html = dock("monitor");
    expect(html.match(/data-open="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-open="true"><button[^>]*aria-label="Fermer l&#x27;antenne"/);
    expect(html).toMatch(/class="control-drawer" data-open="false"><button[^>]*aria-label="Fermer les sons"/);
  });

  it("ouvre la feuille Live, la liste des viewers ou la confirmation de l'arrêt, une seule à la fois, selon le menu", () => {
    for (const [menu, label] of [
      ["live", "Fermer le live"],
      ["viewers", "Fermer la liste des viewers"],
      ["stop", "Fermer sans arrêter le live"],
    ] as const) {
      const html = dock(menu);
      expect(html.match(/data-open="true"/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`data-open="true"><button[^>]*aria-label="${label}"`));
    }
  });
});

describe("ControlGrid", () => {
  it("ouvre les sons au départ : il n'y a plus de page des scènes ni des micros", () => {
    const html = renderToStaticMarkup(<ControlGrid isOpen={false} onToast={noop} />);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("control-keys");
    expect(html).not.toContain("control-menu-list");
  });

  it("n'a plus d'onglets : ni contrôle segmenté, ni page Jean-Renard, la grille des sons seule", () => {
    const html = renderToStaticMarkup(<ControlGrid isOpen={false} onToast={noop} />);
    expect(html).not.toContain("lp-segmented");
    expect(html.match(/type="radio"/g)).toBeNull();
    for (const label of ["Couper le son", "Chargement…"]) expect(html).toContain(label);
    expect(html).not.toContain("Jean-Renard");
    expect(html).not.toContain("Scènes");
    expect(html).not.toContain("Micros");
  });

  it("dit que les sons se chargent tant que le serveur n'a pas rendu la liste, même sans scène dans OBS", () => {
    const html = renderToStaticMarkup(<ControlGrid isOpen={false} onToast={noop} />);
    expect(html).not.toContain("control-keys");
    expect(html).toContain("Chargement…");
  });

  it("met « Couper le son » en tête, avant les sons : un bouton neutre qui coupe le son en cours", () => {
    const html = renderToStaticMarkup(<ControlGrid isOpen={false} onToast={noop} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Couper le son/);
    expect(html.indexOf("Couper le son")).toBeLessThan(html.indexOf("Chargement…"));
    expect(html).toContain('aria-label="Sons"');
    expect(html).not.toContain("lp-btn--danger");
    expect(html).not.toContain("lp-btn--primary");
  });
});

describe("la feuille Antenne : les scènes", () => {
  const menu = (state: ControlState, isOpen = true) =>
    renderToStaticMarkup(
      <MonitorSheet url={null} state={state} isOpen={isOpen} onClose={noop} onToast={noop} />,
    );

  it("ouvre une feuille avec une touche par scène d'OBS, la scène à l'antenne claire", () => {
    const html = menu(STATE);
    expect(html).toContain("control-menu-list");
    expect(html).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu/);
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*Pause/);
  });

  it("n'a aucune scène de Master dans sa liste", () => {
    const html = menu({
      ...STATE,
      scenes: ["Jeu", "Master - Tchat", "master - Webcam", "Pause", "Master - LivePlace"],
    });
    expect(html).toContain("Jeu");
    expect(html).toContain("Pause");
    expect(html).not.toMatch(/Master/i);
    expect(html.match(/class="lp-btn control-key"/g)).toHaveLength(2);
  });

  it("dit pourquoi la liste est vide quand OBS n'est pas joint, ou qu'il n'a que des scènes de Master", () => {
    const offline = menu(IDLE_CONTROL);
    expect(offline).not.toContain("control-menu-list");
    expect(offline).toContain("Aucune scène à choisir.");
    expect(menu({ ...STATE, scenes: ["Master - Tchat"] })).toContain("Aucune scène dans OBS.");
  });

  it("se ferme par la poignée ou le voile, comme le tiroir, et dit s'il est ouvert", () => {
    const html = menu(STATE, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(html).toContain(">Scène<");
    expect(menu(STATE)).toContain('data-open="true"');
  });

  it("met les scènes sous l'image en grand, pas de scène à part : un seul endroit pour voir et choisir", () => {
    const html = menu(STATE);
    expect(html.indexOf("monitor-large")).toBeLessThan(html.indexOf(">Scène<"));
    expect(html.indexOf(">Scène<")).toBeLessThan(html.indexOf(">Jeu<"));
    expect(html).not.toContain("Fermer le menu des scènes");
  });
});

describe("MicMenu", () => {
  const menu = (state: ControlState, isOpen = true, ownNumber: number | null = null) =>
    renderToStaticMarkup(
      <MicMenu state={state} ownNumber={ownNumber} isOpen={isOpen} onClose={noop} onToast={noop} />,
    );
  const withOpen = (open: string | null): ControlState => ({
    ...STATE,
    mics: MICS.map((mic) => ({ ...mic, isOpen: mic.id === open })),
  });

  it("ouvre une feuille avec PC et chaque caméra connectée sous « Micro entendu », sans Muet dans la liste, le micro entendu clair", () => {
    const html = menu(withOpen("camera-1"));
    expect(html).toContain("control-menu-list");
    expect(html).toContain(">Micro entendu<");
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*>PC</);
    expect(html).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 1/);
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 2/);
    expect(html).not.toContain(">Muet<");
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
  });

  it("met « Couper le micro » hors de la liste, après PC et les caméras dans l'ordre", () => {
    const html = menu(withOpen("pc"));
    const labels = ["PC", "Caméra 1", "Caméra 2", "Couper le micro"].map((label) =>
      html.indexOf(`>${label}<`),
    );
    expect(labels.every((position) => position > 0)).toBe(true);
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    const listStart = html.indexOf("control-menu-list");
    const listEnd = html.indexOf("</div>", listStart);
    expect(html.slice(listStart, listEnd)).not.toContain("Couper le micro");
    expect(html.indexOf("Couper le micro")).toBeGreaterThan(listEnd);
  });

  it("met PC en clair quand c'est lui qui est entendu, et « Micro coupé » enfoncé, sans micro coché, quand tous les micros sont coupés", () => {
    expect(menu(withOpen("pc"))).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*>PC</);
    expect(menu(withOpen("pc"))).toMatch(
      /aria-pressed="false"[^>]*>(?:(?!<\/button>)[\s\S])*>Couper le micro</,
    );
    const muted = menu(withOpen(null));
    expect(muted.match(/data-state="active"/g)).toBeNull();
    expect(muted).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*>Micro coupé</);
    expect(muted).not.toContain(">Couper le micro<");
  });

  it("dessine le bouton avec le micro barré, sans rouge ni orange : couper n'est ni « les viewers t'entendent » ni une alerte", () => {
    for (const open of ["pc", null]) {
      const html = menu(withOpen(open));
      expect(html).toContain("lucide-mic-off");
      expect(html).not.toMatch(/lp-btn--danger|lp-danger|lp-warning|lp-btn--primary/);
    }
  });

  it("écrit « · ce téléphone » après la caméra du Selfie, et rien à la Régie", () => {
    expect(menu(withOpen("pc"), true, 1)).toContain("Caméra 1 · ce téléphone");
    expect(menu(withOpen("pc"), true, 1)).not.toContain("Caméra 2 · ce téléphone");
    expect(menu(withOpen("pc"))).not.toContain("ce téléphone");
  });

  it("grise le micro d'une caméra dont la source OBS manque, avec ce qui manque, mais pas « Couper le micro »", () => {
    const html = menu({
      ...STATE,
      mics: [{ id: "camera-3", label: "Caméra 3", isOpen: false, isAvailable: false }],
    });
    expect(html).toContain("Source OBS introuvable");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toMatch(/disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 3/);
    expect(html).toContain(">Couper le micro<");
  });

  it("dit d'attendre le serveur tant que la régie n'a rien donné, sans « Couper le micro » : il n'y a rien à couper", () => {
    const html = menu(IDLE_CONTROL);
    expect(html).not.toContain("control-menu-list");
    expect(html).toContain("En attente du serveur…");
    expect(html).not.toContain("Couper le micro");
  });

  it("se ferme par la poignée ou le voile, et dit s'il est ouvert", () => {
    const html = menu(STATE, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer le menu des micros");
    expect(html).toContain(">Micro<");
    expect(menu(STATE)).toContain('data-open="true"');
  });
});

describe("la feuille Antenne : le plan", () => {
  // Sans scène à l'antenne : seule la touche du plan est claire, comme dans l'ancien menu du plan.
  const menu = (state: ControlState, isOpen = true) =>
    renderToStaticMarkup(
      <MonitorSheet
        url={null}
        state={{ ...state, scene: null }}
        isOpen={isOpen}
        onClose={noop}
        onToast={noop}
      />,
    );

  it("ouvre une feuille avec les membres de la place caméra dans l'ordre PC, caméras, Tête, celui à l'image clair", () => {
    const html = menu({ ...STATE, picture: pictureOf("camera-1") });
    expect(html).toContain("control-menu-list");
    const labels = ["PC", "Caméra 1", "Caméra 2", "Tête"].map((label) => html.indexOf(`>${label}<`));
    expect(labels.every((position) => position > 0)).toBe(true);
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    expect(html).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 1/);
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*Tête/);
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
  });

  it("grise une caméra dont le téléphone ne filme pas vers OBS, avec ce qui manque, et laisse le PC et la tête touchables", () => {
    const html = menu({ ...STATE, picture: pictureOf("pc") });
    expect(html).toContain("Le téléphone ne filme pas vers OBS");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toMatch(/disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 2/);
  });

  it("ne met aucun membre en clair quand rien n'est à l'image", () => {
    expect(menu({ ...STATE, picture: pictureOf(null) }).match(/data-state="active"/g)).toBeNull();
  });

  it("dit pourquoi la liste est vide quand OBS n'est pas joint, et n'a aucune section Plan sans place caméra", () => {
    const offline = menu(IDLE_CONTROL);
    expect(offline).not.toContain("control-menu-list");
    expect(offline).toContain("Aucune scène à choisir.");
    expect(menu(STATE)).not.toContain("cameraSlotScene");
    expect(menu(STATE)).not.toContain(">Plan<");
  });

  it("se ferme par la poignée ou le voile, et dit s'il est ouvert", () => {
    const html = menu({ ...STATE, picture: pictureOf("pc") }, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(html).toContain(">Plan<");
    expect(menu({ ...STATE, picture: pictureOf("pc") })).toContain('data-open="true"');
  });

  it("met le plan après les scènes, sous l'image : on voit et on change au même endroit", () => {
    const html = renderToStaticMarkup(
      <MonitorSheet
        url={null}
        state={{ ...STATE, picture: pictureOf("pc") }}
        isOpen
        onClose={noop}
        onToast={noop}
      />,
    );
    const order = ["monitor-large", ">Scène<", ">Pause<", ">Plan<", ">Caméra 1<"].map((text) =>
      html.indexOf(text),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).not.toContain("Fermer le menu du plan");
  });
});

describe("ChatViewersPanel", () => {
  const panel = (view: Parameters<typeof ChatViewersPanel>[0]["view"]) =>
    renderToStaticMarkup(<ChatViewersPanel view={view} onRefresh={noop} />);
  const chatViewers = [
    { id: "1", nickname: "Alice" },
    { id: "2", nickname: "Bob" },
  ];

  it("met en tête le nombre de personnes listées, puis dit que les viewers non connectés à Twitch n'y sont pas", () => {
    const html = panel({ kind: "ready", chatViewers });
    expect(html).toContain("2 personnes");
    expect(html).toContain("Les viewers qui ne sont pas connectés à Twitch n&#x27;apparaissent pas");
    expect(html).toContain("le nombre du bandeau compte tout le monde");
    expect(html.indexOf("2 personnes")).toBeLessThan(html.indexOf("n&#x27;apparaissent pas"));
  });

  it("liste les pseudos dans l'ordre reçu, un par ligne, et garde un bouton pour rafraîchir", () => {
    const html = panel({ kind: "ready", chatViewers });
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html.indexOf("Alice")).toBeLessThan(html.indexOf("Bob"));
    expect(html).toContain("Rafraîchir la liste");
    expect(html).not.toMatch(/Rafraîchir la liste[^>]*disabled/);
  });

  it("écrit « 1 personne » au singulier, « 0 personne » sans personne, et le dit", () => {
    expect(panel({ kind: "ready", chatViewers: [chatViewers[0] ?? { id: "x", nickname: "x" }] })).toContain(
      "1 personne<",
    );
    const empty = panel({ kind: "ready", chatViewers: [] });
    expect(empty).toContain("0 personne<");
    expect(empty).toContain("Personne n&#x27;est connecté au tchat.");
    expect(empty).not.toContain("<li");
  });

  it("dit « Chargement… » pendant la lecture, avec le rafraîchissement grisé, sans nombre ni pseudo", () => {
    const html = panel({ kind: "loading" });
    expect(html).toContain("Chargement…");
    expect(html).toContain("disabled");
    expect(html).not.toContain("personne");
    expect(html).not.toContain("<li");
  });

  it("montre le refus de Twitch tel quel, en orange (agis), avec un bouton pour réessayer", () => {
    const html = panel({
      kind: "failed",
      message: "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus",
    });
    expect(html).toContain(
      "Reconnecte Twitch dans l&#x27;onglet Twitch : la liste demande une autorisation de plus",
    );
    expect(html).toContain("lp-warning");
    expect(html).not.toContain("lp-danger");
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/Rafraîchir la liste[^>]*disabled/);
  });
});

describe("LiveSheet", () => {
  const endAt = new Date(2026, 9, 19, 23, 40).getTime();
  const sheet = (state: ControlState = { ...STATE, endAt }, isOpen = true) =>
    renderToStaticMarkup(
      <LiveSheet
        state={state}
        isOpen={isOpen}
        onClose={noop}
        onOpenViewers={noop}
        onOpenStop={noop}
        onToast={noop}
      />,
    );

  it("est une feuille « Live » fermée au départ, avec la poignée et de quoi la fermer", () => {
    const html = sheet(STATE, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer le live");
    expect(html).toContain(">Live<");
    expect(sheet(STATE, true)).toContain('data-open="true"');
  });

  it("écrit « Fin prévue 23:40 » avec −10 min et +10 min à côté, la fin plus tôt avant la fin plus tard", () => {
    const html = sheet();
    expect(html).toContain("Fin prévue 23:40");
    const order = ["Fin prévue 23:40", ">−10 min<", ">+10 min<"].map((text) => html.indexOf(text));
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/class="lp-btn control-key"/g)).toHaveLength(3);
  });

  it("écrit « Fin prévue --:-- » sans fin, et garde les deux touches de fin", () => {
    const html = sheet(STATE);
    expect(html).toContain("Fin prévue --:--");
    expect(html).toContain(">−10 min<");
    expect(html).toContain(">+10 min<");
  });

  it("met le bilan après la fin prévue : une touche « Bilan »", () => {
    const html = sheet();
    expect(html).toContain(">Bilan<");
    expect(html.indexOf("Fin prévue")).toBeLessThan(html.indexOf(">Bilan<"));
    expect(html).not.toContain("Faire le bilan");
  });

  it("met une ligne « 12 viewers » qui ouvre la liste des présents, un bouton après le bilan", () => {
    const html = sheet();
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*12 viewers/);
    expect(html.indexOf(">Bilan<")).toBeLessThan(html.indexOf("12 viewers"));
    expect(html).toContain("Viewers : voir qui est dans le tchat");
  });

  it("garde la ligne des viewers sans nombre, avec la raison au toucher, quand le live est hors ligne ou que Twitch est muet", () => {
    const offline = sheet({ ...STATE, viewers: { kind: "offline" } });
    expect(offline).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Viewers</);
    expect(offline).toContain("Live hors ligne : voir qui est dans le tchat");
    expect(sheet({ ...STATE, viewers: { kind: "unknown" } })).toContain(
      "Nombre de viewers inconnu : voir qui est dans le tchat",
    );
  });

  it("n'a « Arrêter le live » que pendant le live, en rouge, après les viewers : le seul bouton de danger", () => {
    const html = sheet();
    expect(html.match(/lp-btn--danger/g)).toHaveLength(1);
    expect(html).toMatch(/lp-btn--danger[^>]*>(?:(?!<\/button>)[\s\S])*Arrêter le live</);
    expect(html.indexOf("12 viewers")).toBeLessThan(html.indexOf("Arrêter le live"));
  });

  it("hors live, garde la fin prévue et le bilan, mais n'a pas « Arrêter le live »", () => {
    const html = sheet({ ...STATE, endAt, broadcast: { isLive: false, durationMs: 0 } });
    expect(html).toContain("Fin prévue 23:40");
    expect(html).toContain(">Bilan<");
    expect(html).not.toContain("Arrêter le live");
    expect(html).not.toContain("lp-btn--danger");
  });

  it("n'a aucun attribut style", () => {
    expect(sheet()).not.toContain("style=");
  });
});

describe("ViewersSheet", () => {
  it("est une feuille fermée au départ, comme les menus, avec la poignée et de quoi la fermer", () => {
    const html = renderToStaticMarkup(<ViewersSheet isOpen={false} onClose={noop} />);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer la liste des viewers");
    expect(html).toContain("Viewers du tchat");
    expect(renderToStaticMarkup(<ViewersSheet isOpen onClose={noop} />)).toContain('data-open="true"');
  });
});

describe("StopLiveSheet", () => {
  const sheet = (isOpen = true) =>
    renderToStaticMarkup(<StopLiveSheet isOpen={isOpen} onClose={noop} onToast={noop} />);

  it("demande « Arrêter le live ? » avec « Arrêter » en bouton de danger et « Annuler »", () => {
    const html = sheet();
    expect(html).toContain("Arrêter le live ?");
    expect(html).toMatch(/lp-btn--danger[^>]*>(?:(?!<\/button>)[\s\S])*(?:<[^>]*>)*Arrêter</);
    expect(html).toMatch(/>Annuler</);
    expect(html.match(/lp-btn--danger/g)).toHaveLength(1);
  });

  it("dit le résultat de l'arrêt : le live s'arrête pour tous les viewers, et ne repart pas tout seul", () => {
    const html = sheet();
    expect(html).toContain("Le live s&#x27;arrête pour tous les viewers");
    expect(html).toContain("ne repart pas tout seul");
    expect(html).not.toContain("OBS arrête la diffusion");
  });

  it("se ferme par la poignée ou le voile sans rien arrêter, et dit s'il est ouvert", () => {
    const html = sheet(false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer sans arrêter le live");
    expect(sheet()).toContain('data-open="true"');
  });
});

describe("ControlKeyButton", () => {
  const item = { id: "mic:pc", label: "Micro du PC", state: "idle", isDisabled: false } as const;
  const action = { kind: "mic", id: "pc" } as const;

  it("porte son état dans data-state : active (claire) ou idle", () => {
    for (const state of ["active", "idle"] as const) {
      const html = renderToStaticMarkup(
        <ControlKeyButton item={{ ...item, state, action }} onPress={noop} />,
      );
      expect(html).toContain(`data-state="${state}"`);
    }
  });

  it("est un bouton du design system qui écrit son libellé, et sa ligne quand elle en a une", () => {
    const html = renderToStaticMarkup(
      <ControlKeyButton item={{ ...item, note: "Source OBS introuvable", action }} onPress={noop} />,
    );
    expect(html).toContain("lp-btn control-key");
    expect(html).toContain("Micro du PC");
    expect(html).toContain("Source OBS introuvable");
    expect(
      renderToStaticMarkup(<ControlKeyButton item={{ ...item, action }} onPress={noop} />),
    ).not.toContain("control-key-note");
  });

  it("grise la touche qu'on ne peut pas presser", () => {
    const html = renderToStaticMarkup(
      <ControlKeyButton item={{ ...item, isDisabled: true, action }} onPress={noop} />,
    );
    expect(html).toContain("disabled");
  });
});

describe("ChatComposer", () => {
  it("n'est qu'un bouton « Écrire » dans la boîte du chat tant qu'on ne l'a pas ouvert", () => {
    const html = renderToStaticMarkup(<ControlChat />);
    expect(html).toContain("chat-write");
    expect(html).toContain("Écrire");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("est un champ avec Envoyer et de quoi le fermer quand le bouton l'a ouvert", () => {
    const html = renderToStaticMarkup(<ChatComposer onClose={noop} />);
    expect(html).toContain("<form");
    expect(html).toContain("<input");
    expect(html).toContain("Envoyer");
    expect(html).toContain("Fermer le champ");
  });
});

describe("ControlToast", () => {
  it("montre une erreur dans une pill que le lecteur d'écran ne lit pas, et l'annonce par la région d'alerte du design system", () => {
    const html = renderToStaticMarkup(
      <ControlToast message={{ id: 1, tone: "error", text: "OBS n'est pas connecté" }} />,
    );
    expect(html).toContain("control-toast");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/role="alert"[^>]*><span[^>]*>OBS n&#x27;est pas connecté<\/span>/);
    expect(html).toContain("lp-warning");
    expect(html).not.toContain("lp-danger");
  });

  it("n'écrit rien sans toast, et garde ses deux régions vides", () => {
    const html = renderToStaticMarkup(<ControlToast message={null} />);
    expect(html).not.toContain("control-toast");
    expect(html.match(/role="(?:status|alert)"/g)).toHaveLength(2);
    expect(html).not.toContain("<span");
  });
});
