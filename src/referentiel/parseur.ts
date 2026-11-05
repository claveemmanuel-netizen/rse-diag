import { parse as parseYaml, YAMLParseError } from 'yaml';
import type { ZodIssue } from 'zod';
import { referentielSchema, type Question, type Referentiel } from './schema';

/** Erreur de lecture du référentiel : `messages` liste tous les problèmes, en français. */
export class ErreurReferentiel extends Error {
  readonly messages: string[];
  constructor(messages: string[]) {
    super(`Référentiel invalide :\n- ${messages.join('\n- ')}`);
    this.name = 'ErreurReferentiel';
    this.messages = messages;
  }
}

type Chemin = (string | number)[];

/** Décrit un chemin Zod avec les identifiants du fichier (« section biodiversite, question bio_haies »). */
function decrireChemin(brut: unknown, chemin: Chemin): string {
  const parts: string[] = [];
  let courant: unknown = brut;
  for (let i = 0; i < chemin.length; i++) {
    const cle = chemin[i];
    const suivant = (courant as Record<string | number, unknown> | undefined)?.[cle];
    if (cle === 'sections' && typeof chemin[i + 1] === 'number') {
      const section = (suivant as unknown[] | undefined)?.[chemin[i + 1] as number] as { id?: string } | undefined;
      parts.push(`section « ${section?.id ?? `n°${(chemin[i + 1] as number) + 1}`} »`);
      courant = section;
      i += 1;
    } else if (cle === 'questions' && typeof chemin[i + 1] === 'number') {
      const question = (suivant as unknown[] | undefined)?.[chemin[i + 1] as number] as { id?: string } | undefined;
      parts.push(`question « ${question?.id ?? `n°${(chemin[i + 1] as number) + 1}`} »`);
      courant = question;
      i += 1;
    } else if (typeof cle === 'number') {
      parts.push(`élément n°${cle + 1}`);
      courant = suivant;
    } else {
      parts.push(`champ « ${cle} »`);
      courant = suivant;
    }
  }
  return parts.length ? parts.join(', ') : 'racine du fichier';
}

function traduireIssue(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'champ obligatoire manquant' : `valeur invalide (attendu : ${issue.expected}, reçu : ${issue.received})`;
    case 'unrecognized_keys':
      return `champ(s) inconnu(s) : ${issue.keys.join(', ')} (faute de frappe ?)`;
    case 'invalid_union_discriminator':
      return `type de question inconnu (attendu : ${issue.options.join(', ')})`;
    case 'invalid_enum_value':
      return `valeur « ${String(issue.received)} » non autorisée (attendu : ${issue.options.join(', ')})`;
    default:
      return issue.message;
  }
}

