import { IconeMoins, IconePlus } from './Icones';

interface Props {
  valeur: number | null;
  onChange: (valeur: number | null) => void;
  pas?: number;
  min?: number;
  max?: number;
  unite?: string;
  etiquetteAria: string;
}

const arrondir = (n: number) => Math.round(n * 1000) / 1000;

/** Compteur à gros boutons − / + (la saisie directe au clavier reste possible). `null` = pas encore renseigné. */
export function Compteur({ valeur, onChange, pas = 1, min = 0, max, unite, etiquetteAria }: Props) {
  const borner = (v: number) => Math.max(min, max !== undefined ? Math.min(max, v) : v);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Moins"
          onClick={() => onChange(valeur === null ? min : borner(arrondir(valeur - pas)))}
          className="flex min-h-tactile w-20 items-center justify-center rounded-xl border-2 border-vert-800 bg-white text-vert-800 active:bg-vert-100"
        >
          <IconeMoins width={32} height={32} />
        </button>
        <div className="flex min-h-tactile flex-1 items-center justify-center gap-1 rounded-xl border-2 border-slate-400 bg-white px-2">
          <input
            type="number"
            inputMode="decimal"
            aria-label={etiquetteAria}
            value={valeur ?? ''}
            placeholder="—"
            min={min}
            max={max}
            step={pas}
            onChange={(e) => {
              const brut = e.target.value;
              onChange(brut === '' ? null : borner(Number(brut)));
            }}
            className="w-full min-w-0 bg-transparent text-center text-3xl font-extrabold text-slate-900 outline-none placeholder:text-slate-400"
          />
          {unite && <span className="shrink-0 text-lg font-semibold text-slate-700">{unite}</span>}
        </div>
        <button
          type="button"
          aria-label="Plus"
          onClick={() => onChange(valeur === null ? borner(arrondir(min + pas)) : borner(arrondir(valeur + pas)))}
          className="flex min-h-tactile w-20 items-center justify-center rounded-xl border-2 border-vert-800 bg-vert-700 text-white active:bg-vert-900"
        >
          <IconePlus width={32} height={32} />
        </button>
      </div>
      {valeur !== null && (
        <button type="button" className="text-sm font-semibold text-slate-700 underline" onClick={() => onChange(null)}>
          Effacer ({valeur}
          {unite ? ` ${unite}` : ''})
        </button>
      )}
    </div>
  );
}
