import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { toRoleFilmStart } from "../../domain/phone-layout.rules";
import type { PictureStanding } from "../../domain/picture.schema";
import { CameraSheet, StopFilmSheet } from "./camera-sheet";
import { MobilePage } from "./mobile-page";
import { PhoneScreen } from "./phone-screen";

// L'orientation du téléphone, par test : le rendu du serveur la rend toujours en paysage.
const orientation = vi.hoisted(() => ({ isPortrait: false }));

vi.mock("./use-portrait", () => ({ usePortrait: () => orientation.isPortrait }));

const noop = () => undefined;

const render = (isPortrait: boolean, initialFilm = toRoleFilmStart("control")): string => {
  orientation.isPortrait = isPortrait;
  const html = renderToStaticMarkup(<PhoneScreen initialFilm={initialFilm} onUpdateRole={noop} />);
  orientation.isPortrait = false;
  return html;
};

const bar = (html: string, from: string, to: string): string =>
  html.slice(html.indexOf(from), html.indexOf(to));

describe("PhoneScreen : le téléphone ne filme pas", () => {
  it("Quand le téléphone ne filme pas, le système doit garder la même disposition en portrait et en paysage", () => {
    expect(render(true)).toBe(render(false));
  });

  it("montre « Filmer » entre « Micro : X » et « Sons », et ni aperçu de caméra, ni pastille de caméra, ni message de rotation", () => {
    const html = render(false);
    const row = bar(html, "control-bar", "control-drawer");
    expect(row.indexOf("Micro : –")).toBeLessThan(row.indexOf("Filmer"));
    expect(row.indexOf("Filmer")).toBeLessThan(row.indexOf(">Sons<"));
    for (const absent of [
      "<video",
      "Caméra…",
      "Montrer",
      "Tourne le téléphone",
      "selfie-preview",
      "camera-role",
    ]) {
      expect(html).not.toContain(absent);
    }
    expect(html).toContain("control-role");
  });

  it("garde le coin qui change de rôle dans le bandeau, et le chat avec « Écrire »", () => {
    const html = render(true);
    expect(bar(html, "control-banner", "control-chat")).toContain("role-corner");
    expect(html).toContain("Écrire");
  });

  it("ne pose ni la feuille Caméra ni la confirmation d'arrêt : rien à arrêter", () => {
    const html = render(true);
    expect(html).not.toContain("Fermer la caméra");
    expect(html).not.toContain("Fermer sans arrêter de filmer");
  });
});

describe("PhoneScreen : le téléphone filme en portrait", () => {
  const html = render(true, toRoleFilmStart("selfie"));

  it("met l'aperçu en haut, puis le bandeau, le chat et la barre du bas, sans « Filmer » ni message de rotation", () => {
    const order = ["selfie-preview", "control-banner", "control-chat", "control-bar"].map((name) =>
      html.indexOf(name),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).not.toContain("Filmer");
    expect(html).not.toContain("Tourne le téléphone");
  });

  it("met la pastille « Caméra… » qui ouvre la feuille Caméra et l'objectif seul, en bas de l'aperçu", () => {
    const preview = bar(html, "selfie-preview", "control-banner");
    expect(preview).toContain("Caméra…");
    expect(preview).toContain('title="Caméra : numéro, arrêter de filmer"');
    expect(preview.match(/<button[^>]*title="Changer de caméra"/g)).toHaveLength(1);
    expect(preview).not.toContain("Éteindre l&#x27;écran");
    expect(preview).not.toContain("Micro :");
  });

  it("met « Montrer » (la caméra au plan) entre « Micro : X » et « Sons » dans la barre du bas", () => {
    const row = bar(html, "control-bar", "control-drawer");
    expect(row.indexOf("Micro : –")).toBeLessThan(row.indexOf("Montrer"));
    expect(row.indexOf("Montrer")).toBeLessThan(row.indexOf(">Sons<"));
  });

  it("pose la feuille Caméra et sa confirmation après le tiroir des sons, fermées", () => {
    expect(html.indexOf("Fermer les sons")).toBeLessThan(html.indexOf("Fermer la caméra"));
    expect(html.indexOf("Fermer la caméra")).toBeLessThan(html.indexOf("Fermer sans arrêter de filmer"));
    expect(html).not.toContain('data-open="true"');
  });
});

