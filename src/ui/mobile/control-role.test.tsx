import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ControlState, IDLE_CONTROL } from "../../domain/control.schema";
import type { BannerMenu } from "./banner-menus";
import { ChatComposer } from "./chat-composer";
import { ChatViewersPanel } from "./chat-viewers-panel";
import { ControlBanner } from "./control-banner";
import { ControlChat } from "./control-chat";
import { ControlGrid } from "./control-grid";
import { ControlKeyButton } from "./control-key";
import { ControlRole } from "./control-role";
import { ControlToast } from "./control-toast";
import { MicMenu } from "./mic-menu";
import { PictureMenu } from "./picture-menu";
import { SceneMenu } from "./scene-menu";
import { StopLiveSheet } from "./stop-live-sheet";
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

describe("ControlRole", () => {
  it("montre de haut en bas le bandeau, le chat avec « Écrire », puis la grille de touches, avec le coin qui change de rôle", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    expect(html).toContain("control-role");
    const order = ["control-banner", "control-chat", "control-grid"].map((name) => html.indexOf(name));
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Changer de rôle");
  });

  it("n'a aucun champ de saisie au départ : « Écrire » est un bouton, le champ n'existe qu'ouvert", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    expect(html).toContain("Écrire");
    expect(html).not.toContain('<input type="text"');
    expect(html).not.toContain("Envoyer");
  });

  it("garde le menu des scènes et celui des micros fermés au départ, après la grille : les pastilles du bandeau les ouvrent", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    expect(html).toContain("Fermer le menu des scènes");
    expect(html).toContain("Fermer le menu des micros");
    expect(html).toContain("Fermer le menu de l&#x27;image");
    expect(html).toContain('data-open="false"');
    expect(html.indexOf("control-grid")).toBeLessThan(html.indexOf("control-drawer"));
    expect(html).not.toContain('data-open="true"');
  });

  it("dit tout sobrement avant le premier état du serveur : hors ligne, pas de viewers, OBS non joint", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    expect(html).toContain("Hors ligne");
    expect(html).toContain("OBS non joint");
    expect(html).toContain("OBS n&#x27;est pas connecté.");
  });

  it("met la vignette du retour antenne en tête du bandeau, avant « Hors ligne », avec « OBS non joint » avant le premier état", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    const banner = html.slice(html.indexOf("control-banner"), html.indexOf("control-chat"));
    expect(banner).toContain("monitor-thumbnail");
    expect(banner.indexOf("monitor-thumbnail")).toBeLessThan(banner.indexOf("Hors ligne"));
    expect(banner).toContain("Voir le retour antenne en grand");
    expect(html).toMatch(/class="monitor-thumbnail"[^>]*>(?:(?!<\/button>)[\s\S])*OBS non joint/);
  });

  it("garde la feuille du retour antenne fermée au départ, avec la vignette qui dit qu'elle l'est", () => {
    const html = renderToStaticMarkup(<ControlRole onUpdateRole={noop} />);
    expect(html).toContain("Fermer le retour antenne");
    expect(html).toMatch(/class="monitor-thumbnail"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('data-open="true"');
  });
});

