import type { NomTable, Utilisateur } from '../domain/types';

/** Ligne échangée avec le serveur (clés en camelCase, identique au modèle local sans champs techniques). */
export type LigneDistante = Record<string, unknown> & { id: string; updatedAt: string; deletedAt?: string | null };

export interface PagePull {
  lignes: LigneDistante[];
  /** Curseur à mémoriser pour la prochaine récupération (valeur opaque pour le synchroniseur). */
  curseur: string | null;
  /** true quand il n'y a plus rien à récupérer. */
  fini: boolean;
}

/**
 * Contrat que doit respecter un backend. Pour changer de backend (Node/Express, Firebase…),
 * il suffit d'écrire une nouvelle classe qui implémente cette interface et de la brancher
 * dans `repository/index.ts` : le reste de l'application n'est pas modifié.
 */
export interface DepotDistant {
  readonly nom: string;
  /** Envoie des lignes (création ou mise à jour, suppressions logiques comprises). */
  pousser(table: NomTable, lignes: LigneDistante[]): Promise<void>;
  /** Récupère les lignes modifiées sur le serveur depuis le curseur donné. */
  tirer(table: NomTable, curseur: string | null): Promise<PagePull>;
  envoyerPhoto(chemin: string, blob: Blob, mime: string): Promise<void>;
  /** URL temporaire d'une photo envoyée (null si indisponible). */
  urlPhoto(chemin: string, dureeSecondes?: number): Promise<string | null>;
  listerUtilisateurs(): Promise<Utilisateur[]>;
  /** Génère le brouillon de diagnostic à partir de l'export JSON (côté serveur : la clé API n'est jamais dans le front). */
  genererBrouillon(exportVisite: unknown): Promise<string>;
}

/** Authentification : connexion par lien magique, session persistante, rôles. */
export interface ServiceAuth {
  readonly mode: 'supabase' | 'local';
  restaurerSession(): Promise<Utilisateur | null>;
  envoyerLienMagique(email: string): Promise<void>;
  deconnecter(): Promise<void>;
  /** Abonnement aux changements de session (retourne la fonction de désabonnement). */
  surChangement(fn: (u: Utilisateur | null) => void): () => void;
}
