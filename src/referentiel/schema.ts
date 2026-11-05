import { z } from 'zod';

// Schéma Zod du référentiel de questions (fichier YAML éditable sans coder).
// Les messages d'erreur sont rédigés pour être compris par un non-développeur.

const identifiant = z
  .string({ required_error: 'identifiant manquant' })
  .regex(/^[a-z0-9_-]+$/i, 'identifiant invalide (lettres, chiffres, _ et - uniquement, sans espace)');

const scoreSur100 = z.number().min(0, 'le score doit être entre 0 et 100').max(100, 'le score doit être entre 0 et 100');

export const conditionSchema = z
  .object({
    question: identifiant,
    dans: z.array(z.string()).min(1).optional(),
    sauf: z.array(z.string()).min(1).optional(),
  })
  .strict()
  .refine((c) => Boolean(c.dans) !== Boolean(c.sauf), {
    message: "une condition 'afficherSi' doit contenir soit 'dans', soit 'sauf' (pas les deux, pas aucun)",
  });

export const pisteSchema = z
  .object({
    titre: z.string().min(1),
    texte: z.string().min(1),
    effort: z.enum(['faible', 'moyen', 'eleve']).optional(),
  })
  .strict();

const baseQuestion = {
  id: identifiant,
  libelle: z.string().min(1, 'libellé manquant'),
  poids: z.number().min(0, 'le poids doit être positif ou nul').max(10, 'le poids doit être entre 0 et 10').default(0),
  pourquoi: z.string().optional(),
  piste: pisteSchema.optional(),
  prestation: identifiant.optional(),
  afficherSi: conditionSchema.optional(),
  cleExport: z.string().regex(/^[a-z0-9_]+$/).optional(),
};

export const valeursBool = ['oui', 'non', 'partiel', 'nsp'] as const;

const questionBool = z
  .object({
    ...baseQuestion,
    type: z.literal('bool'),
    reponses: z.array(z.enum(valeursBool)).min(2).optional(),
    sansObjet: z.boolean().optional(),
    score: z
      .object({
        oui: scoreSur100.optional(),
        non: scoreSur100.optional(),
        partiel: scoreSur100.optional(),
        nsp: scoreSur100.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const optionChoix = z
  .object({
    valeur: identifiant,
    libelle: z.string().min(1),
    // null (ou absent) = option non comptabilisée (ex. « Ne sait pas »).
    score: scoreSur100.nullable().optional(),
    // Option exclusive : elle désélectionne les autres (ex. « Aucun »).
    exclusif: z.boolean().optional(),
  })
  .strict();

const questionChoix = z
  .object({
    ...baseQuestion,
    type: z.literal('choix'),
    options: z.array(optionChoix).min(2, 'une question à choix doit avoir au moins 2 options'),
    multiple: z.boolean().optional(),
    agregat: z.enum(['somme', 'max', 'moyenne', 'min']).optional(),
  })
  .strict();

const questionNombre = z
  .object({
    ...baseQuestion,
    type: z.literal('nombre'),
    unite: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pas: z.number().positive().optional(),
    affichage: z.enum(['compteur', 'curseur']).optional(),
    score: z
      .object({
        tranches: z
          .array(
            z
              .object({
                // Borne haute INCLUSE ; absente ou null = « et au-delà ».
                jusqua: z.number().nullable().optional(),
                score: scoreSur100,
              })
              .strict(),
          )
          .min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

const questionTexte = z
  .object({ ...baseQuestion, type: z.literal('texte'), multiligne: z.boolean().optional() })
  .strict();
const questionPhoto = z.object({ ...baseQuestion, type: z.literal('photo') }).strict();
const questionDate = z.object({ ...baseQuestion, type: z.literal('date') }).strict();

export const questionSchema = z.discriminatedUnion('type', [
  questionBool,
  questionChoix,
  questionNombre,
  questionTexte,
  questionPhoto,
  questionDate,
]);

export const sectionSchema = z
  .object({
    id: identifiant,
    libelle: z.string().min(1),
    /** Intitulé abrégé pour les axes du radar (par défaut : le libellé complet). */
    libelleCourt: z.string().min(1).max(30, 'libellé court : 30 caractères maximum').optional(),
    type: z.enum(['qualification', 'pilier']),
    icone: z.string().optional(),
    description: z.string().optional(),
    poidsPilier: z.number().min(0).optional(),
    questions: z.array(questionSchema).min(1, 'une section doit contenir au moins une question'),
  })
  .strict();

const secondesEstimees = z.number().positive('la durée doit être un nombre de secondes supérieur à 0');

/** Durées estimées de remplissage (en secondes) ; les valeurs absentes prennent la valeur par défaut de `lib/chrono.ts`. */
export const dureesSchema = z
  .object({
    bool: secondesEstimees.optional(),
    choix: secondesEstimees.optional(),
    nombre: secondesEstimees.optional(),
    texte: secondesEstimees.optional(),
    photo: secondesEstimees.optional(),
    date: secondesEstimees.optional(),
    /** Inventaire des zones : durée estimée pour l'ensemble de l'étape. */
    zones: secondesEstimees.optional(),
    /** Objectif de durée de la collecte, en minutes. */
    objectifMinutes: z.number().positive('l\'objectif doit être un nombre de minutes supérieur à 0').optional(),
  })
  .strict();

export const referentielSchema = z
  .object({
    version: z.string().regex(/^\d+(\.\d+){0,2}$/, "la version doit ressembler à '1.0.0'"),
    nom: z.string().min(1),
    niveaux: z
      .array(
        z
          .object({
            id: identifiant,
            libelle: z.string().min(1),
            min: z.number().min(0).max(100),
            couleur: z.string().optional(),
            description: z.string().optional(),
          })
          .strict(),
      )
      .min(2),
    quickWins: z
      .object({
        max: z.number().int().min(1).default(5),
        seuil: z.number().min(0).max(100).default(50),
        maxParPilier: z.number().int().min(1).default(2),
      })
      .strict()
      .default({}),
    pointsForts: z
      .object({
        max: z.number().int().min(1).default(5),
        seuil: z.number().min(0).max(100).default(80),
      })
      .strict()
      .default({}),
    durees: dureesSchema.default({}),
    prestations: z
      .array(z.object({ id: identifiant, libelle: z.string().min(1), description: z.string().optional() }).strict())
      .default([]),
    zones: z
      .object({
        types: z.array(z.object({ id: identifiant, libelle: z.string().min(1), icone: z.string().optional() }).strict()).min(1),
        etats: z.array(z.object({ id: identifiant, libelle: z.string().min(1) }).strict()).min(2),
        tailles: z
          .array(z.object({ id: identifiant, libelle: z.string().min(1), m2Indicatif: z.number().positive() }).strict())
          .min(2),
      })
      .strict(),
    sections: z.array(sectionSchema).min(1),
  })
  .strict();

export type ReferentielBrut = z.input<typeof referentielSchema>;
export type Referentiel = z.output<typeof referentielSchema>;
export type Section = Referentiel['sections'][number];
export type Question = Section['questions'][number];
export type QuestionBool = Extract<Question, { type: 'bool' }>;
export type QuestionChoix = Extract<Question, { type: 'choix' }>;
export type QuestionNombre = Extract<Question, { type: 'nombre' }>;
export type Niveau = Referentiel['niveaux'][number];
export type Condition = z.infer<typeof conditionSchema>;
export type Piste = z.infer<typeof pisteSchema>;
export type ValeurBool = (typeof valeursBool)[number] | 'na';
