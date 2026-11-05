/** Petits utilitaires partagés (identifiants, dates, anti-rebond). */

export const nouvelId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const maintenant = (): string => new Date().toISOString();

/** Date du jour au format AAAA-MM-JJ (fuseau local). */
export function aujourdhui(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ajouterJours(isoDate: string, jours: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + jours);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formaterDateHeure(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formaterDateCourte(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function antiRebond<A extends unknown[]>(fn: (...args: A) => void, delaiMs: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delaiMs);
  };
  debounced.annuler = () => {
    if (t) clearTimeout(t);
    t = undefined;
  };
  return debounced;
}

/** Lien vers une vue satellite de l'adresse (pour estimer les surfaces avant la visite). */
export function lienSatellite(adresse: string, codePostal?: string, ville?: string, lat?: number | null, lng?: number | null) {
  const requete = encodeURIComponent([adresse, codePostal, ville].filter(Boolean).join(' '));
  const google =
    lat != null && lng != null
      ? `https://www.google.com/maps/@${lat},${lng},120m/data=!3m1!1e3`
      : `https://www.google.com/maps/search/?api=1&query=${requete}&basemap=satellite`;
  const geoportail =
    lat != null && lng != null
      ? `https://www.geoportail.gouv.fr/carte?c=${lng},${lat}&z=19&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`
      : null;
  return { google, geoportail };
}

/** Nom de fichier sûr (sans accents ni caractères spéciaux). */
export function nomFichierSur(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'visite'
  );
}

export function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
