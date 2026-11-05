import type { SupabaseClient } from '@supabase/supabase-js';
import type { NomTable, Utilisateur } from '../../domain/types';
import type { DepotDistant, LigneDistante, PagePull } from '../distant';

const TAILLE_PAGE = 500;

const NOMS_TABLES: Record<NomTable, string> = {
  prospects: 'prospects',
  sites: 'sites',
  visites: 'visites',
  zones: 'zones',
  reponses: 'reponses',
  photos: 'photos',
  notesVocales: 'notes_vocales',
  scores: 'scores',
  recommandations: 'recommandations',
  statuts: 'statuts_commerciaux',
};

export const versSnake = (cle: string): string => cle.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const versCamel = (cle: string): string => cle.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Convertit les clés de premier niveau (les valeurs JSON imbriquées ne sont pas touchées). */
export function transformerCles(objet: Record<string, unknown>, fn: (cle: string) => string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objet).map(([k, v]) => [fn(k), v]));
}

/** Adaptateur Supabase (Postgres + Storage + Auth) du contrat `DepotDistant`. */
export class DepotSupabase implements DepotDistant {
  readonly nom = 'Supabase';
  constructor(private readonly client: SupabaseClient) {}

  async pousser(table: NomTable, lignes: LigneDistante[]): Promise<void> {
    if (lignes.length === 0) return;
    // Les champs vidés localement (undefined) sont envoyés à null : JSON.stringify les omettrait et le serveur garderait l'ancienne valeur.
    const rows = lignes.map((l) => transformerCles(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v === undefined ? null : v])), versSnake));
    const { error } = await this.client.from(NOMS_TABLES[table]).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`${table} : ${error.message}`);
  }

  async tirer(table: NomTable, curseur: string | null): Promise<PagePull> {
    let requete = this.client.from(NOMS_TABLES[table]).select('*').order('serveur_le', { ascending: true }).limit(TAILLE_PAGE);
    if (curseur) requete = requete.gt('serveur_le', curseur);
    const { data, error } = await requete;
    if (error) throw new Error(`${table} : ${error.message}`);
    const lignes = (data ?? []).map((r) => transformerCles(r as Record<string, unknown>, versCamel) as LigneDistante);
    const dernier = lignes[lignes.length - 1];
    return {
      lignes,
      curseur: dernier ? String(dernier.serveurLe ?? curseur ?? '') || curseur : curseur,
      fini: lignes.length < TAILLE_PAGE,
    };
  }

  async envoyerPhoto(chemin: string, blob: Blob, mime: string): Promise<void> {
    const { error } = await this.client.storage.from('photos').upload(chemin, blob, { contentType: mime, upsert: true });
    if (error) throw new Error(`photo : ${error.message}`);
  }

  async urlPhoto(chemin: string, dureeSecondes = 3600): Promise<string | null> {
    const { data, error } = await this.client.storage.from('photos').createSignedUrl(chemin, dureeSecondes);
    return error ? null : data.signedUrl;
  }

  async listerUtilisateurs(): Promise<Utilisateur[]> {
    const { data, error } = await this.client.from('profils').select('id, email, nom, role');
    if (error) throw new Error(`profils : ${error.message}`);
    return (data ?? []) as Utilisateur[];
  }

  async genererBrouillon(exportVisite: unknown): Promise<string> {
    const { data, error } = await this.client.functions.invoke('brouillon-diagnostic', { body: { visite: exportVisite } });
    if (error) {
      // Sur un statut non 2xx, supabase-js ne fournit que le corps brut dans `context` : on en extrait le message français.
      const contexte = (error as { context?: unknown }).context;
      if (contexte instanceof Response) {
        const corps = (await contexte.json().catch(() => null)) as { erreur?: string } | null;
        if (corps?.erreur) throw new Error(corps.erreur);
      }
      throw new Error(error.message);
    }
    if (!data || typeof data.brouillon !== 'string') throw new Error(data?.erreur ?? 'Réponse inattendue du serveur.');
    return data.brouillon as string;
  }
}
