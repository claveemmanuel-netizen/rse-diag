import { db } from '../db/base';
import { STATUTS } from '../domain/types';
import {
  ACTIONS_SUIVANTES_TEST,
  NOTES_SYNTHESE_TEST,
  champsVidesDeLaFiche,
  decalageRelanceTest,
  ficheTest,
  generateurAlea,
  notesVocalesTest,
  reponsesTest,
  zonesTest,
  type FicheTest,
} from '../lib/donneesTest';
import { photoTest, signatureTest } from '../lib/imagesTest';
import { ajouterJours, aujourdhui, maintenant } from '../lib/outils';
import { referentielPour } from '../referentiel';
import {
  ajouterNoteVocale,
  ajouterPhoto,
  ajouterZone,
  creerVisite,
  definirStatutCommercial,
  enregistrerReponse,
  lireReponses,
  mettreAJourProspectEtSite,
  modifierVisite,
  modifierZone,
  recalculerScores,
  reponsesEnTable,
} from './depot';

// Remplissage de DONNÉES DE TEST (démonstration et recette) : uniquement des champs vides,
// jamais d'écrasement de ce que l'utilisateur a saisi. Relancer l'action ne duplique rien.

type FabriquePhoto = typeof photoTest;

export interface OptionsRemplissage {
  /** Même graine = mêmes données (par défaut : l'heure courante). */
  graine?: number;
  /** Ajoute des photos et une signature factices (nécessite un navigateur : canvas). Par défaut : oui. */
  images?: boolean;
  /** Fabriques d'images alternatives (tests, sans navigateur). */
  fabriquePhoto?: FabriquePhoto;
  fabriqueSignature?: () => string;
}

export interface BilanRemplissage {
  reponses: number;
  zones: number;
  photos: number;
  notes: number;
}

const CLES_PROSPECT: (keyof FicheTest)[] = ['raisonSociale', 'siret', 'secteur', 'effectif', 'contactNom', 'contactFonction', 'contactEmail', 'contactTel'];

async function lireContexte(visiteId: string) {
  const visite = await db.visites.get(visiteId);
  if (!visite || visite.deletedAt) throw new Error('Visite introuvable.');
  const site = await db.sites.get(visite.siteId);
  const prospect = site ? await db.prospects.get(site.prospectId) : undefined;
  return { visite, site, prospect, ref: referentielPour(visite.referentielVersion) };
}

/** Complète les champs vides de la fiche prospect / site et la date prévue. */
async function completerFiche(visiteId: string, graine: number): Promise<void> {
  const { visite, site, prospect } = await lireContexte(visiteId);
  const actuelle = {
    raisonSociale: prospect?.raisonSociale,
    siret: prospect?.siret,
    secteur: prospect?.secteur,
    effectif: prospect?.effectif,
    adresse: site?.adresse,
    codePostal: site?.codePostal,
    ville: site?.ville,
    lat: site?.lat,
    lng: site?.lng,
    surfaceEstimeeM2: site?.surfaceEstimeeM2,
    contactNom: prospect?.contactNom,
    contactFonction: prospect?.contactFonction,
    contactEmail: prospect?.contactEmail,
    contactTel: prospect?.contactTel,
  };
  const manquants = champsVidesDeLaFiche(actuelle, ficheTest(graine));
  const prospectPatch: Record<string, unknown> = {};
  const sitePatch: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(manquants)) {
    if ((CLES_PROSPECT as string[]).includes(cle)) prospectPatch[cle] = valeur;
    else sitePatch[cle] = valeur;
  }
  await mettreAJourProspectEtSite(visiteId, prospectPatch, sitePatch, visite.datePrevue ? {} : { datePrevue: aujourdhui() });
}