describe("ControlBanner", () => {
  const banner = (view: { state: ControlState; receivedAt: number }, openMenu: BannerMenu | null = null) =>
    renderToStaticMarkup(<ControlBanner view={view} openMenu={openMenu} onOpenMenu={noop} />);

  it("Quand OBS diffuse, le système doit montrer le point rouge et « Live 1:40 », les viewers et la scène à l'antenne", () => {
    const html = banner({ state: STATE, receivedAt: START });
    expect(html).toContain("control-live-dot");
    expect(html).toContain("Live 1:40");
    expect(html).toContain(">12<");
    expect(html).toContain(">Jeu<");
  });

  it("fait avancer la durée du live depuis l'instant où l'état est arrivé", () => {
    const html = banner({ state: STATE, receivedAt: START - 5000 });
    expect(html).toContain("Live 1:45");
  });

  it("dit « Hors ligne » sans point rouge quand OBS ne diffuse pas, et un tiret quand le nombre de viewers est inconnu", () => {
    const html = banner({
      state: { ...STATE, broadcast: { isLive: false, durationMs: 0 }, viewers: { kind: "unknown" } },
      receivedAt: START,
    });
    expect(html).toContain("Hors ligne");
    expect(html).not.toContain("control-live-dot");
    expect(html).toContain(">–<");
    expect(html).toContain("Nombre de viewers inconnu");
  });

  it("fait de la scène à l'antenne un bouton qui ouvre le menu des scènes, et dit s'il est ouvert", () => {
    const closed = banner({ state: STATE, receivedAt: START });
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu/);
    expect(closed).toContain("Choisir la scène à l&#x27;antenne");
    const open = banner({ state: STATE, receivedAt: START }, "scenes");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Jeu/);
  });

  it("met à côté de la scène le micro du live, un bouton qui ouvre le menu des micros : « Micro : PC » ou « Micro : Caméra 1 »", () => {
    const withOpen = (open: string) => ({
      state: { ...STATE, mics: MICS.map((mic) => ({ ...mic, isOpen: mic.id === open })) },
      receivedAt: START,
    });
    const pc = banner(withOpen("pc"));
    expect(pc).toContain("Micro : PC");
    expect(pc).toContain("Choisir le micro du live");
    expect(pc).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Micro : PC/);
    expect(banner(withOpen("camera-1"))).toContain("Micro : Caméra 1");
    expect(banner(withOpen("camera-1"), "mics")).toMatch(
      /<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Micro : Caméra 1/,
    );
  });

  it("dit « Micro : coupé » quand aucun micro n'est ouvert, et un tiret sans OBS", () => {
    expect(banner({ state: { ...STATE, mics: MICS }, receivedAt: START })).toContain("Micro : coupé");
    expect(banner({ state: IDLE_CONTROL, receivedAt: START })).toContain("Micro : –");
  });

  it("n'ouvre qu'une feuille à la fois : les boutons des autres pastilles restent fermés", () => {
    const html = banner({ state: { ...STATE, mics: MICS }, receivedAt: START }, "mics");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
  });

  it("ajoute la pastille de l'image quand OBS a une place caméra : « Image : PC » ou « Image : Caméra 1 », un bouton qui ouvre le menu de l'image", () => {
    const pc = banner({ state: { ...STATE, picture: pictureOf("pc") }, receivedAt: START });
    expect(pc).toContain("Image : PC");
    expect(pc).toContain("Choisir qui est à l&#x27;image");
    expect(pc).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Image : PC/);
    expect(banner({ state: { ...STATE, picture: pictureOf("camera-1") }, receivedAt: START })).toContain(
      "Image : Caméra 1",
    );
    expect(banner({ state: { ...STATE, picture: pictureOf("head") }, receivedAt: START })).toContain(
      "Image : Tête",
    );
    expect(
      banner({ state: { ...STATE, picture: pictureOf("camera-1") }, receivedAt: START }, "picture"),
    ).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Image : Caméra 1/);
  });

  it("met un tiret quand aucun membre n'est à l'image, et n'a pas de pastille sans place caméra", () => {
    expect(banner({ state: { ...STATE, picture: pictureOf(null) }, receivedAt: START })).toContain(
      "Image : –",
    );
    expect(banner({ state: STATE, receivedAt: START })).not.toContain("Image :");
    expect(banner({ state: IDLE_CONTROL, receivedAt: START })).not.toContain(
      "Choisir qui est à l&#x27;image",
    );
  });

  it("garde une seule feuille ouverte avec la pastille de l'image : les autres boutons restent fermés", () => {
    const html = banner({ state: { ...STATE, picture: pictureOf("pc") }, receivedAt: START }, "picture");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(4);
  });

  it("fait du nombre de viewers un bouton qui ouvre la liste des viewers, et dit si elle est ouverte", () => {
    const closed = banner({ state: STATE, receivedAt: START });
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*12</);
    expect(closed).toContain("Viewers : voir qui est dans le tchat");
    const open = banner({ state: STATE, receivedAt: START }, "viewers");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*12</);
  });

  it("garde le tiret et la raison du nombre inconnu dans le bouton des viewers", () => {
    const html = banner({ state: { ...STATE, viewers: { kind: "offline" } }, receivedAt: START });
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*–</);
    expect(html).toContain("Live hors ligne : voir qui est dans le tchat");
  });

  it("fait du live en cours un bouton qui ouvre la confirmation de l'arrêt, et dit si elle est ouverte", () => {
    const closed = banner({ state: STATE, receivedAt: START });
    expect(closed).toMatch(/<button[^>]*aria-expanded="false"[^>]*>(?:(?!<\/button>)[\s\S])*Live 1:40/);
    expect(closed).toContain("Arrêter le live");
    const open = banner({ state: STATE, receivedAt: START }, "stop");
    expect(open).toMatch(/<button[^>]*aria-expanded="true"[^>]*>(?:(?!<\/button>)[\s\S])*Live 1:40/);
  });

  it("pose ce qui ouvre le bandeau (`lead`) avant la première pastille, et rien sans lui", () => {
    const view = { state: STATE, receivedAt: START };
    const withLead = renderToStaticMarkup(
      <ControlBanner view={view} openMenu={null} onOpenMenu={noop} lead={<i className="test-lead" />} />,
    );
    expect(withLead.indexOf("test-lead")).toBeGreaterThan(0);
    expect(withLead.indexOf("test-lead")).toBeLessThan(withLead.indexOf("Live 1:40"));
    expect(banner(view)).not.toContain("test-lead");
  });

  it("ne fait pas de « Hors ligne » un bouton : l'appli ne démarre pas le live", () => {
    const html = banner({
      state: { ...STATE, broadcast: { isLive: false, durationMs: 0 } },
      receivedAt: START,
    });
    expect(html).toContain("Hors ligne");
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Hors ligne/);
    expect(html).not.toContain("Arrêter le live");
  });
});

