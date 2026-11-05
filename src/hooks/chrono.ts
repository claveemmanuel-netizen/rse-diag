import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChronoSection } from '../domain/types';
import { enregistrerChrono } from '../repository/depot';

const PERIODE_ENREGISTREMENT_MS = 15_000;
// Un intervalle anormalement long (veille de l'appareil, onglet gelé) n'est pas compté en entier.
const ECART_MAX_MS = 5_000;

export interface EtatChrono {
  secondes: number;
  /** Déclenché : la première modification de la section a eu lieu (dans cette visite ou une précédente ouverture). */
  demarre: boolean;
  enPause: boolean;
  basculerPause: () => void;
}

/**
 * Chronomètre d'une section de la visite.
 * - Déclenchement : à la première modification, c'est-à-dire quand `signature` (résumé des données de la
 *   section : réponses, commentaires, photos) change par rapport à son premier état connu.
 * - Une fois déclenché, il repart tout seul à chaque retour sur la section et se cumule dans la visite.
 * - Il ne compte que l'écran affiché au premier plan et hors pause manuelle.
 * Le composant appelant doit être remonté (prop `key`) quand `cle` change.
 */
export function useChrono(visiteId: string, cle: string, enregistre: ChronoSection | undefined, signature: string | undefined): EtatChrono {
  const [secondes, setSecondes] = useState(enregistre?.secondes ?? 0);
  const [demarre, setDemarre] = useState(Boolean(enregistre));
  const [enPause, setEnPause] = useState(false);
  const [auPremierPlan, setAuPremierPlan] = useState(() => document.visibilityState !== 'hidden');
  const ms = useRef((enregistre?.secondes ?? 0) * 1000);
  const signatureInitiale = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (signature === undefined) return;
    if (signatureInitiale.current === undefined) signatureInitiale.current = signature;
    else if (signature !== signatureInitiale.current) setDemarre(true);
  }, [signature]);

  useEffect(() => {
    const maj = () => setAuPremierPlan(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', maj);
    return () => document.removeEventListener('visibilitychange', maj);
  }, []);

  const actif = demarre && !enPause && auPremierPlan;

  useEffect(() => {
    if (!actif) return;
    let dernier = Date.now();
    const cumuler = () => {
      const maintenant = Date.now();
      ms.current += Math.min(maintenant - dernier, ECART_MAX_MS);
      dernier = maintenant;
    };
    const id = setInterval(() => {
      cumuler();
      setSecondes(Math.floor(ms.current / 1000));
    }, 1000);
    return () => {
      clearInterval(id);
      cumuler();
      setSecondes(Math.floor(ms.current / 1000));
    };
  }, [actif]);

  const enregistrer = useCallback(() => {
    void enregistrerChrono(visiteId, cle, Math.floor(ms.current / 1000));
  }, [visiteId, cle]);

  // Déclaré après l'effet du chronomètre : à l'arrêt, le dernier intervalle est déjà cumulé quand on enregistre.
  useEffect(() => {
    if (!actif) return;
    enregistrer();
    const id = setInterval(enregistrer, PERIODE_ENREGISTREMENT_MS);
    return () => {
      clearInterval(id);
      enregistrer();
    };
  }, [actif, enregistrer]);

  const basculerPause = useCallback(() => setEnPause((p) => !p), []);

  return { secondes, demarre, enPause, basculerPause };
}
