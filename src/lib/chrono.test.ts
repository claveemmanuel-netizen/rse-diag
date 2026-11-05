import { describe, expect, it } from 'vitest';
import { parserReferentiel } from '../referentiel/parseur';
import { referentielActif } from '../referentiel';
import { questionsVisibles } from '../scoring/moteur';
import {
  CLE_CHRONO_ZONES,
  cumulerChrono,
  dureesEffectives,
  estimerVisite,
  formaterChrono,
  formaterEstimation,
  secondesEstimeesSection,
  totalChronos,
} from './chrono';

const base = `
version: "1.0.0"
nom: Test
niveaux:
  - { id: a, libelle: A, min: 0 }
  - { id: b, libelle: B, min: 50 }
zones:
  types: [{ id: pelouse, libelle: Pelouse }]
  etats: [{ id: bon, libelle: Bon }, { id: mauvais, libelle: Mauvais }]
  tailles: [{ id: petit, libelle: Petit, m2Indicatif: 10 }, { id: grand, libelle: Grand, m2Indicatif: 100 }]
sections:
  - id: s1
    libelle: Section 1
    type: pilier
    questions:
      - { id: q1, libelle: Q1, type: bool, poids: 1 }
      - { id: q2, libelle: Q2, type: texte }
      - { id: q3, libelle: Q3, type: bool, afficherSi: { question: q1, dans: [oui] } }
`;

const parser = (extra = '') => parserReferentiel(base + extra);
const estValide = (extra: string) => {
  try {
    parserReferentiel(base + extra);
    return true;
  } catch {
    return false;
  }
};

describe('durées estimées', () => {
  it('utilise les durées par défaut quand la rubrique « durees » est absente', () => {
    const ref = parser();
    expect(dureesEffectives(ref)).toMatchObject({ bool: 12, texte: 30, zones: 240, objectifMinutes: 30 });
  });

  it('prend en compte les durées surchargées dans le référentiel', () => {
    const ref = parser('durees:\n  texte: 60\n  objectifMinutes: 20\n');
    expect(dureesEffectives(ref)).toMatchObject({ texte: 60, bool: 12, objectifMinutes: 20 });
  });

  it('refuse une durée négative ou une rubrique inconnue', () => {
    expect(estValide('durees:\n  texte: -5\n')).toBe(false);
    expect(estValide('durees:\n  inconnu: 5\n')).toBe(false);
  });

  it("n'additionne que les questions visibles de la section", () => {
    const ref = parser();
    const section = ref.sections[0];
    // q3 est masquée tant que q1 n'est pas « oui » : bool (12) + texte (30)
    expect(secondesEstimeesSection(ref, section, questionsVisibles(ref, {}))).toBe(12 + 30);
    // q3 apparaît : + bool (12)
    expect(secondesEstimeesSection(ref, section, questionsVisibles(ref, { q1: 'oui' }))).toBe(12 + 30 + 12);
  });

  it("estime chaque section, l'inventaire des zones, le total et l'objectif", () => {
    const ref = parser();
    const e = estimerVisite(ref, questionsVisibles(ref, {}));
    expect(e.parCle).toEqual({ s1: 42, [CLE_CHRONO_ZONES]: 240 });
    expect(e.totalSecondes).toBe(282);
    expect(e.objectifSecondes).toBe(1800);
  });

  it('le référentiel livré a une estimation de collecte cohérente avec l’objectif de 30 minutes', () => {
    const e = estimerVisite(referentielActif, questionsVisibles(referentielActif, {}));
    expect(e.totalSecondes).toBeGreaterThan(0);
    expect(e.totalSecondes).toBeLessThanOrEqual(e.objectifSecondes);
  });
});

describe('cumul du chronomètre', () => {
  const t0 = '2026-11-04T09:00:00.000Z';

  it('crée l’entrée avec sa date de début à la première modification', () => {
    expect(cumulerChrono(undefined, 's1', 0, t0)).toEqual({ s1: { secondes: 0, debutLe: t0 } });
    expect(cumulerChrono(null, 's1', 12.9, t0)).toEqual({ s1: { secondes: 12, debutLe: t0 } });
  });

  it('cumule sans toucher à la date de début ni aux autres sections', () => {
    const avant = { s1: { secondes: 30, debutLe: t0 }, s2: { secondes: 5, debutLe: t0 } };
    const apres = cumulerChrono(avant, 's1', 45, '2026-11-04T09:10:00.000Z');
    expect(apres).toEqual({ s1: { secondes: 45, debutLe: t0 }, s2: { secondes: 5, debutLe: t0 } });
    expect(avant.s1.secondes).toBe(30);
  });

  it('ne recule jamais et renvoie le même objet quand rien n’a avancé (pas d’écriture inutile)', () => {
    const avant = { s1: { secondes: 30, debutLe: t0 } };
    expect(cumulerChrono(avant, 's1', 30, t0)).toBe(avant);
    expect(cumulerChrono(avant, 's1', 10, t0)).toBe(avant);
  });

  it('totalise le temps de toutes les sections', () => {
    expect(totalChronos(undefined)).toBe(0);
    expect(totalChronos({ a: { secondes: 60, debutLe: t0 }, b: { secondes: 90, debutLe: t0 } })).toBe(150);
  });
});

describe('formats', () => {
  it('formate le chrono en mm:ss puis h:mm:ss', () => {
    expect(formaterChrono(0)).toBe('00:00');
    expect(formaterChrono(192)).toBe('03:12');
    expect(formaterChrono(3725)).toBe('1:02:05');
  });

  it('arrondit l’estimation à la minute, 1 minute au minimum', () => {
    expect(formaterEstimation(20)).toBe('~1 min');
    expect(formaterEstimation(210)).toBe('~4 min');
  });
});
