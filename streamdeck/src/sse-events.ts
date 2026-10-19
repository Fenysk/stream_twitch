// Lire un flux SSE (text/event-stream) à la main : le Node 20 du Stream Deck n'a pas d'`EventSource`. Le serveur n'écrit que `event:`,
// `data:`, `retry:` et des commentaires ; seuls `event:` et `data:` comptent ici.

// Le nom d'un évènement sans `event:` : celui des messages de `onmessage`.
export const MESSAGE_EVENT = "message";

export type SseEvent = { name: string; data: string };

// Un lecteur à nourrir de morceaux de texte, coupés n'importe où (au milieu d'une ligne comme d'un mot) : chaque évènement complet
// (fini par une ligne vide) part à `onEvent`, ses lignes `data:` jointes par un saut de ligne. Une ligne de commentaire (`:`), une
// ligne d'un champ qu'on ne lit pas, ou un évènement sans `data:` ne donnent rien.
export const createSseReader = (onEvent: (event: SseEvent) => void): ((text: string) => void) => {
  let pending = "";
  let name = "";
  let data: string[] = [];

  const finishEvent = (): void => {
    if (data.length > 0) onEvent({ name: name || MESSAGE_EVENT, data: data.join("\n") });
    name = "";
    data = [];
  };

  const takeLine = (line: string): void => {
    if (line === "") {
      finishEvent();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // Une seule espace suit les deux-points, la valeur garde les autres.
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  };

  return (text) => {
    pending += text;
    const lines = pending.split(/\r\n|\n|\r/);
    pending = lines.pop() ?? "";
    for (const line of lines) takeLine(line);
  };
};
