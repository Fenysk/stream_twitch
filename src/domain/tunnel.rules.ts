import type { Settings } from "./settings.schema";

// Le tunnel : Fenysk parle depuis `after` ms sans silence de plus de `pause` ms ; au plus un par `gap` ms.
export type TunnelRules = { after: number; pause: number; gap: number };

// Sans les réglages du renard (tous ou aucun), pas de tunnel.
export function toTunnelRules({
  foxTunnelAfter,
  foxTunnelPause,
  foxTunnelGap,
}: Settings): TunnelRules | undefined {
  if (foxTunnelAfter === undefined || foxTunnelPause === undefined || foxTunnelGap === undefined)
    return undefined;
  return { after: foxTunnelAfter, pause: foxTunnelPause, gap: foxTunnelGap };
}

// Depuis quand Fenysk parle sans silence de plus de `pause` ; `null` quand il se tait depuis plus longtemps.
export type Tunnel = { since: number | null };

export const TUNNEL_START: Tunnel = { since: null };

// `silentFor` : depuis combien de ms il ne dit plus rien (infini s'il n'a rien dit depuis le démarrage).
export type TunnelInput = { now: number; silentFor: number; pause: number };

// Un silence plus long que `pause` coupe le tunnel ; sinon il continue, et commence au dernier mot s'il n'était pas en cours.
export function toNextTunnel(previous: Tunnel, { now, silentFor, pause }: TunnelInput): Tunnel {
  if (silentFor > pause) return TUNNEL_START;
  return { since: previous.since ?? now - silentFor };
}

// Le tunnel est dû : il dure depuis `after` ms, et le dernier est assez loin (`sinceLast`, infini s'il n'y en a pas eu).
export const isTunnelDue = (
  { tunnel, now, sinceLast }: { tunnel: Tunnel; now: number; sinceLast: number },
  { after, gap }: TunnelRules,
): boolean => tunnel.since !== null && now - tunnel.since >= after && sinceLast >= gap;
