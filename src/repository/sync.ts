import type { Table } from 'dexie';
import { db } from '../db/base';
import { TABLES_SYNC, type Entite, type NomTable, type Photo, type Utilisateur } from '../domain/types';
import { maintenant } from '../lib/outils';
import { surModificationLocale } from './depot';
import type { DepotDistant, LigneDistante } from './distant';

// Moteur de synchronisation « local d'abord » :
//  1. envoi (push) des lignes marquées `dirty` (photos : téléversement du fichier d'abord) ;
//  2. récupération (pull) des modifications du serveur depuis un curseur par table ;
//  3. en cas de conflit, la modification locale non encore envoyée la plus récente l'emporte.

type LigneLocale = Entite & Record<string, unknown>;
const tableDe = (nom: NomTable) => db[nom] as unknown as Table<LigneLocale, string>;

export interface EtatSync {
  /** false en mode local (pas de serveur configuré) ou si personne n'est connecté. */
  actif: boolean;
  enLigne: boolean;
  enCours: boolean;
  /** Nombre de lignes modifiées localement et pas encore envoyées. */
  enAttente: number;
  derniereSynchro: string | null;
  erreur: string | null;
}

let etat: EtatSync = {
  actif: false,
  enLigne: typeof navigator === 'undefined' ? true : navigator.onLine,
  enCours: false,
  enAttente: 0,
  derniereSynchro: null,
  erreur: null,
};
const abonnes = new Set<() => void>();
function majEtat(patch: Partial<EtatSync>) {
  etat = { ...etat, ...patch };
  abonnes.forEach((fn) => fn());
}
export const lireEtatSync = (): EtatSync => etat;
export const surEtatSync = (fn: () => void) => {
  abonnes.add(fn);
  return () => void abonnes.delete(fn);
};

export async function compterEnAttente(): Promise<number> {
  const comptes = await Promise.all(TABLES_SYNC.map((nom) => tableDe(nom).where('dirty').equals(1).count()));
  return comptes.reduce((a, b) => a + b, 0);
}

let distant: DepotDistant | null = null;
let utilisateur: Utilisateur | null = null;
let enCours = false;
let relancer = false;

const TAILLE_LOT = 100;
const MAX_PAGES = 200;

/** Retire les champs purement locaux avant l'envoi au serveur. */
function versLigneDistante(ligne: LigneLocale): LigneDistante {
  const propre = Object.fromEntries(Object.entries(ligne).filter(([cle]) => cle !== 'dirty' && cle !== 'blob'));
  return propre as LigneDistante;
}

/** Téléverse les photos qui ne sont pas encore dans le Storage et renseigne leur chemin. */
async function envoyerPhotos(lot: LigneLocale[], idUtilisateur: string, depot: DepotDistant) {
  for (const ligne of lot) {
    const photo = ligne as unknown as Photo;
    if (photo.deletedAt || photo.storagePath || !photo.blob) continue;
    const chemin = `${idUtilisateur}/${photo.visiteId}/${photo.id}.jpg`;
    await depot.envoyerPhoto(chemin, photo.blob, photo.mime || 'image/jpeg');
    // `update` sans toucher à updatedAt : la ligne reste « à envoyer » jusqu'à l'upsert ci-dessous.
    await db.photos.update(photo.id, { storagePath: chemin });
    ligne.storagePath = chemin;
  }
}

async function pousserTable(nom: NomTable, depot: DepotDistant, idUtilisateur: string) {
  const table = tableDe(nom);
  const echecs = new Map<string, string>();
  for (;;) {
    const lot = await table
      .where('dirty')
      .equals(1)
      .filter((l) => !echecs.has(l.id))
      .limit(TAILLE_LOT)
      .toArray();
    if (lot.length === 0) break;

    const envoyees: LigneLocale[] = [];
    try {
      if (nom === 'photos') await envoyerPhotos(lot, idUtilisateur, depot);
      await depot.pousser(nom, lot.map(versLigneDistante));
      envoyees.push(...lot);
    } catch (e) {
      // Une ligne défectueuse ne doit pas bloquer toutes les autres : on réessaie ligne par ligne.
      if (lot.length === 1) {
        echecs.set(lot[0].id, e instanceof Error ? e.message : String(e));
      } else {
        for (const ligne of lot) {
          try {
            if (nom === 'photos') await envoyerPhotos([ligne], idUtilisateur, depot);
            await depot.pousser(nom, [versLigneDistante(ligne)]);
            envoyees.push(ligne);
          } catch (e2) {
            echecs.set(ligne.id, e2 instanceof Error ? e2.message : String(e2));
          }
        }
      }
    }

    // On ne retire « dirty » que si la ligne n'a pas été modifiée pendant l'envoi.
    await db.transaction('rw', table, async () => {
      for (const ligne of envoyees) {
        const courante = await table.get(ligne.id);
        if (courante && courante.updatedAt === ligne.updatedAt) await table.update(ligne.id, { dirty: 0 });
      }
    });
  }
  if (echecs.size > 0) {
    const [id, message] = [...echecs.entries()][0];
    throw new Error(`${nom} (${id.slice(0, 8)}…) : ${message}`);
  }
}

