import { describe, expect, it } from 'vitest';
import { parserReferentiel } from '../referentiel/parseur';
import type { Referentiel } from '../referentiel/schema';
import {
  calculerScores,
  genererQuickWins,
  niveauPour,
  progressionSection,
  questionsVisibles,
  scoreQuestion,
  type Reponses,
} from './moteur';

// Référentiel de test minimal : il illustre chaque type de règle de score.
const YAML_TEST = `
version: "1.0.0"
nom: "Référentiel de test"
niveaux:
  - { id: debutant, libelle: Débutant, min: 0 }
  - { id: progression, libelle: "En progression", min: 40 }
  - { id: avance, libelle: Avancé, min: 65 }
  - { id: exemplaire, libelle: Exemplaire, min: 85 }
quickWins: { max: 3, seuil: 50, maxParPilier: 2 }
pointsForts: { max: 2, seuil: 80 }
prestations:
  - { id: presta_a, libelle: "Prestation A" }
zones:
  types: [ { id: pelouse, libelle: Pelouse } ]
  etats: [ { id: bon, libelle: Bon }, { id: mauvais, libelle: Mauvais } ]
  tailles: [ { id: petit, libelle: Petit, m2Indicatif: 50 }, { id: grand, libelle: Grand, m2Indicatif: 500 } ]
sections:
  - id: qualif
    libelle: Qualification
    type: qualification
    questions:
      - { id: q_statut, libelle: "Statut", type: choix, options: [ { valeur: proprio, libelle: Propriétaire }, { valeur: locataire, libelle: Locataire } ] }
      - { id: q_bailleur, libelle: "Bailleur", type: texte, afficherSi: { question: q_statut, dans: [locataire] } }
      - { id: q_detail, libelle: "Détail du bailleur", type: texte, afficherSi: { question: q_bailleur, sauf: [rien] } }
  - id: p1
    libelle: "Pilier 1"
    type: pilier
    questions:
      - id: a
        libelle: "Question A (bool standard)"
        type: bool
        poids: 3
        piste: { titre: "Piste A", texte: "Faire A" }
        prestation: presta_a
      - id: b
        libelle: "Question B (inversée)"
        type: bool
        reponses: [oui, non, nsp]
        poids: 1
        score: { oui: 0, non: 100 }
        piste: { titre: "Piste B", texte: "Faire B" }
      - id: c
        libelle: "Question C (choix multiple)"
        type: choix
        multiple: true
        poids: 2
        piste: { titre: "Piste C", texte: "Faire C" }
        options:
          - { valeur: x, libelle: X, score: 40 }
          - { valeur: y, libelle: Y, score: 40 }
          - { valeur: z, libelle: Z, score: 40 }
          - { valeur: aucun, libelle: Aucun, score: 0, exclusif: true }
          - { valeur: nsp, libelle: "Ne sait pas" }
      - id: d
        libelle: "Question D (nombre)"
        type: nombre
        unite: "%"
        poids: 2
        piste: { titre: "Piste D", texte: "Faire D" }
        score:
          tranches:
            - { jusqua: 20, score: 100 }
            - { jusqua: 50, score: 50 }
            - { score: 0 }
      - id: e
        libelle: "Question E (non notée)"
        type: texte
  - id: p2
    libelle: "Pilier 2"
    type: pilier
    poidsPilier: 3
    questions:
      - { id: f, libelle: "Question F", type: bool, poids: 1 }
      - id: g
        libelle: "Question G (dépend de A)"
        type: bool
        poids: 2
        afficherSi: { question: a, dans: [oui, partiel] }
        piste: { titre: "Piste G", texte: "Faire G" }
`;

const ref: Referentiel = parserReferentiel(YAML_TEST);
const question = (id: string) => ref.sections.flatMap((s) => s.questions).find((q) => q.id === id)!;

describe('scoreQuestion — questions oui/non/partiel', () => {
  it('applique les scores par défaut oui=100, partiel=50, non=0', () => {
    const a = question('a');
    expect(scoreQuestion(a, 'oui')).toBe(100);
    expect(scoreQuestion(a, 'partiel')).toBe(50);
    expect(scoreQuestion(a, 'non')).toBe(0);
  });

  it("n'attribue aucun score à « ne sait pas », « sans objet » ou une absence de réponse", () => {
    const a = question('a');
    expect(scoreQuestion(a, 'nsp')).toBeNull();
    expect(scoreQuestion(a, 'na')).toBeNull();
    expect(scoreQuestion(a, undefined)).toBeNull();
    expect(scoreQuestion(a, '')).toBeNull();
  });

  it('respecte une règle inversée déclarée dans le référentiel', () => {
    const b = question('b');
    expect(scoreQuestion(b, 'oui')).toBe(0);
    expect(scoreQuestion(b, 'non')).toBe(100);
  });
});

