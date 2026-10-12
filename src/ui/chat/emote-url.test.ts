import { describe, expect, it } from "vitest";
import { toEmoteUrl } from "./emote-url";

describe("toEmoteUrl", () => {
  it("pointe vers l'image de l'emote sur le CDN de Twitch", () => {
    expect(toEmoteUrl("25")).toBe("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0");
  });

  it("garde l'identifiant dans le chemin, même avec des caractères spéciaux", () => {
    expect(toEmoteUrl("emotesv2_abc/../x")).toBe(
      "https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_abc%2F..%2Fx/default/dark/2.0",
    );
  });
});
