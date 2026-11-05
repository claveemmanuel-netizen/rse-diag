import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/base';
import { ajouterZone, creerVisite, definirStatutCommercial, enregistrerChrono, modifierZone } from './depot';

describe('chronomètre par section', () => {
  it('enregistre le temps dans la visite (marquée à synchroniser), sans jamais reculer', async () => {
    const id = await creerVisite({ prospect: { raisonSociale: 'ACME', creePar: 'u1' }, site: { adresse: '1 rue des Tilleuls' }, utilisateurId: 'u1' });
    await db.visites.update(id, { dirty: 0 });

    await enregistrerChrono(id, 'biodiversite', 0);
    const debut = (await db.visites.get(id))?.chronos?.biodiversite.debutLe;
    expect(debut).toBeTruthy();

    await Promise.all([enregistrerChrono(id, 'biodiversite', 95), enregistrerChrono(id, 'zones', 40)]);
    await enregistrerChrono(id, 'biodiversite', 60);
    const visite = await db.visites.get(id);
    expect(visite?.chronos).toEqual({ biodiversite: { secondes: 95, debutLe: debut }, zones: { secondes: 40, debutLe: expect.any(String) } });
    expect(visite?.dirty).toBe(1);
  });
});

describe('écritures locales concurrentes', () => {
  it("ne perd aucune modification quand plusieurs champs d'une même zone sont enregistrés en même temps", async () => {
    const id = await ajouterZone('visite-1', 'pelouse');
    await Promise.all([modifierZone(id, { nom: 'Pelouse nord' }), modifierZone(id, { tailleId: 'moyen' }), modifierZone(id, { surfaceM2: 120 }), modifierZone(id, { note: 'Tonte à revoir' })]);
    const zone = await db.zones.get(id);
    expect(zone).toMatchObject({ nom: 'Pelouse nord', tailleId: 'moyen', surfaceM2: 120, note: 'Tonte à revoir' });
  });

  it("conserve la prochaine action et la date de relance saisies en même temps qu'un changement de statut", async () => {
    await Promise.all([
      definirStatutCommercial('visite-2', { prochaineAction: 'Envoyer le devis' }, 'u1'),
      definirStatutCommercial('visite-2', { dateRelance: '2030-01-15' }, 'u1'),
      definirStatutCommercial('visite-2', { statut: 'devis_a_faire' }, 'u1'),
    ]);
    const statut = await db.statuts.get('visite-2');
    expect(statut).toMatchObject({ statut: 'devis_a_faire', prochaineAction: 'Envoyer le devis', dateRelance: '2030-01-15' });
    expect(statut?.historique).toHaveLength(1);
  });
});
