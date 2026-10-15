import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPhrase, toPhraseRequest, toPhraseTitle } from "./phrase-request";
import type { FetchFn } from "./server-request";

const BASE = "http://127.0.0.1:4747";

describe("toPhraseRequest", () => {
  it("demande au renard de dire le texte, nettoyé comme le serveur le fait", () => {
    expect(toPhraseRequest({ kind: "text", text: "  Bonjour\nle   tchat !  " })).toEqual({
      path: "/api/fox/speak",
      body: { text: "Bonjour le tchat !" },
    });
  });

  it("coupe le texte à ce que le serveur dit : 500 caractères", () => {
    const request = toPhraseRequest({ kind: "text", text: "a".repeat(800) });
    expect(request?.body).toEqual({ text: "a".repeat(500) });
  });

  it("demande le bilan du live avec un corps JSON vide, même quand un texte est gardé", () => {
    expect(toPhraseRequest({ kind: "review", text: "gardé" })).toEqual({ path: "/api/fox/review", body: {} });
  });

  it("ne demande rien pour un texte vide ou fait de blancs", () => {
    expect(toPhraseRequest({ kind: "text", text: "" })).toBeUndefined();
    expect(toPhraseRequest({ kind: "text", text: " \n\t " })).toBeUndefined();
  });
});

describe("toPhraseTitle", () => {
  it("garde le nom de la touche", () => {
    expect(toPhraseTitle({ kind: "text", text: "Salut", name: "Salut" })).toBe("Salut");
    expect(toPhraseTitle({ kind: "review", name: "Fin de live" })).toBe("Fin de live");
  });

  it("écrit Phrase ou Bilan du live quand la touche n'a pas de nom", () => {
    expect(toPhraseTitle({ kind: "text", text: "Salut" })).toBe("Phrase");
    expect(toPhraseTitle({})).toBe("Phrase");
    expect(toPhraseTitle({ kind: "review" })).toBe("Bilan du live");
    expect(toPhraseTitle({ kind: "review", name: "  " })).toBe("Bilan du live");
  });

  it("demande de choisir un réglage quand ce que la touche garde est illisible", () => {
    expect(toPhraseTitle({ kind: "shout" })).toBe("Choisir\nun réglage");
    expect(toPhraseTitle(null)).toBe("Choisir\nun réglage");
  });
});

describe("sendPhrase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const answering =
    (body: string, status = 200): FetchFn =>
    async () =>
      new Response(body, { status });

  it("envoie le JSON en POST sur la route, avec un délai de 30 s pour la synthèse", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchFn = vi.fn<FetchFn>(answering('{"url":"/api/fox/speech/1"}'));
    const outcome = await sendPhrase(BASE, { path: "/api/fox/speak", body: { text: "Bonjour" } }, fetchFn);
    expect(outcome).toEqual({ ok: true });
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/api/fox/speak`, {
      signal: expect.any(AbortSignal),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"text":"Bonjour"}',
    });
  });

  it("envoie le bilan avec un corps JSON vide, comme la route l'exige", async () => {
    const fetchFn = vi.fn<FetchFn>(answering('{"text":"Bilan"}'));
    await sendPhrase(BASE, { path: "/api/fox/review", body: {} }, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/api/fox/review`, expect.objectContaining({ body: "{}" }));
  });

  it("rend le refus du serveur avec son statut et son message : un bilan sans rien à dire est un 409", async () => {
    const refusal = JSON.stringify({ issues: [{ path: "", message: "rien à dire" }] });
    expect(await sendPhrase(BASE, { path: "/api/fox/review", body: {} }, answering(refusal, 409))).toEqual({
      ok: false,
      reason: "refused",
      status: 409,
      message: "rien à dire",
    });
  });

  it("rend aussi le refus d'un 4xx ou d'un 5xx dont le corps n'est pas lisible", async () => {
    expect(
      await sendPhrase(BASE, { path: "/api/fox/speak", body: { text: "x" } }, answering("Boom", 500)),
    ).toEqual({
      ok: false,
      reason: "refused",
      status: 500,
      message: undefined,
    });
    expect(
      await sendPhrase(BASE, { path: "/api/fox/speak", body: { text: "x" } }, answering("{}", 404)),
    ).toEqual({
      ok: false,
      reason: "refused",
      status: 404,
      message: undefined,
    });
  });

  it("dit que le serveur est injoignable quand le réseau échoue", async () => {
    const failing: FetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await sendPhrase(BASE, { path: "/api/fox/review", body: {} }, failing)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
