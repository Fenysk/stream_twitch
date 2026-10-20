import { describe, expect, it } from "vitest";
import { isMicCoveredByPicture, toDirectMicId } from "./fallback.rules";
import type { PictureState } from "./picture.schema";

const MEMBERS = ["pc", "camera-1", "camera-2", "head"].map((id) => ({ id, label: id, isAvailable: true }));
const picture = (currentId: string | null, lost: readonly string[] = []): PictureState => ({
  members: MEMBERS.map((member) => ({ ...member, isAvailable: !lost.includes(member.id) })),
  currentId,
});

describe("toDirectMicId", () => {
  it("demande le micro de la caméra à l'image, ou celui du PC pour le PC, quand il n'est pas déjà celui du live", () => {
    expect(toDirectMicId("camera-1", "pc")).toBe("camera-1");
    expect(toDirectMicId("pc", "camera-1")).toBe("pc");
    expect(toDirectMicId("camera-1", null)).toBe("camera-1");
  });

  it("ne demande rien quand le micro voulu est déjà celui du live", () => {
    expect(toDirectMicId("camera-1", "camera-1")).toBeNull();
    expect(toDirectMicId("pc", "pc")).toBeNull();
  });

  it("ne demande rien pour la tête, quel que soit le micro du live : elle ne touche plus au micro", () => {
    expect(toDirectMicId("head", "pc")).toBeNull();
    expect(toDirectMicId("head", "camera-1")).toBeNull();
    expect(toDirectMicId("head", null)).toBeNull();
  });
});

describe("isMicCoveredByPicture", () => {
  it("dit vrai quand la caméra du mic perdu est à l'image perdue et que l'image se replie vers le PC (pas de tête dans la place)", () => {
    const noHead: PictureState = {
      members: [
        { id: "pc", label: "PC", isAvailable: true },
        { id: "camera-1", label: "Caméra 1", isAvailable: false },
      ],
      currentId: "camera-1",
    };
    expect(isMicCoveredByPicture("camera-1", noHead)).toBe(true);
  });

  it("dit faux quand l'image se replie vers la tête, ou que la caméra du mic perdu n'est pas celle de l'image", () => {
    expect(isMicCoveredByPicture("camera-1", picture("camera-1", ["camera-1"]))).toBe(false);
    expect(isMicCoveredByPicture("camera-2", picture("camera-1", ["camera-1"]))).toBe(false);
    expect(isMicCoveredByPicture("camera-1", picture("head"))).toBe(false);
  });
});
