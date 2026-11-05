import type { Question } from '../referentiel/schema';
import type { ValeurReponse } from './moteur';

export const LIBELLES_BOOL: Record<string, string> = {
  oui: 'Oui',
  non: 'Non',
  partiel: 'Partiel',
  nsp: 'Ne sait pas',
  na: 'Sans objet',
};

/** Formate une date ISO (AAAA-MM-JJ) en JJ/MM/AAAA. */
export function formaterDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Texte lisible d'une réponse (export, PDF, synthèse). Chaîne vide si pas de réponse. */
export function libelleReponse(q: Question, valeur: ValeurReponse): string {
  if (valeur === undefined || valeur === null || valeur === '' || (Array.isArray(valeur) && valeur.length === 0)) return '';
  switch (q.type) {
    case 'bool':
      return LIBELLES_BOOL[String(valeur)] ?? String(valeur);
    case 'choix': {
      const liste = Array.isArray(valeur) ? valeur : [String(valeur)];
      return liste.map((v) => q.options.find((o) => o.valeur === v)?.libelle ?? v).join(', ');
    }
    case 'nombre':
      return `${valeur}${q.unite ? ` ${q.unite}` : ''}`;
    case 'date':
      return formaterDate(String(valeur));
    default:
      return String(valeur);
  }
}
