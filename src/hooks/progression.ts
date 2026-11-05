import { useMemo } from 'react';
import type { Referentiel } from '../referentiel/schema';
import { progressionSection, questionsVisibles, type Progression, type Reponses } from '../scoring/moteur';
import { usePhotos, useReponses } from './donnees';

export interface ProgressionVisite {
  reponses: Reponses;
  commentaires: Record<string, string>;
  visibles: Set<string>;
  parSection: Record<string, Progression>;
  global: Progression;
  /** Nombre de photos par question. */
  photosParQuestion: Record<string, number>;
}

/** Réponses + avancement de chaque section (questions visibles répondues / questions visibles). */
export function useProgressionVisite(ref: Referentiel, visiteId: string): ProgressionVisite | undefined {
  const reps = useReponses(visiteId);
  const photos = usePhotos(visiteId);

  return useMemo(() => {
    if (!reps || !photos) return undefined;
    const photosParQuestion: Record<string, number> = {};
    for (const p of photos) if (p.questionId) photosParQuestion[p.questionId] = (photosParQuestion[p.questionId] ?? 0) + 1;
    const avecPhoto = new Set(Object.keys(photosParQuestion));
    const visibles = questionsVisibles(ref, reps.table);
    const parSection: Record<string, Progression> = {};
    let repondues = 0;
    let total = 0;
    for (const s of ref.sections) {
      const p = progressionSection(s, visibles, reps.table, avecPhoto);
      parSection[s.id] = p;
      repondues += p.repondues;
      total += p.total;
    }
    const commentaires = Object.fromEntries(reps.liste.filter((r) => r.commentaire).map((r) => [r.questionId, r.commentaire as string]));
    return {
      reponses: reps.table,
      commentaires,
      visibles,
      parSection,
      photosParQuestion,
      global: { repondues, total, pourcentage: total === 0 ? 0 : Math.round((repondues / total) * 100) },
    };
  }, [ref, reps, photos]);
}
