import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitorImage } from "./monitor-image";
import { MonitorSheet } from "./monitor-sheet";
import { MonitorThumbnail } from "./monitor-thumbnail";

const noop = () => undefined;
const URL_OF_IMAGE = "blob:http://192.168.1.20:4747/6f1c1c1a-1c2d-4b7e-9f3b-2d6f0f6a9b11";

describe("MonitorThumbnail", () => {
  const thumbnail = (url: string | null, isLinked = true, isExpanded = false) =>
    renderToStaticMarkup(
      <MonitorThumbnail url={url} isLinked={isLinked} isExpanded={isExpanded} onPress={noop} />,
    );

  it("est un bouton qui ouvre l'image en grand et montre l'image reçue, sans attribut style", () => {
    const html = thumbnail(URL_OF_IMAGE);
    expect(html).toContain('<button type="button" class="monitor-thumbnail"');
    expect(html).toContain('aria-label="Voir l&#x27;antenne en grand"');
    expect(html).toContain(`<img class="monitor-image" src="${URL_OF_IMAGE}" alt=""`);
    expect(html).not.toContain("style=");
  });

  it("dit s'il a ouvert la feuille par aria-expanded", () => {
    expect(thumbnail(URL_OF_IMAGE)).toContain('aria-expanded="false"');
    expect(thumbnail(URL_OF_IMAGE, true, true)).toContain('aria-expanded="true"');
  });

  it("montre le squelette, sans image, quand OBS est joint et que rien n'est encore arrivé", () => {
    const html = thumbnail(null);
    expect(html).toContain("lp-skeleton");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("OBS non joint");
  });

  it("écrit « OBS non joint » quand OBS ne l'est pas, sans image ni squelette", () => {
    const html = thumbnail(URL_OF_IMAGE, false);
    expect(html).toContain("monitor-empty");
    expect(html).toContain("OBS non joint");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("lp-skeleton");
  });
});

describe("MonitorImage", () => {
  it("décrit la scène à l'antenne quand elle a un texte alternatif", () => {
    const html = renderToStaticMarkup(
      <MonitorImage url={URL_OF_IMAGE} isLinked alt="La scène à l'antenne dans OBS" />,
    );
    expect(html).toContain('alt="La scène à l&#x27;antenne dans OBS"');
  });
});

describe("MonitorSheet", () => {
  const sheet = (isOpen: boolean, url: string | null = URL_OF_IMAGE, isLinked = true) =>
    renderToStaticMarkup(<MonitorSheet url={url} isLinked={isLinked} isOpen={isOpen} onClose={noop} />);

  it("est une feuille « Antenne » avec de quoi la fermer, ouverte ou non", () => {
    const html = sheet(false);
    expect(html).toContain('data-open="false"');
    expect(html).toContain("lp-grabber");
    expect(html).toContain(">Antenne<");
    expect(html).toContain("Fermer l&#x27;antenne");
    expect(sheet(true)).toContain('data-open="true"');
  });

  it("montre l'image en grand sous son titre", () => {
    const html = sheet(true);
    expect(html).toContain("monitor-large");
    expect(html).toContain(`src="${URL_OF_IMAGE}"`);
    expect(html).toContain('alt="La scène à l&#x27;antenne dans OBS"');
    expect(html.indexOf("control-drawer-title")).toBeLessThan(html.indexOf("monitor-large"));
    expect(html).not.toContain("style=");
  });

  it("montre le squelette avant la première image, et « OBS non joint » sans OBS", () => {
    expect(sheet(true, null)).toContain("lp-skeleton");
    expect(sheet(true, null)).not.toContain("<img");
    const offline = sheet(true, null, false);
    expect(offline).toContain("OBS non joint");
    expect(offline).not.toContain("lp-skeleton");
  });
});