describe('scoreQuestion — choix et nombres', () => {
  it('plafonne à 100 la somme des options cochées (choix multiple)', () => {
    const c = question('c');
    expect(scoreQuestion(c, ['x'])).toBe(40);
    expect(scoreQuestion(c, ['x', 'y'])).toBe(80);
    expect(scoreQuestion(c, ['x', 'y', 'z'])).toBe(100);
  });

  it('ignore les options sans score et retourne null si rien de notable', () => {
    const c = question('c');
    expect(scoreQuestion(c, ['nsp'])).toBeNull();
    expect(scoreQuestion(c, ['x', 'nsp'])).toBe(40);
    expect(scoreQuestion(c, [])).toBeNull();
    expect(scoreQuestion(c, ['aucun'])).toBe(0);
  });

  it('applique les tranches avec bornes hautes incluses', () => {
    const d = question('d');
    expect(scoreQuestion(d, 0)).toBe(100);
    expect(scoreQuestion(d, 20)).toBe(100);
    expect(scoreQuestion(d, 21)).toBe(50);
    expect(scoreQuestion(d, 50)).toBe(50);
    expect(scoreQuestion(d, 51)).toBe(0);
    expect(scoreQuestion(d, 1000)).toBe(0);
  });

  it('gère les agrégats max / moyenne / min des choix multiples', () => {
    const base = `
version: "1.0.0"
nom: T
niveaux: [ { id: n1, libelle: N1, min: 0 }, { id: n2, libelle: N2, min: 50 } ]
zones:
  types: [ { id: p, libelle: P } ]
  etats: [ { id: a, libelle: A }, { id: b, libelle: B } ]
  tailles: [ { id: s, libelle: S, m2Indicatif: 1 }, { id: l, libelle: L, m2Indicatif: 2 } ]
sections:
  - id: s1
    libelle: S1
    type: pilier
    questions:
      - { id: q, libelle: Q, type: choix, multiple: true, poids: 1, agregat: AGG, options: [ { valeur: a, libelle: A, score: 20 }, { valeur: b, libelle: B, score: 80 } ] }
`;
    const q = (agg: string) => parserReferentiel(base.replace('AGG', agg)).sections[0].questions[0];
    expect(scoreQuestion(q('max'), ['a', 'b'])).toBe(80);
    expect(scoreQuestion(q('min'), ['a', 'b'])).toBe(20);
    expect(scoreQuestion(q('moyenne'), ['a', 'b'])).toBe(50);
  });
});

describe('questionsVisibles — conditions afficherSi', () => {
  it("masque une question tant que sa condition n'est pas remplie", () => {
    expect(questionsVisibles(ref, {}).has('q_bailleur')).toBe(false);
    expect(questionsVisibles(ref, { q_statut: 'proprio' }).has('q_bailleur')).toBe(false);
    expect(questionsVisibles(ref, { q_statut: 'locataire' }).has('q_bailleur')).toBe(true);
  });

  it('masque en cascade les questions dépendantes d’une question masquée', () => {
    const v = questionsVisibles(ref, { q_statut: 'proprio', q_bailleur: 'Dupont' });
    expect(v.has('q_detail')).toBe(false);
  });

  it("n'affiche pas une question 'sauf' tant que la question de référence n'a pas de réponse", () => {
    const v = questionsVisibles(ref, { q_statut: 'locataire', q_bailleur: 'Dupont' });
    expect(v.has('q_detail')).toBe(true);
    expect(questionsVisibles(ref, { q_statut: 'locataire' }).has('q_detail')).toBe(false);
  });

  it('exclut du score une réponse donnée à une question devenue masquée', () => {
    const r: Reponses = { a: 'non', g: 'non', f: 'oui' };
    expect(calculerScores(ref, r).piliers[1].score).toBe(100); // g masquée : seule f compte
    const r2: Reponses = { a: 'oui', g: 'non', f: 'oui' };
    expect(calculerScores(ref, r2).piliers[1].score).toBe(33); // (1×100 + 2×0) / 3
  });
});

