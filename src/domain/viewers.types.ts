// Ce que le serveur sait du nombre de viewers du live : en cours (zéro compris), hors ligne, ou inconnu (pas encore de réponse,
// Twitch a échoué à la dernière demande, ou pas d'identifiants Twitch).
export type ViewersState = { kind: "live"; count: number } | { kind: "offline" } | { kind: "unknown" };
