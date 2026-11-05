import type { Niveau, Question, Referentiel, Section } from '../referentiel/schema';

// Moteur de scoring : AUCUNE règle métier en dur ici, tout vient du référentiel.

/** Valeur d'une réponse : bool/choix → texte, choix multiple → liste, nombre → nombre, texte/date → texte. */
export type ValeurReponse = string | string[] | number | null | undefined;
export type Reponses = Record<string, ValeurReponse>;

export interface ScorePilier {
  sectionId: string;
  libelle: string;
  /** Intitulé abrégé (axes du radar). */
  libelleCourt: string;
  icone?: string;
  /** Score 0-100 arrondi, ou null si aucune question notée n'a reçu de réponse exploitable. */
  score: number | null;
  niveau: Niveau | null;
  /** Part (0-1) du poids total des questions notées qui a reçu une réponse exploitable. */
  couverture: number;
  nbQuestionsNotees: number;
  nbReponduesNotees: number;
}

export interface ScoreGlobal {
  score: number | null;
  niveau: Niveau | null;
  couverture: number;
}

export interface PisteAmelioration {
  questionId: string;
  sectionId: string;
  pilier: string;
  titre: string;
  texte: string;
  effort?: 'faible' | 'moyen' | 'eleve';
  prestationId?: string;
  score: number;
  /** Poids × écart au maximum : sert à classer les pistes. */
  priorite: number;
}

export interface PointFort {
  questionId: string;
  sectionId: string;
  pilier: string;
  libelle: string;
  score: number;
}

export interface ResultatScores {
  piliers: ScorePilier[];
  global: ScoreGlobal;
  /** Score (0-100) de chaque question visible et notable, null si non exploitable. */
  parQuestion: Record<string, number | null>;
  /** Identifiants des questions affichées compte tenu des conditions 'afficherSi'. */
  visibles: Set<string>;
  quickWins: PisteAmelioration[];
  pointsForts: PointFort[];
}

const aReponse = (v: ValeurReponse): boolean =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'number' && Number.isNaN(v));

export const estRepondue = aReponse;

/** Score 0-100 d'UNE réponse selon la règle déclarée dans le référentiel (null = non comptabilisée). */
export function scoreQuestion(q: Question, valeur: ValeurReponse): number | null {
  if (!aReponse(valeur)) return null;

  switch (q.type) {
    case 'bool': {
      if (typeof valeur !== 'string' || valeur === 'na') return null;
      const table: Record<string, number | undefined> = { oui: 100, partiel: 50, non: 0, ...q.score };
      const s = table[valeur];
      return typeof s === 'number' ? s : null;
    }
    case 'choix': {
      const choisies = Array.isArray(valeur) ? valeur : [String(valeur)];
      const scores = choisies
        .map((v) => q.options.find((o) => o.valeur === v)?.score)
        .filter((s): s is number => typeof s === 'number');
      if (scores.length === 0) return null;
      if (!q.multiple) return scores[0];
      switch (q.agregat ?? 'somme') {
        case 'max':
          return Math.max(...scores);
        case 'min':
          return Math.min(...scores);
        case 'moyenne':
          return scores.reduce((a, b) => a + b, 0) / scores.length;
        default:
          return Math.min(100, scores.reduce((a, b) => a + b, 0));
      }
    }
    case 'nombre': {
      if (typeof valeur !== 'number' || !q.score) return null;
      const tranche = q.score.tranches.find((t) => t.jusqua == null || valeur <= t.jusqua);
      return tranche ? tranche.score : null;
    }
    default:
      return null;
  }
}

function valeursEnListe(v: ValeurReponse): string[] {
  if (!aReponse(v)) return [];
  return Array.isArray(v) ? v : [String(v)];
}

/**
 * Détermine les questions affichées. Une question dont la condition 'afficherSi' n'est pas remplie,
 * ou qui dépend d'une question elle-même masquée, est ignorée (affichage, progression et score).
 * Une question de référence sans réponse masque ses questions dépendantes.
 */
export function questionsVisibles(ref: Referentiel, reponses: Reponses): Set<string> {
  const visibles = new Set<string>();
  for (const section of ref.sections) {
    for (const q of section.questions) {
      const c = q.afficherSi;
      if (!c) {
        visibles.add(q.id);
        continue;
      }
      if (!visibles.has(c.question)) continue;
      const donnees = valeursEnListe(reponses[c.question]);
      if (donnees.length === 0) continue;
      const ok = c.dans ? donnees.some((v) => c.dans!.includes(v)) : !donnees.some((v) => c.sauf!.includes(v));
      if (ok) visibles.add(q.id);
    }
  }
  return visibles;
}

export function niveauPour(niveaux: Niveau[], score: number | null): Niveau | null {
  if (score === null) return null;
  const tries = [...niveaux].sort((a, b) => a.min - b.min);
  let retenu = tries[0];
  for (const n of tries) if (score >= n.min) retenu = n;
  return retenu;
}

const arrondi = (n: number) => Math.round(n);

function calculerPilier(ref: Referentiel, section: Section, visibles: Set<string>, reponses: Reponses, parQuestion: Record<string, number | null>): ScorePilier {
  let somme = 0;
  let poidsRepondu = 0;
  let poidsTotal = 0;
  let nbNotees = 0;
  let nbRepondues = 0;

  for (const q of section.questions) {
    if (!visibles.has(q.id) || q.poids <= 0) continue;
    const s = scoreQuestion(q, reponses[q.id]);
    parQuestion[q.id] = s;
    poidsTotal += q.poids;
    nbNotees += 1;
    if (s !== null) {
      somme += q.poids * s;
      poidsRepondu += q.poids;
      nbRepondues += 1;
    }
  }

  const score = poidsRepondu > 0 ? arrondi(somme / poidsRepondu) : null;
  return {
    sectionId: section.id,
    libelle: section.libelle,
    libelleCourt: section.libelleCourt ?? section.libelle,
    icone: section.icone,
    score,
    niveau: niveauPour(ref.niveaux, score),
    couverture: poidsTotal > 0 ? poidsRepondu / poidsTotal : 0,
    nbQuestionsNotees: nbNotees,
    nbReponduesNotees: nbRepondues,
  };
}