describe("ControlGrid", () => {
  it("ouvre la page des sons au départ : il n'y a plus de page des scènes ni des micros", () => {
    const html = renderToStaticMarkup(<ControlGrid state={STATE} onToast={noop} />);
    expect(html).toContain("Chargement…");
    expect(html).not.toContain("control-keys");
    expect(html).not.toContain("control-menu-list");
  });

  it("propose les deux pages par un contrôle segmenté : Sons, Jean-Renard", () => {
    const html = renderToStaticMarkup(<ControlGrid state={STATE} onToast={noop} />);
    expect(html).toContain("lp-segmented");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    for (const label of ["Sons", "Jean-Renard"]) expect(html).toContain(label);
    expect(html).not.toContain("Scènes");
    expect(html).not.toContain("Micros");
  });

  it("dit que la page des sons se charge tant que le serveur n'a pas rendu la liste, même sans scène dans OBS", () => {
    const html = renderToStaticMarkup(<ControlGrid state={IDLE_CONTROL} onToast={noop} />);
    expect(html).not.toContain("control-keys");
    expect(html).toContain("Chargement…");
  });
});

describe("SceneMenu", () => {
  const menu = (state: ControlState, isOpen = true) =>
    renderToStaticMarkup(<SceneMenu state={state} isOpen={isOpen} onClose={noop} onToast={noop} />);

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
    expect(offline).toContain("OBS n&#x27;est pas connecté.");
    expect(menu({ ...STATE, scenes: ["Master - Tchat"] })).toContain("Aucune scène dans OBS.");
  });

  it("se ferme par la poignée ou le voile, comme le tiroir, et dit s'il est ouvert", () => {
    const html = menu(STATE, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer le menu des scènes");
    expect(html).toContain("Scène à l&#x27;antenne");
    expect(menu(STATE)).toContain('data-open="true"');
  });
});

