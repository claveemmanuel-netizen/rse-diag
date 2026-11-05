import { useState } from 'react';
import { donneesTestActives } from '../config/entreprise';
import { Alerte } from './ui';

interface Props {
  libelle: string;
  /** Action de remplissage ; retourne le message de confirmation affiché ensuite. */
  action: () => Promise<string>;
  className?: string;
}

/** Bouton « données de test » : discret (pointillés ambre), masqué si la fonction est désactivée. */
export function BoutonTest({ libelle, action, className = '' }: Props) {
  const [etat, setEtat] = useState<{ type: 'repos' | 'cours' | 'succes' | 'erreur'; message?: string }>({ type: 'repos' });
  if (!donneesTestActives) return null;

  const lancer = async () => {
    setEtat({ type: 'cours' });
    try {
      setEtat({ type: 'succes', message: await action() });
    } catch (e) {
      setEtat({ type: 'erreur', message: e instanceof Error ? e.message : 'Remplissage impossible.' });
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        disabled={etat.type === 'cours'}
        onClick={() => void lancer()}
        className="flex min-h-tactile w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-700 bg-amber-50 px-4 py-2 text-base font-bold text-amber-950 active:bg-amber-100 disabled:opacity-60"
      >
        <span aria-hidden="true">🧪</span>
        {etat.type === 'cours' ? 'Remplissage en cours…' : libelle}
      </button>
      {etat.type === 'succes' && <Alerte type="succes">{etat.message}</Alerte>}
      {etat.type === 'erreur' && <Alerte type="erreur">{etat.message}</Alerte>}
    </div>
  );
}
