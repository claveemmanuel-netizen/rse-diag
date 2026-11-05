import { modeLocal } from '../config/entreprise';
import { useEtatSync } from '../hooks/useEtatSync';
import { formaterDateHeure } from '../lib/outils';
import { synchroniser } from '../repository/sync';
import { IconeNuage } from './Icones';

/** Pastille d'état : hors ligne, nombre de modifications en attente, dernière synchronisation. */
export function BadgeSync() {
  const etat = useEtatSync();

  let texte: string;
  let style: string;
  if (modeLocal) {
    texte = 'Mode local';
    style = 'bg-slate-200 text-slate-900';
  } else if (!etat.enLigne) {
    texte = etat.enAttente > 0 ? `Hors ligne · ${etat.enAttente} en attente` : 'Hors ligne';
    style = 'bg-amber-300 text-slate-900';
  } else if (etat.erreur) {
    texte = 'Erreur de synchro';
    style = 'bg-red-700 text-white';
  } else if (etat.enCours) {
    texte = 'Synchronisation…';
    style = 'bg-sky-200 text-sky-950';
  } else if (etat.enAttente > 0) {
    texte = `${etat.enAttente} en attente`;
    style = 'bg-amber-300 text-slate-900';
  } else {
    texte = 'Synchronisé';
    style = 'bg-green-200 text-green-950';
  }

  const detail = modeLocal
    ? 'Aucun serveur configuré : les données restent sur cet appareil.'
    : etat.erreur
      ? etat.erreur
      : etat.derniereSynchro
        ? `Dernière synchronisation : ${formaterDateHeure(etat.derniereSynchro)}`
        : 'Pas encore synchronisé';

  return (
    <button
      type="button"
      title={detail}
      aria-label={`${texte}. ${detail}`}
      onClick={() => !modeLocal && void synchroniser()}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold ${style}`}
    >
      <IconeNuage width={18} height={18} />
      {texte}
    </button>
  );
}
