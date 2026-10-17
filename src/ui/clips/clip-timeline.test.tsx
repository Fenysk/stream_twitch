import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClipTimeline, TimelineLane, TimelineTrack, toPercent } from "./clip-timeline";
import { TrimBar } from "./trim-bar";

const timelineCss = readFileSync(join(import.meta.dirname, "clip-timeline.css"), "utf8").replace(/\s+/g, " ");
const editorCss = readFileSync(join(import.meta.dirname, "clip-editor.css"), "utf8").replace(/\s+/g, " ");

const render = (duration = 100, time = 25) =>
  renderToStaticMarkup(
    <ClipTimeline duration={duration} time={time} onSeek={() => undefined}>
      <TimelineTrack name="Coupe">
        <TrimBar
          duration={duration}
          trim={{ start: 10, end: 60 }}
          time={time}
          onStartChange={() => undefined}
          onEndChange={() => undefined}
          onSeek={() => undefined}
        />
      </TimelineTrack>
      <TimelineTrack name="Autre">
        <TimelineLane />
      </TimelineTrack>
    </ClipTimeline>,
  );

describe("toPercent", () => {
  it("place un instant en pourcentage de la durée, borné à la zone", () => {
    expect(toPercent(25, 100)).toBe("25%");
    expect(toPercent(-5, 100)).toBe("0%");
    expect(toPercent(500, 100)).toBe("100%");
    expect(toPercent(5, 0)).toBe("0%");
  });
});

describe("la règle", () => {
  it("écrit une graduation et son libellé à chaque pas rond : « 0:15 », « 1:30 », dix libellés au plus", () => {
    const html = render(100);
    const labels = [...html.matchAll(/timeline-tick-label[^>]*>([^<]+)</g)].map(([, label]) => label);
    expect(labels).toEqual(["0:00", "0:15", "0:30", "0:45", "1:00", "1:15", "1:30"]);
  });

  it("place chaque graduation en pourcentage de la durée, comme les poignées de la barre de coupe", () => {
    const html = render(100);
    expect(html).toContain("left:15%");
    expect(html).toContain("left:90%");
    expect(html).toContain("left:0%");
  });

  it("garde la règle à dix libellés au plus pour un clip long", () => {
    const html = render(3600);
    expect(html.match(/timeline-tick-label/g)?.length).toBeLessThanOrEqual(10);
  });
});

describe("les pistes", () => {
  it("écrivent le nom de chaque piste à gauche, devant sa zone", () => {
    const html = render();
    expect(html).toMatch(/timeline-name[^>]*>Coupe</);
    expect(html).toMatch(/timeline-name[^>]*>Autre</);
  });

  it("posent la barre de coupe telle quelle dans la piste Coupe : ses deux poignées et sa zone", () => {
    const html = render();
    expect(html.match(/role="slider"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Début de la partie gardée"');
    expect(html).toContain("trim-area");
  });

  it("donne à la règle et à chaque zone la même zone : les rangées ont les mêmes colonnes, les zones la même marge", () => {
    const html = render();
    expect(html.match(/class="timeline-track/g)).toHaveLength(3);
    expect(html.match(/class="timeline-zone"/g)).toHaveLength(2);
    expect(timelineCss).toContain(
      ".timeline-track { display: grid; grid-template-columns: var(--timeline-name-width) minmax(0, 1fr);",
    );
    expect(timelineCss).toContain(
      ".timeline-zone { box-sizing: border-box; min-width: 0; padding: 0 var(--trim-handle-width); }",
    );
  });

  it("partage la marge latérale de la barre de coupe : une seule valeur, 14 px, pour la timeline et la barre", () => {
    expect(editorCss).toContain(".clip-timeline, .trim-bar { --trim-handle-width: 14px; }");
    expect(editorCss).toMatch(/\.trim-bar \{ box-sizing: border-box; padding: 0 var\(--trim-handle-width\);/);
    expect(editorCss.match(/--trim-handle-width: 14px/g)).toHaveLength(1);
  });
});

describe("la position de lecture", () => {
  it("est un seul trait, à l'instant lu, sur une couche qui traverse la règle et toutes les pistes", () => {
    const html = render(100, 25);
    expect(html.match(/class="timeline-playhead"/g)).toHaveLength(1);
    expect(html).toContain('class="timeline-playhead" style="left:25%"');
    expect(html).toContain('class="timeline-playhead-layer" aria-hidden="true"');
  });

  it("ne capte pas la souris et passe par-dessus les pistes, avec la même marge que les zones", () => {
    expect(timelineCss).toMatch(
      /\.timeline-playhead-layer \{ position: absolute; top: 0; bottom: 0; left: var\(--timeline-name-width\); right: 0; box-sizing: border-box; padding: 0 var\(--trim-handle-width\); pointer-events: none; \}/,
    );
  });

  it("est de la couleur du trait de la barre de coupe, qui ne se voit plus dans la timeline", () => {
    expect(timelineCss).toContain("background: var(--danger)");
    expect(timelineCss).toContain(".clip-timeline .trim-playhead { display: none; }");
    expect(render()).toContain("trim-playhead");
  });
});

describe("la recherche au clic", () => {
  it("se fait sur la règle comme sur le vide d'une piste : chaque zone est une zone à pointeur", () => {
    const html = render();
    expect(html.match(/class="timeline-lane"/g)).toHaveLength(2);
    expect(timelineCss).toMatch(
      /\.timeline-lane \{ position: relative; cursor: pointer; touch-action: none; \}/,
    );
  });
});
