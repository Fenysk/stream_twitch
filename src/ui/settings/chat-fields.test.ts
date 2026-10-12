import { describe, expect, it } from "vitest";
import { CHAT_ANIMATIONS, CHAT_STYLES } from "../../domain/chat.schema";
import { DEFAULT_CHAT_LOOK } from "../../domain/chat-settings.rules";
import { ANIMATION_CHOICES, CHAT_SLIDERS, STYLE_CHOICES } from "./chat-fields";
import { type SliderSpec, toNearestStep } from "./head-fields";
import { toChanges, toFieldErrors } from "./settings-changes";

const spec = (key: string): SliderSpec => {
  const found = CHAT_SLIDERS.find((slider) => slider.key === key);
  if (!found) throw new Error(`curseur absent : ${key}`);
  return found;
};

const labelsOf = (key: string): string[] => spec(key).steps.map(({ label }) => label);

describe("les curseurs de l'onglet Tchat", () => {
  it("sont quatre, dans l'ordre : opacité du fond, taille du texte, durée d'affichage, messages à l'écran", () => {
    expect(CHAT_SLIDERS.map(({ label }) => label)).toEqual([
      "Opacité du fond",
      "Taille du texte",
      "Durée d'affichage",
      "Messages à l'écran",
    ]);
    expect(CHAT_SLIDERS.map(({ key }) => key)).toEqual([
      "chatOpacity",
      "chatTextSize",
      "chatDuration",
      "chatMaxMessages",
    ]);
  });

  it("règlent l'opacité de 0 à 100 % par pas de 5, en pourcentage entier", () => {
    expect(spec("chatOpacity").steps).toHaveLength(21);
    expect(labelsOf("chatOpacity").slice(0, 3)).toEqual(["0 %", "5 %", "10 %"]);
    expect(labelsOf("chatOpacity").at(-1)).toBe("100 %");
    expect(spec("chatOpacity").steps.at(-1)?.value).toBe(100);
  });

  it("règlent la durée de 10 s à 2 min, puis « Toujours », qui vaut 0", () => {
    expect(labelsOf("chatDuration")).toEqual([
      "10 s",
      "15 s",
      "20 s",
      "30 s",
      "45 s",
      "1 min",
      "1 min 30 s",
      "2 min",
      "Toujours",
    ]);
    expect(spec("chatDuration").steps.at(-1)?.value).toBe(0);
    expect(toNearestStep(spec("chatDuration"), 0)).toBe(0);
    expect(toNearestStep(spec("chatDuration"), 100)).toBe(90);
  });

  it("règlent la taille du texte et le nombre de messages", () => {
    expect(labelsOf("chatTextSize").at(0)).toBe("12 px");
    expect(labelsOf("chatTextSize").at(-1)).toBe("40 px");
    expect(labelsOf("chatMaxMessages").at(0)).toBe("3");
    expect(labelsOf("chatMaxMessages").at(-1)).toBe("20");
  });

  it("démarrent sur l'allure par défaut du tchat quand le réglage n'a pas de valeur", () => {
    expect(toNearestStep(spec("chatOpacity"), undefined)).toBe(DEFAULT_CHAT_LOOK.opacity);
    expect(toNearestStep(spec("chatTextSize"), undefined)).toBe(DEFAULT_CHAT_LOOK.textSize);
    expect(toNearestStep(spec("chatDuration"), undefined)).toBe(DEFAULT_CHAT_LOOK.duration);
    expect(toNearestStep(spec("chatMaxMessages"), undefined)).toBe(DEFAULT_CHAT_LOOK.maxMessages);
  });

  it("ont une aide courte, de sept mots au plus", () => {
    for (const { help } of CHAT_SLIDERS) {
      expect(help.length).toBeGreaterThan(0);
      expect(help.split(/\s+/).length).toBeLessThanOrEqual(7);
    }
  });
});

describe("les choix de l'onglet Tchat", () => {
  it("proposent chaque style et chaque animation du domaine, une fois", () => {
    expect(STYLE_CHOICES.map(({ value }) => value)).toEqual([...CHAT_STYLES]);
    expect(ANIMATION_CHOICES.map(({ value }) => value)).toEqual([...CHAT_ANIMATIONS]);
  });
});

describe("les curseurs du tchat avec l'envoi des réglages", () => {
  it("envoient un curseur du tchat comme ceux de la tête, et le disent avec son libellé en cas de refus", () => {
    expect(toChanges({ chatOpacity: 50 }, {}, { threshold: -40 })).toEqual({ chatOpacity: 50 });
    expect(
      toFieldErrors([{ path: "chatOpacity", message: "chatOpacity trop grand" }]).byKey.chatOpacity,
    ).toBe("« Opacité du fond » trop grand");
  });
});
