import { describe, expect, it } from "vitest";
import type { SpeakResult } from "./fox.usecase";
import { createShowVoice } from "./show.usecase";

const OPENING = ["Bienvenue.", "Rebonjour."];
const CLOSING = ["Adieu.", "À jamais."];

const setup = (
  said: SpeakResult = { ok: true, url: "/api/fox/speech/1", durationMs: 2500 },
  lists: { showOpeningPhrases?: string[]; showClosingPhrases?: string[] } = {
    showOpeningPhrases: OPENING,
    showClosingPhrases: CLOSING,
  },
  random = () => 0,
) => {
  const spoken: string[] = [];
  const logs: string[] = [];
  const voice = createShowVoice({
    say: async (text) => {
      spoken.push(text);
      return said;
    },
    settings: lists,
    random,
    log: (line) => logs.push(line),
  });
  return { voice, spoken, logs };
};

describe("la phrase d'un clip ou les rires", () => {
  it("fait dire telle quelle la phrase donnée, et rend sa durée", async () => {
    const { voice, spoken } = setup();
    expect(await voice.sayText("Quel saut !", "la phrase du clip")).toEqual({ ok: true, durationMs: 2500 });
    expect(spoken).toEqual(["Quel saut !"]);
  });

  it("ne dit rien quand la phrase est vide : Jean-Renard se tait, durée 0", async () => {
    const { voice, spoken } = setup();
    expect(await voice.sayText("", "la phrase du clip")).toEqual({ ok: true, durationMs: 0 });
    expect(spoken).toEqual([]);
  });

  it("rend 502 avec la cause quand la voix n'a pas pu dire la phrase, et le journalise", async () => {
    const { voice, logs } = setup({
      ok: false,
      status: 502,
      message: "la synthèse a échoué : PowerShell absent",
    });
    expect(await voice.sayText("Quel saut !", "la phrase du clip")).toEqual({
      ok: false,
      status: 502,
      message: "la synthèse a échoué : PowerShell absent",
    });
    expect(logs).toEqual([
      "Émission : la phrase du clip n'a pas été dite : la synthèse a échoué : PowerShell absent",
    ]);
  });

  it("rend 409 quand l'émission s'est arrêtée pendant la synthèse, sans le journaliser : ce n'est pas une panne", async () => {
    const { voice, logs } = setup({ ok: false, status: 409, message: "l'émission n'est pas en cours" });
    expect(await voice.sayText("Quel saut !", "la phrase du clip")).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(logs).toEqual([]);
  });
});

describe("l'ouverture et la clôture", () => {
  it("dit une phrase de la liste d'ouverture, et rend sa durée", async () => {
    const { voice, spoken } = setup();
    expect(await voice.sayLine("opening")).toEqual({ ok: true, durationMs: 2500 });
    expect(OPENING).toContain(spoken[0]);
  });

  it("dit la liste de clôture pour la clôture, jamais celle de l'ouverture", async () => {
    const { voice, spoken } = setup();
    await voice.sayLine("closing");
    expect(CLOSING).toContain(spoken[0]);
  });

  it("ne répète pas une phrase avant d'avoir tout dit, d'une émission à l'autre", async () => {
    const { voice, spoken } = setup(undefined, undefined, () => 0.999);
    await voice.sayLine("opening");
    await voice.sayLine("opening");
    expect([...spoken].sort()).toEqual([...OPENING].sort());
    await voice.sayLine("opening");
    expect(spoken[2]).not.toBe(spoken[1]);
  });

  it("tient une liste à part de l'autre : l'ouverture dite ne retire rien à la clôture", async () => {
    const { voice, spoken } = setup(undefined, undefined, () => 0.999);
    await voice.sayLine("opening");
    await voice.sayLine("closing");
    await voice.sayLine("closing");
    expect([...spoken.slice(1)].sort()).toEqual([...CLOSING].sort());
  });

  it("se tait quand la liste est vide ou absente : durée 0, rien de dit", async () => {
    const { voice, spoken } = setup(undefined, { showOpeningPhrases: [] });
    expect(await voice.sayLine("opening")).toEqual({ ok: true, durationMs: 0 });
    expect(await voice.sayLine("closing")).toEqual({ ok: true, durationMs: 0 });
    expect(spoken).toEqual([]);
  });

  it("applique des phrases réglées en cours de route", async () => {
    const { voice, spoken } = setup();
    voice.update({ showOpeningPhrases: ["Nouvelle."], showClosingPhrases: [] });
    await voice.sayLine("opening");
    expect(spoken).toEqual(["Nouvelle."]);
  });

  it("journalise une ouverture qui n'a pas pu être dite", async () => {
    const { voice, logs } = setup({ ok: false, status: 502, message: "voix absente" });
    expect(await voice.sayLine("opening")).toMatchObject({ ok: false, status: 502 });
    expect(logs).toEqual(["Émission : l'ouverture n'a pas été dite : voix absente"]);
  });
});
