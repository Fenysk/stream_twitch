import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClipPlayer } from "./clip-player";

describe("le lecteur d'un clip brut", () => {
  it("lit la vidéo servie en flux par le serveur, désignée par son nom de fichier encodé", () => {
    const html = renderToStaticMarkup(<ClipPlayer name="Replay 2026-10-15 15-09-05.mp4" />);
    expect(html).toContain('src="/api/clips/video?name=Replay%202026-10-15%2015-09-05.mp4"');
    expect(html).toContain("controls");
  });

  it("encode un nom qui contient des caractères d'URL, pour ne jamais en changer le sens", () => {
    const html = renderToStaticMarkup(<ClipPlayer name="a&b=c#d%.mp4" />);
    expect(html).toContain("name=a%26b%3Dc%23d%25.mp4");
  });
});
