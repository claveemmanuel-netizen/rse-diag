import type { ValeurReponse } from '../scoring/moteur';

// Modèle de données de l'application (stocké localement dans IndexedDB, synchronisé vers Supabase).

export type Role = 'terrain' | 'bureau';

/** Champs communs : identifiant client (UUID), horodatage de modification, suppression logique, état de synchro. */
export interface Entite {
  id: string;
  /** Horodatage ISO de la dernière modification locale (sert à arbitrer les conflits). */
  updatedAt: string;
  /** Suppression logique : la ligne est conservée pour propager la suppression au serveur. */
  deletedAt?: string | null;
  /** 1 = modification locale à envoyer au serveur. */
  dirty: 0 | 1;
}

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: Role;
}

export interface Prospect extends Entite {
  raisonSociale: string;
  siret?: string;
  secteur?: string;
  effectif?: string;
  contactNom?: string;
  contactFonction?: string;
  contactEmail?: string;
  contactTel?: string;
  creePar: string;
}

export interface Site extends Entite {
  prospectId: string;
  adresse: string;
  codePostal?: string;
  ville?: string;
  lat?: number | null;
  lng?: number | null;
  surfaceEstimeeM2?: number | null;
  notes?: string;
}

export type EtatVisite = 'preparee' | 'en_cours' | 'terminee';

/** Temps passé sur une section ; démarre à la première modification de la section. */
export interface ChronoSection {
  /** Secondes cumulées (écran au premier plan uniquement, hors pauses). */
  secondes: number;
  /** Date de la première modification de la section (déclenchement du chrono). */
  debutLe: string;
}

export interface Visite extends Entite {
  siteId: string;
  /** Chargé d'affaires qui réalise la visite. */
  utilisateurId: string;
  /** Version du référentiel de questions utilisée pour cette visite. */
  referentielVersion: string;
  datePrevue?: string | null;
  dateDebut?: string | null;
  dateFin?: string | null;
  etat: EtatVisite;
  /** Sections que l'utilisateur a choisi de passer pour y revenir plus tard. */
  sectionsIgnorees: string[];
  /** Dernier écran ouvert (pour « reprendre la visite »). */
  derniereRoute?: string | null;
  /** Chronomètre par section (identifiant de section, ou « zones »). Absent pour les visites antérieures. */
  chronos?: Record<string, ChronoSection> | null;
  rgpdInformee: boolean;
  rgpdInformeeLe?: string | null;
  consentementRapport: boolean;
  consentementRapportLe?: string | null;
  /** Signature du contact (image PNG en data URL). */
  signature?: string | null;
  notesSynthese?: string;
  /** Brouillon de diagnostic généré par IA : toujours relu et validé par un humain. */
  brouillonTexte?: string | null;
  brouillonGenereLe?: string | null;
  brouillonValidePar?: string | null;
  brouillonValideLe?: string | null;
}

export interface Zone extends Entite {
  visiteId: string;
  typeId: string;
  nom?: string;
  surfaceM2?: number | null;
  tailleId?: string | null;
  etatId?: string | null;
  note?: string;
  ordre: number;
}

/** Identifiant déterministe : `${visiteId}:${questionId}` (une seule réponse par question). */
export interface Reponse extends Entite {
  visiteId: string;
  questionId: string;
  valeur: ValeurReponse;
  commentaire?: string;
}

export interface Photo extends Entite {
  visiteId: string;
  questionId?: string | null;
  zoneId?: string | null;
  /** Image compressée (JPEG, 1600 px max) conservée localement jusqu'à l'envoi. */
  blob?: Blob;
  mime: string;
  largeur: number;
  hauteur: number;
  prisLe: string;
  lat?: number | null;
  lng?: number | null;
  precisionM?: number | null;
  /** Chemin dans le Storage une fois la photo envoyée. */
  storagePath?: string | null;
  legende?: string;
}

export interface NoteVocale extends Entite {
  visiteId: string;
  /** Contexte de la note : 'section:biodiversite', 'zones', 'question:bio_point_eau'… */
  contexte?: string | null;
  texte: string;
}

/** Instantané du score d'un pilier (ou 'global') : id = `${visiteId}:${pilier}`. */
export interface ScoreEnregistre extends Entite {
  visiteId: string;
  pilier: string;
  score: number | null;
  niveauId: string | null;
  couverture: number;
}

export interface Recommandation extends Entite {
  visiteId: string;
  questionId?: string | null;
  pilier?: string | null;
  titre: string;
  texte: string;
  priorite: number;
  prestationId?: string | null;
  source: 'auto' | 'manuelle';
  retenue: boolean;
}

export type StatutVisite = 'a_rediger' | 'redige' | 'envoye' | 'devis_a_faire';

export const STATUTS: { id: StatutVisite; libelle: string; couleur: string }[] = [
  { id: 'a_rediger', libelle: 'À rédiger', couleur: 'bg-amber-200 text-amber-950' },
  { id: 'redige', libelle: 'Rédigé', couleur: 'bg-sky-200 text-sky-950' },
  { id: 'envoye', libelle: 'Envoyé', couleur: 'bg-green-200 text-green-950' },
  { id: 'devis_a_faire', libelle: 'Devis à faire', couleur: 'bg-violet-200 text-violet-950' },
];

/** Un enregistrement par visite : id = visiteId. */
export interface StatutCommercial extends Entite {
  visiteId: string;
  statut: StatutVisite;
  prochaineAction?: string;
  dateRelance?: string | null;
  historique: { statut: StatutVisite; date: string; par: string }[];
}

export interface MetaLocale {
  cle: string;
  valeur: string;
}

/** Noms des tables synchronisées (et noms des propriétés de la base locale). */
export const TABLES_SYNC = [
  'prospects',
  'sites',
  'visites',
  'zones',
  'reponses',
  'photos',
  'notesVocales',
  'scores',
  'recommandations',
  'statuts',
] as const;
export type NomTable = (typeof TABLES_SYNC)[number];
