import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comparerVersions, ErreurReferentiel, parserReferentiel } from './parseur';
import { questionsVisibles, scoreQuestion } from '../scoring/moteur';

const ENTETE = `
version: "1.0.0"
nom: "Test"
niveaux:
  - { id: n1, libelle: Bas, min: 0 }
  - { id: n2, libelle: Haut, min: 50 }
prestations:
  - { id: presta, libelle: "Une prestation" }
zones:
  types: [ { id: pelouse, libelle: Pelouse } ]
  etats: [ { id: bon, libelle: Bon }, { id: mauvais, libelle: Mauvais } ]
  tailles: [ { id: petit, libelle: Petit, m2Indicatif: 50 }, { id: grand, libelle: Grand, m2Indicatif: 500 } ]
`;

/** Construit un document complet avec UN pilier contenant les questions données (YAML indenté). */
const doc = (questions: string, entete = ENTETE) => `${entete}
sections:
  - id: pilier1
    libelle: "Pilier 1"
    type: pilier
    questions:
${questions}
`;

const erreursDe = (yaml: string): string[] => {
  try {
    parserReferentiel(yaml);
  } catch (e) {
    expect(e).toBeInstanceOf(ErreurReferentiel);
    return (e as ErreurReferentiel).messages;
  }
  throw new Error("le référentiel aurait dû être refusé");
};

describe('parserReferentiel — lecture valide', () => {
  it('lit un référentiel minimal et applique les valeurs par défaut', () => {
    const ref = parserReferentiel(doc('      - { id: q1, libelle: "Question", type: bool }'));
    expect(ref.version).toBe('1.0.0');
    expect(ref.sections[0].questions[0].poids).toBe(0);
    expect(ref.quickWins).toEqual({ max: 5, seuil: 50, maxParPilier: 2 });
    expect(ref.pointsForts).toEqual({ max: 5, seuil: 80 });
  });

  it('accepte les 6 types de question et une condition valide', () => {
    const ref = parserReferentiel(
      doc(`
      - { id: q_bool, libelle: B, type: bool, poids: 2, prestation: presta }
      - { id: q_choix, libelle: C, type: choix, poids: 1, options: [ { valeur: a, libelle: A, score: 100 }, { valeur: b, libelle: B, score: 0 } ] }
      - { id: q_nombre, libelle: N, type: nombre, poids: 1, score: { tranches: [ { jusqua: 10, score: 100 }, { score: 0 } ] } }
      - { id: q_texte, libelle: T, type: texte, afficherSi: { question: q_bool, dans: [oui] } }
      - { id: q_photo, libelle: P, type: photo }
      - { id: q_date, libelle: D, type: date }`),
    );
    expect(ref.sections[0].questions.map((q) => q.type)).toEqual(['bool', 'choix', 'nombre', 'texte', 'photo', 'date']);
  });

  it('accepte aussi du JSON (sous-ensemble du YAML)', () => {
    const json = JSON.stringify({
      version: '2.0',
      nom: 'J',
      niveaux: [
        { id: 'a', libelle: 'A', min: 0 },
        { id: 'b', libelle: 'B', min: 50 },
      ],
      zones: {
        types: [{ id: 'p', libelle: 'P' }],
        etats: [{ id: 'a', libelle: 'A' }, { id: 'b', libelle: 'B' }],
        tailles: [{ id: 's', libelle: 'S', m2Indicatif: 1 }, { id: 'l', libelle: 'L', m2Indicatif: 2 }],
      },
      sections: [{ id: 's1', libelle: 'S1', type: 'pilier', questions: [{ id: 'q', libelle: 'Q', type: 'bool', poids: 1 }] }],
    });
    expect(parserReferentiel(json).version).toBe('2.0');
  });
});

