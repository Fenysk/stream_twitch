import { describe, expect, it } from "vitest";
import { createTrackStreams } from "./track-streams";

// Les pistes sont des textes et un flux est un objet qui garde sa piste : de quoi voir si le même objet revient.
const setup = () => {
  const opened: string[] = [];
  const toStreams = createTrackStreams((track: string) => {
    opened.push(track);
    return { track };
  });
  return { toStreams, opened };
};

describe("createTrackStreams", () => {
  it("Quand la caméra donne une piste vidéo et une piste audio, le système doit ouvrir un flux par piste : l'image d'un côté, le mic de l'autre", () => {
    const { toStreams } = setup();
    expect(toStreams("vidéo 1", "audio 1")).toEqual({
      image: { track: "vidéo 1" },
      mic: { track: "audio 1" },
    });
  });

  it("rend les mêmes flux, sans en ouvrir d'autres, tant que les pistes ne changent pas", () => {
    const { toStreams, opened } = setup();
    const first = toStreams("vidéo 1", "audio 1");
    const again = toStreams("vidéo 1", "audio 1");
    expect(again.image).toBe(first.image);
    expect(again.mic).toBe(first.mic);
    expect(opened).toEqual(["vidéo 1", "audio 1"]);
  });

  it("Quand la caméra change (l'autre objectif), le système doit ouvrir un nouveau flux d'image et garder celui du mic", () => {
    const { toStreams, opened } = setup();
    const before = toStreams("vidéo 1", "audio 1");
    const after = toStreams("vidéo 2", "audio 1");
    expect(after.image).toEqual({ track: "vidéo 2" });
    expect(after.image).not.toBe(before.image);
    expect(after.mic).toBe(before.mic);
    expect(opened).toEqual(["vidéo 1", "audio 1", "vidéo 2"]);
  });

  it("ne rend aucun flux sans piste, caméra arrêtée, et en ouvre de nouveaux quand elle repart avec de nouvelles pistes", () => {
    const { toStreams } = setup();
    const before = toStreams("vidéo 1", "audio 1");
    expect(toStreams(null, null)).toEqual({ image: null, mic: null });
    const after = toStreams("vidéo 2", "audio 2");
    expect(after.image).not.toBe(before.image);
    expect(after.mic).not.toBe(before.mic);
  });

  it("rend un flux de chaque sorte à part : une piste manquante ne retire pas l'autre", () => {
    const { toStreams } = setup();
    expect(toStreams("vidéo 1", null)).toEqual({ image: { track: "vidéo 1" }, mic: null });
    expect(toStreams(null, "audio 1")).toEqual({ image: null, mic: { track: "audio 1" } });
  });
});
