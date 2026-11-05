import { referentielPour } from '../referentiel';
import { CLE_CHRONO_ZONES, estimerVisite, totalChronos } from '../lib/chrono';
import { calculerScores } from '../scoring/moteur';
import { libelleReponse } from '../scoring/affichage';
import { surfaceZone } from '../lib/zones';
import { nomFichierSur, telecharger } from '../lib/outils';
import { depotDistant } from '../repository';
import type { DonneesVisite } from './donnees';
import { chargerDonneesVisite } from './donnees';

// Export JSON structuré d'une visite : entrée de la rédaction assistée par IA (et archive lisible).

export const VERSION_SCHEMA_EXPORT = 'rse-diag/visite@1';

export interface OptionsExport {
  /** Liens temporaires (signés) des photos déjà envoyées au serveur, par identifiant de photo. */
  urlsPhotos?: Record<string, string>;
  /** Retire les données personnelles du contact (envoi à un LLM : minimisation RGPD). */
  anonymiser?: boolean;
}

export function construireExportVisite(d: DonneesVisite, options: OptionsExport = {}) {
  const ref = referentielPour(d.visite.referentielVersion);
  const reponsesParQuestion = new Map(d.reponses.map((r) => [r.questionId, r]));
  const table = Object.fromEntries(d.reponses.map((r) => [r.questionId, r.valeur]));
  const resultat = calculerScores(ref, table);
  const photosParQuestion = new Map<string, string[]>();
  const photosParZone = new Map<string, string[]>();
  for (const p of d.photos) {
    if (p.questionId) photosParQuestion.set(p.questionId, [...(photosParQuestion.get(p.questionId) ?? []), p.id]);
    if (p.zoneId) photosParZone.set(p.zoneId, [...(photosParZone.get(p.zoneId) ?? []), p.id]);
  }

  const reponses = ref.sections.flatMap((section) =>
    section.questions
      .filter((q) => resultat.visibles.has(q.id))
      .map((q) => {
        const r = reponsesParQuestion.get(q.id);
        const valeur = r?.valeur ?? null;
        return {
          questionId: q.id,
          section: section.id,
          typeSection: section.type,
          question: q.libelle,
          type: q.type,
          repondue: libelleReponse(q, valeur) !== '' || (photosParQuestion.get(q.id)?.length ?? 0) > 0,
          valeur,
          valeurLibelle: libelleReponse(q, valeur) || null,
          score: resultat.parQuestion[q.id] ?? null,
          poids: q.poids,
          commentaire: r?.commentaire || null,
          photos: photosParQuestion.get(q.id) ?? [],
        };
      }),
  );

  // Réponses de qualification à plat (clé d'export → texte), pratique pour un tableur ou un prompt.
  const qualification: Record<string, string> = {};
  for (const section of ref.sections.filter((s) => s.type === 'qualification')) {
    for (const q of section.questions) {
      if (q.cleExport) qualification[q.cleExport] = libelleReponse(q, table[q.id]);
    }
  }

  const prospect = d.prospect;
  const estimation = estimerVisite(ref, resultat.visibles);
  const chronos = d.visite.chronos ?? {};
  const etapesChrono = [...ref.sections.map((s) => ({ cle: s.id, libelle: s.libelle })), { cle: CLE_CHRONO_ZONES, libelle: 'Inventaire des zones' }];
  return {
    schema: VERSION_SCHEMA_EXPORT,
    exporteLe: new Date().toISOString(),
    referentiel: { version: ref.version, nom: ref.nom },
    visite: {
      id: d.visite.id,
      etat: d.visite.etat,
      datePrevue: d.visite.datePrevue ?? null,
      dateDebut: d.visite.dateDebut ?? null,
      dateFin: d.visite.dateFin ?? null,
      chargeAffaires: d.chargeAffaires?.nom ?? null,
      rgpdInformee: d.visite.rgpdInformee,
      consentementRapport: d.visite.consentementRapport,
      signatureRecueillie: Boolean(d.visite.signature),
    },
    // Temps de collecte : estimation par étape et temps réellement passé (chrono déclenché à la première modification).
    chronometrage: {
      objectifMinutes: Math.round(estimation.objectifSecondes / 60),
      totalEstimeSecondes: estimation.totalSecondes,
      totalPasseSecondes: totalChronos(chronos),
      etapes: etapesChrono.map((e) => ({
        id: e.cle,
        libelle: e.libelle,
        estimeSecondes: estimation.parCle[e.cle],
        passeSecondes: chronos[e.cle]?.secondes ?? null,
        debutLe: chronos[e.cle]?.debutLe ?? null,
      })),
    },
    prospect: prospect
      ? {
          raisonSociale: prospect.raisonSociale,
          siret: prospect.siret ?? null,
          secteur: prospect.secteur ?? null,
          effectif: prospect.effectif ?? null,
          ...(options.anonymiser
            ? {}
            : {
                contact: {
                  nom: prospect.contactNom ?? null,
                  fonction: prospect.contactFonction ?? null,
                  email: prospect.contactEmail ?? null,
                  telephone: prospect.contactTel ?? null,
                },
              }),
        }
      : null,
    site: d.site
      ? {
          adresse: d.site.adresse,
          codePostal: d.site.codePostal ?? null,
          ville: d.site.ville ?? null,
          lat: d.site.lat ?? null,
          lng: d.site.lng ?? null,
          surfaceEstimeeM2: d.site.surfaceEstimeeM2 ?? null,
        }
      : null,
    qualification,
    scores: {
      global: {
        score: resultat.global.score,
        niveau: resultat.global.niveau?.libelle ?? null,
        couverture: Math.round(resultat.global.couverture * 100) / 100,
      },
      piliers: resultat.piliers.map((p) => ({
        id: p.sectionId,
        libelle: p.libelle,
        score: p.score,
        niveau: p.niveau?.libelle ?? null,
        couverture: Math.round(p.couverture * 100) / 100,
      })),
    },
    reponses,
    zones: d.zones.map((z) => ({
      id: z.id,
      type: z.typeId,
      typeLibelle: ref.zones.types.find((t) => t.id === z.typeId)?.libelle ?? z.typeId,
      nom: z.nom || null,
      surfaceSaisieM2: z.surfaceM2 ?? null,
      surfaceRetenueM2: surfaceZone(ref, z),
      taille: ref.zones.tailles.find((t) => t.id === z.tailleId)?.libelle ?? null,
      etat: ref.zones.etats.find((e) => e.id === z.etatId)?.libelle ?? null,
      observation: z.note || null,
      photos: photosParZone.get(z.id) ?? [],
    })),
    observations: {
      syntheseSaisie: d.visite.notesSynthese || null,
      commentairesQuestions: reponses.filter((r) => r.commentaire).map((r) => ({ questionId: r.questionId, question: r.question, texte: r.commentaire })),
    },
    notesVocales: d.notes.map((n) => ({ id: n.id, contexte: n.contexte ?? null, creeLe: n.updatedAt, transcription: n.texte })),
    photos: d.photos.map((p) => ({
      id: p.id,
      questionId: p.questionId ?? null,
      zoneId: p.zoneId ?? null,
      prisLe: p.prisLe,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      precisionM: p.precisionM ?? null,
      legende: p.legende || null,
      largeur: p.largeur,
      hauteur: p.hauteur,
      cheminStorage: p.storagePath ?? null,
      lien: options.urlsPhotos?.[p.id] ?? null,
    })),
    pointsForts: resultat.pointsForts.map((f) => ({ questionId: f.questionId, pilier: f.pilier, constat: f.libelle, score: f.score })),
    recommandations: d.recommandations.map((r) => ({
      titre: r.titre,
      texte: r.texte,
      priorite: r.priorite,
      pilier: r.pilier ?? null,
      source: r.source,
      retenue: r.retenue,
      prestation: ref.prestations.find((p) => p.id === r.prestationId)?.libelle ?? null,
    })),
    statutCommercial: d.statut
      ? { statut: d.statut.statut, prochaineAction: d.statut.prochaineAction ?? null, dateRelance: d.statut.dateRelance ?? null }
      : null,
  };
}

