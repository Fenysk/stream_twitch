import { describe, expect, it } from "vitest";
import {
  REWARD_DEFAULTS,
  RewardCreationSchema,
  RewardFieldsSchema,
  RewardListSchema,
  RewardRecordsFileSchema,
  RewardSoundInputSchema,
} from "./reward.schema";

const fields = { title: "Applaudissements", cost: 100, pace: 30 };

describe("RewardFieldsSchema : les bornes d'un reward", () => {
  it("accepte les valeurs que le formulaire propose au départ : 100 points, 30 s", () => {
    expect(REWARD_DEFAULTS).toEqual({ cost: 100, pace: 30 });
    expect(RewardFieldsSchema.safeParse({ title: "Rire", ...REWARD_DEFAULTS }).success).toBe(true);
  });

  it("coupe les blancs autour du titre, et le refuse vide ou au-delà de 45 caractères", () => {
    expect(RewardFieldsSchema.parse({ ...fields, title: "  Rire  " }).title).toBe("Rire");
    expect(RewardFieldsSchema.safeParse({ ...fields, title: "   " }).success).toBe(false);
    expect(RewardFieldsSchema.safeParse({ ...fields, title: "a".repeat(45) }).success).toBe(true);
    expect(RewardFieldsSchema.safeParse({ ...fields, title: "a".repeat(46) }).success).toBe(false);
  });

  it("veut un coût entier d'1 point au moins", () => {
    expect(RewardFieldsSchema.safeParse({ ...fields, cost: 1 }).success).toBe(true);
    expect(RewardFieldsSchema.safeParse({ ...fields, cost: 0 }).success).toBe(false);
    expect(RewardFieldsSchema.safeParse({ ...fields, cost: 10.5 }).success).toBe(false);
  });

  it("veut une pace entière de 0 (aucune) à 604 800 s (7 jours)", () => {
    expect(RewardFieldsSchema.safeParse({ ...fields, pace: 0 }).success).toBe(true);
    expect(RewardFieldsSchema.safeParse({ ...fields, pace: 604_800 }).success).toBe(true);
    expect(RewardFieldsSchema.safeParse({ ...fields, pace: 604_801 }).success).toBe(false);
    expect(RewardFieldsSchema.safeParse({ ...fields, pace: -1 }).success).toBe(false);
  });

  it("dit en français ce qui ne va pas", () => {
    const result = RewardFieldsSchema.safeParse({ ...fields, cost: 0, pace: -5 });
    expect(result.success ? [] : result.error.issues.map(({ message }) => message)).toEqual([
      "le coût vaut 1 point au moins",
      "la pace ne peut pas être négative",
    ]);
  });
});

describe("RewardCreationSchema et RewardSoundInputSchema : le sound d'un reward", () => {
  it("crée un reward sans sound quand la demande n'en dit rien, ou avec celui qu'elle nomme", () => {
    expect(RewardCreationSchema.parse(fields)).toEqual({ ...fields, sound: null });
    expect(RewardCreationSchema.parse({ ...fields, sound: "rire0001" }).sound).toBe("rire0001");
    expect(RewardCreationSchema.safeParse({ ...fields, sound: "" }).success).toBe(false);
  });

  it("choisit un sound par son identifiant, ou `null` pour n'en garder aucun", () => {
    expect(RewardSoundInputSchema.safeParse({ sound: "rire0001" }).success).toBe(true);
    expect(RewardSoundInputSchema.safeParse({ sound: null }).success).toBe(true);
    expect(RewardSoundInputSchema.safeParse({ sound: "" }).success).toBe(false);
    expect(RewardSoundInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("RewardRecordsFileSchema : data/rewards.json", () => {
  it("lit les enregistrements par id de reward : titre, sound ou null, isManaged", () => {
    const file = {
      "bf38114f-2b75-4538-b5b5-a071db82f77e": { title: "Prout.", sound: "823e2671", isManaged: false },
      "reward-1": { title: "Rire", sound: null, isManaged: true },
    };
    expect(RewardRecordsFileSchema.parse(file)).toEqual(file);
    expect(RewardRecordsFileSchema.safeParse({}).success).toBe(true);
  });

  it("refuse un enregistrement incomplet, ou un sound vide", () => {
    expect(RewardRecordsFileSchema.safeParse({ a: { title: "Rire", sound: null } }).success).toBe(false);
    expect(
      RewardRecordsFileSchema.safeParse({ a: { title: "Rire", sound: "", isManaged: true } }).success,
    ).toBe(false);
  });
});

describe("RewardListSchema : les rewards que l'onglet reçoit", () => {
  const reward = {
    id: "reward-1",
    title: "Prout.",
    cost: 50,
    pace: 10,
    isManaged: false,
    isMissing: false,
    sound: "823e2671",
  };

  it("lit un reward de la chaîne avec son sound, ou sans", () => {
    expect(RewardListSchema.safeParse({ rewards: [reward, { ...reward, sound: null }] }).success).toBe(true);
    expect(RewardListSchema.safeParse({ rewards: [] }).success).toBe(true);
  });

  it("refuse un coût négatif, ou une liste absente", () => {
    expect(RewardListSchema.safeParse({ rewards: [{ ...reward, cost: -1 }] }).success).toBe(false);
    expect(RewardListSchema.safeParse({}).success).toBe(false);
  });
});
