import type { Table } from 'dexie';
import { db } from '../db/base';
import type {
  Entite,
  EtatVisite,
  NoteVocale,
  Photo,
  Prospect,
  Recommandation,
  Reponse,
  Site,
  StatutCommercial,
  StatutVisite,
  Visite,
  Zone,
} from '../domain/types';
import { cumulerChrono } from '../lib/chrono';
import { maintenant, nouvelId } from '../lib/outils';
import { referentielActif, referentielPour } from '../referentiel';
import { calculerScores, type Reponses, type ResultatScores, type ValeurReponse } from '../scoring/moteur';

// Couche « repository » LOCALE : toute l'application lit et écrit ici (IndexedDB).
// La synchronisation avec le serveur (Supabase ou autre) est assurée à part par `sync.ts`,
// à travers l'interface `DepotDistant` : changer de backend ne touche pas à ce fichier.

export type Saisie<T extends Entite> = Omit<T, keyof Entite>;
type SansTechnique<T extends Entite> = Omit<T, 'updatedAt' | 'dirty'>;

/** Écrit une ligne en la marquant « à synchroniser ». */
async function ecrire<T extends Entite>(table: Table<T, string>, ligne: SansTechnique<T>): Promise<T> {
  const complete = { ...ligne, updatedAt: maintenant(), dirty: 1 } as T;
  await table.put(complete);
  declencherSync();
  return complete;
}

// Lecture + écriture dans une même transaction : deux modifications rapprochées de la même ligne
// (ex. sortie d'un champ puis appui sur un bouton) ne s'écrasent pas.
async function modifier<T extends Entite>(table: Table<T, string>, id: string, patch: Partial<SansTechnique<T>>): Promise<T | undefined> {
  return db.transaction('rw', table, async () => {
    const existant = await table.get(id);
    if (!existant) return undefined;
    return ecrire(table, { ...existant, ...patch } as SansTechnique<T>);
  });
}

// ─── Signal de synchronisation ──────────────────────────────────────────────
// Évite une dépendance circulaire : le synchroniseur s'abonne à ce signal.
type Ecouteur = () => void;
const ecouteursSync = new Set<Ecouteur>();
export const surModificationLocale = (fn: Ecouteur) => {
  ecouteursSync.add(fn);
  return () => void ecouteursSync.delete(fn);
};
function declencherSync() {
  ecouteursSync.forEach((fn) => fn());
}

// ─── Prospects, sites, visites ──────────────────────────────────────────────

export interface NouvelleVisite {
  prospect: Saisie<Prospect>;
  site: Omit<Saisie<Site>, 'prospectId'>;
  utilisateurId: string;
  datePrevue?: string | null;
}

/** Crée prospect + site + visite + statut commercial initial, en une seule transaction. */
export async function creerVisite({ prospect, site, utilisateurId, datePrevue }: NouvelleVisite): Promise<string> {
  const prospectId = nouvelId();
  const siteId = nouvelId();
  const visiteId = nouvelId();
  await db.transaction('rw', [db.prospects, db.sites, db.visites, db.statuts], async () => {
    await ecrire(db.prospects, { ...prospect, id: prospectId });
    await ecrire(db.sites, { ...site, id: siteId, prospectId });
    await ecrire(db.visites, {
      id: visiteId,
      siteId,
      utilisateurId,
      referentielVersion: referentielActif.version,
      datePrevue: datePrevue ?? null,
      etat: 'preparee',
      sectionsIgnorees: [],
      rgpdInformee: false,
      consentementRapport: false,
    });
    await ecrire(db.statuts, { id: visiteId, visiteId, statut: 'a_rediger', historique: [] });
  });
  return visiteId;
}

