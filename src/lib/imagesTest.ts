// Images fictives pour les données de test (navigateur uniquement : utilise un <canvas>).

function nouveauCanvas(largeur: number, hauteur: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de générer une image de test.');
  return { canvas, ctx };
}

/** Faux « paysage » (ciel, pelouse, arbres) avec la mention « PHOTO DE TEST » et la légende. */
export async function photoTest(legende: string, graine: number): Promise<{ blob: Blob; largeur: number; hauteur: number }> {
  const largeur = 800;
  const hauteur = 600;
  const { canvas, ctx } = nouveauCanvas(largeur, hauteur);
  const teinte = 95 + (graine % 40);

  const ciel = ctx.createLinearGradient(0, 0, 0, hauteur * 0.6);
  ciel.addColorStop(0, '#7dd3fc');
  ciel.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.fillStyle = `hsl(${teinte} 45% 38%)`;
  ctx.fillRect(0, hauteur * 0.55, largeur, hauteur * 0.45);

  for (let i = 0; i < 4; i++) {
    const x = ((i + 1) * largeur) / 5 + ((graine * (i + 3)) % 30) - 15;
    const base = hauteur * (0.52 + (i % 2) * 0.06);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x - 5, base - 40, 10, 40);
    ctx.fillStyle = `hsl(${teinte + i * 6} 50% ${28 + i * 4}%)`;
    ctx.beginPath();
    ctx.arc(x, base - 70, 48 + (i % 2) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, hauteur - 74, largeur, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('PHOTO DE TEST', 16, hauteur - 40);
  ctx.font = '20px sans-serif';
  ctx.fillText(legende.slice(0, 56), 16, hauteur - 12);

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.7));
  if (!blob) throw new Error('Impossible de générer une photo de test.');
  return { blob, largeur, hauteur };
}

/** Faux paraphe au format attendu par la zone de signature (PNG en data URL). */
export function signatureTest(): string {
  const { canvas, ctx } = nouveauCanvas(480, 180);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(30, 120);
  ctx.bezierCurveTo(60, 30, 90, 30, 100, 110);
  ctx.bezierCurveTo(110, 160, 140, 40, 175, 95);
  ctx.bezierCurveTo(195, 130, 215, 70, 250, 100);
  ctx.bezierCurveTo(290, 135, 320, 50, 360, 95);
  ctx.bezierCurveTo(385, 125, 420, 80, 450, 70);
  ctx.moveTo(40, 150);
  ctx.bezierCurveTo(180, 135, 320, 160, 440, 140);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}
