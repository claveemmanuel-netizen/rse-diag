import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/base';
import type { NoteVocale, Photo, Prospect, Recommandation, Reponse, ScoreEnregistre, Site, StatutCommercial, Visite, Zone } from '../domain/types';
import { reponsesEnTable } from '../repository/depot';
import type { Reponses } from '../scoring/moteur';

// Lecture « en direct » de la base locale : l'écran se met à jour dès qu'une donnée change (y compris après une synchro).
// Convention : `undefined` = chargement en cours ; `null` = introuvable.

const actives = <T extends { deletedAt?: string | null }>(liste: T[]): T[] => liste.filter((x) => !x.deletedAt);

export interface DossierVisite {
  visite: Visite;
  site: Site | null;
  prospect: Prospect | null;
}

export function useDossierVisite(visiteId: string | undefined): DossierVisite | null | undefined {
  return useLiveQuery(
    async () => {
      if (!visiteId) return null;
      const visite = await db.visites.get(visiteId);
      if (!visite || visite.deletedAt) return null;
      const site = (await db.sites.get(visite.siteId)) ?? null;
      const prospect = site ? ((await db.prospects.get(site.prospectId)) ?? null) : null;
      return { visite, site, prospect };
    },
    [visiteId],
    undefined,
  );
}

export function useReponses(visiteId: string): { liste: Reponse[]; table: Reponses } | undefined {
  const liste = useLiveQuery(async () => actives(await db.reponses.where('visiteId').equals(visiteId).toArray()), [visiteId]);
  return useMemo(() => (liste ? { liste, table: reponsesEnTable(liste) } : undefined), [liste]);
}

export const useZones = (visiteId: string): Zone[] | undefined =>
  useLiveQuery(async () => actives(await db.zones.where('visiteId').equals(visiteId).toArray()).sort((a, b) => a.ordre - b.ordre), [visiteId]);

export const usePhotos = (visiteId: string): Photo[] | undefined =>
  useLiveQuery(async () => actives(await db.photos.where('visiteId').equals(visiteId).toArray()).sort((a, b) => a.prisLe.localeCompare(b.prisLe)), [visiteId]);

export const useNotesVocales = (visiteId: string): NoteVocale[] | undefined =>
  useLiveQuery(async () => actives(await db.notesVocales.where('visiteId').equals(visiteId).toArray()).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)), [visiteId]);

export const useScoresEnregistres = (visiteId: string): ScoreEnregistre[] | undefined =>
  useLiveQuery(async () => actives(await db.scores.where('visiteId').equals(visiteId).toArray()), [visiteId]);

export const useRecommandations = (visiteId: string): Recommandation[] | undefined =>
  useLiveQuery(
    async () => actives(await db.recommandations.where('visiteId').equals(visiteId).toArray()).sort((a, b) => a.priorite - b.priorite),
    [visiteId],
  );

export const useStatut = (visiteId: string): StatutCommercial | null | undefined =>
  useLiveQuery(async () => {
    const s = await db.statuts.get(visiteId);
    return s && !s.deletedAt ? s : null;
  }, [visiteId]);

/** Ligne de liste (accueil terrain et tableau de bord bureau). */
export interface ResumeVisite {
  visite: Visite;
  site: Site | null;
  prospect: Prospect | null;
  statut: StatutCommercial | null;
  scoreGlobal: number | null;
  niveauId: string | null;
  nbPhotos: number;
  nbZones: number;
}

/** Résumé de toutes les visites locales (le terrain ne voit que les siennes ; le bureau, tout ce qui est synchronisé). */
export function useResumesVisites(utilisateurId?: string): ResumeVisite[] | undefined {
  return useLiveQuery(async () => {
    const visites = actives(await db.visites.toArray()).filter((v) => !utilisateurId || v.utilisateurId === utilisateurId);
    const resumes = await Promise.all(
      visites.map(async (visite): Promise<ResumeVisite> => {
        const site = (await db.sites.get(visite.siteId)) ?? null;
        const prospect = site ? ((await db.prospects.get(site.prospectId)) ?? null) : null;
        const statutBrut = await db.statuts.get(visite.id);
        const global = await db.scores.get(`${visite.id}:global`);
        const nbPhotos = (await db.photos.where('visiteId').equals(visite.id).toArray()).filter((p) => !p.deletedAt).length;
        const nbZones = (await db.zones.where('visiteId').equals(visite.id).toArray()).filter((z) => !z.deletedAt).length;
        return {
          visite,
          site,
          prospect,
          statut: statutBrut && !statutBrut.deletedAt ? statutBrut : null,
          scoreGlobal: global?.score ?? null,
          niveauId: global?.niveauId ?? null,
          nbPhotos,
          nbZones,
        };
      }),
    );
    return resumes.sort((a, b) => (b.visite.dateDebut ?? b.visite.datePrevue ?? b.visite.updatedAt).localeCompare(a.visite.dateDebut ?? a.visite.datePrevue ?? a.visite.updatedAt));
  }, [utilisateurId]);
}
