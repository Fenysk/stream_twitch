import { renderSVG } from "uqr";

// Un QR code en SVG, noir sur blanc quelle que soit l'apparence : un lecteur le lit mal clair sur sombre. L'image porte son texte.
export const QrCode = ({ text, label }: { text: string; label: string }) => (
  <img
    className="mobile-qr-code"
    alt={label}
    src={`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(text, { ecc: "M", border: 2 }))}`}
  />
);