/** Crée les zones de test manquantes et complète les champs vides des zones existantes. */
async function completerZones(visiteId: string, alea: ReturnType<typeof generateurAlea>): Promise<number> {
  const { ref } = await lireContexte(visiteId);
  const existantes = (await db.zones.where('visiteId').equals(visiteId).toArray()).filter((z) => !z.deletedAt);
  const modeles = zonesTest(ref, alea, 99);

  for (const zone of existantes) {
    const modele = modeles.find((m) => m.typeId === zone.typeId);
    if (!modele) continue;
    const patch: Record<string, unknown> = {};
    if (!zone.nom) patch.nom = modele.nom;
    if (!zone.etatId) patch.etatId = modele.etatId;
    if (!zone.tailleId && zone.surfaceM2 == null) {
      patch.tailleId = modele.tailleId;
      patch.surfaceM2 = modele.surfaceM2;
    }
    if (!zone.note) patch.note = modele.note;
    if (Object.keys(patch).length) await modifierZone(zone.id, patch);
  }

  const presents = new Set(existantes.map((z) => z.typeId));
  const aCreer = zonesTest(ref, alea, 6).filter((m) => !presents.has(m.typeId));
  for (const m of aCreer) {
    const id = await ajouterZone(visiteId, m.typeId);
    await modifierZone(id, { nom: m.nom, surfaceM2: m.surfaceM2, tailleId: m.tailleId, etatId: m.etatId, note: m.note });
  }
  return aCreer.length;
}

/** Ajoute des zones de test (écran « Zones »). Retourne le nombre de zones créées. */
export async function ajouterZonesTest(visiteId: string, graine: number = Date.now()): Promise<number> {
  const crees = await completerZones(visiteId, generateurAlea(graine));
  await recalculerScores(visiteId);
  return crees;
}

/** Remplit les questions de test (toutes les sections, ou une seule). Retourne le nombre de réponses ajoutées. */
async function completerReponses(visiteId: string, alea: ReturnType<typeof generateurAlea>, sectionId?: string): Promise<number> {
  const { visite, ref } = await lireContexte(visiteId);
  const existantes = reponsesEnTable(await lireReponses(visiteId));
  const { valeurs, commentaires } = reponsesTest(ref, alea, existantes, sectionId);
  for (const [questionId, valeur] of Object.entries(valeurs)) {
    await enregistrerReponse(visiteId, questionId, { valeur, ...(commentaires[questionId] ? { commentaire: commentaires[questionId] } : {}) });
  }
  const ignorees = visite.sectionsIgnorees.filter((id) => (sectionId ? id !== sectionId : false));
  if (ignorees.length !== visite.sectionsIgnorees.length) await modifierVisite(visiteId, { sectionsIgnorees: ignorees });
  return Object.keys(valeurs).length;
}

/** Remplit uniquement les questions d'une section (écran « Questionnaire »). */
export async function remplirSectionTest(visiteId: string, sectionId: string, graine: number = Date.now()): Promise<number> {
  const nombre = await completerReponses(visiteId, generateurAlea(graine), sectionId);
  await recalculerScores(visiteId);
  return nombre;
}

/** Ajoute quelques photos factices (zones puis questions) si la visite n'en a aucune. */
async function ajouterPhotosTest(visiteId: string, graine: number, fabrique: FabriquePhoto): Promise<number> {
  const { site, ref } = await lireContexte(visiteId);
  const existantes = (await db.photos.where('visiteId').equals(visiteId).toArray()).filter((p) => !p.deletedAt);
  if (existantes.length > 0) return 0;

  const zones = (await db.zones.where('visiteId').equals(visiteId).toArray()).filter((z) => !z.deletedAt).slice(0, 3);
  const questions = ref.sections
    .filter((s) => s.type === 'pilier')
    .slice(0, 2)
    .map((s) => s.questions[0])
    .filter(Boolean);
  const cibles = [
    ...zones.map((z) => ({ zoneId: z.id, questionId: null as string | null, legende: z.nom ?? 'Zone' })),
    ...questions.map((q) => ({ zoneId: null as string | null, questionId: q.id, legende: q.libelle })),
  ];

  let numero = 0;
  for (const cible of cibles) {
    const image = await fabrique(cible.legende, graine + numero);
    await ajouterPhoto({
      visiteId,
      zoneId: cible.zoneId,
      questionId: cible.questionId,
      blob: image.blob,
      mime: 'image/jpeg',
      largeur: image.largeur,
      hauteur: image.hauteur,
      prisLe: maintenant(),
      // Position simulée à proximité du site, comme le ferait le GPS du téléphone.
      lat: site?.lat != null ? site.lat + (((graine + numero) % 7) - 3) * 0.00008 : null,
      lng: site?.lng != null ? site.lng + (((graine + numero) % 5) - 2) * 0.00008 : null,
      precisionM: 12,
      legende: cible.legende,
    });
    numero++;
  }
  return numero;
}

