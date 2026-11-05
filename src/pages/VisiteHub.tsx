import { Link } from 'react-router-dom';
import { BoutonTest } from '../components/BoutonTest';
import { Page } from '../components/Page';
import { Alerte, Badge, BarreProgression, Chargement } from '../components/ui';
import { useZones } from '../hooks/donnees';
import { useProgressionVisite } from '../hooks/progression';
import { useAuth } from '../hooks/useAuth';
import { CLE_CHRONO_ZONES, estimerVisite, formaterChrono, formaterEstimation, totalChronos } from '../lib/chrono';
import { formaterDateCourte } from '../lib/outils';
import { remplirVisiteTest } from '../repository/donneesTest';
import { useContexteVisite } from './VisiteLayout';

interface Etape {
  cle: string;
  vers: string;
  icone: string;
  titre: string;
  detail?: string;
  pourcentage?: number;
  fait?: boolean;
  aRevoir?: boolean;
  /** Temps estimé de remplissage et temps déjà passé (absent tant que le chrono n'a pas démarré). */
  temps?: { estimeSecondes: number; passeSecondes?: number };
}

function LigneTemps({ temps }: { temps: NonNullable<Etape['temps']> }) {
  const { estimeSecondes, passeSecondes } = temps;
  const depasse = passeSecondes !== undefined && passeSecondes > estimeSecondes;
  return (
    <p className="truncate text-sm text-slate-700" data-testid="temps-etape">
      <span aria-hidden>⏱ </span>
      {formaterEstimation(estimeSecondes)} estimé{passeSecondes !== undefined && ' · '}
      {passeSecondes !== undefined && <span className={`font-bold ${depasse ? 'text-amber-800' : 'text-vert-800'}`}>{formaterChrono(passeSecondes)} passées</span>}
    </p>
  );
}

