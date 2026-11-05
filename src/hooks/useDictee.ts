import { useCallback, useEffect, useRef, useState } from 'react';
import { useEnLigne } from './useEnLigne';

// Dictée vocale : Web Speech API en français (fr-FR).
// Limites connues (à connaître pour le terrain) :
//  - Chrome / Android : la reconnaissance passe par les serveurs de Google, donc il faut du réseau ;
//  - Safari / iOS : prise en charge partielle ; sinon, le micro du clavier du téléphone fonctionne partout.

interface ResultatReco {
  isFinal: boolean;
  0: { transcript: string };
}
interface EvenementReco {
  resultIndex: number;
  results: { length: number; [i: number]: ResultatReco };
}
interface Reconnaissance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EvenementReco) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type FabriqueReco = new () => Reconnaissance;

function fabrique(): FabriqueReco | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: FabriqueReco; webkitSpeechRecognition?: FabriqueReco };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dicteeSupportee = (): boolean => fabrique() !== null;

const MESSAGES: Record<string, string> = {
  'not-allowed': "Micro refusé : autorisez l'accès au micro dans les réglages du navigateur.",
  'service-not-allowed': "Micro refusé : autorisez l'accès au micro dans les réglages du navigateur.",
  'audio-capture': 'Aucun micro détecté.',
  network: 'La dictée vocale demande une connexion Internet.',
  'language-not-supported': 'Le français n’est pas pris en charge pour la dictée sur cet appareil.',
};

// Une seule dictée à la fois : démarrer une nouvelle dictée arrête la précédente.
let arreterCourante: (() => void) | null = null;

export interface UseDictee {
  /** La dictée peut être lancée maintenant (navigateur compatible et réseau disponible). */
  utilisable: boolean;
  /** Raison pour laquelle la dictée n'est pas utilisable (null si elle l'est). */
  indisponibilite: string | null;
  ecoute: boolean;
  /** Texte en cours de reconnaissance (provisoire). */
  provisoire: string;
  erreur: string | null;
  basculer: () => void;
  arreter: () => void;
}

/** `onTexte` reçoit chaque morceau de phrase définitif reconnu. */
export function useDictee(onTexte: (texte: string) => void): UseDictee {
  const enLigne = useEnLigne();
  const supportee = dicteeSupportee();
  const [ecoute, setEcoute] = useState(false);
  const [provisoire, setProvisoire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const rappel = useRef(onTexte);
  rappel.current = onTexte;
  const reco = useRef<Reconnaissance | null>(null);
  const voulu = useRef(false);

  const arreter = useCallback(() => {
    voulu.current = false;
    reco.current?.stop();
    setProvisoire('');
  }, []);

  const demarrer = useCallback(() => {
    const Fabrique = fabrique();
    if (!Fabrique) return;
    arreterCourante?.();
    setErreur(null);

    const r = new Fabrique();
    r.lang = 'fr-FR';
    // Sur Android, le mode continu duplique le texte : on relance à la place la reconnaissance courte.
    r.continuous = !/android/i.test(navigator.userAgent);
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0].transcript.trim();
        if (res.isFinal) {
          if (t) rappel.current(t);
        } else interim += `${t} `;
      }
      setProvisoire(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      voulu.current = false;
      setErreur(MESSAGES[e.error] ?? `Dictée interrompue (${e.error}).`);
    };
    r.onend = () => {
      if (voulu.current) {
        try {
          r.start();
          return;
        } catch {
          /* on termine proprement */
        }
      }
      setEcoute(false);
      setProvisoire('');
      if (arreterCourante === arret) arreterCourante = null;
    };
    const arret = () => {
      voulu.current = false;
      r.stop();
    };

    reco.current = r;
    voulu.current = true;
    arreterCourante = arret;
    try {
      r.start();
      setEcoute(true);
    } catch {
      voulu.current = false;
      setErreur('Impossible de démarrer la dictée.');
    }
  }, []);

  const basculer = useCallback(() => {
    if (voulu.current) arreter();
    else demarrer();
  }, [arreter, demarrer]);

  // On coupe le micro si le composant disparaît ou si le réseau tombe.
  useEffect(() => () => {
    voulu.current = false;
    reco.current?.abort();
  }, []);
  useEffect(() => {
    if (!enLigne && voulu.current) arreter();
  }, [enLigne, arreter]);

  const indisponibilite = !supportee
    ? "Dictée non disponible sur ce navigateur : utilisez le micro du clavier de votre téléphone."
    : !enLigne
      ? 'Dictée indisponible hors ligne : utilisez le micro du clavier de votre téléphone.'
      : null;

  return { utilisable: indisponibilite === null, indisponibilite, ecoute, provisoire, erreur, basculer, arreter };
}
