/** Pré-remplissage de la fiche prospect depuis l'API publique « Recherche d'entreprises » (data.gouv.fr). */

export interface FicheEntreprise {
  siret: string;
  raisonSociale: string;
  adresse: string;
  codePostal: string;
  ville: string;
  lat: number | null;
  lng: number | null;
  /** Libellé du code NAF (ex. « 62.02A »). */
  secteur: string;
  /** Tranche d'effectif lisible (ex. « 10 à 19 salariés »). */
  effectif: string;
}

/** Tranches d'effectif salarié de l'INSEE. */
const TRANCHES_EFFECTIF: Record<string, string> = {
  NN: 'Unité non employeuse',
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
};

export const libelleEffectif = (code: string | null | undefined): string => (code ? (TRANCHES_EFFECTIF[code] ?? '') : '');

/** Ne garde que les chiffres (on accepte « 327 733 184 00516 »). */
export const normaliserSiret = (saisie: string): string => saisie.replace(/\D/g, '');

export const siretComplet = (saisie: string): boolean => normaliserSiret(saisie).length === 14;

type Json = Record<string, unknown>;
const texte = (v: unknown): string => (typeof v === 'string' ? v : '');
const nombre = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** Transforme la réponse de l'API en fiche (fonction pure, testable). Retourne null si le SIRET n'est pas trouvé. */
export function convertirReponse(json: unknown, siret: string): FicheEntreprise | null {
  const resultats = (json as { results?: Json[] } | null)?.results;
  const entreprise = resultats?.[0];
  if (!entreprise) return null;

  const candidats = [...(((entreprise.matching_etablissements as Json[] | undefined) ?? [])), entreprise.siege as Json | undefined];
  const etablissement = candidats.find((e) => e && texte(e.siret) === siret);
  if (!etablissement) return null; // l'API a renvoyé une autre entreprise : on ne remplit rien

  const naf = texte(etablissement.activite_principale) || texte(entreprise.activite_principale);
  const tranche = texte(etablissement.tranche_effectif_salarie) || texte(entreprise.tranche_effectif_salarie);
  return {
    siret,
    raisonSociale: texte(entreprise.nom_complet) || texte(entreprise.nom_raison_sociale),
    adresse: [texte(etablissement.numero_voie), texte(etablissement.type_voie), texte(etablissement.libelle_voie)].filter(Boolean).join(' ') ||
      texte(etablissement.adresse),
    codePostal: texte(etablissement.code_postal),
    ville: texte(etablissement.libelle_commune),
    lat: nombre(etablissement.latitude),
    lng: nombre(etablissement.longitude),
    secteur: naf ? `NAF ${naf}` : '',
    effectif: libelleEffectif(tranche),
  };
}

export async function rechercherParSiret(saisie: string, signal?: AbortSignal): Promise<FicheEntreprise | null> {
  const siret = normaliserSiret(saisie);
  if (siret.length !== 14) throw new Error('Un numéro SIRET comporte 14 chiffres.');
  const reponse = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siret}&per_page=1`, { signal });
  if (reponse.status === 429) throw new Error('Trop de requêtes, réessayez dans quelques secondes.');
  if (!reponse.ok) throw new Error(`Service indisponible (${reponse.status}).`);
  return convertirReponse(await reponse.json(), siret);
}
