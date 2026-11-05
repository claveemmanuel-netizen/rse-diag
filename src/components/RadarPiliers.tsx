import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';

export interface PointRadar {
  libelle: string;
  score: number | null;
}

/** Radar des piliers (0-100). Un pilier non évalué est affiché à 0 et signalé dans la légende. */
export function RadarPiliers({ points, hauteur = 320 }: { points: PointRadar[]; hauteur?: number }) {
  const donnees = points.map((p) => ({ pilier: p.libelle, score: p.score ?? 0 }));
  const nonEvalues = points.filter((p) => p.score === null).map((p) => p.libelle);
  return (
    <figure aria-label="Radar des six piliers" className="w-full">
      <div style={{ width: '100%', height: hauteur }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={donnees} outerRadius="66%" margin={{ top: 10, right: 56, bottom: 10, left: 56 }}>
            <PolarGrid stroke="#94a3b8" />
            <PolarAngleAxis dataKey="pilier" tick={{ fill: '#0f172a', fontSize: 13, fontWeight: 600 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fill: '#475569', fontSize: 10 }} />
            <Radar dataKey="score" stroke="#1b6428" strokeWidth={3} fill="#2f8f3c" fillOpacity={0.45} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {nonEvalues.length > 0 && <figcaption className="text-center text-sm text-slate-700">Non évalué : {nonEvalues.join(', ')}</figcaption>}
    </figure>
  );
}
