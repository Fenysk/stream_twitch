import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrimBar } from "./trim-bar";

const render = (overrides: { start?: number; end?: number; time?: number } = {}) =>
  renderToStaticMarkup(
    <TrimBar
      duration={100}
      trim={{ start: overrides.start ?? 25, end: overrides.end ?? 75 }}
      time={overrides.time ?? 50}
      onStartChange={() => undefined}
      onEndChange={() => undefined}
      onSeek={() => undefined}
    />,
  );

describe("la barre de la partie gardée", () => {
  it("pose une poignée de début et une poignée de fin, nommées, avec leur instant", () => {
    const html = render();
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Début de la partie gardée"');
    expect(html).toContain('aria-label="Fin de la partie gardée"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('aria-valuenow="75"');
    expect(html).toContain('aria-valuetext="0:25.00"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("place les poignées, la partie gardée et la lecture en pourcentage de la durée", () => {
    const html = render();
    expect(html).toContain("trim-handle--start");
    expect(html).toContain("trim-handle--end");
    expect(html).toContain("left:25%");
    expect(html).toContain("left:75%");
    expect(html).toContain("left:50%");
    expect(html).toContain("width:50%");
  });

  it("désactive les deux poignées quand le début et la fin ne se changent plus, sans cacher la barre", () => {
    const html = renderToStaticMarkup(
      <TrimBar
        duration={100}
        trim={{ start: 0, end: 100 }}
        time={10}
        isDisabled
        onStartChange={() => undefined}
        onEndChange={() => undefined}
        onSeek={() => undefined}
      />,
    );
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(render()).not.toContain('disabled=""');
  });

  it("garde tout le clip quand le début est à zéro et la fin à la durée", () => {
    const html = render({ start: 0, end: 100 });
    expect(html).toContain("left:0%");
    expect(html).toContain("width:100%");
  });
});
