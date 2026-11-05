import { useEffect, useRef, useState } from 'react';
import { Bouton } from './ui';

/** Zone de signature au doigt (PNG en data URL). Sert d'accord du prospect pour recevoir le rapport. */
export function Signature({ valeur, onChange }: { valeur: string | null | undefined; onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const aDessine = useRef(false);
  const [vide, setVide] = useState(!valeur);

  // Dimensionne le canvas à sa taille d'affichage (netteté sur écrans haute densité) et réaffiche la signature existante.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    if (valeur) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = valeur;
    }
    // Initialisation unique : la signature affichée ensuite est celle du canvas.
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const debut = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dessine.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  };
  const trace = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    aDessine.current = true;
    setVide(false);
  };
  const fin = () => {
    if (!dessine.current) return;
    dessine.current = false;
    if (aDessine.current && canvas.current) onChange(canvas.current.toDataURL('image/png'));
  };
  const effacer = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    aDessine.current = false;
    setVide(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Zone de signature"
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-slate-500 bg-white"
        onPointerDown={debut}
        onPointerMove={trace}
        onPointerUp={fin}
        onPointerCancel={fin}
        onPointerLeave={fin}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{vide ? 'Signez avec le doigt dans le cadre.' : 'Signature enregistrée.'}</span>
        <Bouton variante="neutre" className="!min-h-11 !px-4 !py-1.5 !text-base" onClick={effacer} disabled={vide}>
          Effacer
        </Bouton>
      </div>
    </div>
  );
}