async function tirerTable(nom: NomTable, depot: DepotDistant) {
  const table = tableDe(nom);
  const cleCurseur = `curseur:${nom}`;
  let curseur = (await db.meta.get(cleCurseur))?.valeur ?? null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const resultat = await depot.tirer(nom, curseur);
    if (resultat.lignes.length > 0) {
      await db.transaction('rw', table, async () => {
        for (const distante of resultat.lignes) {
          const locale = await table.get(distante.id);
          // Modification locale non envoyée et plus récente : on la garde, elle partira au prochain envoi.
          if (locale && locale.dirty === 1 && locale.updatedAt >= distante.updatedAt) continue;
          const { serveurLe: _ignore, ...reste } = distante as Record<string, unknown>;
          void _ignore;
          const fusion: Record<string, unknown> = { ...reste, dirty: 0 };
          if (locale?.blob) fusion.blob = locale.blob;
          await table.put(fusion as LigneLocale);
        }
      });
    }
    const precedent = curseur;
    curseur = resultat.curseur ?? curseur;
    if (curseur && curseur !== precedent) await db.meta.put({ cle: cleCurseur, valeur: curseur });
    if (resultat.fini || curseur === precedent) break;
  }
}

/** Lance un cycle complet (sans effet hors ligne ou en mode local). Les appels simultanés sont regroupés. */
export async function synchroniser(): Promise<void> {
  const depot = distant;
  const user = utilisateur;
  if (!depot || !user) return;
  if (!navigator.onLine) {
    majEtat({ enLigne: false });
    return;
  }
  if (enCours) {
    relancer = true;
    return;
  }
  enCours = true;
  majEtat({ enCours: true, enLigne: true });
  try {
    for (const nom of TABLES_SYNC) await pousserTable(nom, depot, user.id);
    for (const nom of TABLES_SYNC) await tirerTable(nom, depot);
    try {
      const utilisateurs = await depot.listerUtilisateurs();
      if (utilisateurs.length > 0) await db.utilisateurs.bulkPut(utilisateurs);
    } catch {
      /* la liste des utilisateurs n'est pas critique */
    }
    const instant = maintenant();
    await db.meta.put({ cle: 'derniereSynchro', valeur: instant });
    majEtat({ derniereSynchro: instant, erreur: null });
  } catch (e) {
    majEtat({ erreur: e instanceof Error ? e.message : String(e) });
  } finally {
    enCours = false;
    majEtat({ enCours: false, enAttente: await compterEnAttente() });
    if (relancer) {
      relancer = false;
      void synchroniser();
    }
  }
}

let arret: (() => void) | null = null;

/** Démarre la synchronisation automatique (démarrage, retour du réseau, après chaque modification, toutes les minutes). */
export function demarrerSync(depot: DepotDistant, user: Utilisateur): () => void {
  arreterSync();
  distant = depot;
  utilisateur = user;
  majEtat({ actif: true, enLigne: navigator.onLine, erreur: null });

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const planifier = () => {
    void compterEnAttente().then((n) => majEtat({ enAttente: n }));
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(() => void synchroniser(), 2500);
  };
  const retourReseau = () => {
    majEtat({ enLigne: true });
    void synchroniser();
  };
  const perteReseau = () => majEtat({ enLigne: false });
  const retourAppli = () => {
    if (document.visibilityState === 'visible') void synchroniser();
  };

  window.addEventListener('online', retourReseau);
  window.addEventListener('offline', perteReseau);
  document.addEventListener('visibilitychange', retourAppli);
  const desabonner = surModificationLocale(planifier);
  const intervalle = setInterval(() => void synchroniser(), 60_000);

  void db.meta.get('derniereSynchro').then((m) => m && majEtat({ derniereSynchro: m.valeur }));
  void compterEnAttente().then((n) => majEtat({ enAttente: n }));
  void synchroniser();

  arret = () => {
    window.removeEventListener('online', retourReseau);
    window.removeEventListener('offline', perteReseau);
    document.removeEventListener('visibilitychange', retourAppli);
    desabonner();
    clearInterval(intervalle);
    if (minuteur) clearTimeout(minuteur);
  };
  return arreterSync;
}

export function arreterSync() {
  arret?.();
  arret = null;
  distant = null;
  utilisateur = null;
  majEtat({ actif: false, enCours: false });
}
