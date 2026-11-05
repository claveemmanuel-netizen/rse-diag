import { db } from '../db/base';
import type { NoteVocale, Photo, Prospect, Recommandation, Reponse, Site, StatutCommercial, Utilisateur, Visite, Zone } from '../domain/types';

/** Toutes les données d'une visite, lues dans la base locale (suppressions logiques écartées). */
export interface DonneesVisite {
  visite: Visite;
  site: Site | null;
  prospect: Prospect | null;
  statut: StatutCommercial | null;
  chargeAffaires: Utilisateur | null;
  reponses: Reponse[];
  zones: Zone[];
  photos: Photo[];
  notes: NoteVocale[];
  recommandations: Recommandation[];
}

const actives = <T extends { deletedAt?: string | null }>(l: T[]): T[] => l.filter((x) => !x.deletedAt);

export async function chargerDonneesVisite(visiteId: string): Promise<DonneesVisite | null> {
  const visite = await db.visites.get(visiteId);
  if (!visite || visite.deletedAt) return null;
  const site = (await db.sites.get(visite.siteId)) ?? null;
  const prospect = site ? ((await db.prospects.get(site.prospectId)) ?? null) : null;
  const statut = (await db.statuts.get(visiteId)) ?? null;
  const [reponses, zones, photos, notes, recommandations, chargeAffaires] = await Promise.all([
    db.reponses.where('visiteId').equals(visiteId).toArray(),
    db.zones.where('visiteId').equals(visiteId).toArray(),
    db.photos.where('visiteId').equals(visiteId).toArray(),
    db.notesVocales.where('visiteId').equals(visiteId).toArray(),
    db.recommandations.where('visiteId').equals(visiteId).toArray(),
    db.utilisateurs.get(visite.utilisateurId),
  ]);
  return {
    visite,
    site,
    prospect,
    statut: statut && !statut.deletedAt ? statut : null,
    chargeAffaires: chargeAffaires ?? null,
    reponses: actives(reponses),
    zones: actives(zones).sort((a, b) => a.ordre - b.ordre),
    photos: actives(photos).sort((a, b) => a.prisLe.localeCompare(b.prisLe)),
    notes: actives(notes).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
    recommandations: actives(recommandations).sort((a, b) => a.priorite - b.priorite),
  };
}

export async function chargerToutesLesVisites(): Promise<DonneesVisite[]> {
  const ids = actives(await db.visites.toArray()).map((v) => v.id);
  const liste = await Promise.all(ids.map(chargerDonneesVisite));
  return liste.filter((d): d is DonneesVisite => d !== null);
}
