import { referentielActif, referentielPour } from '../referentiel';
import { calculerScores } from '../scoring/moteur';
import { libelleReponse } from '../scoring/affichage';
import { surfaceZone } from '../lib/zones';
import { enMinutes, totalChronos } from '../lib/chrono';
import { formaterDateCourte, telecharger } from '../lib/outils';
import { STATUTS } from '../domain/types';
import { chargerToutesLesVisites, type DonneesVisite } from './donnees';

// Export CSV du pipeline commercial : une ligne par visite, lisible dans Excel et Google Sheets
// (séparateur « ; », UTF-8 avec BOM, dates JJ/MM/AAAA, virgule décimale).

const SEPARATEUR = ';';

/** Met une cellule au format CSV et neutralise l'injection de formules (=, +, -, @) à l'ouverture dans un tableur. */
export function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  let texte = typeof valeur === 'number' ? String(valeur).replace('.', ',') : typeof valeur === 'boolean' ? (valeur ? 'Oui' : 'Non') : String(valeur);
  if (typeof valeur === 'string' && /^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

const libelleStatut = (id: string | undefined) => STATUTS.find((s) => s.id === id)?.libelle ?? '';
const libelleEtat = { preparee: 'Préparée', en_cours: 'En cours', terminee: 'Terminée' } as const;

export function construireCsv(visites: DonneesVisite[]): string {
  const ref = referentielActif;
  const piliers = ref.sections.filter((s) => s.type === 'pilier');
  const colonnesQualif = ref.sections
    .filter((s) => s.type === 'qualification')
    .flatMap((s) => s.questions.filter((q) => q.cleExport).map((q) => ({ cle: q.cleExport as string, id: q.id })));

  const entetes = [
    'ID visite',
    'Date de visite',
    "Chargé d'affaires",
    'Raison sociale',
    'SIRET',
    "Secteur d'activité",
    'Effectif',
    'Adresse',
    'Code postal',
    'Ville',
    'Contact',
    'Fonction',
    'Email',
    'Téléphone',
    'État de la visite',
    'Statut commercial',
    'Prochaine action',
    'Date de relance',
    'Information RGPD donnée',
    'Accord pour recevoir le rapport',
    'Score global',
    'Niveau de maturité',
    ...piliers.map((p) => `Score ${p.libelle}`),
    'Pistes prioritaires',
    'Nombre de zones',
    'Surface des zones (m²)',
    'Nombre de photos',
    'Nombre de notes vocales',
    'Durée de collecte (min)',
    ...colonnesQualif.map((c) => c.cle),
    'Version du référentiel',
    'Dernière modification',
  ];

  const lignes = visites.map((d) => {
    const vref = referentielPour(d.visite.referentielVersion);
    const table = Object.fromEntries(d.reponses.map((r) => [r.questionId, r.valeur]));
    const resultat = calculerScores(vref, table);
    const scoreDe = (id: string) => resultat.piliers.find((p) => p.sectionId === id)?.score ?? null;
    const surface = d.zones.reduce((s, z) => s + (surfaceZone(vref, z) ?? 0), 0);
    const retenues = d.recommandations.filter((r) => r.retenue).map((r) => r.titre);
    const qualif = (id: string) => {
      const q = vref.sections.flatMap((s) => s.questions).find((x) => x.id === id);
      return q ? libelleReponse(q, table[id]) : '';
    };

    return [
      d.visite.id,
      formaterDateCourte(d.visite.dateDebut ?? d.visite.datePrevue),
      d.chargeAffaires?.nom,
      d.prospect?.raisonSociale,
      d.prospect?.siret,
      d.prospect?.secteur,
      d.prospect?.effectif,
      d.site?.adresse,
      d.site?.codePostal,
      d.site?.ville,
      d.prospect?.contactNom,
      d.prospect?.contactFonction,
      d.prospect?.contactEmail,
      d.prospect?.contactTel,
      libelleEtat[d.visite.etat],
      libelleStatut(d.statut?.statut),
      d.statut?.prochaineAction,
      formaterDateCourte(d.statut?.dateRelance),
      d.visite.rgpdInformee,
      d.visite.consentementRapport,
      resultat.global.score,
      resultat.global.niveau?.libelle,
      ...piliers.map((p) => scoreDe(p.id)),
      retenues.join(' | '),
      d.zones.length,
      Math.round(surface),
      d.photos.length,
      d.notes.length,
      d.visite.chronos ? enMinutes(totalChronos(d.visite.chronos)) : null,
      ...colonnesQualif.map((c) => qualif(c.id)),
      d.visite.referentielVersion,
      formaterDateCourte(d.visite.updatedAt),
    ];
  });

  return '\uFEFF' + [entetes, ...lignes].map((l) => l.map(cellule).join(SEPARATEUR)).join('\r\n') + '\r\n';
}

export async function telechargerCsvVisites(): Promise<number> {
  const visites = await chargerToutesLesVisites();
  const jour = new Date().toISOString().slice(0, 10);
  telecharger(new Blob([construireCsv(visites)], { type: 'text/csv;charset=utf-8' }), `visites-diagnostic-rse-${jour}.csv`);
  return visites.length;
}
