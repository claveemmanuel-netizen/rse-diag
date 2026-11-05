import { describe, expect, it } from 'vitest';
import type { Photo, Prospect, Reponse, Site, Visite } from '../domain/types';
import { cellule, construireCsv } from './csv';
import type { DonneesVisite } from './donnees';
import { construireExportVisite, VERSION_SCHEMA_EXPORT } from './json';
import { referentielActif } from '../referentiel';

const base = { updatedAt: '2025-06-01T10:00:00.000Z', dirty: 0 as const };

function donnees(surcharge: Partial<DonneesVisite> = {}): DonneesVisite {
  const visite: Visite = {
    ...base,
    id: 'v1',
    siteId: 's1',
    utilisateurId: 'u1',
    referentielVersion: referentielActif.version,
    etat: 'terminee',
    sectionsIgnorees: [],
    rgpdInformee: true,
    consentementRapport: true,
    signature: 'data:image/png;base64,AAAA',
    datePrevue: '2025-06-01',
  };
  const prospect: Prospect = { ...base, id: 'p1', raisonSociale: 'Acme; "Logistique"', siret: '12345678900011', contactNom: 'Jeanne Martin', contactEmail: 'jeanne@acme.fr', creePar: 'u1' };
  const site: Site = { ...base, id: 's1', prospectId: 'p1', adresse: '1 rue des Tilleuls', codePostal: '44000', ville: 'Nantes' };
  const reponse = (questionId: string, valeur: Reponse['valeur']): Reponse => ({ ...base, id: `v1:${questionId}`, visiteId: 'v1', questionId, valeur });
  const photo: Photo = { ...base, id: 'ph1', visiteId: 'v1', questionId: 'bio_haies_variees', mime: 'image/jpeg', largeur: 800, hauteur: 600, prisLe: '2025-06-01T10:05:00.000Z', storagePath: 'u1/v1/ph1.jpg' };
  return {
    visite,
    site,
    prospect,
    statut: null,
    chargeAffaires: { id: 'u1', email: 'a@b.fr', nom: 'Paul Terrain', role: 'terrain' },
    reponses: [reponse('bio_haies_variees', 'non'), reponse('q_statut_occupation', 'locataire')],
    zones: [],
    photos: [photo],
    notes: [{ ...base, id: 'n1', visiteId: 'v1', contexte: 'zones', texte: 'Pelouse jaunie près du parking' }],
    recommandations: [],
    ...surcharge,
  };
}

describe('cellule (CSV)', () => {
  it('met entre guillemets les séparateurs, guillemets et retours à la ligne', () => {
    expect(cellule('a;b')).toBe('"a;b"');
    expect(cellule('dit "oui"')).toBe('"dit ""oui"""');
    expect(cellule('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });

  it('neutralise les formules interprétées par Excel / Google Sheets', () => {
    expect(cellule('=SOMME(A1:A2)')).toBe("'=SOMME(A1:A2)");
    expect(cellule('+33 6 12 34 56 78')).toBe("'+33 6 12 34 56 78");
    expect(cellule('@cmd')).toBe("'@cmd");
  });

  it('formate nombres (virgule décimale), booléens et valeurs vides', () => {
    expect(cellule(12.5)).toBe('12,5');
    expect(cellule(-3)).toBe('-3');
    expect(cellule(true)).toBe('Oui');
    expect(cellule(false)).toBe('Non');
    expect(cellule(null)).toBe('');
    expect(cellule(undefined)).toBe('');
  });
});

describe('construireCsv', () => {
  it("produit un BOM UTF-8, des lignes CRLF et autant de colonnes que d'en-têtes", () => {
    const csv = construireCsv([donnees(), donnees()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lignes = csv.trimEnd().split('\r\n');
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toContain('Raison sociale');
    expect(lignes[0]).toContain('statut_occupation');
    expect(lignes[1]).toContain('"Acme; ""Logistique"""');
    expect(lignes[1]).toContain('Locataire');
  });

  it('exporte un fichier avec seulement les en-têtes quand il n’y a aucune visite', () => {
    expect(construireCsv([]).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('construireExportVisite (JSON)', () => {
  it('référence la version du schéma et du référentiel', () => {
    const json = construireExportVisite(donnees());
    expect(json.schema).toBe(VERSION_SCHEMA_EXPORT);
    expect(json.referentiel.version).toBe(referentielActif.version);
  });

  it('expose réponses, qualification, notes vocales et photos avec leur lien', () => {
    const json = construireExportVisite(donnees(), { urlsPhotos: { ph1: 'https://exemple.test/ph1.jpg' } });
    const haies = json.reponses.find((r) => r.questionId === 'bio_haies_variees');
    expect(haies).toMatchObject({ valeur: 'non', repondue: true, score: 0, photos: ['ph1'] });
    expect(json.qualification.statut_occupation).toBe('Locataire');
    expect(json.notesVocales[0].transcription).toBe('Pelouse jaunie près du parking');
    expect(json.photos[0]).toMatchObject({ id: 'ph1', cheminStorage: 'u1/v1/ph1.jpg', lien: 'https://exemple.test/ph1.jpg' });
  });

  it('ne transmet ni la signature ni, en mode anonymisé, les coordonnées du contact', () => {
    const complet = construireExportVisite(donnees());
    expect(JSON.stringify(complet)).not.toContain('data:image/png');
    expect(complet.prospect?.contact?.email).toBe('jeanne@acme.fr');

    const anonyme = construireExportVisite(donnees(), { anonymiser: true });
    expect(JSON.stringify(anonyme)).not.toContain('jeanne@acme.fr');
    expect(JSON.stringify(anonyme)).not.toContain('Jeanne Martin');
  });

  it('signale les questions sans réponse au lieu de les inventer', () => {
    const json = construireExportVisite(donnees());
    const sansReponse = json.reponses.filter((r) => !r.repondue);
    expect(sansReponse.length).toBeGreaterThan(0);
    expect(sansReponse.every((r) => r.valeur === null && r.valeurLibelle === null)).toBe(true);
  });
});
