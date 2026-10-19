import { describe, expect, it } from "vitest";
import type { PictureState } from "../../src/domain/picture.schema";
import {
  PICTURE_NO_PLACE_TITLE,
  PICTURE_NONE_TITLE,
  PICTURE_PENDING_TITLE,
  toPictureTitle,
} from "./picture-title";
import { SERVER_DOWN_TITLE, SERVER_TO_RESTART_TITLE } from "./server-request";

const picture = (currentId: string | null): PictureState => ({
  members: [
    { id: "pc", label: "PC", isAvailable: true },
    { id: "camera-1", label: "Caméra 1", isAvailable: false },
    { id: "head", label: "Tête", isAvailable: true },
  ],
  currentId,
});

describe("toPictureTitle", () => {
  it("écrit le nom du membre à l'image : PC, Caméra 1 ou Tête, même quand sa caméra ne filme plus", () => {
    expect(toPictureTitle({ status: "ready", picture: picture("pc") })).toBe("PC");
    expect(toPictureTitle({ status: "ready", picture: picture("camera-1") })).toBe("Caméra 1");
    expect(toPictureTitle({ status: "ready", picture: picture("head") })).toBe("Tête");
  });

  it("met un tiret quand aucun membre n'est à l'image, ou que celui qui l'était n'est plus dans la place", () => {
    expect(toPictureTitle({ status: "ready", picture: picture(null) })).toBe(PICTURE_NONE_TITLE);
    expect(toPictureTitle({ status: "ready", picture: picture("camera-9") })).toBe(PICTURE_NONE_TITLE);
  });

  it("dit que la place est inconnue quand OBS n'a aucun membre à montrer", () => {
    expect(toPictureTitle({ status: "ready", picture: { members: [], currentId: null } })).toBe(
      PICTURE_NO_PLACE_TITLE,
    );
  });

  it("dit d'attendre avant le premier message du flux, et pourquoi le serveur ne donne rien sinon", () => {
    expect(toPictureTitle({ status: "pending" })).toBe(PICTURE_PENDING_TITLE);
    expect(toPictureTitle({ status: "down" })).toBe(SERVER_DOWN_TITLE);
    expect(toPictureTitle({ status: "to-restart" })).toBe(SERVER_TO_RESTART_TITLE);
  });

  it("tient sur deux lignes de moins de dix caractères, pour une touche de 72 px", () => {
    for (const title of [PICTURE_PENDING_TITLE, PICTURE_NO_PLACE_TITLE, PICTURE_NONE_TITLE]) {
      const lines = title.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.every((line) => line.length <= 10)).toBe(true);
    }
  });
});