export type ExportVisite = ReturnType<typeof construireExportVisite>;

/** Liens temporaires des photos déjà envoyées (7 jours) ; ignoré hors ligne ou en mode local. */
async function urlsDesPhotos(d: DonneesVisite): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  if (!depotDistant || !navigator.onLine) return urls;
  await Promise.all(
    d.photos
      .filter((p) => p.storagePath)
      .map(async (p) => {
        const url = await depotDistant!.urlPhoto(p.storagePath as string, 7 * 24 * 3600).catch(() => null);
        if (url) urls[p.id] = url;
      }),
  );
  return urls;
}

export async function preparerExportVisite(visiteId: string, options: OptionsExport = {}): Promise<ExportVisite> {
  const donnees = await chargerDonneesVisite(visiteId);
  if (!donnees) throw new Error('Visite introuvable.');
  return construireExportVisite(donnees, { ...options, urlsPhotos: options.urlsPhotos ?? (await urlsDesPhotos(donnees)) });
}

export async function telechargerJson(visiteId: string): Promise<void> {
  const donnees = await preparerExportVisite(visiteId);
  const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json;charset=utf-8' });
  const jour = new Date().toISOString().slice(0, 10);
  telecharger(blob, `visite-${nomFichierSur(donnees.prospect?.raisonSociale ?? 'prospect')}-${jour}.json`);
}