describe('calculerScores — piliers, global, niveaux', () => {
  it('calcule la moyenne pondérée par pilier', () => {
    const r: Reponses = { a: 'oui', b: 'oui', c: ['x', 'y', 'z'], d: 60 };
    // a:3×100 + b:1×0 + c:2×100 + d:2×0 = 500 / 8 = 62,5 → 63
    expect(calculerScores(ref, r).piliers[0].score).toBe(63);
  });

  it('exclut « ne sait pas » du numérateur ET du dénominateur', () => {
    const r: Reponses = { a: 'oui', b: 'nsp', c: ['nsp'], d: 10 };
    // seuls a (3×100) et d (2×100) comptent → 100
    const p = calculerScores(ref, r).piliers[0];
    expect(p.score).toBe(100);
    expect(p.nbReponduesNotees).toBe(2);
    expect(p.couverture).toBeCloseTo(5 / 8);
  });

  it("retourne un score null (et non 0) quand aucune question notée n'est exploitable", () => {
    const res = calculerScores(ref, {});
    expect(res.piliers[0].score).toBeNull();
    expect(res.piliers[0].niveau).toBeNull();
    expect(res.global.score).toBeNull();
  });

  it('utilise le libellé complet comme libellé court tant que libelleCourt est absent, sinon la version abrégée', () => {
    expect(calculerScores(ref, {}).piliers[0].libelleCourt).toBe('Pilier 1');
    const abrege = parserReferentiel(YAML_TEST.replace('libelle: "Pilier 1"', 'libelle: "Pilier 1"\n    libelleCourt: "P1"'));
    expect(calculerScores(abrege, {}).piliers[0]).toMatchObject({ libelle: 'Pilier 1', libelleCourt: 'P1' });
  });

  it('pondère le score global par poidsPilier et ignore les piliers non évalués', () => {
    // Pilier 1 = 100 (poids 1), pilier 2 = 0 (poids 3) → (100 + 0) / 4 = 25
    const res = calculerScores(ref, { a: 'oui', f: 'non' });
    expect(res.piliers.map((p) => p.score)).toEqual([100, 0]);
    expect(res.global.score).toBe(25);

    // Pilier 2 non évalué : le global est celui du pilier 1 seul.
    expect(calculerScores(ref, { a: 'oui' }).global.score).toBe(100);
  });

  it('attribue le niveau de maturité selon les seuils du référentiel (bornes incluses)', () => {
    expect(niveauPour(ref.niveaux, 0)?.id).toBe('debutant');
    expect(niveauPour(ref.niveaux, 39)?.id).toBe('debutant');
    expect(niveauPour(ref.niveaux, 40)?.id).toBe('progression');
    expect(niveauPour(ref.niveaux, 65)?.id).toBe('avance');
    expect(niveauPour(ref.niveaux, 85)?.id).toBe('exemplaire');
    expect(niveauPour(ref.niveaux, 100)?.id).toBe('exemplaire');
    expect(niveauPour(ref.niveaux, null)).toBeNull();
  });
});

describe('quick wins et points forts', () => {
  it('classe les pistes par poids × écart au maximum', () => {
    const r: Reponses = { a: 'non', b: 'oui', c: ['aucun'], d: 90 };
    // priorités : a=3×100=300, c=2×100=200, d=2×100=200, b=1×100=100
    // c et d sont ex æquo (départagés par l'ordre du référentiel) ; plafond de 2 pistes par pilier.
    const ids = calculerScores(ref, r).quickWins.map((w) => w.questionId);
    expect(ids).toEqual(['a', 'c']);
  });

  it('ignore les réponses « ne sait pas », les bonnes réponses et les questions masquées', () => {
    const r: Reponses = { a: 'nsp', b: 'non', c: ['x', 'y', 'z'], d: 10, f: 'oui', g: 'non' };
    expect(calculerScores(ref, r).quickWins).toEqual([]);
  });

  it('respecte le plafond par pilier', () => {
    // Pilier 1 : b, c, d mauvaises → 2 retenues max (a = partiel = 50, au seuil).
    // Pilier 2 : g mauvaise (a=partiel la rend visible) → retenue malgré le plafond atteint en pilier 1.
    const r: Reponses = { a: 'partiel', b: 'oui', c: ['aucun'], d: 90, g: 'non' };
    const wins = calculerScores(ref, r).quickWins;
    expect(wins.filter((w) => w.sectionId === 'p1')).toHaveLength(2);
    expect(wins.some((w) => w.questionId === 'g')).toBe(true);
    expect(wins).toHaveLength(3);
  });

  it('transmet la prestation liée et le seuil est exclusif (score ≥ seuil = pas de piste)', () => {
    const win = calculerScores(ref, { a: 'non' }).quickWins[0];
    expect(win.prestationId).toBe('presta_a');
    expect(win.pilier).toBe('Pilier 1');
    // partiel = 50 = seuil → pas de piste
    expect(genererQuickWins(ref, { parQuestion: { a: 50 } })).toEqual([]);
  });

  it('liste les points forts au-dessus du seuil, les plus pondérés d’abord', () => {
    const r: Reponses = { a: 'oui', b: 'non', c: ['x', 'y', 'z'], d: 5, f: 'oui' };
    const forts = calculerScores(ref, r).pointsForts.map((p) => p.questionId);
    expect(forts).toEqual(['a', 'c']); // max=2 ; a (300) > c (200) = d (200) > b (100)
  });
});

describe('progressionSection', () => {
  it('compte les questions visibles répondues, y compris « ne sait pas »', () => {
    const r: Reponses = { a: 'nsp', b: 'oui' };
    const v = questionsVisibles(ref, r);
    const p1 = ref.sections.find((s) => s.id === 'p1')!;
    expect(progressionSection(p1, v, r)).toEqual({ repondues: 2, total: 5, pourcentage: 40 });
  });

  it('ne compte pas les questions masquées dans le total', () => {
    const r: Reponses = {};
    const v = questionsVisibles(ref, r);
    const q = ref.sections.find((s) => s.id === 'qualif')!;
    expect(progressionSection(q, v, r).total).toBe(1); // q_bailleur et q_detail masquées
  });
});