/**
 * Remplit TOUTE la visite avec des données fictives : fiche, RGPD, questionnaire, zones, photos,
 * notes vocales, synthèse, signature et suivi commercial. Seuls les champs vides sont touchés.
 * La visite n'est pas clôturée : l'utilisateur garde la main sur l'étape finale.
 */
export async function remplirVisiteTest(visiteId: string, options: OptionsRemplissage = {}): Promise<BilanRemplissage> {
  const graine = options.graine ?? Date.now();
  const alea = generateurAlea(graine);

  await completerFiche(visiteId, graine);

  const { visite, ref } = await lireContexte(visiteId);
  const maintenantIso = maintenant();
  await modifierVisite(visiteId, {
    ...(visite.rgpdInformee ? {} : { rgpdInformee: true, rgpdInformeeLe: maintenantIso }),
    ...(visite.consentementRapport ? {} : { consentementRapport: true, consentementRapportLe: maintenantIso }),
    ...(visite.notesSynthese ? {} : { notesSynthese: NOTES_SYNTHESE_TEST }),
    ...(visite.signature || options.images === false ? {} : { signature: (options.fabriqueSignature ?? signatureTest)() }),
  });

  const reponses = await completerReponses(visiteId, alea);
  const zones = await completerZones(visiteId, alea);
  const photos = options.images === false ? 0 : await ajouterPhotosTest(visiteId, graine, options.fabriquePhoto ?? photoTest);

  let notes = 0;
  const notesExistantes = (await db.notesVocales.where('visiteId').equals(visiteId).toArray()).filter((n) => !n.deletedAt);
  if (notesExistantes.length === 0) {
    for (const note of notesVocalesTest(ref)) {
      await ajouterNoteVocale(visiteId, note.texte, note.contexte);
      notes++;
    }
  }

  const statut = await db.statuts.get(visiteId);
  await definirStatutCommercial(
    visiteId,
    {
      ...(statut && statut.historique.length > 0 ? {} : { statut: STATUTS[Math.floor(alea() * STATUTS.length)].id }),
      ...(statut?.prochaineAction ? {} : { prochaineAction: ACTIONS_SUIVANTES_TEST }),
      ...(statut?.dateRelance ? {} : { dateRelance: ajouterJours(aujourdhui(), decalageRelanceTest(alea)) }),
    },
    visite.utilisateurId,
  );

  await recalculerScores(visiteId);
  return { reponses, zones, photos, notes };
}

/** Crée une visite fictive complète (fiche + tout le reste) et retourne son identifiant. */
export async function creerVisiteTest(utilisateurId: string, options: OptionsRemplissage = {}): Promise<string> {
  const graine = options.graine ?? Date.now();
  const f = ficheTest(graine);
  const visiteId = await creerVisite({
    prospect: {
      raisonSociale: f.raisonSociale,
      siret: f.siret,
      secteur: f.secteur,
      effectif: f.effectif,
      contactNom: f.contactNom,
      contactFonction: f.contactFonction,
      contactEmail: f.contactEmail,
      contactTel: f.contactTel,
      creePar: utilisateurId,
    },
    site: { adresse: f.adresse, codePostal: f.codePostal, ville: f.ville, lat: f.lat, lng: f.lng, surfaceEstimeeM2: f.surfaceEstimeeM2 },
    utilisateurId,
    datePrevue: aujourdhui(),
  });
  await remplirVisiteTest(visiteId, { ...options, graine });
  return visiteId;
}