describe('parserReferentiel — fichiers du dossier referentiel/', () => {
  const dossier = join(process.cwd(), 'referentiel');
  const fichiers = readdirSync(dossier).filter((f) => /\.ya?ml$/.test(f));

  it('contient au moins un référentiel', () => {
    expect(fichiers.length).toBeGreaterThan(0);
  });

  for (const fichier of fichiers) {
    describe(fichier, () => {
      const ref = parserReferentiel(readFileSync(join(dossier, fichier), 'utf8'));

      it('est valide', () => {
        expect(ref.sections.length).toBeGreaterThan(0);
      });

      it('contient la qualification et les 6 piliers du cahier des charges', () => {
        expect(ref.sections.filter((s) => s.type === 'qualification')).toHaveLength(1);
        expect(ref.sections.filter((s) => s.type === 'pilier')).toHaveLength(6);
      });

      it('donne à chaque pilier au moins une question notée', () => {
        for (const s of ref.sections.filter((x) => x.type === 'pilier')) {
          expect(s.questions.some((q) => q.poids > 0), `pilier ${s.id}`).toBe(true);
        }
      });

      it("n'attache une piste d'amélioration qu'à des questions notées", () => {
        const incoherentes = ref.sections.flatMap((s) => s.questions).filter((q) => q.piste && q.poids <= 0);
        expect(incoherentes.map((q) => q.id)).toEqual([]);
      });
    });
  }
});

describe('référentiel V2 — fusion des critères de l\'étude de marché', () => {
  const lire = (f: string) => parserReferentiel(readFileSync(join(process.cwd(), 'referentiel', f), 'utf8'));
  const v1 = lire('v1.yaml');
  const v2 = lire('v2.yaml');
  const ids = (r: typeof v1) => r.sections.flatMap((s) => s.questions.map((q) => q.id));

  it('conserve tous les identifiants de la V1 (les visites existantes restent lisibles)', () => {
    const manquants = ids(v1).filter((id) => !ids(v2).includes(id));
    expect(manquants).toEqual([]);
  });

  it('ajoute les 13 questions issues de la fusion', () => {
    expect(ids(v2).length - ids(v1).length).toBe(13);
  });

  it("ne pose la question de l'ombre aux postes extérieurs que si des salariés travaillent dehors", () => {
    const base = { q_postes_exterieurs: 'non', eau_paillage: 'non' };
    expect(questionsVisibles(v2, base).has('clim_ombre_postes')).toBe(false);
    expect(questionsVisibles(v2, base).has('gouv_risque_chaleur')).toBe(false);
    const dehors = questionsVisibles(v2, { ...base, q_postes_exterieurs: 'oui' });
    expect(dehors.has('clim_ombre_postes')).toBe(true);
    expect(dehors.has('gouv_risque_chaleur')).toBe(true);
  });

  it('ne demande le type de paillage que si les massifs sont paillés', () => {
    expect(questionsVisibles(v2, { eau_paillage: 'non' }).has('eau_paillage_plastique')).toBe(false);
    expect(questionsVisibles(v2, { eau_paillage: 'oui' }).has('eau_paillage_plastique')).toBe(true);
  });

  it('note la pleine terre autour du repère de 30 %', () => {
    const q = v2.sections.flatMap((s) => s.questions).find((x) => x.id === 'eau_pleine_terre')!;
    expect(scoreQuestion(q, 5)).toBe(0);
    expect(scoreQuestion(q, 20)).toBe(40);
    expect(scoreQuestion(q, 30)).toBeGreaterThanOrEqual(80);
  });
});

