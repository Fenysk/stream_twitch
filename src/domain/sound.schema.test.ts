import { describe, expect, it } from "vitest";
import {
  LegacySoundFileSchema,
  SOUND_DEFAULTS,
  SoundEventSchema,
  SoundFieldsSchema,
  SoundFileSchema,
  SoundInputSchema,
  SoundOutcomeSchema,
  SoundSummarySchema,
} from "./sound.schema";

const fields = { title: "Applaudissements", fader: 80 };

describe("SoundFieldsSchema : les bornes d'un sound", () => {
  it("accepte le fader que le formulaire propose au départ : 80 %", () => {
    expect(SOUND_DEFAULTS).toEqual({ fader: 80 });
    expect(SoundFieldsSchema.safeParse({ title: "Rire", ...SOUND_DEFAULTS }).success).toBe(true);
  });

  it("coupe les blancs autour du titre, et le refuse vide ou au-delà de 45 caractères", () => {
    expect(SoundFieldsSchema.parse({ ...fields, title: "  Rire  " }).title).toBe("Rire");
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "   " }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "a".repeat(45) }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "a".repeat(46) }).success).toBe(false);
  });

  it("veut un fader entier de 0 à 100 %", () => {
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 0 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 100 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 101 }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 50.5 }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: -1 }).success).toBe(false);
  });

  it("n'a plus de coût ni de pace : ils sont ceux du reward, et un coût envoyé est écarté", () => {
    expect(SoundFieldsSchema.parse({ ...fields, cost: 100, pace: 30 })).toEqual(fields);
    expect(Object.keys(SoundFieldsSchema.shape)).toEqual(["title", "fader"]);
  });

  it("dit en français ce qui ne va pas", () => {
    const result = SoundFieldsSchema.safeParse({ title: "", fader: 120 });
    expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
      "le titre ne peut pas être vide",
      "le volume fait 100 % au plus",
    ]);
  });
});

describe("SoundInputSchema et SoundFileSchema", () => {
  it("laisse le fichier de côté quand on garde l'ancien", () => {
    expect(SoundInputSchema.safeParse(fields).success).toBe(true);
    expect(SoundInputSchema.safeParse({ ...fields, file: "AAAA" }).success).toBe(true);
    expect(SoundInputSchema.safeParse({ ...fields, file: "" }).success).toBe(false);
  });

  it("écarte un reward envoyé avec un sound : le lien se règle du côté du reward", () => {
    expect(SoundInputSchema.parse({ ...fields, rewardId: "reward-1", cost: 50, isManaged: true })).toEqual(
      fields,
    );
  });

  it("garde dans sound.json le titre, le fader et le format du fichier, parmi mp3, wav et ogg", () => {
    expect(SoundFileSchema.parse({ ...fields, format: "ogg" })).toEqual({ ...fields, format: "ogg" });
    expect(SoundFileSchema.safeParse({ ...fields, format: "flac" }).success).toBe(false);
    expect(SoundFileSchema.safeParse(fields).success).toBe(false);
  });

  it("lit un sound.json d'avant sans garder son reward : un sound.json n'a que le titre, le fader et le format", () => {
    const legacy = { ...fields, format: "wav", cost: 50, pace: 10, rewardId: "reward-1", isManaged: false };
    expect(SoundFileSchema.parse(legacy)).toEqual({ ...fields, format: "wav" });
  });
});

describe("LegacySoundFileSchema : un sound.json d'avant, lu pour la conversion", () => {
  it("garde le coût, la pace, le reward et isManaged d'un sound relié à un reward", () => {
    const legacy = { ...fields, format: "mp3", cost: 50, pace: 10, rewardId: "reward-1", isManaged: false };
    expect(LegacySoundFileSchema.parse(legacy)).toEqual(legacy);
  });

  it("lit `rewardId: null` d'un sound sans reward, et ne remplit rien de ce que le fichier ne dit pas", () => {
    expect(LegacySoundFileSchema.parse({ ...fields, format: "mp3", rewardId: null })).toEqual({
      ...fields,
      format: "mp3",
      rewardId: null,
    });
    expect(LegacySoundFileSchema.parse({ ...fields, format: "mp3" })).toEqual({ ...fields, format: "mp3" });
  });

  it("refuse un reward vide, ou un format inconnu", () => {
    expect(LegacySoundFileSchema.safeParse({ ...fields, format: "mp3", rewardId: "" }).success).toBe(false);
    expect(LegacySoundFileSchema.safeParse({ ...fields, format: "flac" }).success).toBe(false);
  });
});

describe("SoundSummarySchema : un sound tel que les pages le voient", () => {
  const summary = {
    ...fields,
    id: "rire0001",
    version: "7.42",
    rewardTitles: ["Prout."],
    clipCount: 3,
  };

  it("dit qui l'utilise : les titres des rewards, et le nombre de clips confirmés", () => {
    expect(SoundSummarySchema.parse(summary)).toEqual(summary);
    expect(SoundSummarySchema.safeParse({ ...summary, rewardTitles: [], clipCount: 0 }).success).toBe(true);
  });

  it("laisse le nombre de clips à `null` quand le dossier des clips est illisible, et le refuse négatif", () => {
    expect(SoundSummarySchema.safeParse({ ...summary, clipCount: null }).success).toBe(true);
    expect(SoundSummarySchema.safeParse({ ...summary, clipCount: -1 }).success).toBe(false);
    expect(SoundSummarySchema.safeParse({ ...summary, clipCount: undefined }).success).toBe(false);
  });
});

describe("SoundEventSchema et SoundOutcomeSchema : ce qui passe entre le serveur et la page /sounds", () => {
  it("lit un sound à jouer, avec son fader, et l'ordre de se taire", () => {
    expect(
      SoundEventSchema.safeParse({
        kind: "play",
        playId: "p1",
        soundId: "ab12cd34",
        version: "7.42",
        fader: 80,
      }).success,
    ).toBe(true);
    expect(SoundEventSchema.safeParse({ kind: "stop" }).success).toBe(true);
    expect(SoundEventSchema.safeParse({ kind: "play", playId: "p1" }).success).toBe(false);
    expect(SoundEventSchema.safeParse({ kind: "pause" }).success).toBe(false);
  });

  it("lit la réponse de la page : fini, ou raté avec sa raison", () => {
    expect(SoundOutcomeSchema.safeParse({ playId: "p1", outcome: "ended" }).success).toBe(true);
    expect(
      SoundOutcomeSchema.safeParse({ playId: "p1", outcome: "failed", reason: "fichier illisible" }).success,
    ).toBe(true);
    expect(SoundOutcomeSchema.safeParse({ playId: "p1", outcome: "stopped" }).success).toBe(false);
  });
});
