import type { Question, Referentiel } from '../referentiel/schema';
import { estRepondue, questionsVisibles, type Reponses, type ValeurReponse } from '../scoring/moteur';
import { ajouterJours, aujourdhui } from './outils';

// Générateur de DONNÉES DE TEST (fonctions pures, sans base ni navigateur).
// Il s'appuie sur le référentiel : si les questions changent, les données de test suivent.
// Les noms, adresses, e-mails et numéros sont fictifs (domaines « .example », numéros 01 99 00 xx xx).

export type Alea = () => number;

/** Générateur pseudo-aléatoire reproductible (mulberry32) : une même graine donne les mêmes données. */
export function generateurAlea(graine: number): Alea {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choisir = <T>(liste: readonly T[], alea: Alea): T => liste[Math.min(liste.length - 1, Math.floor(alea() * liste.length))];

// ─── Fiche prospect ─────────────────────────────────────────────────────────

export interface FicheTest {
  raisonSociale: string;
  siret: string;
  secteur: string;
  effectif: string;
  adresse: string;
  codePostal: string;
  ville: string;
  lat: number;
  lng: number;
  surfaceEstimeeM2: number;
  contactNom: string;
  contactFonction: string;
  contactEmail: string;
  contactTel: string;
}

const FICHES: FicheTest[] = [
  {
    raisonSociale: '[TEST] Logistique Rhône-Alpes SAS',
    siret: '00000000000012',
    secteur: 'Logistique et entreposage',
    effectif: '50 à 99 salariés',
    adresse: '12 rue des Lilas',
    codePostal: '69003',
    ville: 'Lyon',
    lat: 45.7597,
    lng: 4.8422,
    surfaceEstimeeM2: 3500,
    contactNom: 'Claire Martin',
    contactFonction: 'Responsable des services généraux',
    contactEmail: 'claire.martin@logistique-ra.example',
    contactTel: '01 99 00 12 34',
  },
  {
    raisonSociale: '[TEST] Clinique des Cèdres',
    siret: '00000000000020',
    secteur: 'Santé',
    effectif: '100 à 199 salariés',
    adresse: '8 avenue du Parc',
    codePostal: '31000',
    ville: 'Toulouse',
    lat: 43.6047,
    lng: 1.4442,
    surfaceEstimeeM2: 6000,
    contactNom: 'Karim Benali',
    contactFonction: 'Directeur administratif et financier',
    contactEmail: 'k.benali@clinique-cedres.example',
    contactTel: '01 99 00 23 45',
  },
  {
    raisonSociale: '[TEST] Parc d’activités Horizon',
    siret: '00000000000038',
    secteur: 'Services aux entreprises',
    effectif: '250 à 499 salariés',
    adresse: '3 allée des Peupliers',
    codePostal: '44800',
    ville: 'Saint-Herblain',
    lat: 47.2184,
    lng: -1.6006,
    surfaceEstimeeM2: 12000,
    contactNom: 'Sophie Lambert',
    contactFonction: 'Property manager',
    contactEmail: 'sophie.lambert@horizon-pm.example',
    contactTel: '01 99 00 34 56',
  },
  {
    raisonSociale: '[TEST] Maison Verdier Industrie',
    siret: '00000000000046',
    secteur: 'Fabrication de matériel industriel',
    effectif: '20 à 49 salariés',
    adresse: '27 chemin de la Source',
    codePostal: '33600',
    ville: 'Pessac',
    lat: 44.8067,
    lng: -0.6311,
    surfaceEstimeeM2: 2200,
    contactNom: 'Julien Verdier',
    contactFonction: 'Gérant',
    contactEmail: 'julien.verdier@maison-verdier.example',
    contactTel: '01 99 00 45 67',
  },
];

export function ficheTest(graine: number): FicheTest {
  return choisir(FICHES, generateurAlea(graine));
}

const estVide = (v: unknown) => v === undefined || v === null || v === '';

/** Ne garde de la fiche de test que les champs encore vides dans la fiche actuelle (rien n'est écrasé). */
export function champsVidesDeLaFiche(actuelle: Partial<Record<keyof FicheTest, unknown>>, fiche: FicheTest): Partial<FicheTest> {
  const patch: Partial<Record<keyof FicheTest, string | number>> = {};
  for (const cle of Object.keys(fiche) as (keyof FicheTest)[]) {
    if (estVide(actuelle[cle])) patch[cle] = fiche[cle];
  }
  return patch as Partial<FicheTest>;
}

// ─── Réponses au questionnaire ──────────────────────────────────────────────

const TEXTES_PAR_QUESTION: Record<string, string> = {
  q_decideur_nom: 'Mme Dubois',
  q_decideur_organisation: 'Foncière des Lilas (bailleur)',
  q_decideur_coordonnees: 'c.dubois@fonciere-lilas.example · 01 99 00 56 78',
  q_prestataire_nom: 'Entretien Vert Services',
  q_attentes:
    'Des espaces extérieurs plus accueillants pour les salariés, une démarche valorisable dans notre rapport RSE et un entretien plus régulier côté entrée.',
  q_irritants: 'Passages irréguliers du prestataire, pelouse jaunie en été, parking très minéral et brûlant, aucun retour sur ce qui est fait.',
};

const TEXTES_GENERIQUES = [
  'Observation de test : élément à vérifier lors de la rédaction du diagnostic.',
  'Information recueillie auprès de l’interlocuteur pendant la visite (donnée fictive).',
  'À confirmer avec le gestionnaire du site (donnée de test).',
];

const COMMENTAIRES = [
  'Constaté sur place, voir photo.',
  'D’après l’interlocuteur, à confirmer.',
  'Variable selon les saisons.',
  'Mis en place récemment.',
  'Concerne surtout le côté parking.',
];

/** Valeur plausible pour une question, selon son type (null pour une photo : elle est ajoutée à part). */
export function valeurTest(q: Question, alea: Alea): ValeurReponse {
  switch (q.type) {
    case 'bool': {
      const disponibles = (q.reponses ?? ['oui', 'non', 'partiel', 'nsp']) as string[];
      const poids: Record<string, number> = { oui: 0.45, partiel: 0.15, non: 0.35, nsp: 0.05 };
      const total = disponibles.reduce((s, r) => s + (poids[r] ?? 0.1), 0);
      let tirage = alea() * total;
      for (const r of disponibles) {
        tirage -= poids[r] ?? 0.1;
        if (tirage <= 0) return r;
      }
      return disponibles[0];
    }
    case 'choix': {
      if (!q.multiple) return choisir(q.options, alea).valeur;
      const exclusives = q.options.filter((o) => o.exclusif);
      const libres = q.options.filter((o) => !o.exclusif);
      if (libres.length === 0) return exclusives[0].valeur;
      if (exclusives.length > 0 && alea() < 0.15) return [choisir(exclusives, alea).valeur];
      const nombre = 1 + Math.floor(alea() * Math.min(3, libres.length));
      const reste = [...libres];
      const choisies: string[] = [];
      while (choisies.length < nombre) choisies.push(reste.splice(Math.floor(alea() * reste.length), 1)[0].valeur);
      return choisies;
    }
    case 'nombre': {
      const min = q.min ?? 0;
      const max = q.max ?? 100;
      const pas = q.pas ?? 1;
      const etapes = Math.max(0, Math.floor((max - min) / pas));
      return Number((min + pas * Math.floor(alea() * (etapes + 1))).toFixed(6));
    }
    case 'texte':
      return TEXTES_PAR_QUESTION[q.id] ?? choisir(TEXTES_GENERIQUES, alea);
    case 'date':
      return ajouterJours(aujourdhui(), 90 + Math.floor(alea() * 270));
    case 'photo':
      return null;
  }
}

export interface ReponsesTest {
  valeurs: Record<string, ValeurReponse>;
  commentaires: Record<string, string>;
}

/**
 * Réponses de test pour les questions visibles qui n'ont pas encore de réponse.
 * Les réponses déjà saisies ne sont jamais modifiées ; les questions conditionnelles
 * ne sont remplies que si leur condition est remplie par les réponses précédentes.
 * `sectionId` limite le remplissage à une section.
 */
export function reponsesTest(ref: Referentiel, alea: Alea, existantes: Reponses = {}, sectionId?: string): ReponsesTest {
  const courantes: Reponses = { ...existantes };
  const valeurs: Record<string, ValeurReponse> = {};
  const commentaires: Record<string, string> = {};
  for (const section of ref.sections) {
    for (const q of section.questions) {
      if (sectionId && section.id !== sectionId) continue;
      if (q.type === 'photo' || estRepondue(courantes[q.id])) continue;
      if (!questionsVisibles(ref, courantes).has(q.id)) continue;
      const valeur = valeurTest(q, alea);
      courantes[q.id] = valeur;
      valeurs[q.id] = valeur;
      if (q.type !== 'texte' && alea() < 0.2) commentaires[q.id] = choisir(COMMENTAIRES, alea);
    }
  }
  return { valeurs, commentaires };
}

// ─── Zones, notes vocales, clôture ──────────────────────────────────────────

export interface ZoneTest {
  typeId: string;
  nom: string;
  surfaceM2: number | null;
  tailleId: string;
  etatId: string;
  note: string;
}

const TYPES_ZONES_PRIVILEGIES = ['pelouse', 'massif', 'haie', 'arbres', 'parking', 'point_eau'];

const NOMS_ZONES: Record<string, string> = {
  pelouse: 'Pelouse devant l’entrée',
  massif: 'Massif d’accueil',
  haie: 'Haie côté parking',
  arbres: 'Alignement d’arbres',
  parking: 'Parking visiteurs',
  point_eau: 'Bassin de rétention',
};

const NOTES_ZONES: Record<string, string> = {
  pelouse: 'Tonte régulière, quelques zones jaunies en été.',
  massif: 'Peu fleuri, sol nu entre les plantations.',
  haie: 'Haie monospécifique de laurier, peu favorable à la faune.',
  arbres: 'Arbres adultes en bon état, ombrage partiel.',
  parking: 'Enrobé sur toute la surface, aucun arbre.',
  point_eau: 'Bassin entretenu, quelques roseaux.',
};

/** Quelques zones variées (types, tailles, états et surfaces) construites à partir du référentiel. */
export function zonesTest(ref: Referentiel, alea: Alea, max = 6): ZoneTest[] {
  const types = ref.zones.types;
  const choisis = [
    ...TYPES_ZONES_PRIVILEGIES.map((id) => types.find((t) => t.id === id)).filter((t): t is (typeof types)[number] => Boolean(t)),
    ...types.filter((t) => !TYPES_ZONES_PRIVILEGIES.includes(t.id)),
  ].slice(0, max);
  return choisis.map((t, i) => {
    const taille = ref.zones.tailles[i % ref.zones.tailles.length];
    return {
      typeId: t.id,
      nom: NOMS_ZONES[t.id] ?? t.libelle,
      // Une zone sur deux n'a que la taille estimée : les deux saisies existent sur le terrain.
      surfaceM2: i % 2 === 0 ? Math.max(10, Math.round((taille.m2Indicatif * (0.6 + alea() * 0.8)) / 10) * 10) : null,
      tailleId: taille.id,
      etatId: ref.zones.etats[i % ref.zones.etats.length].id,
      note: NOTES_ZONES[t.id] ?? 'Zone de test : observation à compléter.',
    };
  });
}

export interface NoteTest {
  contexte: string;
  texte: string;
}

/** Transcriptions vocales fictives, rattachées à des écrans réels (format : chemin relatif à la visite). */
export function notesVocalesTest(ref: Referentiel): NoteTest[] {
  const pilier = ref.sections.find((s) => s.type === 'pilier');
  return [
    { contexte: 'sommaire', texte: 'Accueil très aimable. L’interlocuteur souhaite un devis pour un entretien plus écologique, avec un point d’étape à la fin de l’été.' },
    { contexte: 'zones', texte: 'Grande pelouse peu utilisée côté entrée, les salariés déjeunent plutôt sur le parking. Prévoir des bancs sous les arbres.' },
    ...(pilier ? [{ contexte: `section/${pilier.id}`, texte: 'Pas de plan de gestion écrit. Le prestataire intervient environ tous les quinze jours sans compte rendu.' }] : []),
  ];
}

export const NOTES_SYNTHESE_TEST =
  'Visite de test : bonne base à valoriser (arbres adultes, espace de pause), marges de progrès nettes sur les sols et les pratiques d’entretien. À présenter comme une opportunité de démarche RSE visible.';

export const ACTIONS_SUIVANTES_TEST = 'Envoyer le pré-rapport et proposer un rendez-vous pour présenter un contrat d’entretien responsable.';

/** Décalage de la date de relance, en jours (négatif = relance déjà due, pour tester le tableau de bord). */
export const decalageRelanceTest = (alea: Alea): number => Math.floor(alea() * 10) - 3;
