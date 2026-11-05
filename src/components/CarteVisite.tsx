import { Link } from 'react-router-dom';
import { STATUTS, type EtatVisite } from '../domain/types';
import type { ResumeVisite } from '../hooks/donnees';
import { formaterDateCourte } from '../lib/outils';
import { referentielPour } from '../referentiel';
import { Badge, couleurScore } from './ui';

export const LIBELLE_ETAT: Record<EtatVisite, string> = {
  preparee: 'Préparée',
  en_cours: 'En cours',
  terminee: 'Terminée',
};

export const COULEUR_ETAT: Record<EtatVisite, string> = {
  preparee: 'bg-slate-200 text-slate-900',
  en_cours: 'bg-sky-200 text-sky-950',
  terminee: 'bg-green-200 text-green-950',
};

export function BadgeStatut({ statut }: { statut: string | undefined }) {
  const s = STATUTS.find((x) => x.id === statut);
  return s ? <Badge className={s.couleur}>{s.libelle}</Badge> : null;
}

/** Carte d'une visite dans la liste du terrain : un appui pour ouvrir ou reprendre. */
export function CarteVisite({ resume }: { resume: ResumeVisite }) {
  const { visite, site, prospect, statut, scoreGlobal, niveauId } = resume;
  const niveau = referentielPour(visite.referentielVersion).niveaux.find((n) => n.id === niveauId);
  const date = formaterDateCourte(visite.dateDebut ?? visite.datePrevue ?? visite.updatedAt);
  return (
    <Link to={`/visites/${visite.id}`} className="carte block active:bg-slate-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold">{prospect?.raisonSociale || 'Prospect sans nom'}</p>
          <p className="truncate text-slate-700">{[site?.adresse, site?.ville].filter(Boolean).join(', ') || 'Adresse non renseignée'}</p>
        </div>
        {scoreGlobal !== null && (
          <span className={`shrink-0 rounded-xl px-3 py-1 text-xl font-extrabold ${couleurScore(scoreGlobal)}`} title={niveau?.libelle}>
            {scoreGlobal}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <Badge className={COULEUR_ETAT[visite.etat]}>{LIBELLE_ETAT[visite.etat]}</Badge>
        <BadgeStatut statut={statut?.statut} />
        <span className="text-slate-600">{date}</span>
        {visite.dirty === 1 && <span className="text-amber-800">· à synchroniser</span>}
      </div>
    </Link>
  );
}
