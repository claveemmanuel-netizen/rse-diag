import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Petits composants d'interface partagés.

type Variante = 'primaire' | 'secondaire' | 'neutre' | 'danger';

export function Bouton({
  variante = 'primaire',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button type={type} className={`bouton-${variante} ${className}`} {...props} />;
}

export function Carte({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`carte ${className}`}>{children}</section>;
}

export function Champ({ etiquette, aide, children }: { etiquette: string; aide?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="etiquette">{etiquette}</span>
      {children}
      {aide && <span className="mt-1 block text-sm text-slate-600">{aide}</span>}
    </label>
  );
}

export function BarreProgression({ pourcentage, etiquette, className = '' }: { pourcentage: number; etiquette?: string; className?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pourcentage)));
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
        aria-label={etiquette ?? 'Progression'}
        className="h-3 w-full overflow-hidden rounded-full bg-slate-300"
      >
        <div className={`h-full rounded-full transition-all ${p === 100 ? 'bg-vert-600' : 'bg-vert-500'}`} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function Alerte({ type = 'info', children }: { type?: 'info' | 'attention' | 'erreur' | 'succes'; children: ReactNode }) {
  const styles = {
    info: 'border-sky-700 bg-sky-50 text-sky-950',
    attention: 'border-amber-700 bg-amber-50 text-amber-950',
    erreur: 'border-red-700 bg-red-50 text-red-950',
    succes: 'border-green-700 bg-green-50 text-green-950',
  }[type];
  return (
    <div role={type === 'erreur' ? 'alert' : 'status'} className={`rounded-xl border-l-8 px-4 py-3 text-base ${styles}`}>
      {children}
    </div>
  );
}

export function Chargement({ message = 'Chargement…' }: { message?: string }) {
  return <p className="p-8 text-center text-lg text-slate-700">{message}</p>;
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${className}`}>{children}</span>;
}

/** Case à cocher à grande zone tactile (consentements, validations). */
export function CaseACocher({ coche, onChange, children, disabled }: { coche: boolean; onChange: (coche: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex min-h-tactile cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${coche ? 'border-vert-700 bg-vert-50' : 'border-slate-400 bg-white'} ${disabled ? 'opacity-60' : ''}`}>
      <input type="checkbox" className="mt-1 h-7 w-7 shrink-0 accent-vert-700" checked={coche} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-base font-semibold">{children}</span>
    </label>
  );
}

/** Couleur de texte/fond selon un score 0-100 (contraste élevé). */
export function couleurScore(score: number | null): string {
  if (score === null) return 'bg-slate-200 text-slate-800';
  if (score >= 85) return 'bg-green-700 text-white';
  if (score >= 65) return 'bg-lime-600 text-white';
  if (score >= 40) return 'bg-amber-500 text-slate-900';
  return 'bg-red-700 text-white';
}
