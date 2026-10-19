import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileState } from "../../domain/phone.schema";
import { MobileSettingsTab } from "./mobile-settings-tab";

const ORIGIN = "https://pcmasterrace.tail2d6b0a.ts.net";

// Ce que le hook rend, par test : l'état envoyé par le serveur (`null` : il n'a pas encore répondu).
const state = vi.hoisted(() => ({ mobile: null as MobileState | null }));

vi.mock("./use-mobile-state", () => ({ useMobileState: () => state.mobile }));

beforeEach(() => {
  // L'onglet lit le port de l'adresse où il est ouvert : le serveur d'essai de ces tests est sur 4748.
  vi.stubGlobal("window", { location: { port: "4748" } });
  state.mobile = { origin: ORIGIN, phones: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Le HTML rendu écrit l'apostrophe en entité : les attentes la lisent comme dans le texte.
const render = (): string => renderToStaticMarkup(<MobileSettingsTab />).replaceAll("&#x27;", "'");
const toTitles = (html: string): string[] =>
  [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(([, title]) => title ?? "");
const toCard = (html: string, title: string): string => {
  const start = html.indexOf(`>${title}</h2>`);
  return start === -1 ? "" : html.slice(start, html.indexOf("</section>", start));
};

describe("l'onglet Mobile", () => {
  it("dit « Chargement… » tant que le serveur n'a pas répondu", () => {
    state.mobile = null;
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Mobile<\/h1>/);
    expect(html).toContain("Chargement…");
  });

  it("range ses blocs en trois cartes : les QR codes, les sources OBS, les téléphones connectés", () => {
    expect(toTitles(render())).toEqual([
      "Ouvrir sur le téléphone",
      "Sources navigateur d'OBS",
      "Téléphones connectés",
    ]);
  });

  it("montre un QR code par rôle, avec l'adresse que le téléphone ouvrira", () => {
    const card = toCard(render(), "Ouvrir sur le téléphone");
    expect(card.match(/<img/g)).toHaveLength(3);
    for (const [role, label] of [
      ["camera", "Caméra"],
      ["control", "Régie"],
      ["selfie", "Selfie"],
    ]) {
      expect(card).toContain(`alt="QR code du rôle ${label}"`);
      expect(card).toContain(`${ORIGIN}/mobile?role=${role}`);
    }
    expect(card).toContain("data:image/svg+xml");
  });

  it("Si mobileOrigin n'est pas réglé, alors l'onglet doit dire où l'écrire au lieu de montrer des QR codes", () => {
    state.mobile = { origin: null, phones: [] };
    const card = toCard(render(), "Ouvrir sur le téléphone");
    expect(card).toContain("mobileOrigin");
    expect(card).toContain("settings.json");
    expect(card).not.toContain("<img");
  });

  it("donne l'adresse de la prochaine caméra libre quand aucun téléphone n'est connecté, avec son bouton Copier", () => {
    const card = toCard(render(), "Sources navigateur d'OBS");
    expect(card).toContain("http://camera-1.localhost:4748/camera/1");
    expect(card).toContain("Prochaine libre");
    expect(card.match(/<span>Copier<\/span>/g)).toHaveLength(1);
    expect(card).toContain("1920");
    expect(card).toContain("Contrôler l'audio via OBS");
  });

  it("donne l'adresse de chaque caméra connectée, puis celle de la prochaine libre", () => {
    state.mobile = {
      origin: ORIGIN,
      phones: [
        { id: "phone-aaaa-0001", role: "camera", number: 1, hasScreen: true, isReceiving: true },
        { id: "phone-bbbb-0002", role: "selfie", number: 2, hasScreen: false, isReceiving: false },
        { id: "phone-cccc-0003", role: "control", number: null, hasScreen: false, isReceiving: false },
      ],
    };
    const card = toCard(render(), "Sources navigateur d'OBS");
    const addresses = [...card.matchAll(/http:\/\/camera-\d+\.localhost:4748\/camera\/\d+/g)].map(
      ([text]) => text,
    );
    expect(addresses).toEqual([
      "http://camera-1.localhost:4748/camera/1",
      "http://camera-2.localhost:4748/camera/2",
      "http://camera-3.localhost:4748/camera/3",
    ]);
    expect(card.match(/Prochaine libre/g)).toHaveLength(1);
    expect(card.match(/<span>Copier<\/span>/g)).toHaveLength(3);
  });

  it("dit qu'aucun téléphone n'est connecté", () => {
    expect(toCard(render(), "Téléphones connectés")).toContain("Aucun téléphone connecté.");
  });

  it("liste chaque téléphone connecté avec son rôle, son numéro et l'état de sa source OBS", () => {
    state.mobile = {
      origin: ORIGIN,
      phones: [
        { id: "phone-aaaa-0001", role: "camera", number: 1, hasScreen: true, isReceiving: true },
        { id: "phone-bbbb-0002", role: "selfie", number: 2, hasScreen: false, isReceiving: false },
        { id: "phone-cccc-0003", role: "control", number: null, hasScreen: false, isReceiving: false },
      ],
    };
    const card = toCard(render(), "Téléphones connectés");
    expect(card.match(/<li/g)).toHaveLength(3);
    expect(card).toContain("Caméra 1");
    expect(card).toContain("Caméra · téléphone phon");
    expect(card).toContain("Source OBS connectée");
    expect(card).toContain("Caméra 2");
    expect(card).toContain("Selfie · téléphone phon");
    expect(card).toContain("Pas de source OBS");
    expect(card).toContain("Régie");
    expect(card.match(/Source OBS connectée|Pas de source OBS/g)).toHaveLength(2);
  });
});