describe("PhoneScreen : le téléphone filme en paysage", () => {
  const html = render(false, toRoleFilmStart("camera"));

  it("couvre tout l'écran de l'aperçu, avec la marque de l'antenne, sans chat, sans bandeau et sans message de rotation", () => {
    expect(html).toContain("camera-role");
    expect(html).toContain('data-on-air="false"');
    expect(html).toContain("<video");
    for (const absent of ["control-chat", "control-banner", "control-bar", "Sons", "Tourne le téléphone"]) {
      expect(html).not.toContain(absent);
    }
  });

  it("met la barre [Micro : X] [Montrer] [Objectif] [Écran noir] dans cet ordre, avec la pastille de la caméra", () => {
    const row = bar(html, "camera-bar-slot", "Fermer la caméra");
    const order = ["Micro : –", "Montrer", "Changer de caméra", "Éteindre l&#x27;écran"].map((text) =>
      row.indexOf(text),
    );
    expect(order.every((position) => position > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain("Caméra…");
  });

  it("garde la feuille Micro, que le bouton ouvre, et la feuille Caméra, fermées", () => {
    expect(html).toContain("Fermer le menu des micros");
    expect(html).toContain("Fermer la caméra");
    expect(html).not.toContain('data-open="true"');
  });
});

describe("la rotation ne change que la disposition", () => {
  it("donne trois mises en page pour un téléphone qui filme : portrait, paysage, et celle de la Régie quand il ne filme pas", () => {
    const portrait = render(true, toRoleFilmStart("selfie"));
    const landscape = render(false, toRoleFilmStart("selfie"));
    expect(portrait).toContain("selfie-preview");
    expect(landscape).not.toContain("selfie-preview");
    expect(landscape).toContain("camera-role");
    expect(render(true)).toContain("control-role");
  });

  it("garde le même objectif au départ en portrait comme en paysage : celui du ?role=, pas celui de l'orientation", () => {
    expect(render(true, toRoleFilmStart("selfie"))).toContain("is-mirrored");
    expect(render(false, toRoleFilmStart("selfie"))).toContain("is-mirrored");
    expect(render(true, toRoleFilmStart("camera"))).not.toContain("is-mirrored");
    expect(render(false, toRoleFilmStart("camera"))).not.toContain("is-mirrored");
  });
});

describe("les adresses ?role= des QR codes déjà imprimés", () => {
  const open = (role: "camera" | "control" | "selfie", isPortrait: boolean): string => {
    orientation.isPortrait = isPortrait;
    const html = renderToStaticMarkup(<MobilePage urlRole={role} onLeaveUrlRole={noop} />);
    orientation.isPortrait = false;
    return html;
  };

  it("fait filmer role=camera avec la caméra arrière, sans miroir, dans l'écran unique", () => {
    const html = open("camera", false);
    expect(html).toContain("<video");
    expect(html).not.toContain("is-mirrored");
    expect(html).not.toContain("Filmer");
    expect(open("camera", true)).toContain("selfie-preview");
  });

  it("fait filmer role=selfie avec la caméra avant, en miroir pour toi", () => {
    const html = open("selfie", true);
    expect(html).toMatch(/<video[^>]*class="camera-preview is-mirrored"/);
    expect(html).toContain("selfie-preview");
  });

  it("ne fait pas filmer role=control : « Filmer » au lieu de l'aperçu, la même chose en portrait et en paysage", () => {
    const html = open("control", true);
    expect(html).toContain("Filmer");
    expect(html).not.toContain("<video");
    expect(open("control", false)).toBe(html);
  });
});

// Le bouton d'un arbre d'éléments non rendu : son `onPress`, pour le toucher sans navigateur.
const getPress = (node: ReactNode, label: string): (() => void) | undefined => {
  if (Array.isArray(node)) return node.map((child) => getPress(child, label)).find((press) => press);
  if (!isValidElement(node)) return undefined;
  const props: unknown = node.props;
  if (typeof props !== "object" || props === null) return undefined;
  if (
    "label" in props &&
    props.label === label &&
    "onPress" in props &&
    typeof props.onPress === "function"
  ) {
    const press = props.onPress;
    return () => press();
  }
  return "children" in props ? getPress(props.children as ReactNode, label) : undefined;
};

describe("CameraSheet : arrêter de filmer", () => {
  const TAKEN: PictureStanding = { hasPlace: true, isCurrent: true, shown: "Caméra 2" };
  const FREE: PictureStanding = { hasPlace: true, isCurrent: false, shown: "Tête" };

  const touch = (standing: PictureStanding, isLiveMic: boolean): string[] => {
    const calls: string[] = [];
    const sheet = CameraSheet({
      number: 2,
      isOpen: true,
      standing,
      isLiveMic,
      onClose: () => calls.push("close"),
      onUpdateNumber: async () => null,
      onAskStop: () => calls.push("ask"),
      onStopFilming: () => calls.push("stop"),
    });
    getPress(sheet, "Arrêter de filmer")?.();
    return calls;
  };

  it("Quand ce téléphone n'a ni le plan ni le micro, le système doit arrêter de filmer tout de suite, sans confirmation", () => {
    expect(touch(FREE, false)).toEqual(["stop"]);
  });

  it("Quand ce téléphone a le plan ou le micro, le système doit demander la confirmation avant d'arrêter", () => {
    expect(touch(TAKEN, false)).toEqual(["ask"]);
    expect(touch(FREE, true)).toEqual(["ask"]);
    expect(touch(TAKEN, true)).toEqual(["ask"]);
  });

  it("montre le numéro de la caméra, avec le choix du numéro, et le bouton qui arrête", () => {
    const html = renderToStaticMarkup(
      <CameraSheet
        number={2}
        isOpen
        standing={FREE}
        isLiveMic={false}
        onClose={noop}
        onUpdateNumber={async () => null}
        onAskStop={noop}
        onStopFilming={noop}
      />,
    );
    expect(html).toContain('data-open="true"');
    expect(html).toContain('aria-label="Caméra 2"');
    expect(html).toContain("Numéro de la caméra");
    expect(html).toContain("Prendre ce numéro");
    expect(html).toContain("Arrêter de filmer");
    expect(html).toContain("Fermer la caméra");
  });

  it("dit le résultat dans la confirmation, adapté à l'état réel, et propose d'annuler", () => {
    const sheet = (outcome: string | null) =>
      renderToStaticMarkup(<StopFilmSheet isOpen outcome={outcome} onClose={noop} onStopFilming={noop} />);
    expect(sheet("Le plan passe à Tête, le micro au PC.")).toContain("Le plan passe à Tête, le micro au PC.");
    expect(sheet("Le micro passe au PC.")).toContain("Le micro passe au PC.");
    const html = sheet("Le plan passe à Tête.");
    expect(html).toContain("Arrêter de filmer ?");
    expect(html).toContain("Annuler");
    expect(html).toContain("Fermer sans arrêter de filmer");
    expect(sheet(null)).not.toContain("control-confirm-text");
  });

  it("arrête de filmer au bouton de la confirmation, et rien d'autre ne l'arrête", () => {
    const calls: string[] = [];
    const sheet = StopFilmSheet({
      isOpen: true,
      outcome: "Le plan passe à Tête.",
      onClose: () => calls.push("close"),
      onStopFilming: () => calls.push("stop"),
    });
    getPress(sheet, "Annuler")?.();
    expect(calls).toEqual(["close"]);
    getPress(sheet, "Arrêter de filmer")?.();
    expect(calls).toEqual(["close", "stop"]);
  });
});
