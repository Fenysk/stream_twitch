import { describe, expect, it } from "vitest";
import { toEffectiveSettings, toNextLocal, toSettingsView } from "./settings.rules";
import type { Settings } from "./settings.schema";

const defaults: Settings = {
  obsAddress: "ws://127.0.0.1:4455",
  micName: "Mic/Aux",
  threshold: -40,
  delay: 250,
  tilt: 1,
  opening: 1.8,
  quietLevel: -25,
  loudLevel: -10,
  quietScale: 0.3,
  loudScale: 2,
  voiceEffect: 0.5,
  idleMin: 2000,
  idleMax: 5000,
  idleAngle: 6,
  idleLift: 0.005,
};

// Les défauts sans quietLevel : le threshold devient le niveau doux, et peut alors dépasser le loudLevel.
const { quietLevel: _quietLevel, ...withoutQuietLevel } = defaults;

describe("toEffectiveSettings", () => {
  it("rend les valeurs par défaut quand il n'y a rien de local", () => {
    expect(toEffectiveSettings(defaults, {})).toEqual({ ok: true, value: defaults });
  });

  it("met les valeurs locales devant les valeurs par défaut, réglage par réglage", () => {
    const result = toEffectiveSettings(defaults, { threshold: -35, tilt: 0.5 });
    expect(result).toEqual({ ok: true, value: { ...defaults, threshold: -35, tilt: 0.5 } });
  });

  it("accepte les cinq réglages de l'interface à la fois", () => {
    const result = toEffectiveSettings(defaults, {
      threshold: -30,
      tilt: 0,
      opening: 3,
      voiceEffect: 1,
      idleAngle: 15,
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.voiceEffect : undefined).toBe(1);
  });

  it("refuse un seuil qui dépasse le niveau fort, quand le niveau doux est celui du seuil", () => {
    const result = toEffectiveSettings(withoutQuietLevel, { threshold: -5 });
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          path: "loudLevel",
          message: "loudLevel doit dépasser quietLevel (ou threshold quand il n'y a pas de quietLevel)",
        },
      ],
    });
  });

  it("refuse des réglages de settings.json qui ne vont pas ensemble, comme un idleMax plus petit que idleMin", () => {
    const result = toEffectiveSettings({ ...defaults, idleMin: 4000, idleMax: 3000 }, {});
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "idleMax", message: "idleMax ne peut pas être plus petit que idleMin" }],
    });
  });

  it("refuse une valeur hors limites avec ce qui est attendu", () => {
    const result = toEffectiveSettings(defaults, { threshold: 5, voiceEffect: 2 });
    expect(result.ok).toBe(false);
    const issues = result.ok ? [] : result.issues;
    expect(issues).toContainEqual({ path: "threshold", message: "doit être d'au plus 0 dB" });
    expect(issues).toContainEqual({ path: "voiceEffect", message: "doit être d'au plus 1 (100 %)" });
  });
});

describe("toNextLocal", () => {
  it("ajoute un réglage, en gardant les autres, sans toucher à l'objet reçu", () => {
    const local = { threshold: -35 };
    const result = toNextLocal(local, { tilt: 0.5 });
    expect(result).toEqual({ ok: true, value: { threshold: -35, tilt: 0.5 } });
    expect(local).toEqual({ threshold: -35 });
  });

  it("remplace la valeur d'un réglage déjà local", () => {
    expect(toNextLocal({ threshold: -35 }, { threshold: -30 })).toEqual({
      ok: true,
      value: { threshold: -30 },
    });
  });

  it("retire un réglage quand sa valeur est null : il reprend sa valeur par défaut", () => {
    expect(toNextLocal({ threshold: -35, opening: 2 }, { threshold: null })).toEqual({
      ok: true,
      value: { opening: 2 },
    });
  });

  it("accepte l'expression active, un identifiant, et la retire avec null", () => {
    expect(toNextLocal({}, { expression: "abcd0001" })).toEqual({
      ok: true,
      value: { expression: "abcd0001" },
    });
    expect(toNextLocal({ expression: "abcd0001", tilt: 0.5 }, { expression: null })).toEqual({
      ok: true,
      value: { tilt: 0.5 },
    });
  });

  it("refuse une expression vide ou qui n'est pas un texte", () => {
    const result = toNextLocal({}, { expression: "" });
    expect(result.ok ? [] : result.issues).toContainEqual({
      path: "expression",
      message: "ne peut pas être vide",
    });
    const wrongType = toNextLocal({}, { expression: 12 });
    expect(wrongType.ok ? [] : wrongType.issues).toContainEqual({
      path: "expression",
      message: "doit être un texte",
    });
  });

  it("garde l'expression dans la vue de l'interface quand elle est choisie", () => {
    const effective = { ...defaults, expression: "abcd0001" };
    const view = toSettingsView({ defaults, local: { expression: "abcd0001" }, effective });
    expect(view.effective.expression).toBe("abcd0001");
    expect(view.defaults).not.toHaveProperty("expression");
  });

  it("accepte l'effet de la voix, de 0 % à 100 %, et un pivot à ×0", () => {
    expect(toNextLocal({}, { voiceEffect: 0 })).toEqual({ ok: true, value: { voiceEffect: 0 } });
    expect(toNextLocal({}, { voiceEffect: 1, tilt: 0 })).toEqual({
      ok: true,
      value: { voiceEffect: 1, tilt: 0 },
    });
  });

  it("refuse les réglages qui restent dans settings.json, avec un message clair", () => {
    const result = toNextLocal(
      {},
      { micName: "Audio du bureau", delay: 300, rhythm: 90, quietLevel: -30, loudLevel: -5, idleMin: 100 },
    );
    expect(result.ok).toBe(false);
    const issues = result.ok ? [] : result.issues;
    expect(issues.map(({ path }) => path).sort()).toEqual([
      "delay",
      "idleMin",
      "loudLevel",
      "micName",
      "quietLevel",
      "rhythm",
    ]);
    for (const { message } of issues) {
      expect(message).toBe("ce réglage ne se change pas ici, il reste dans settings.json");
    }
  });

  it("refuse l'adresse d'OBS et un réglage inconnu", () => {
    const result = toNextLocal({}, { obsAddress: "ws://autre:4455", foo: 1 });
    expect(result.ok).toBe(false);
    const issues = result.ok ? [] : result.issues;
    expect(issues.map(({ path }) => path).sort()).toEqual(["foo", "obsAddress"]);
    expect(issues.find(({ path }) => path === "foo")?.message).toBe("réglage inconnu");
    expect(issues.find(({ path }) => path === "obsAddress")?.message).toBe(
      "ce réglage ne se change pas ici, il reste dans settings.json",
    );
  });

  it("refuse une valeur du mauvais type ou négative", () => {
    const result = toNextLocal({}, { threshold: "fort", tilt: -1, voiceEffect: 1.5 });
    const issues = result.ok ? [] : result.issues;
    expect(issues).toContainEqual({ path: "threshold", message: "doit être un nombre" });
    expect(issues).toContainEqual({ path: "tilt", message: "ne peut pas être négatif" });
    expect(issues).toContainEqual({ path: "voiceEffect", message: "doit être d'au plus 1 (100 %)" });
  });
});

