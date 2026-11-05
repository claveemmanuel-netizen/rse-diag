import Dexie, { type Table } from 'dexie';
import type {
  MetaLocale,
  NoteVocale,
  Photo,
  Prospect,
  Recommandation,
  Reponse,
  ScoreEnregistre,
  Site,
  StatutCommercial,
  Utilisateur,
  Visite,
  Zone,
} from '../domain/types';

/** Base locale IndexedDB : source de vérité de l'application, y compris hors ligne. */
export class BaseLocale extends Dexie {
  prospects!: Table<Prospect, string>;
  sites!: Table<Site, string>;
  visites!: Table<Visite, string>;
  zones!: Table<Zone, string>;
  reponses!: Table<Reponse, string>;
  photos!: Table<Photo, string>;
  notesVocales!: Table<NoteVocale, string>;
  scores!: Table<ScoreEnregistre, string>;
  recommandations!: Table<Recommandation, string>;
  statuts!: Table<StatutCommercial, string>;
  utilisateurs!: Table<Utilisateur, string>;
  meta!: Table<MetaLocale, string>;

  constructor(nom = 'rse-diag') {
    super(nom);
    // `dirty` est un nombre (0/1) car IndexedDB ne sait pas indexer les booléens.
    this.version(1).stores({
      prospects: 'id, raisonSociale, dirty',
      sites: 'id, prospectId, dirty',
      visites: 'id, siteId, utilisateurId, etat, dirty',
      zones: 'id, visiteId, dirty',
      reponses: 'id, visiteId, questionId, dirty',
      photos: 'id, visiteId, questionId, zoneId, dirty',
      notesVocales: 'id, visiteId, dirty',
      scores: 'id, visiteId, dirty',
      recommandations: 'id, visiteId, dirty',
      statuts: 'id, visiteId, statut, dateRelance, dirty',
      utilisateurs: 'id',
      meta: 'cle',
    });
  }
}

export const db = new BaseLocale();

/** Demande au navigateur de ne pas purger les données locales (important sur iOS / Safari). */
export async function demanderStockagePersistant(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* sans importance */
  }
  return false;
}
