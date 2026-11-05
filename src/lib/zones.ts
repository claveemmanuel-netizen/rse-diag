import type { Zone } from '../domain/types';
import type { Referentiel } from '../referentiel/schema';

/** Surface retenue pour une zone : valeur saisie en m², sinon valeur indicative de la taille choisie. */
export function surfaceZone(ref: Referentiel, z: Pick<Zone, 'surfaceM2' | 'tailleId'>): number | null {
  if (typeof z.surfaceM2 === 'number') return z.surfaceM2;
  const taille = ref.zones.tailles.find((t) => t.id === z.tailleId);
  return taille ? taille.m2Indicatif : null;
}
