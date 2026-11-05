import type { ChronoSection } from '../domain/types';
import type { Referentiel, Section } from '../referentiel/schema';

// Durées estimées de remplissage et cumul du temps passé : fonctions pures, testables sans écran.

/** Clé du chronomètre de l'inventaire des zones (les autres clés sont les identifiants de section). */
export const CLE_CHRONO_ZONES = 'zones';

/** Durées par défaut (secondes) ; surchargeables dans la rubrique « durees » du référentiel. */
export const DUREES_PAR_DEFAUT = {
  bool: 12,
  choix: 15,
  nombre: 12,
  texte: 30,
  photo: 20,
  date: 10,
  zones: 240,
  objectifMinutes: 30,
} as const;

export type DureesEffectives = { [K in keyof typeof DUREES_PAR_DEFAUT]: number };

export function dureesEffectives(ref: Pick<Referentiel, 'durees'>): DureesEffectives {
  return { ...DUREES_PAR_DEFAUT, ...ref.durees };
}

/** Temps estimé (secondes) pour remplir une section : somme des questions actuellement visibles. */
export function secondesEstimeesSection(ref: Pick<Referentiel, 'durees'>, section: Section, visibles: Set<string>): number {
  const durees = dureesEffectives(ref);
  return section.questions.filter((q) => visibles.has(q.id)).reduce((somme, q) => somme + durees[q.type], 0);
}

export interface EstimationVisite {
  /** Estimation par clé de chrono (identifiant de section, puis « zones »). */
  parCle: Record<string, number>;
  totalSecondes: number;
  objectifSecondes: number;
}

/** Estimation de toutes les étapes chronométrées : sections du référentiel + inventaire des zones. */
export function estimerVisite(ref: Referentiel, visibles: Set<string>): EstimationVisite {
  const durees = dureesEffectives(ref);
  const parCle: Record<string, number> = {};
  for (const s of ref.sections) parCle[s.id] = secondesEstimeesSection(ref, s, visibles);
  parCle[CLE_CHRONO_ZONES] = durees.zones;
  return {
    parCle,
    totalSecondes: Object.values(parCle).reduce((a, b) => a + b, 0),
    objectifSecondes: durees.objectifMinutes * 60,
  };
}

/** Cumule le temps passé : ne recule jamais, et crée l'entrée (avec sa date de début) à la première modification. */
export function cumulerChrono(chronos: Record<string, ChronoSection> | null | undefined, cle: string, secondes: number, maintenantIso: string): Record<string, ChronoSection> {
  const actuel = chronos?.[cle];
  const valeur = Math.max(0, Math.floor(secondes));
  if (actuel && valeur <= actuel.secondes) return chronos as Record<string, ChronoSection>;
  return { ...chronos, [cle]: { secondes: valeur, debutLe: actuel?.debutLe ?? maintenantIso } };
}

export function totalChronos(chronos: Record<string, ChronoSection> | null | undefined): number {
  return Object.values(chronos ?? {}).reduce((somme, c) => somme + c.secondes, 0);
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** Affichage d'un chronomètre : « 03:12 », ou « 1:02:05 » au-delà d'une heure. */
export function formaterChrono(secondes: number): string {
  const total = Math.max(0, Math.floor(secondes));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${deuxChiffres(m)}:${deuxChiffres(s)}` : `${deuxChiffres(m)}:${deuxChiffres(s)}`;
}

/** Affichage d'une estimation : « ~4 min » (arrondie à la minute, 1 min au minimum). */
export function formaterEstimation(secondes: number): string {
  return `~${Math.max(1, Math.round(secondes / 60))} min`;
}

/** Minutes arrondies à la minute (colonne d'export). */
export const enMinutes = (secondes: number): number => Math.round(secondes / 60);
