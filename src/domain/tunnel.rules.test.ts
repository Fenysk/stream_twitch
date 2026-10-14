import { describe, expect, it } from "vitest";
import type { Settings } from "./settings.schema";
import { isTunnelDue, TUNNEL_START, type TunnelRules, toNextTunnel, toTunnelRules } from "./tunnel.rules";

const rules: TunnelRules = { after: 180_000, pause: 5000, gap: 600_000 };
const FOREVER = Number.POSITIVE_INFINITY;

describe("toTunnelRules", () => {
  const base: Settings = {
    obsAddress: "ws://127.0.0.1:4455",
    micName: "Mic/Aux",
    threshold: -40,
    delay: 250,
  };

  it("reprend la durée, la pause et l'écart des réglages", () => {
    expect(
      toTunnelRules({ ...base, foxTunnelAfter: 180_000, foxTunnelPause: 5000, foxTunnelGap: 600_000 }),
    ).toEqual(rules);
  });

  it("ne donne aucune règle sans les réglages du renard", () => {
    expect(toTunnelRules(base)).toBeUndefined();
  });
});

describe("toNextTunnel : depuis quand il parle sans silence de plus de 5 s", () => {
  it("ne compte rien tant qu'il se tait depuis toujours", () => {
    expect(toNextTunnel(TUNNEL_START, { now: 10_000, silentFor: FOREVER, pause: 5000 })).toEqual({
      since: null,
    });
  });

  it("commence quand il parle, à l'instant de son dernier mot", () => {
    expect(toNextTunnel(TUNNEL_START, { now: 10_000, silentFor: 0, pause: 5000 })).toEqual({ since: 10_000 });
    expect(toNextTunnel(TUNNEL_START, { now: 10_000, silentFor: 2000, pause: 5000 })).toEqual({
      since: 8000,
    });
  });

  it("garde son début tant que les silences durent 5 s au plus", () => {
    const first = toNextTunnel(TUNNEL_START, { now: 10_000, silentFor: 0, pause: 5000 });
    expect(toNextTunnel(first, { now: 15_000, silentFor: 5000, pause: 5000 })).toEqual(first);
    expect(toNextTunnel(first, { now: 60_000, silentFor: 100, pause: 5000 })).toEqual(first);
  });

  it("repart de zéro après un silence de plus de 5 s", () => {
    const first = toNextTunnel(TUNNEL_START, { now: 10_000, silentFor: 0, pause: 5000 });
    expect(toNextTunnel(first, { now: 15_100, silentFor: 5001, pause: 5000 })).toEqual({ since: null });
    const again = toNextTunnel({ since: null }, { now: 30_000, silentFor: 0, pause: 5000 });
    expect(again).toEqual({ since: 30_000 });
  });
});

describe("isTunnelDue : 3 min de parole, au plus un par 10 min", () => {
  const tunnel = { since: 0 };

  it("est dû à 3 min pile de parole, pas avant", () => {
    expect(isTunnelDue({ tunnel, now: 179_999, sinceLast: FOREVER }, rules)).toBe(false);
    expect(isTunnelDue({ tunnel, now: 180_000, sinceLast: FOREVER }, rules)).toBe(true);
  });

  it("n'est pas dû quand il ne parle pas", () => {
    expect(isTunnelDue({ tunnel: TUNNEL_START, now: 500_000, sinceLast: FOREVER }, rules)).toBe(false);
  });

  it("attend l'écart de 10 min depuis le dernier", () => {
    expect(isTunnelDue({ tunnel, now: 200_000, sinceLast: 599_999 }, rules)).toBe(false);
    expect(isTunnelDue({ tunnel, now: 200_000, sinceLast: 600_000 }, rules)).toBe(true);
  });

  it("suit les réglages : une durée et un écart plus courts", () => {
    const quick: TunnelRules = { after: 30_000, pause: 2000, gap: 60_000 };
    expect(isTunnelDue({ tunnel, now: 30_000, sinceLast: 60_000 }, quick)).toBe(true);
    expect(isTunnelDue({ tunnel, now: 29_999, sinceLast: 60_000 }, quick)).toBe(false);
  });
});
