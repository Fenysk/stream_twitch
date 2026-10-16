import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EditableSettings } from "../../domain/settings.schema";
import { END_AT_CODEC, type TimeSpec } from "./head-fields";
import { SettingTime } from "./setting-time";
import type { UseSettings } from "./use-settings";

const spec: TimeSpec = {
  key: "foxEndAt",
  label: "Fin prévue",
  help: "HH:MM. Vide : pas de fin prévue.",
  codec: END_AT_CODEC,
};

const lateSpec: TimeSpec = { key: "foxLateAfter", label: "Il bâille à partir de", help: "HH:MM." };

const at = (day: number, hours: number, minutes = 0): number =>
  new Date(2026, 9, day, hours, minutes).getTime();
const iso = (when: number): string => new Date(when).toISOString();

const settings = (byKey: Partial<Record<string, string>> = {}): UseSettings => ({
  view: null,
  drafts: {},
  errors: { byKey, general: [] },
  edit: () => undefined,
  choose: async () => undefined,
  change: async () => true,
  reset: async () => undefined,
});

const render = (
  effective: Partial<EditableSettings>,
  byKey: Partial<Record<string, string>> = {},
  field: TimeSpec = spec,
): string =>
  renderToStaticMarkup(
    createElement(SettingTime, {
      spec: field,
      settings: settings(byKey),
      effective: effective as EditableSettings,
    }),
  );

describe("le champ d'une heure", () => {
  it("montre l'heure qui s'applique, sous son libellé et son aide", () => {
    const html = render({ foxEndAt: iso(at(15, 0, 30)) });
    expect(html).toContain("Fin prévue");
    expect(html).toContain('value="00:30"');
    expect(html).toContain("HH:MM. Vide : pas de fin prévue.");
    expect(html).toContain('placeholder="HH:MM"');
    expect(html).toContain('maxLength="5"');
  });

  it("montre un champ vide quand il n'y a pas de fin prévue, ou pas de réglage", () => {
    expect(render({ foxEndAt: "" })).toContain('value=""');
    expect(render({})).toContain('value=""');
  });

  it("écrit le refus du serveur sous le champ", () => {
    const html = render({ foxEndAt: "2026-10-16T13:00:00.000Z" }, { foxEndAt: "doit s'écrire HH:MM" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("doit s&#x27;écrire HH:MM");
  });

  it("n'écrit aucune alerte sans refus", () => {
    expect(render({ foxEndAt: iso(at(14, 21)) })).not.toContain('role="alert"');
  });

  it("montre telle quelle l'heure d'un réglage qui n'a pas de codec : l'heure des bâillements tardifs", () => {
    expect(render({ foxLateAfter: "23:30" }, {}, lateSpec)).toContain('value="23:30"');
  });
});

describe("END_AT_CODEC : la fin prévue dans le champ", () => {
  it("montre l'heure locale de l'instant gardé, vide sans fin", () => {
    expect(END_AT_CODEC.toShown(iso(at(14, 23)))).toBe("23:00");
    expect(END_AT_CODEC.toShown(iso(at(15, 8, 5)))).toBe("08:05");
    expect(END_AT_CODEC.toShown("")).toBe("");
  });

  it("garde la prochaine fois que l'heure tapée sonne, strictement après maintenant", () => {
    expect(END_AT_CODEC.toSaved("15:00", at(14, 14))).toBe(iso(at(14, 15)));
    expect(END_AT_CODEC.toSaved("15:00", at(14, 16))).toBe(iso(at(15, 15)));
    expect(END_AT_CODEC.toSaved("15:00", at(14, 15))).toBe(iso(at(15, 15)));
  });

  it("garde le texte vide pour effacer la fin", () => {
    expect(END_AT_CODEC.toSaved("", at(14, 14))).toBe("");
  });

  it("refuse ce qui n'est pas une heure, en le disant", () => {
    expect(END_AT_CODEC.toSaved("25:00", at(14, 14))).toBeNull();
    expect(END_AT_CODEC.toSaved("minuit", at(14, 14))).toBeNull();
    expect(END_AT_CODEC.refusal).toBe("doit s'écrire HH:MM (de 00:00 à 23:59), ou rester vide");
  });

  it("relit ce qu'il a gardé : l'heure tapée revient telle quelle dans le champ", () => {
    const saved = END_AT_CODEC.toSaved("23:40", at(14, 21));
    expect(END_AT_CODEC.toShown(saved ?? "")).toBe("23:40");
  });
});
