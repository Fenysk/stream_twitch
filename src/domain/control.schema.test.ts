import { describe, expect, it } from "vitest";
import {
  CHAT_TEXT_MAX,
  ChatSendRequestSchema,
  ControlStateSchema,
  EndRequestSchema,
  IDLE_CONTROL,
  MicRequestSchema,
  SceneRequestSchema,
} from "./control.schema";
import { LinkRequestSchema, PhoneEventSchema } from "./phone.schema";
import { PictureRequestSchema } from "./picture.schema";

describe("ControlStateSchema", () => {
  it("lit l'état de repos que la page montre avant le serveur", () => {
    expect(ControlStateSchema.parse(IDLE_CONTROL)).toEqual(IDLE_CONTROL);
  });

  it("lit un état complet : live, viewers, scène, micros, caméras à l'antenne et fin prévue", () => {
    const state = {
      isLinked: true,
      broadcast: { isLive: true, durationMs: 102_000 },
      viewers: { kind: "live", count: 12 },
      scene: "Jeu",
      scenes: ["Jeu", "Pause"],
      mics: [{ id: "pc", label: "Micro du PC", isOpen: true, isAvailable: true }],
      onAir: [1, 3],
      endAt: 1_760_000_000_000,
      picture: {
        members: [
          { id: "pc", label: "PC", isAvailable: true },
          { id: "camera-1", label: "Caméra 1", isAvailable: false },
        ],
        currentId: "pc",
      },
    };
    expect(ControlStateSchema.parse(state)).toEqual(state);
  });

  it("refuse une image dont un membre n'a pas de nom ou dont la disponibilité manque", () => {
    const member = { id: "pc", label: "PC", isAvailable: true };
    expect(
      ControlStateSchema.safeParse({ ...IDLE_CONTROL, picture: { members: [member], currentId: null } })
        .success,
    ).toBe(true);
    for (const wrong of [
      { ...member, label: "" },
      { ...member, id: "" },
      { id: "pc", label: "PC" },
    ]) {
      expect(
        ControlStateSchema.safeParse({ ...IDLE_CONTROL, picture: { members: [wrong], currentId: null } })
          .success,
      ).toBe(false);
    }
  });

  it("refuse une durée négative, des viewers inconnus du schéma et un micro sans nom", () => {
    expect(
      ControlStateSchema.safeParse({ ...IDLE_CONTROL, broadcast: { isLive: true, durationMs: -1 } }).success,
    ).toBe(false);
    expect(ControlStateSchema.safeParse({ ...IDLE_CONTROL, viewers: { kind: "beaucoup" } }).success).toBe(
      false,
    );
    expect(
      ControlStateSchema.safeParse({
        ...IDLE_CONTROL,
        mics: [{ id: "pc", label: "", isOpen: true, isAvailable: true }],
      }).success,
    ).toBe(false);
  });

  it("refuse un numéro de caméra à l'antenne qui n'est pas un entier à partir de 1", () => {
    for (const onAir of [[0], [1.5], ["1"]]) {
      expect(ControlStateSchema.safeParse({ ...IDLE_CONTROL, onAir }).success).toBe(false);
    }
  });

  it("voyage dans le flux du téléphone sous le nom control", () => {
    expect(PhoneEventSchema.safeParse({ kind: "control", state: IDLE_CONTROL }).success).toBe(true);
    expect(PhoneEventSchema.safeParse({ kind: "control", state: {} }).success).toBe(false);
  });

  it("dit à un téléphone qui filme où en est l'image pour lui, sous le nom picture", () => {
    const standing = { hasPlace: true, isCurrent: false, shown: "Tête" };
    expect(PhoneEventSchema.parse({ kind: "picture", standing })).toEqual({ kind: "picture", standing });
    expect(
      PhoneEventSchema.safeParse({ kind: "picture", standing: { ...standing, shown: undefined } }).success,
    ).toBe(false);
    expect(PhoneEventSchema.safeParse({ kind: "picture" }).success).toBe(false);
  });
});

describe("les demandes de la régie", () => {
  it("lit une scène, un micro et un sens de fin de live", () => {
    expect(SceneRequestSchema.safeParse({ name: "Jeu" }).success).toBe(true);
    expect(SceneRequestSchema.safeParse({ name: "" }).success).toBe(false);
    expect(MicRequestSchema.safeParse({ id: "camera-2" }).success).toBe(true);
    expect(MicRequestSchema.safeParse({}).success).toBe(false);
    expect(PictureRequestSchema.safeParse({ id: "head" }).success).toBe(true);
    expect(PictureRequestSchema.safeParse({ id: "" }).success).toBe(false);
    expect(PictureRequestSchema.safeParse({}).success).toBe(false);
    expect(PictureRequestSchema.parse({ id: "head", isMicKept: true })).toEqual({
      id: "head",
      isMicKept: true,
    });
    expect(PictureRequestSchema.parse({ id: "head" })).toEqual({ id: "head" });
    expect(PictureRequestSchema.safeParse({ id: "head", isMicKept: "oui" }).success).toBe(false);
    expect(EndRequestSchema.safeParse({ direction: "later" }).success).toBe(true);
    expect(EndRequestSchema.safeParse({ direction: "sooner" }).success).toBe(true);
    expect(EndRequestSchema.safeParse({ direction: "plus tard" }).success).toBe(false);
  });

  it("lit ce que chaque côté d'une caméra dit de sa liaison : le téléphone s'il filme, la page OBS si sa liaison est vive", () => {
    const phone = { from: "phone", phoneId: "phone-aaaa-0001", isFilming: false };
    const screen = { from: "screen", screenId: "screen-aaaa-0001", isLinked: true };
    expect(LinkRequestSchema.parse(phone)).toEqual(phone);
    expect(LinkRequestSchema.parse(screen)).toEqual(screen);
    expect(LinkRequestSchema.safeParse({ from: "phone", phoneId: "phone-aaaa-0001" }).success).toBe(false);
    expect(LinkRequestSchema.safeParse({ from: "screen", screenId: "x", isLinked: true }).success).toBe(
      false,
    );
    expect(LinkRequestSchema.safeParse({ from: "serveur", phoneId: "phone-aaaa-0001" }).success).toBe(false);
  });

  it("Quand le message est vide ou fait d'espaces, le système doit le refuser ; il retire les espaces autour", () => {
    expect(ChatSendRequestSchema.safeParse({ text: "" }).success).toBe(false);
    expect(ChatSendRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(ChatSendRequestSchema.parse({ text: "  Salut le chat  " })).toEqual({ text: "Salut le chat" });
  });

  it("refuse un message de plus de 500 caractères et accepte 500 pile", () => {
    expect(ChatSendRequestSchema.safeParse({ text: "a".repeat(CHAT_TEXT_MAX) }).success).toBe(true);
    expect(ChatSendRequestSchema.safeParse({ text: "a".repeat(CHAT_TEXT_MAX + 1) }).success).toBe(false);
  });
});