describe("MicMenu", () => {
  const menu = (state: ControlState, isOpen = true) =>
    renderToStaticMarkup(<MicMenu state={state} isOpen={isOpen} onClose={noop} onToast={noop} />);
  const withOpen = (open: string | null): ControlState => ({
    ...STATE,
    mics: MICS.map((mic) => ({ ...mic, isOpen: mic.id === open })),
  });

  it("ouvre une feuille avec le micro du PC et celui de chaque caméra connectée, le micro du live clair", () => {
    const html = menu(withOpen("camera-1"));
    expect(html).toContain("control-menu-list");
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*Micro du PC/);
    expect(html).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 1/);
    expect(html).toMatch(/data-state="idle"[^>]*>(?:(?!<\/button>)[\s\S])*Caméra 2/);
    expect(html.match(/data-state="active"/g)).toHaveLength(1);
  });

  it("met le micro du PC en clair quand c'est lui qui parle au live, et aucun quand tous sont coupés", () => {
    expect(menu(withOpen("pc"))).toMatch(/data-state="active"[^>]*>(?:(?!<\/button>)[\s\S])*Micro du PC/);
    expect(menu(withOpen(null)).match(/data-state="active"/g)).toBeNull();
  });

  it("grise le micro d'une caméra dont la source OBS manque, avec ce qui manque", () => {
    const html = menu({
      ...STATE,
      mics: [{ id: "camera-3", label: "Caméra 3", isOpen: false, isAvailable: false }],
    });
    expect(html).toContain("Source OBS introuvable");
    expect(html).toContain("disabled");
  });

  it("dit d'attendre le serveur tant que la régie n'a rien donné", () => {
    const html = menu(IDLE_CONTROL);
    expect(html).not.toContain("control-menu-list");
    expect(html).toContain("En attente du serveur…");
  });

  it("se ferme par la poignée ou le voile, et dit s'il est ouvert", () => {
    const html = menu(STATE, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer le menu des micros");
    expect(html).toContain("Micro du live");
    expect(menu(STATE)).toContain('data-open="true"');
  });
});

describe("PictureMenu", () => {
  const menu = (state: ControlState, isOpen = true) =>
    renderToStaticMarkup(<PictureMenu state={state} isOpen={isOpen} onClose={noop} onToast={noop} />);

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

  it("dit pourquoi la liste est vide : OBS n'est pas joint, ou n'a pas de place caméra", () => {
    const offline = menu(IDLE_CONTROL);
    expect(offline).not.toContain("control-menu-list");
    expect(offline).toContain("OBS n&#x27;est pas connecté.");
    expect(menu(STATE)).toContain("OBS n&#x27;a pas de place caméra : vérifie cameraSlotScene.");
  });

  it("se ferme par la poignée ou le voile, et dit s'il est ouvert", () => {
    const html = menu({ ...STATE, picture: pictureOf("pc") }, false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain("Fermer le menu de l&#x27;image");
    expect(html).toContain("Qui est à l&#x27;image");
    expect(menu({ ...STATE, picture: pictureOf("pc") })).toContain('data-open="true"');
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

  it("montre le refus de Twitch tel quel, en rouge, avec un bouton pour réessayer", () => {
    const html = panel({
      kind: "failed",
      message: "Reconnecte Twitch dans l'onglet Twitch : la liste demande une autorisation de plus",
    });
    expect(html).toContain(
      "Reconnecte Twitch dans l&#x27;onglet Twitch : la liste demande une autorisation de plus",
    );
    expect(html).toContain("lp-danger");
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/Rafraîchir la liste[^>]*disabled/);
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
    expect(html).toContain("lp-danger");
  });

  it("n'écrit rien sans toast, et garde ses deux régions vides", () => {
    const html = renderToStaticMarkup(<ControlToast message={null} />);
    expect(html).not.toContain("control-toast");
    expect(html.match(/role="(?:status|alert)"/g)).toHaveLength(2);
    expect(html).not.toContain("<span");
  });
});
