import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BadgeSync } from './BadgeSync';
import { IconeFleche } from './Icones';

interface Props {
  titre: string;
  sousTitre?: string;
  /** Chemin du bouton retour (absent = pas de retour). */
  retour?: string;
  libelleRetour?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Largeur maximale du contenu (tableau de bord : large). */
  large?: boolean;
}

/** Gabarit d'écran : bandeau vert contrasté, retour, état de synchronisation, contenu centré. */
export function Page({ titre, sousTitre, retour, libelleRetour = 'Retour', actions, children, large }: Props) {
  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 bg-vert-900 text-white shadow-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className={`mx-auto flex items-center gap-2 px-3 py-2 ${large ? 'max-w-6xl' : 'max-w-3xl'}`}>
          {retour && (
            <Link to={retour} aria-label={libelleRetour} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 active:bg-white/30">
              <IconeFleche />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold leading-tight">{titre}</h1>
            {sousTitre && <p className="truncate text-sm text-vert-100">{sousTitre}</p>}
          </div>
          {actions}
          <BadgeSync />
        </div>
      </header>
      <main className={`mx-auto space-y-4 p-3 ${large ? 'max-w-6xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}
