import { comparerVersions, parserReferentiel } from './parseur';
import type { Question, Referentiel, Section } from './schema';

// Tous les fichiers YAML du dossier `referentiel/` sont embarqués dans l'application :
// une visite ancienne reste lisible avec SA version de référentiel.
const fichiers = import.meta.glob('../../referentiel/*.{yaml,yml}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const referentiels = new Map<string, Referentiel>();
for (const [chemin, contenu] of Object.entries(fichiers)) {
  try {
    const ref = parserReferentiel(contenu);
    referentiels.set(ref.version, ref);
  } catch (e) {
    // Une erreur dans le fichier est affichée clairement au démarrage plutôt qu'ignorée.
    console.error(`Référentiel invalide (${chemin})`, e);
    throw e;
  }
}

if (referentiels.size === 0) throw new Error("Aucun référentiel trouvé dans le dossier 'referentiel/'.");

const versions = [...referentiels.keys()].sort(comparerVersions);
export const versionActive = versions[versions.length - 1];
export const referentielActif: Referentiel = referentiels.get(versionActive)!;

/** Référentiel d'une visite donnée (version mémorisée ; à défaut, la version la plus récente). */
export function referentielPour(version: string | undefined | null): Referentiel {
  return (version && referentiels.get(version)) || referentielActif;
}

export function trouverSection(ref: Referentiel, id: string | undefined): Section | undefined {
  return ref.sections.find((s) => s.id === id);
}

export function trouverQuestion(ref: Referentiel, id: string): { question: Question; section: Section } | undefined {
  for (const section of ref.sections) {
    const question = section.questions.find((q) => q.id === id);
    if (question) return { question, section };
  }
  return undefined;
}

export const toutesQuestions = (ref: Referentiel): Question[] => ref.sections.flatMap((s) => s.questions);