describe('parserReferentiel — erreurs lisibles', () => {
  it("refuse un YAML mal formé en indiquant la ligne", () => {
    const e = erreursDe('version: "1.0.0"\nnom: [pas fermé\n');
    expect(e[0]).toMatch(/pas un YAML valide/);
  });

  it('refuse un fichier vide', () => {
    expect(erreursDe('')[0]).toMatch(/vide/);
  });

  it('signale une faute de frappe sur un nom de champ, avec la question concernée', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: bool, poid: 3 }'));
    expect(e.join('\n')).toMatch(/question « q1 »/);
    expect(e.join('\n')).toMatch(/champ\(s\) inconnu\(s\) : poid/);
  });

  it('signale un type de question inconnu', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: curseur }'));
    expect(e.join('\n')).toMatch(/type de question inconnu/);
  });

  it('refuse les identifiants de question en double', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: A, type: texte }\n      - { id: q1, libelle: B, type: texte }'));
    expect(e.join('\n')).toMatch(/question « q1 » défini plusieurs fois/);
  });

  it("refuse une prestation inconnue", () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: bool, prestation: inexistante }'));
    expect(e.join('\n')).toMatch(/prestation « inexistante » n'existe pas/);
  });

  it("refuse un 'afficherSi' qui vise une question inconnue ou située plus loin", () => {
    const apres = erreursDe(
      doc('      - { id: q1, libelle: A, type: bool, afficherSi: { question: q2, dans: [oui] } }\n      - { id: q2, libelle: B, type: bool }'),
    );
    expect(apres.join('\n')).toMatch(/doit être une question définie AVANT/);
    const inconnue = erreursDe(doc('      - { id: q1, libelle: A, type: bool, afficherSi: { question: zzz, dans: [oui] } }'));
    expect(inconnue.join('\n')).toMatch(/« zzz »/);
  });

  it("refuse une valeur d'afficherSi qui n'existe pas pour la question visée", () => {
    const e = erreursDe(
      doc('      - { id: q1, libelle: A, type: bool }\n      - { id: q2, libelle: B, type: texte, afficherSi: { question: q1, dans: [peutetre] } }'),
    );
    expect(e.join('\n')).toMatch(/valeur « peutetre » qui n'existe pas/);
  });

  it("refuse une condition avec à la fois 'dans' et 'sauf'", () => {
    const e = erreursDe(
      doc('      - { id: q1, libelle: A, type: bool }\n      - { id: q2, libelle: B, type: texte, afficherSi: { question: q1, dans: [oui], sauf: [non] } }'),
    );
    expect(e.join('\n')).toMatch(/soit 'dans', soit 'sauf'/);
  });

  it('refuse une question notée sans règle de score exploitable', () => {
    const nombre = erreursDe(doc('      - { id: q1, libelle: N, type: nombre, poids: 2 }'));
    expect(nombre.join('\n')).toMatch(/sans règle 'score.tranches'/);
    const choix = erreursDe(
      doc('      - { id: q1, libelle: C, type: choix, poids: 2, options: [ { valeur: a, libelle: A }, { valeur: b, libelle: B } ] }'),
    );
    expect(choix.join('\n')).toMatch(/aucune option n'a de 'score'/);
  });

  it('refuse un poids sur une question texte / photo / date', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: T, type: texte, poids: 2 }'));
    expect(e.join('\n')).toMatch(/ne peut pas être notée/);
  });

  it("refuse une piste d'amélioration sur une question non notée (elle ne serait jamais proposée)", () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: bool, piste: { titre: T, texte: X } }'));
    expect(e.join('\n')).toMatch(/jamais proposée/);
  });

  it('refuse un score hors de 0-100 et un poids négatif', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: bool, poids: -1, score: { oui: 150 } }'));
    expect(e.join('\n')).toMatch(/entre 0 et 100/);
    expect(e.join('\n')).toMatch(/poids doit être positif/);
  });

  it('exige des tranches croissantes terminées par une tranche ouverte', () => {
    const ferme = erreursDe(
      doc('      - { id: q1, libelle: N, type: nombre, poids: 1, score: { tranches: [ { jusqua: 10, score: 100 }, { jusqua: 20, score: 0 } ] } }'),
    );
    expect(ferme.join('\n')).toMatch(/dernière tranche doit être sans 'jusqua'/);
    const desordre = erreursDe(
      doc('      - { id: q1, libelle: N, type: nombre, poids: 1, score: { tranches: [ { jusqua: 20, score: 100 }, { jusqua: 10, score: 50 }, { score: 0 } ] } }'),
    );
    expect(desordre.join('\n')).toMatch(/classées par 'jusqua' croissant/);
  });

  it('exige que le premier niveau de maturité commence à 0 et que les seuils croissent', () => {
    const e = erreursDe(
      doc('      - { id: q1, libelle: Q, type: bool }', ENTETE.replace('min: 0', 'min: 10')),
    );
    expect(e.join('\n')).toMatch(/commencer à 0/);
  });

  it('refuse une version mal formée', () => {
    const e = erreursDe(doc('      - { id: q1, libelle: Q, type: bool }', ENTETE.replace('"1.0.0"', '"v1"')));
    expect(e.join('\n')).toMatch(/version/);
  });

  it('remonte plusieurs erreurs en une seule fois', () => {
    const e = erreursDe(
      doc('      - { id: q1, libelle: A, type: bool, prestation: x1 }\n      - { id: q1, libelle: B, type: bool, prestation: x2 }'),
    );
    expect(e.length).toBeGreaterThanOrEqual(3);
  });
});

describe('comparerVersions', () => {
  it('compare les versions numériquement', () => {
    expect(comparerVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(comparerVersions('1.0.0', '1.0.0')).toBe(0);
    expect(comparerVersions('1', '1.0.1')).toBeLessThan(0);
    expect(comparerVersions('2.0', '1.9.9')).toBeGreaterThan(0);
  });
});
