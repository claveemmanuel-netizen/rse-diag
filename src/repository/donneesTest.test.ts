import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/base';
import { estRepondue, questionsVisibles } from '../scoring/moteur';
import { generateurAlea, valeurTest } from '../lib/donneesTest';
import { referentielActif } from '../referentiel';
import { creerVisite, enregistrerReponse, lireReponses, reponsesEnTable } from './depot';
import { creerVisiteTest, remplirSectionTest, remplirVisiteTest } from './donneesTest';

const fabriquePhoto = async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), largeur: 800, hauteur: 600 });
const sansImages = { graine: 42, images: false } as const;

async function compter(visiteId: string) {
  const vivants = <T extends { deletedAt?: string | null }>(l: T[]) => l.filter((x) => !x.deletedAt).length;
  return {
    reponses: (await lireReponses(visiteId)).length,
    zones: vivants(await db.zones.where('visiteId').equals(visiteId).toArray()),
    photos: vivants(await db.photos.where('visiteId').equals(visiteId).toArray()),
    notes: vivants(await db.notesVocales.where('visiteId').equals(visiteId).toArray()),
  };
}

describe('données de test', () => {
  it('répond à toutes les questions visibles, sans toucher aux questions masquées', async () => {
    const id = await creerVisiteTest('u-test', sansImages);
    const reponses = reponsesEnTable(await lireReponses(id));
    const visibles = questionsVisibles(referentielActif, reponses);

    const aRepondre = referentielActif.sections.flatMap((s) => s.questions).filter((q) => q.type !== 'photo' && visibles.has(q.id));
    expect(aRepondre.length).toBeGreaterThan(30);
    expect(aRepondre.filter((q) => !estRepondue(reponses[q.id]))).toEqual([]);
    expect(Object.keys(reponses).filter((q) => estRepondue(reponses[q]) && !visibles.has(q))).toEqual([]);
  });

  it('complète la fiche, le RGPD, les zones, les notes, le statut et les scores sans clôturer la visite', async () => {
    const id = await creerVisiteTest('u-test', sansImages);
    const visite = (await db.visites.get(id))!;
    const site = (await db.sites.get(visite.siteId))!;
    const prospect = (await db.prospects.get(site.prospectId))!;
    const statut = (await db.statuts.get(id))!;

    expect(prospect.raisonSociale).toMatch(/^\[TEST\]/);
    expect(prospect.contactEmail).toMatch(/\.example$/);
    expect(visite).toMatchObject({ etat: 'en_cours', rgpdInformee: true, consentementRapport: true });
    expect(visite.notesSynthese).toBeTruthy();
    expect(statut.prochaineAction).toBeTruthy();
    expect(statut.dateRelance).toBeTruthy();
    expect((await compter(id)).zones).toBeGreaterThanOrEqual(5);
    expect((await compter(id)).notes).toBe(3);
    const scores = await db.scores.where('visiteId').equals(id).toArray();
    expect(scores.find((s) => s.pilier === 'global')?.score).not.toBeNull();
  });

  it("est idempotent : relancer le remplissage n'ajoute ni zone, ni note, ni photo", async () => {
    const id = await creerVisiteTest('u-test', { graine: 7, fabriquePhoto, fabriqueSignature: () => 'data:image/png;base64,AAAA' });
    const avant = await compter(id);
    expect(avant.photos).toBeGreaterThan(0);

    const bilan = await remplirVisiteTest(id, { graine: 8, fabriquePhoto, fabriqueSignature: () => 'data:image/png;base64,BBBB' });
    expect(bilan).toEqual({ reponses: 0, zones: 0, photos: 0, notes: 0 });
    expect(await compter(id)).toEqual(avant);
    expect((await db.visites.get(id))?.signature).toBe('data:image/png;base64,AAAA');
  });

  it('ne modifie jamais ce que l’utilisateur a déjà saisi', async () => {
    const id = await creerVisite({
      prospect: { raisonSociale: 'Ma société réelle', creePar: 'u1' },
      site: { adresse: '1 rue Réelle' },
      utilisateurId: 'u1',
    });
    const premiere = referentielActif.sections.flatMap((s) => s.questions).find((q) => q.type === 'bool' && !q.afficherSi)!;
    await enregistrerReponse(id, premiere.id, { valeur: 'non', commentaire: 'Saisi à la main' });

    await remplirVisiteTest(id, sansImages);

    const site = (await db.sites.get((await db.visites.get(id))!.siteId))!;
    const prospect = (await db.prospects.get(site.prospectId))!;
    expect(prospect.raisonSociale).toBe('Ma société réelle');
    expect(site.adresse).toBe('1 rue Réelle');
    expect(prospect.contactNom).toBeTruthy();
    const reponse = (await lireReponses(id)).find((r) => r.questionId === premiere.id);
    expect(reponse).toMatchObject({ valeur: 'non', commentaire: 'Saisi à la main' });
  });

  it("remplit une seule section à la fois", async () => {
    const id = await creerVisite({ prospect: { raisonSociale: 'Société', creePar: 'u1' }, site: { adresse: 'Adresse' }, utilisateurId: 'u1' });
    const section = referentielActif.sections.find((s) => s.type === 'pilier')!;
    const nombre = await remplirSectionTest(id, section.id, 3);

    const idsSection = new Set(section.questions.map((q) => q.id));
    const reponses = await lireReponses(id);
    expect(nombre).toBeGreaterThan(0);
    expect(reponses.every((r) => idsSection.has(r.questionId))).toBe(true);
  });
});

describe('valeurTest', () => {
  it('reste dans les bornes (nombres) et dans les options proposées (choix)', () => {
    const alea = generateurAlea(1);
    for (const q of referentielActif.sections.flatMap((s) => s.questions)) {
      for (let i = 0; i < 20; i++) {
        const v = valeurTest(q, alea);
        if (q.type === 'nombre') {
          expect(v).toBeGreaterThanOrEqual(q.min ?? 0);
          expect(v).toBeLessThanOrEqual(q.max ?? 100);
        }
        if (q.type === 'choix') {
          const valides = new Set(q.options.map((o) => o.valeur));
          for (const x of Array.isArray(v) ? v : [v]) expect(valides.has(x as string)).toBe(true);
        }
      }
    }
  });

  it('est reproductible pour une même graine', () => {
    const q = referentielActif.sections.flatMap((s) => s.questions).find((x) => x.type === 'bool')!;
    expect(valeurTest(q, generateurAlea(5))).toBe(valeurTest(q, generateurAlea(5)));
  });
});
