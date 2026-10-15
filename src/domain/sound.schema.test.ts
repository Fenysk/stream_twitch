import { describe, expect, it } from "vitest";
import {
  RewardChoicesSchema,
  SOUND_DEFAULTS,
  SoundEventSchema,
  SoundFieldsSchema,
  SoundFileSchema,
  SoundInputSchema,
  SoundOutcomeSchema,
} from "./sound.schema";

const fields = { title: "Applaudissements", cost: 100, pace: 30, fader: 80 };

describe("SoundFieldsSchema : les bornes d'un son", () => {
  it("accepte les valeurs par défaut du formulaire : 100 points, 30 s, 80 %", () => {
    expect(SOUND_DEFAULTS).toEqual({ cost: 100, pace: 30, fader: 80 });
    expect(SoundFieldsSchema.safeParse({ title: "Rire", ...SOUND_DEFAULTS }).success).toBe(true);
  });

  it("coupe les blancs autour du titre, et le refuse vide ou au-delà de 45 caractères", () => {
    expect(SoundFieldsSchema.parse({ ...fields, title: "  Rire  " }).title).toBe("Rire");
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "   " }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "a".repeat(45) }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, title: "a".repeat(46) }).success).toBe(false);
  });

  it("veut un coût entier d'1 point au moins", () => {
    expect(SoundFieldsSchema.safeParse({ ...fields, cost: 1 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, cost: 0 }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, cost: 10.5 }).success).toBe(false);
  });

  it("veut une pace entière de 0 (aucune) à 604 800 s (7 jours)", () => {
    expect(SoundFieldsSchema.safeParse({ ...fields, pace: 0 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, pace: 604_800 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, pace: 604_801 }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, pace: -1 }).success).toBe(false);
  });

  it("veut un fader entier de 0 à 100 %", () => {
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 0 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 100 }).success).toBe(true);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 101 }).success).toBe(false);
    expect(SoundFieldsSchema.safeParse({ ...fields, fader: 50.5 }).success).toBe(false);
  });

  it("dit en français ce qui ne va pas", () => {
    const result = SoundFieldsSchema.safeParse({ ...fields, cost: 0, fader: 120 });
    expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
      "le coût vaut 1 point au moins",
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

  it("relie un son à un reward déjà fait sur Twitch par son identifiant, à la création", () => {
    expect(SoundInputSchema.safeParse({ ...fields, rewardId: "reward-1" }).success).toBe(true);
    expect(SoundInputSchema.safeParse({ ...fields, rewardId: "" }).success).toBe(false);
  });

  it("tient un son pour géré par l'app quand sound.json ne dit rien (un son d'avant), et lit `false` quand Twitch l'a fait", () => {
    expect(SoundFileSchema.parse({ ...fields, format: "wav" }).isManaged).toBe(true);
    expect(SoundFileSchema.parse({ ...fields, format: "wav", isManaged: false }).isManaged).toBe(false);
  });

  it("garde le format du fichier dans sound.json, parmi mp3, wav et ogg", () => {
    expect(SoundFileSchema.safeParse({ ...fields, format: "ogg" }).success).toBe(true);
    expect(SoundFileSchema.safeParse({ ...fields, format: "flac" }).success).toBe(false);
    expect(SoundFileSchema.safeParse(fields).success).toBe(false);
  });
});

describe("RewardChoicesSchema : les récompenses de la chaîne que l'onglet reçoit", () => {
  it("lit les récompenses sans son et les sons dont la récompense a disparu", () => {
    const choice = { id: "clash", title: "Clasher Fenysk", cost: 500, pace: 60, isManageable: false };
    expect(RewardChoicesSchema.safeParse({ choices: [choice], missing: ["rire0001"] }).success).toBe(true);
    expect(RewardChoicesSchema.safeParse({ choices: [{ ...choice, cost: -1 }], missing: [] }).success).toBe(
      false,
    );
    expect(RewardChoicesSchema.safeParse({ choices: [] }).success).toBe(false);
  });
});

describe("SoundEventSchema et SoundOutcomeSchema : ce qui passe entre le serveur et la page /sounds", () => {
  it("lit un son à jouer, avec son fader, et l'ordre de se taire", () => {
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
