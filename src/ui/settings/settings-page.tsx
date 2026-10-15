// La page commune de chaque onglet de réglages : un en-tête (le titre de la section, un statut, des actions à droite), puis
// un aperçu fixe à gauche et les réglages à droite, ou les réglages seuls sur toute la largeur. Les réglages se rangent en
// cartes : une carte est un groupe avec son titre.

import { type ReactNode, useId } from "react";
import { DESIGN_TEXTS } from "../design/design-texts";

type SettingsPageProps = {
  title: string;
  status?: ReactNode; // à côté du titre : la connexion, le micro
  actions?: ReactNode; // à droite de l'en-tête
  preview?: ReactNode; // à gauche, fixe pendant qu'on défile ; sans lui, une seule colonne
  errors?: readonly string[]; // les refus du serveur, en haut des réglages
  children?: ReactNode;
};

export const SettingsPage = ({
  title,
  status,
  actions,
  preview,
  errors = [],
  children,
}: SettingsPageProps) => {
  const controls = (
    <div className="settings-controls">
      {errors.length > 0 && (
        <div className="settings-card settings-errors">
          {errors.map((message) => (
            <p key={message} role="alert" className="lp-type-body lp-danger">
              {message}
            </p>
          ))}
        </div>
      )}
      {children}
    </div>
  );
  return (
    <div className="settings-view">
      <header className="settings-head">
        <h1 className="lp-type-heading">{title}</h1>
        {status && <div className="settings-head-status lp-type-body">{status}</div>}
        {actions && <div className="settings-head-actions">{actions}</div>}
      </header>
      {preview ? (
        <div className="settings-layout">
          <aside className="settings-preview settings-card" aria-label="Aperçu">
            {preview}
          </aside>
          {controls}
        </div>
      ) : (
        controls
      )}
    </div>
  );
};

type SettingsCardProps = { title?: string; children: ReactNode };

// Sans titre, une simple surface : la page de l'onglet Découpe, qui n'a pas de groupes.
export const SettingsCard = ({ title, children }: SettingsCardProps) => {
  const titleId = useId();
  return (
    <section className="settings-card" aria-labelledby={title ? titleId : undefined}>
      {title && (
        <h2 id={titleId} className="lp-type-heading">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
};

export const SettingsLoading = ({ title }: { title: string }) => (
  <SettingsPage title={title}>
    <p role="status" className="lp-type-body">
      {DESIGN_TEXTS.loading}
    </p>
  </SettingsPage>
);