function LigneEtape({ etape, numero }: { etape: Etape; numero: number }) {
  return (
    <Link to={etape.vers} className="carte block active:bg-slate-50">
      <div className="flex items-center gap-3">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${etape.fait ? 'bg-vert-700 text-white' : 'bg-slate-200'}`} aria-hidden>
          {etape.fait ? '✓' : etape.icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">
            {numero}. {etape.titre}
          </p>
          {etape.detail && <p className="truncate text-sm text-slate-700">{etape.detail}</p>}
          {etape.temps && <LigneTemps temps={etape.temps} />}
          {etape.pourcentage !== undefined && <BarreProgression pourcentage={etape.pourcentage} etiquette={`Progression : ${etape.titre}`} className="mt-1" />}
        </div>
        {etape.aRevoir && <Badge className="bg-amber-200 text-amber-950">À revoir</Badge>}
        <span aria-hidden className="text-2xl text-slate-500">
          ›
        </span>
      </div>
    </Link>
  );
}

/** Sommaire de la visite : étapes dans l'ordre du parcours, avancement par section, reprise en un appui. */
export default function VisiteHub() {
  const { visite, site, prospect, ref, proprietaire } = useContexteVisite();
  const { estBureau } = useAuth();
  const progression = useProgressionVisite(ref, visite.id);
  const zones = useZones(visite.id);
  if (!progression || !zones) return <Chargement />;

  const base = `/visites/${visite.id}`;
  const estimation = estimerVisite(ref, progression.visibles);
  const chronos = visite.chronos ?? {};
  const tempsDe = (cle: string): Etape['temps'] => ({ estimeSecondes: estimation.parCle[cle], passeSecondes: chronos[cle]?.secondes });
  const passeTotal = totalChronos(chronos);
  const etapes: Etape[] = [
    {
      cle: 'preparation',
      vers: `${base}/preparation`,
      icone: '📋',
      titre: 'Préparation',
      detail: [prospect?.contactNom, prospect?.siret].filter(Boolean).join(' · ') || 'Fiche du prospect',
      fait: Boolean(prospect?.raisonSociale && site?.adresse),
    },
    {
      cle: 'rgpd',
      vers: `${base}/rgpd`,
      icone: '🔒',
      titre: 'Information RGPD',
      detail: visite.consentementRapport ? "Information donnée · accord pour le rapport" : visite.rgpdInformee ? 'Information donnée' : 'À présenter au contact',
      fait: visite.rgpdInformee,
    },
  ];

  const sections = ref.sections.map((s): Etape => {
    const p = progression.parSection[s.id];
    const terminee = p.total > 0 && p.pourcentage === 100;
    return {
      cle: s.id,
      vers: `${base}/section/${s.id}`,
      icone: s.icone ?? '•',
      titre: s.libelle,
      detail: `${p.repondues} / ${p.total} questions`,
      pourcentage: p.pourcentage,
      fait: terminee,
      aRevoir: visite.sectionsIgnorees.includes(s.id) && !terminee,
      temps: tempsDe(s.id),
    };
  });
  const qualification = sections.filter((_, i) => ref.sections[i].type === 'qualification');
  const piliers = sections.filter((_, i) => ref.sections[i].type === 'pilier');

  const total = zones.reduce((somme, z) => somme + (z.surfaceM2 ?? 0), 0);
  etapes.push(...qualification, {
    cle: 'zones',
    vers: `${base}/zones`,
    icone: '🗺️',
    titre: 'Inventaire des zones',
    detail: zones.length ? `${zones.length} zone${zones.length > 1 ? 's' : ''}${total ? ` · ${total} m²` : ''}` : 'Pelouses, haies, arbres, parking…',
    fait: zones.length > 0,
    temps: tempsDe(CLE_CHRONO_ZONES),
  });
  etapes.push(...piliers, { cle: 'synthese', vers: `${base}/synthese`, icone: '📊', titre: 'Synthèse et recommandations', detail: 'Scores, radar, pistes prioritaires, signature' });
  etapes.push({
    cle: 'cloture',
    vers: `${base}/cloture`,
    icone: '🏁',
    titre: 'Clôture et exports',
    detail: visite.etat === 'terminee' ? 'Visite terminée' : 'Statut, relance, PDF / JSON',
    fait: visite.etat === 'terminee',
  });

  const aRevoir = etapes.filter((e) => e.aRevoir);
  const reprise = proprietaire && visite.derniereRoute && visite.derniereRoute !== base && visite.derniereRoute.startsWith(`${base}/`) ? visite.derniereRoute : null;

  return (
    <Page titre={prospect?.raisonSociale || 'Visite'} sousTitre={[site?.adresse, site?.ville].filter(Boolean).join(', ')} retour={estBureau ? '/bureau' : '/'}>
      <div className="carte space-y-2">
        <div className="flex justify-between text-sm font-bold">
          <span>Avancement du questionnaire</span>
          <span>{progression.global.pourcentage} %</span>
        </div>
        <BarreProgression pourcentage={progression.global.pourcentage} etiquette="Avancement global du questionnaire" />
        <p className="text-sm font-semibold" data-testid="temps-total">
          <span aria-hidden>⏱ </span>
          Temps de collecte : {formaterChrono(passeTotal)} passées · {formaterEstimation(estimation.totalSecondes)} estimées · objectif {Math.round(estimation.objectifSecondes / 60)} min
        </p>
        {estimation.totalSecondes > estimation.objectifSecondes && (
          <p className="text-sm font-semibold text-amber-800">L'estimation dépasse l'objectif : mettez de côté les sections les moins utiles pour rester dans le temps.</p>
        )}
        <p className="text-sm text-slate-700">
          {visite.datePrevue ? `Visite prévue le ${formaterDateCourte(visite.datePrevue)} · ` : ''}
          Tout est enregistré automatiquement.
        </p>
      </div>

      <BoutonTest
        libelle="Remplir toute la visite (test)"
        action={async () => {
          const b = await remplirVisiteTest(visite.id);
          return `Visite remplie avec des données fictives : ${b.reponses} réponse(s), ${b.zones} zone(s), ${b.photos} photo(s), ${b.notes} note(s) vocale(s) ajoutées. Les champs déjà saisis n'ont pas été modifiés.`;
        }}
      />

      {reprise && (
        <Link to={reprise} className="bouton-primaire w-full !text-xl">
          ▶ Reprendre où j'en étais
        </Link>
      )}

      {aRevoir.length > 0 && (
        <Alerte type="attention">
          {aRevoir.length} section{aRevoir.length > 1 ? 's' : ''} à revoir : {aRevoir.map((e) => e.titre).join(', ')}.
        </Alerte>
      )}

      <ol className="space-y-2">
        {etapes.map((e, i) => (
          <li key={e.cle}>
            <LigneEtape etape={e} numero={i + 1} />
          </li>
        ))}
      </ol>
    </Page>
  );
}
