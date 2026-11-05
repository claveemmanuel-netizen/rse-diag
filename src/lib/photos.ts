/** Compression des photos côté client (1600 px maximum, JPEG) pour économiser le stockage et la bande passante. */

export const TAILLE_MAX_PHOTO = 1600;

export interface ImageCompressee {
  blob: Blob;
  largeur: number;
  hauteur: number;
}

/** Calcule les dimensions réduites en conservant les proportions (jamais d'agrandissement). */
export function dimensionsReduites(largeur: number, hauteur: number, max = TAILLE_MAX_PHOTO) {
  const ratio = Math.min(1, max / Math.max(largeur, hauteur));
  return { largeur: Math.max(1, Math.round(largeur * ratio)), hauteur: Math.max(1, Math.round(hauteur * ratio)) };
}

async function decoder(fichier: Blob): Promise<{ source: CanvasImageSource; largeur: number; hauteur: number; liberer: () => void }> {
  try {
    const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    return { source: bitmap, largeur: bitmap.width, hauteur: bitmap.height, liberer: () => bitmap.close() };
  } catch {
    // Anciens navigateurs : passage par un élément <img> (qui applique l'orientation EXIF).
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}

export async function compresserImage(fichier: Blob, qualite = 0.8, taillePx = TAILLE_MAX_PHOTO): Promise<ImageCompressee> {
  const image = await decoder(fichier);
  try {
    const { largeur, hauteur } = dimensionsReduites(image.largeur, image.hauteur, taillePx);
    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Impossible de traiter l'image.");
    ctx.drawImage(image.source, 0, 0, largeur, hauteur);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualite));
    if (!blob) throw new Error("Impossible de compresser l'image.");
    return { blob, largeur, hauteur };
  } finally {
    image.liberer();
  }
}

/** Convertit un Blob en data URL (utilisé pour le PDF et la signature). */
export function blobVersDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result));
    lecteur.onerror = () => ko(lecteur.error);
    lecteur.readAsDataURL(blob);
  });
}