/** Contrôles de cohérence que le schéma ne sait pas exprimer (doublons, références, règles de score). */
function verifierCoherence(ref: Referentiel): string[] {
  const erreurs: string[] = [];

  const doublons = (ids: string[], quoi: string) => {
    const vus = new Set<string>();
    for (const id of ids) {
      if (vus.has(id)) erreurs.push(`${quoi} « ${id} » défini plusieurs fois (les identifiants doivent être uniques)`);
      vus.add(id);
    }
  };
  doublons(ref.sections.map((s) => s.id), 'section');
  doublons(ref.sections.flatMap((s) => s.questions.map((q) => q.id)), 'question');
  doublons(ref.prestations.map((p) => p.id), 'prestation');
  doublons(ref.niveaux.map((n) => n.id), 'niveau');
  doublons(ref.zones.types.map((z) => z.id), 'type de zone');

  // Niveaux : le premier démarre à 0, puis ordre strictement croissant.
  if (ref.niveaux[0].min !== 0) erreurs.push("le premier niveau de maturité doit commencer à 0 ('min: 0')");
  for (let i = 1; i < ref.niveaux.length; i++) {
    if (ref.niveaux[i].min <= ref.niveaux[i - 1].min) {
      erreurs.push(`niveaux de maturité : « ${ref.niveaux[i].id} » doit avoir un 'min' supérieur à celui de « ${ref.niveaux[i - 1].id} »`);
    }
  }

  const prestations = new Set(ref.prestations.map((p) => p.id));
  const connues = new Map<string, Question>();

  for (const section of ref.sections) {
    for (const q of section.questions) {
      const ou = `section « ${section.id} », question « ${q.id} »`;

      if (q.prestation && !prestations.has(q.prestation)) {
        erreurs.push(`${ou} : la prestation « ${q.prestation} » n'existe pas dans la liste 'prestations'`);
      }

      if (q.afficherSi) {
        const cible = connues.get(q.afficherSi.question);
        if (!cible) {
          erreurs.push(`${ou} : 'afficherSi' fait référence à « ${q.afficherSi.question} », qui doit être une question définie AVANT celle-ci`);
        } else {
          const attendues = valeursPossibles(cible);
          const demandees = q.afficherSi.dans ?? q.afficherSi.sauf ?? [];
          for (const v of demandees) {
            if (attendues && !attendues.includes(v)) {
              erreurs.push(`${ou} : 'afficherSi' utilise la valeur « ${v} » qui n'existe pas pour « ${cible.id} » (valeurs possibles : ${attendues.join(', ')})`);
            }
          }
        }
      }

      if ((q.type === 'texte' || q.type === 'photo' || q.type === 'date') && q.poids > 0) {
        erreurs.push(`${ou} : une question de type « ${q.type} » ne peut pas être notée (mettre 'poids: 0')`);
      }

      if (q.piste && q.poids <= 0) {
        erreurs.push(`${ou} : une 'piste' est définie mais la question n'est pas notée (poids: 0) : elle ne serait jamais proposée`);
      }

      if (q.type === 'choix') {
        const valeurs = q.options.map((o) => o.valeur);
        doublons(valeurs, `${ou} : option`);
        if (q.poids > 0 && !q.options.some((o) => typeof o.score === 'number')) {
          erreurs.push(`${ou} : question notée (poids > 0) mais aucune option n'a de 'score'`);
        }
        if (q.agregat && !q.multiple) {
          erreurs.push(`${ou} : 'agregat' n'a de sens qu'avec 'multiple: true'`);
        }
      }

      if (q.type === 'nombre') {
        if (q.poids > 0 && !q.score) erreurs.push(`${ou} : question notée (poids > 0) mais sans règle 'score.tranches'`);
        if (q.min !== undefined && q.max !== undefined && q.min >= q.max) erreurs.push(`${ou} : 'min' doit être inférieur à 'max'`);
        if (q.score) {
          const t = q.score.tranches;
          for (let i = 0; i < t.length; i++) {
            const dernier = i === t.length - 1;
            const borne = t[i].jusqua;
            if (dernier && borne != null) erreurs.push(`${ou} : la dernière tranche doit être sans 'jusqua' (ou 'jusqua: null') pour couvrir « et au-delà »`);
            if (!dernier && borne == null) erreurs.push(`${ou} : seule la dernière tranche peut être sans 'jusqua'`);
            if (!dernier && i > 0 && borne != null && t[i - 1].jusqua != null && borne <= (t[i - 1].jusqua as number)) {
              erreurs.push(`${ou} : les tranches doivent être classées par 'jusqua' croissant`);
            }
          }
        }
      }

      connues.set(q.id, q);
    }
  }
  return erreurs;
}

/** Valeurs qu'une question peut prendre dans une condition 'afficherSi' (undefined = non contrôlable). */
function valeursPossibles(q: Question): string[] | undefined {
  if (q.type === 'bool') {
    const base: string[] = q.reponses ? [...q.reponses] : ['oui', 'non', 'partiel', 'nsp'];
    if (q.sansObjet) base.push('na');
    return base;
  }
  if (q.type === 'choix') return q.options.map((o) => o.valeur);
  return undefined;
}

/**
 * Lit et valide un référentiel au format YAML (ou JSON, qui en est un sous-ensemble).
 * Lève une ErreurReferentiel listant tous les problèmes trouvés.
 */
export function parserReferentiel(contenu: string): Referentiel {
  let brut: unknown;
  try {
    brut = parseYaml(contenu);
  } catch (e) {
    const ligne = e instanceof YAMLParseError && e.linePos ? ` (ligne ${e.linePos[0].line})` : '';
    throw new ErreurReferentiel([`le fichier n'est pas un YAML valide${ligne} : ${(e as Error).message.split('\n')[0]}`]);
  }
  if (brut === null || typeof brut !== 'object') {
    throw new ErreurReferentiel(['le fichier est vide ou ne contient pas de structure YAML']);
  }

  const resultat = referentielSchema.safeParse(brut);
  if (!resultat.success) {
    throw new ErreurReferentiel(resultat.error.issues.map((i) => `${decrireChemin(brut, i.path)} : ${traduireIssue(i)}`));
  }

  const erreurs = verifierCoherence(resultat.data);
  if (erreurs.length) throw new ErreurReferentiel(erreurs);
  return resultat.data;
}

/** Compare deux versions « 1.2.0 » (retourne >0 si a est plus récent que b). */
export function comparerVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
