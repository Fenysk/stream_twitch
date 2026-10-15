// La fonction que Stream Deck appelle pour ouvrir le panneau (docs/26-websocket-ui, « connectElgatoStreamDeckSocket »).
interface Window {
  connectElgatoStreamDeckSocket: (
    port: string,
    uuid: string,
    registerEvent: string,
    info: string,
    actionInfo: string,
  ) => void;
}
