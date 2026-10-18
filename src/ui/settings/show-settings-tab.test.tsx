import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipList } from "../../domain/clip.schema";
import type { EditableSettings } from "../../domain/settings.schema";
import { ShowSettingsTab } from "./show-settings-tab";

// Ce que les hooks rendent, par test : la liste des clips, ou le refus du serveur ; les réglages (`null` : pas encore lus).
const state = vi.hoisted(() => ({
  list: null as ClipList | null,
  error: null as string | null,
  effective: null as Partial<EditableSettings> | null,
}));

vi.mock("./use-settings", () => ({
  useSettings: () => ({
    view: state.effective && {
      defaults: { threshold: -40 },
      local: {},
      effective: { threshold: -40, ...state.effective },
    },
    drafts: {},
    errors: { byKey: {}, general: [] },
    edit: () => undefined,
    choose: async () => undefined,
    change: async () => true,
    reset: async () => undefined,
  }),
}));

vi.mock("./use-clips", () => ({
  useClips: () => ({
    list: state.list,
    error: state.error,
    isWorking: false,
    refresh: async () => undefined,
    confirm: async () => null,
    discard: async () => null,
    revise: async () => null,
    withdraw: async () => null,
  }),
}));

beforeEach(() => {
  state.list = { clips: [], confirmedCount: 0, confirmed: [] };
  state.error = null;
  state.effective = null;
});

describe("l'onglet Émission", () => {
  it("porte le titre de son onglet et dit comment brancher la source OBS", () => {
    const html = renderToStaticMarkup(<ShowSettingsTab />);
    expect(html).toMatch(/<h1[^>]*>Émission<\/h1>/);
    expect(html).toContain("1920 × 1080");
    expect(html).toContain("/show");
  });

  it("dit où en est l'émission (arrêtée tant que le serveur n'a rien dit) et donne ses réglages", () => {
    const html = renderToStaticMarkup(<ShowSettingsTab />);
    expect(html).toContain("Émission arrêtée.");
    expect(html).toContain("Phrases de Jean-Renard");
  });

  it("compte les clips confirmés", () => {
    state.list = { clips: [], confirmedCount: 3, confirmed: [] };
    expect(renderToStaticMarkup(<ShowSettingsTab />)).toContain("3 clips confirmés.");
  });

  it("liste les clips bruts avec leur durée, sans lecteur tant qu'aucun n'est choisi", () => {
    state.list = {
      clips: [
        {
          name: "Replay 2026-10-15 15-09-05.mp4",
          modifiedAt: Date.UTC(2026, 9, 15, 15, 9),
          duration: 118.55,
        },
      ],
      confirmedCount: 0,
      confirmed: [],
    };
    const html = renderToStaticMarkup(<ShowSettingsTab />);
    expect(html).toContain("Replay 2026-10-15 15-09-05.mp4");
    expect(html).toContain("1:59");
    expect(html).not.toContain("<video");
  });

  it("liste les clips de l'émission avec leur titre, leur durée et leur date de validation", () => {
    state.list = {
      clips: [],
      confirmedCount: 1,
      confirmed: [
        {
          name: "Replay 2026-10-15 15-09-05.mp4",
          title: "Le saut",
          phrase: "",
          start: 10,
          end: 70,
          rawName: "Replay 2026-10-15 15-09-05.mp4",
          processedName: null,
          confirmedAt: "2026-10-16T10:24:46.845Z",
          version: "1-1",
        },
      ],
    };
    const html = renderToStaticMarkup(<ShowSettingsTab />);
    expect(html).toContain("Clips de l&#x27;émission");
    expect(html).toContain("Le saut");
    expect(html).toContain("1:00");
    expect(html).toContain("validé le");
    expect(html).not.toContain("Aucun clip validé");
  });

  it("prévoit la durée de l'émission sous le nombre de clips, d'après les clips confirmés qu'il a lus", () => {
    state.effective = { showClipCount: 1 };
    state.list = {
      clips: [],
      confirmedCount: 1,
      confirmed: [
        {
          name: "Replay 2026-10-15 15-09-05.mp4",
          title: "Le saut",
          phrase: "",
          start: 10,
          end: 130,
          rawName: "Replay 2026-10-15 15-09-05.mp4",
          processedName: null,
          confirmedAt: "2026-10-16T10:24:46.845Z",
          version: "1-1",
        },
      ],
    };
    // 12 400 d'ouverture et de clôture, 6000 de carton, 120 000 de partie gardée : 138 400 ms.
    expect(renderToStaticMarkup(<ShowSettingsTab />)).toContain("Durée estimée : 2 min");
  });

  it("ne prévoit aucune durée tant que la liste des clips n'est pas lue", () => {
    state.effective = { showClipCount: 1 };
    state.list = null;
    expect(renderToStaticMarkup(<ShowSettingsTab />)).not.toContain("Durée estimée");
  });

  it("dit qu'aucun clip n'est validé quand la liste de l'émission est vide", () => {
    expect(renderToStaticMarkup(<ShowSettingsTab />)).toContain("Aucun clip validé pour l&#x27;instant.");
  });

  it("dit qu'il n'y a aucun clip brut quand le dossier n'en a pas", () => {
    expect(renderToStaticMarkup(<ShowSettingsTab />)).toContain(
      "Aucun clip brut dans le dossier d&#x27;OBS.",
    );
  });

  it("annonce le chargement tant que le serveur n'a pas répondu", () => {
    state.list = null;
    expect(renderToStaticMarkup(<ShowSettingsTab />)).toContain("Chargement…");
  });

  it("montre le refus du serveur (dossier introuvable) tel quel, comme une alerte", () => {
    state.list = null;
    state.error = "le dossier des clips est introuvable : C:\\clips";
    const html = renderToStaticMarkup(<ShowSettingsTab />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("le dossier des clips est introuvable : C:\\clips");
  });
});
