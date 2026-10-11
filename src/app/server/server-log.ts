// Le journal du serveur : sur la sortie standard, une ligne par message, datée.
export function log(message: string): void {
  console.log(`[${new Date().toLocaleString("sv-SE")}] ${message}`);
}