export async function mettreAJourProspectEtSite(
  visiteId: string,
  prospectPatch: Partial<Saisie<Prospect>>,
  sitePatch: Partial<Saisie<Site>>,
  visitePatch: Partial<Saisie<Visite>> = {},
): Promise<void> {
  await db.transaction('rw', [db.prospects, db.sites, db.visites], async () => {
    const visite = await db.visites.get(visiteId);
    if (!visite) return;
    const site = await db.sites.get(visite.siteId);
    if (!site) return;
    await modifier(db.prospects, site.prospectId, prospectPatch);
    await modifier(db.sites, site.id, sitePatch);
    if (Object.keys(visitePatch).length) await modifier(db.visites, visiteId, visitePatch);
  });
}

export const modifierVisite = (id: string, patch: Partial<Saisie<Visite>>) => modifier(db.visites, id, patch);

export async function supprimerVisite(id: string): Promise<void> {
  await modifier(db.visites, id, { deletedAt: maintenant() });
}

/** Passe la visite « en cours » (première ouverture ou première réponse). */
export async function assurerVisiteEnCours(visiteId: string): Promise<void> {
  await db.transaction('rw', db.visites, async () => {
    const v = await db.visites.get(visiteId);
    if (v && v.etat === 'preparee') {
      await modifier(db.visites, visiteId, { etat: 'en_cours' as EtatVisite, dateDebut: maintenant() });
    }
  });
}

export async function memoriserRoute(visiteId: string, route: string): Promise<void> {
  await db.transaction('rw', db.visites, async () => {
    const v = await db.visites.get(visiteId);
    if (v && v.derniereRoute !== route) await modifier(db.visites, visiteId, { derniereRoute: route });
  });
}

/** Enregistre le temps passé sur une section (ou « zones ») ; sans écriture si rien n'a avancé. */
export async function enregistrerChrono(visiteId: string, cle: string, secondes: number): Promise<void> {
  await db.transaction('rw', db.visites, async () => {
    const v = await db.visites.get(visiteId);
    if (!v) return;
    const chronos = cumulerChrono(v.chronos, cle, secondes, maintenant());
    if (chronos !== v.chronos) await modifier(db.visites, visiteId, { chronos });
  });
}

export async function basculerSectionIgnoree(visiteId: string, sectionId: string, ignoree: boolean): Promise<void> {
  await db.transaction('rw', db.visites, async () => {
    const v = await db.visites.get(visiteId);
    if (!v) return;
    const actuel = new Set(v.sectionsIgnorees);
    if (ignoree) actuel.add(sectionId);
    else actuel.delete(sectionId);
    if (actuel.size === v.sectionsIgnorees.length && actuel.has(sectionId) === v.sectionsIgnorees.includes(sectionId)) return;
    await modifier(db.visites, visiteId, { sectionsIgnorees: [...actuel] });
  });
}

export async function terminerVisite(visiteId: string): Promise<void> {
  await modifier(db.visites, visiteId, { etat: 'terminee', dateFin: maintenant() });
  await recalculerScores(visiteId);
}

export async function rouvrirVisite(visiteId: string): Promise<void> {
  await modifier(db.visites, visiteId, { etat: 'en_cours', dateFin: null });
}

// ─── Réponses ───────────────────────────────────────────────────────────────

export const idReponse = (visiteId: string, questionId: string) => `${visiteId}:${questionId}`;

export async function enregistrerReponse(
  visiteId: string,
  questionId: string,
  patch: { valeur?: ValeurReponse; commentaire?: string },
): Promise<void> {
  const id = idReponse(visiteId, questionId);
  // Transaction : une valeur et un commentaire enregistrés presque en même temps ne s'écrasent pas.
  await db.transaction('rw', db.reponses, async () => {
    const existante = await db.reponses.get(id);
    await ecrire(db.reponses, {
      ...(existante ?? { id, visiteId, questionId, valeur: null }),
      ...patch,
      deletedAt: null,
    } as SansTechnique<Reponse>);
  });
  await assurerVisiteEnCours(visiteId);
  planifierRecalcul(visiteId);
}