describe("toSettingsView", () => {
  it("garde les trois jeux de valeurs, avec les cinq réglages de l'interface seulement", () => {
    const view = toSettingsView({ defaults, local: { tilt: 0.5 }, effective: { ...defaults, tilt: 0.5 } });
    expect(view.local).toEqual({ tilt: 0.5 });
    expect(view.effective.tilt).toBe(0.5);
    expect(view.defaults.tilt).toBe(1);
    const editable = ["idleAngle", "opening", "threshold", "tilt", "voiceEffect"];
    expect(Object.keys(view.defaults).sort()).toEqual(editable);
    expect(Object.keys(view.effective).sort()).toEqual(editable);
  });

  it("laisse de côté ce qui n'est pas dans les valeurs par défaut, sans l'inventer", () => {
    const { voiceEffect: _effect, idleAngle: _angle, ...bare } = defaults;
    const view = toSettingsView({ defaults: bare, local: {}, effective: bare });
    expect(Object.keys(view.defaults).sort()).toEqual(["opening", "threshold", "tilt"]);
    expect(view.defaults).not.toHaveProperty("voiceEffect");
    expect(view.effective).not.toHaveProperty("idleAngle");
  });
});

describe("réglages de la tête qui parle (talkMin, talkMax, talkAngle)", () => {
  const talking: Settings = { ...defaults, talkMin: 600, talkMax: 1500, talkAngle: 3 };

  it("accepte les trois réglages de la parole ensemble, ou aucun", () => {
    expect(toEffectiveSettings(talking, {})).toEqual({ ok: true, value: talking });
    const { talkMin: _min, talkMax: _max, talkAngle: _angle, ...none } = talking;
    expect(toEffectiveSettings(none, {})).toEqual({ ok: true, value: none });
  });

  it("refuse un talkMax plus petit que talkMin", () => {
    const result = toEffectiveSettings({ ...talking, talkMin: 2000, talkMax: 1000 }, {});
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "talkMax", message: "talkMax ne peut pas être plus petit que talkMin" }],
    });
  });

  it("refuse la parole incomplète : talkAngle sans intervalle", () => {
    const { talkMin: _min, talkMax: _max, ...partial } = talking;
    const result = toEffectiveSettings(partial, {});
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues).toEqual([
      { path: "", message: "talkMin, talkMax et talkAngle vont ensemble : tous les trois ou aucun" },
    ]);
  });

  it("laisse l'interface changer talkAngle, et refuse un angle négatif", () => {
    const next = toNextLocal({}, { talkAngle: 7 });
    expect(next).toEqual({ ok: true, value: { talkAngle: 7 } });
    const refused = toNextLocal({}, { talkAngle: -1 });
    expect(refused.ok ? [] : refused.issues).toContainEqual({
      path: "talkAngle",
      message: "ne peut pas être négatif",
    });
  });

  it("garde l'intervalle de la parole dans settings.json : l'interface ne le change pas", () => {
    const result = toNextLocal({}, { talkMin: 100, talkMax: 200 });
    const issues = result.ok ? [] : result.issues;
    expect(issues.map(({ path }) => path).sort()).toEqual(["talkMax", "talkMin"]);
  });

  it("montre talkAngle à l'interface avec ses autres réglages", () => {
    const view = toSettingsView({ defaults: talking, local: {}, effective: talking });
    expect(view.effective.talkAngle).toBe(3);
    expect(view.effective).not.toHaveProperty("talkMin");
  });
});