/** Calcule les scores par pilier, le score global, les quick wins et les points forts. */
export function calculerScores(ref: Referentiel, reponses: Reponses): ResultatScores {
  const visibles = questionsVisibles(ref, reponses);
  const parQuestion: Record<string, number | null> = {};
  const piliers: ScorePilier[] = [];

  for (const section of ref.sections) {
    if (section.type !== 'pilier') continue;
    piliers.push(calculerPilier(ref, section, visibles, reponses, parQuestion));
  }

  // Score global : moyenne des piliers évalués, pondérée par 'poidsPilier' (1 par défaut).
  let somme = 0;
  let poids = 0;
  let totalNotees = 0;
  let totalRepondues = 0;
  for (const p of piliers) {
    const section = ref.sections.find((s) => s.id === p.sectionId)!;
    const w = section.poidsPilier ?? 1;
    if (p.score !== null) {
      somme += w * p.score;
      poids += w;
    }
    totalNotees += p.nbQuestionsNotees;
    totalRepondues += p.nbReponduesNotees;
  }
  const scoreGlobal = poids > 0 ? arrondi(somme / poids) : null;

  const resultat: ResultatScores = {
    piliers,
    global: {
      score: scoreGlobal,
      niveau: niveauPour(ref.niveaux, scoreGlobal),
      couverture: totalNotees > 0 ? totalRepondues / totalNotees : 0,
    },
    parQuestion,
    visibles,
    quickWins: [],
    pointsForts: [],
  };
  resultat.quickWins = genererQuickWins(ref, resultat);
  resultat.pointsForts = genererPointsForts(ref, resultat);
  return resultat;
}

/**
 * Quick wins : réponses « négatives » (score sous le seuil) les plus pondérées,
 * classées par poids × écart au maximum, avec un plafond par pilier pour varier les pistes.
 */
export function genererQuickWins(ref: Referentiel, resultat: Pick<ResultatScores, 'parQuestion'>): PisteAmelioration[] {
  const { seuil, max, maxParPilier } = ref.quickWins;
  const candidats: (PisteAmelioration & { ordre: number; poids: number })[] = [];
  let ordre = 0;

  for (const section of ref.sections) {
    for (const q of section.questions) {
      ordre += 1;
      const s = resultat.parQuestion[q.id];
      if (!q.piste || q.poids <= 0 || s === null || s === undefined || s >= seuil) continue;
      candidats.push({
        questionId: q.id,
        sectionId: section.id,
        pilier: section.libelle,
        titre: q.piste.titre,
        texte: q.piste.texte,
        effort: q.piste.effort,
        prestationId: q.prestation,
        score: s,
        priorite: q.poids * (100 - s),
        ordre,
        poids: q.poids,
      });
    }
  }

  candidats.sort((a, b) => b.priorite - a.priorite || b.poids - a.poids || a.ordre - b.ordre);

  const parPilier: Record<string, number> = {};
  const retenus: PisteAmelioration[] = [];
  for (const c of candidats) {
    if (retenus.length >= max) break;
    if ((parPilier[c.sectionId] ?? 0) >= maxParPilier) continue;
    parPilier[c.sectionId] = (parPilier[c.sectionId] ?? 0) + 1;
    const { ordre: _o, poids: _p, ...piste } = c;
    void _o;
    void _p;
    retenus.push(piste);
  }
  return retenus;
}

/** Points forts : réponses notées au-dessus du seuil, les plus pondérées d'abord. */
export function genererPointsForts(ref: Referentiel, resultat: Pick<ResultatScores, 'parQuestion'>): PointFort[] {
  const { seuil, max } = ref.pointsForts;
  const forts: (PointFort & { poids: number })[] = [];
  for (const section of ref.sections) {
    for (const q of section.questions) {
      const s = resultat.parQuestion[q.id];
      if (q.poids > 0 && typeof s === 'number' && s >= seuil) {
        forts.push({ questionId: q.id, sectionId: section.id, pilier: section.libelle, libelle: q.libelle, score: s, poids: q.poids });
      }
    }
  }
  forts.sort((a, b) => b.poids * b.score - a.poids * a.score);
  return forts.slice(0, max).map(({ poids: _p, ...f }) => {
    void _p;
    return f;
  });
}

export interface Progression {
  repondues: number;
  total: number;
  /** 0-100 */
  pourcentage: number;
}

/**
 * Avancement d'une section : questions visibles ayant une réponse / questions visibles.
 * `questionsAvecPhoto` permet de compter les questions de type « photo » comme répondues.
 */
export function progressionSection(
  section: Section,
  visibles: Set<string>,
  reponses: Reponses,
  questionsAvecPhoto: ReadonlySet<string> = new Set(),
): Progression {
  let total = 0;
  let repondues = 0;
  for (const q of section.questions) {
    if (!visibles.has(q.id)) continue;
    total += 1;
    const ok = q.type === 'photo' ? questionsAvecPhoto.has(q.id) : aReponse(reponses[q.id]);
    if (ok) repondues += 1;
  }
  return { repondues, total, pourcentage: total === 0 ? 0 : Math.round((repondues / total) * 100) };
}