export async function lireReponses(visiteId: string): Promise<Reponse[]> {
  const toutes = await db.reponses.where('visiteId').equals(visiteId).toArray();
  return toutes.filter((r) => !r.deletedAt);
}

export const reponsesEnTable = (liste: Reponse[]): Reponses =>
  Object.fromEntries(liste.map((r) => [r.questionId, r.valeur])) as Reponses;

// ─── Zones ──────────────────────────────────────────────────────────────────

export async function ajouterZone(visiteId: string, typeId: string): Promise<string> {
  const existantes = await db.zones.where('visiteId').equals(visiteId).toArray();
  const ordre = existantes.reduce((m, z) => Math.max(m, z.ordre), 0) + 1;
  const id = nouvelId();
  await ecrire(db.zones, { id, visiteId, typeId, ordre, etatId: null, tailleId: null, surfaceM2: null });
  await assurerVisiteEnCours(visiteId);
  return id;
}

export const modifierZone = (id: string, patch: Partial<Saisie<Zone>>) => modifier(db.zones, id, patch);

export async function supprimerZone(id: string): Promise<void> {
  const maintenantIso = maintenant();
  await db.transaction('rw', [db.zones, db.photos], async () => {
    await modifier(db.zones, id, { deletedAt: maintenantIso });
    const photos = await db.photos.where('zoneId').equals(id).toArray();
    for (const p of photos) await modifier(db.photos, p.id, { deletedAt: maintenantIso });
  });
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export async function ajouterPhoto(photo: Omit<Saisie<Photo>, 'storagePath'>): Promise<string> {
  const id = nouvelId();
  await ecrire(db.photos, { ...photo, id, storagePath: null });
  await assurerVisiteEnCours(photo.visiteId);
  return id;
}

export const modifierPhoto = (id: string, patch: Partial<Saisie<Photo>>) => modifier(db.photos, id, patch);

export async function supprimerPhoto(id: string): Promise<void> {
  await modifier(db.photos, id, { deletedAt: maintenant() });
}

// ─── Notes vocales (transcriptions) ─────────────────────────────────────────

export async function ajouterNoteVocale(visiteId: string, texte: string, contexte?: string | null): Promise<string> {
  const id = nouvelId();
  await ecrire(db.notesVocales, { id, visiteId, texte, contexte: contexte ?? null });
  await assurerVisiteEnCours(visiteId);
  return id;
}

export const modifierNoteVocale = (id: string, patch: Partial<Saisie<NoteVocale>>) => modifier(db.notesVocales, id, patch);

export async function supprimerNoteVocale(id: string): Promise<void> {
  await modifier(db.notesVocales, id, { deletedAt: maintenant() });
}

// ─── Statut commercial ──────────────────────────────────────────────────────

export async function definirStatutCommercial(
  visiteId: string,
  patch: { statut?: StatutVisite; prochaineAction?: string; dateRelance?: string | null },
  parId: string,
): Promise<void> {
  await db.transaction('rw', db.statuts, async () => {
    const existant = await db.statuts.get(visiteId);
    const base: SansTechnique<StatutCommercial> = existant ?? { id: visiteId, visiteId, statut: 'a_rediger', historique: [] };
    const historique = [...base.historique];
    if (patch.statut && patch.statut !== base.statut) historique.push({ statut: patch.statut, date: maintenant(), par: parId });
    await ecrire(db.statuts, { ...base, ...patch, historique, deletedAt: null });
  });
}

// ─── Recommandations manuelles ──────────────────────────────────────────────

export async function ajouterRecommandationManuelle(visiteId: string, titre: string, texte: string): Promise<void> {
  const existantes = await db.recommandations.where('visiteId').equals(visiteId).toArray();
  const priorite = existantes.reduce((m, r) => Math.max(m, r.priorite), 0) + 1;
  await ecrire(db.recommandations, { id: nouvelId(), visiteId, titre, texte, priorite, source: 'manuelle', retenue: true });
}

export const modifierRecommandation = (id: string, patch: Partial<Saisie<Recommandation>>) => modifier(db.recommandations, id, patch);

export async function supprimerRecommandation(id: string): Promise<void> {
  await modifier(db.recommandations, id, { deletedAt: maintenant() });
}

// ─── Scores et recommandations automatiques ─────────────────────────────────

const minuteurs = new Map<string, ReturnType<typeof setTimeout>>();

/** Recalcule les scores un court instant après la dernière réponse (évite de recalculer à chaque frappe). */
export function planifierRecalcul(visiteId: string, delaiMs = 1200): void {
  const precedent = minuteurs.get(visiteId);
  if (precedent) clearTimeout(precedent);
  minuteurs.set(
    visiteId,
    setTimeout(() => {
      minuteurs.delete(visiteId);
      void recalculerScores(visiteId).catch((e) => console.error('Recalcul des scores impossible', e));
    }, delaiMs),
  );
}

/** Recalcule scores + quick wins d'une visite et met à jour les tables Score et Recommandation. */
export async function recalculerScores(visiteId: string): Promise<ResultatScores | undefined> {
  const visite = await db.visites.get(visiteId);
  if (!visite) return undefined;
  const ref = referentielPour(visite.referentielVersion);
  const reponses = reponsesEnTable(await lireReponses(visiteId));
  const resultat = calculerScores(ref, reponses);

  const lignes: { pilier: string; score: number | null; niveauId: string | null; couverture: number }[] = [
    ...resultat.piliers.map((p) => ({ pilier: p.sectionId, score: p.score, niveauId: p.niveau?.id ?? null, couverture: arrondi2(p.couverture) })),
    { pilier: 'global', score: resultat.global.score, niveauId: resultat.global.niveau?.id ?? null, couverture: arrondi2(resultat.global.couverture) },
  ];

  await db.transaction('rw', [db.scores, db.recommandations], async () => {
    for (const l of lignes) {
      const id = `${visiteId}:${l.pilier}`;
      const ancien = await db.scores.get(id);
      if (ancien && ancien.score === l.score && ancien.niveauId === l.niveauId && ancien.couverture === l.couverture && !ancien.deletedAt) continue;
      await ecrire(db.scores, { id, visiteId, ...l, deletedAt: null });
    }

    // Recommandations automatiques : mises à jour, en conservant le choix « retenue » de l'utilisateur.
    const existantes = await db.recommandations.where('visiteId').equals(visiteId).toArray();
    const autos = new Map(existantes.filter((r) => r.source === 'auto').map((r) => [r.id, r]));
    const vus = new Set<string>();
    for (const [i, w] of resultat.quickWins.entries()) {
      const id = `${visiteId}:${w.questionId}`;
      vus.add(id);
      const ancienne = autos.get(id);
      const nouvelle = { titre: w.titre, texte: w.texte, priorite: i + 1, pilier: w.sectionId, prestationId: w.prestationId ?? null };
      if (
        ancienne && !ancienne.deletedAt && ancienne.titre === nouvelle.titre && ancienne.texte === nouvelle.texte &&
        ancienne.priorite === nouvelle.priorite && ancienne.prestationId === nouvelle.prestationId
      ) continue;
      await ecrire(db.recommandations, {
        id,
        visiteId,
        questionId: w.questionId,
        source: 'auto',
        retenue: ancienne && !ancienne.deletedAt ? ancienne.retenue : true,
        ...nouvelle,
        deletedAt: null,
      });
    }
    for (const [id, r] of autos) {
      if (!vus.has(id) && !r.deletedAt) await ecrire(db.recommandations, { ...r, deletedAt: maintenant() });
    }
  });
  return resultat;
}

const arrondi2 = (n: number) => Math.round(n * 100) / 100;
