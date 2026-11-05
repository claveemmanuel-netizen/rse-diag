import { formaterChrono, formaterEstimation } from '../lib/chrono';
import type { EtatChrono } from '../hooks/chrono';

interface Props {
  chrono: EtatChrono;
  /** Temps estimé de remplissage, en secondes. */
  estimationSecondes: number;
}

/** Chronomètre compact d'une section : toucher pour mettre en pause / reprendre. */
export function ChipChrono({ chrono, estimationSecondes }: Props) {
  const { secondes, demarre, enPause, basculerPause } = chrono;
  const depasse = demarre && secondes > estimationSecondes;
  const couleur = enPause ? 'bg-slate-200 text-slate-800' : depasse ? 'bg-amber-200 text-amber-950' : 'bg-vert-50 text-vert-900';

  if (!demarre) {
    return (
      <p className="flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-800" data-testid="chrono-attente">
        <span aria-hidden>⏱</span>
        <span>
          Temps estimé {formaterEstimation(estimationSecondes)} · le chrono démarre à votre première saisie
        </span>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={basculerPause}
      aria-label={enPause ? 'Chronomètre en pause : toucher pour reprendre' : 'Chronomètre en cours : toucher pour mettre en pause'}
      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-3 py-1 text-sm font-bold ${couleur}`}
      data-testid="chrono"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>{enPause ? '⏸' : '⏱'}</span>
        <span role="timer" className="tabular-nums">
          {formaterChrono(secondes)}
        </span>
        <span className="font-semibold">/ {formaterEstimation(estimationSecondes)}</span>
      </span>
      <span className="font-semibold">{enPause ? 'En pause · reprendre' : depasse ? 'Estimation dépassée' : 'En cours · pause'}</span>
    </button>
  );
}
