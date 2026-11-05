import { entreprise } from '../../config/entreprise';
import { depotDistant } from '../../repository';
import { blobVersDataUrl, compresserImage } from '../../lib/photos';
import { nomFichierSur, telecharger } from '../../lib/outils';
import { chargerDonneesVisite, type DonneesVisite } from '../donnees';

// Génération du pré-rapport PDF. Le moteur PDF (lourd) n'est chargé qu'au moment de l'export.

/** Largeur maximale des photos intégrées au PDF : suffisant à l'impression et garde un fichier léger. */
const TAILLE_PHOTO_PDF = 800;

async function blobDePhoto(photo: DonneesVisite['photos'][number]): Promise<Blob | null> {
  if (photo.blob) return photo.blob;
  if (photo.storagePath && depotDistant && navigator.onLine) {
    try {
      const url = await depotDistant.urlPhoto(photo.storagePath);
      if (!url) return null;
      const reponse = await fetch(url);
      return reponse.ok ? await reponse.blob() : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function imagesDuRapport(d: DonneesVisite): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (const photo of d.photos) {
    const blob = await blobDePhoto(photo);
    if (!blob) continue;
    try {
      const reduite = await compresserImage(blob, 0.75, TAILLE_PHOTO_PDF);
      images[photo.id] = await blobVersDataUrl(reduite.blob);
    } catch {
      // Une photo illisible ne doit pas empêcher la génération du rapport.
    }
  }
  return images;
}

async function logoEnDataUrl(): Promise<string | null> {
  try {
    const reponse = await fetch(entreprise.logo);
    if (!reponse.ok || !(reponse.headers.get('content-type') ?? '').startsWith('image/')) return null;
    return await blobVersDataUrl(await reponse.blob());
  } catch {
    return null;
  }
}

export interface ResultatPdf {
  blob: Blob;
  nomFichier: string;
  photosManquantes: number;
}

export async function genererPdf(visiteId: string): Promise<ResultatPdf> {
  const donnees = await chargerDonneesVisite(visiteId);
  if (!donnees) throw new Error('Visite introuvable.');
  const [{ pdf }, { RapportPdf }, images, logo] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./RapportPdf'),
    imagesDuRapport(donnees),
    logoEnDataUrl(),
  ]);
  const blob = await pdf(RapportPdf({ donnees, images, logo })).toBlob();
  const jour = new Date().toISOString().slice(0, 10);
  return {
    blob,
    nomFichier: `pre-rapport-${nomFichierSur(donnees.prospect?.raisonSociale ?? 'prospect')}-${jour}.pdf`,
    photosManquantes: donnees.photos.filter((p) => !images[p.id]).length,
  };
}

export async function telechargerPdf(visiteId: string): Promise<ResultatPdf> {
  const resultat = await genererPdf(visiteId);
  telecharger(resultat.blob, resultat.nomFichier);
  return resultat;
}
