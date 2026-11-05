// Connecteur ERP en LECTURE SEULE (prévu, NON implémenté en V1).
//
// Objectif : pouvoir plus tard pré-remplir une fiche prospect depuis l'ERP Extrabat (clients, contacts,
// adresses) sans jamais y écrire. Cette interface fixe le contrat ; l'application ne l'appelle pas encore.
//
// Pour l'implémenter :
//   1. créer `repository/extrabat/source.ts` avec une classe `SourceExtrabat implements SourceProspects` ;
//   2. appeler l'API Extrabat depuis le SERVEUR (fonction Edge Supabase), jamais depuis le front : le jeton
//      d'accès ne doit pas être embarqué dans l'application ;
//   3. la brancher dans `repository/index.ts` et l'utiliser dans `pages/Preparation.tsx` (recherche d'un client
//      à côté de la recherche par SIRET).

/** Fiche prospect telle que l'ERP la fournit (champs facultatifs : on n'importe que ce qui existe). */
export interface ProspectErp {
  /** Identifiant du client dans l'ERP (conservé pour éviter les doublons et faciliter le rapprochement). */
  idErp: string;
  raisonSociale: string;
  siret?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  contactNom?: string;
  contactFonction?: string;
  contactEmail?: string;
  contactTel?: string;
}

/** Source de prospects externe, en lecture seule. */
export interface SourceProspects {
  readonly nom: string;
  /** Recherche par raison sociale, SIRET ou ville. */
  rechercher(termes: string, limite?: number): Promise<ProspectErp[]>;
  lire(idErp: string): Promise<ProspectErp | null>;
}

/** Aucune source branchée en V1. */
export const sourceProspectsErp: SourceProspects | null = null;
