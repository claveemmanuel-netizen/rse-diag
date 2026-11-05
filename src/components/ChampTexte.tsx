import { useCallback, useEffect, useRef, useState, type HTMLInputTypeAttribute } from 'react';
import { useDictee } from '../hooks/useDictee';
import { IconeMicro } from './Icones';

interface Props {
  valeur: string;
  onChange: (valeur: string) => void;
  multiligne?: boolean;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  etiquetteAria?: string;
  lignes?: number;
  /** Masque le bouton de dictée (champs techniques : SIRET, e-mail…). */
  sansMicro?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'decimal';
  autoComplete?: string;
}

const joindre = (avant: string, ajout: string) => (avant && !/\s$/.test(avant) ? `${avant} ${ajout}` : `${avant}${ajout}`);

/**
 * Champ texte avec dictée vocale (fr-FR). La saisie est envoyée avec un léger délai (sauvegarde automatique)
 * et toujours enregistrée à la sortie du champ ou à la fermeture de l'écran.
 */
export function ChampTexte({ valeur, onChange, multiligne, type = 'text', placeholder, etiquetteAria, lignes = 3, sansMicro, inputMode, autoComplete }: Props) {
  const [local, setLocal] = useState(valeur);
  const localRef = useRef(valeur);
  const derniereValeurProp = useRef(valeur);
  const dernierEnvoye = useRef(valeur);
  const enAttente = useRef<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [aideMicro, setAideMicro] = useState(false);

  // Valeur modifiée ailleurs (synchronisation, autre écran) : on l'applique sauf si l'utilisateur est en train de saisir.
  useEffect(() => {
    if (valeur === derniereValeurProp.current) return;
    derniereValeurProp.current = valeur;
    if (enAttente.current === null && valeur !== dernierEnvoye.current) {
      dernierEnvoye.current = valeur;
      localRef.current = valeur;
      setLocal(valeur);
    }
  }, [valeur]);

  const envoyer = useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    if (enAttente.current !== null) {
      const v = enAttente.current;
      enAttente.current = null;
      dernierEnvoye.current = v;
      onChangeRef.current(v);
    }
  }, []);
  useEffect(() => envoyer, [envoyer]);

  const modifier = useCallback(
    (v: string) => {
      localRef.current = v;
      setLocal(v);
      enAttente.current = v;
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(envoyer, 350);
    },
    [envoyer],
  );

  const dictee = useDictee((t) => modifier(joindre(localRef.current, t)));

  const proprietes = {
    value: local,
    onChange: (e: { target: { value: string } }) => modifier(e.target.value),
    onBlur: envoyer,
    placeholder,
    'aria-label': etiquetteAria,
    className: 'champ',
    autoComplete,
    inputMode,
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        {multiligne ? <textarea rows={lignes} {...proprietes} /> : <input type={type} {...proprietes} />}
        {!sansMicro && (
          <button
            type="button"
            onClick={() => {
              if (dictee.utilisable) dictee.basculer();
              else setAideMicro((a) => !a);
            }}
            aria-pressed={dictee.ecoute}
            aria-label={dictee.ecoute ? 'Arrêter la dictée' : 'Dicter'}
            className={`flex min-h-tactile w-14 shrink-0 items-center justify-center rounded-xl border-2 ${
              dictee.ecoute
                ? 'animate-pulse border-red-700 bg-red-700 text-white'
                : dictee.utilisable
                  ? 'border-vert-700 bg-white text-vert-800'
                  : 'border-slate-300 bg-slate-100 text-slate-500'
            }`}
          >
            <IconeMicro />
          </button>
        )}
      </div>
      {dictee.ecoute && (
        <p className="mt-1 text-sm font-semibold text-red-800" aria-live="polite">
          Je vous écoute… {dictee.provisoire && <em className="font-normal text-slate-700">{dictee.provisoire}</em>}
        </p>
      )}
      {dictee.erreur && <p className="mt-1 text-sm font-semibold text-red-800">{dictee.erreur}</p>}
      {aideMicro && dictee.indisponibilite && <p className="mt-1 text-sm text-slate-700">{dictee.indisponibilite}</p>}
    </div>
  );
}
