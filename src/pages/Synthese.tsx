import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChampTexte } from '../components/ChampTexte';
import { IconePoubelle } from '../components/Icones';
import { Page } from '../components/Page';
import { RadarPiliers } from '../components/RadarPiliers';
import { Signature } from '../components/Signature';
import { Alerte, Badge, BarreProgression, Bouton, Carte, CaseACocher, Chargement, couleurScore } from '../components/ui';
import { useRecommandations, useReponses } from '../hooks/donnees';
import { maintenant } from '../lib/outils';
import { calculerScores } from '../scoring/moteur';
import {
  ajouterRecommandationManuelle,
  modifierRecommandation,
  modifierVisite,
  recalculerScores,
  supprimerRecommandation,
} from '../repository/depot';
import type { Recommandation } from '../domain/types';
import { useContexteVisite } from './VisiteLayout';

function LigneRecommandation({ reco, prestation }: { reco: Recommandation; prestation?: string }) {
  const [edition, setEdition] = useState(false);
  return (
    <li className={`rounded-xl border-2 p-3 ${reco.retenue ? 'border-vert-700 bg-white' : 'border-slate-300 bg-slate-50 opacity-80'}`}>
      <CaseACocher coche={reco.retenue} onChange={(c) => void modifierRecommandation(reco.id, { retenue: c })}>
        {reco.titre}
      </CaseACocher>
      {edition ? (
        <div className="mt-2 space-y-2">
          <ChampTexte valeur={reco.titre} onChange={(v) => void modifierRecommandation(reco.id, { titre: v })} etiquetteAria="Titre de la piste" />
          <ChampTexte valeur={reco.texte} onChange={(v) => void modifierRecommandation(reco.id, { texte: v })} multiligne etiquetteAria="Détail de la piste" />
        </div>
      ) : (
        <p className="mt-2 px-1 text-base">{reco.texte}</p>
      )}
      {prestation && <p className="mt-1 px-1 text-sm font-semibold text-vert-800">Prestation associée : {prestation}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Bouton variante="neutre" className="!min-h-11 !px-4 !py-1.5 !text-base" onClick={() => setEdition((e) => !e)}>
          {edition ? 'Terminer la modification' : 'Modifier'}
        </Bouton>
        {reco.source === 'manuelle' && (
          <Bouton variante="danger" className="!min-h-11 !px-4 !py-1.5 !text-base" onClick={() => void supprimerRecommandation(reco.id)} aria-label="Supprimer cette piste">
            <IconePoubelle className="h-5 w-5" /> Supprimer
          </Bouton>
        )}
      </div>
    </li>
  );
}

/** Synthèse immédiate : score par pilier, radar, points forts, pistes prioritaires, accord et signature du prospect. */
export default function Synthese() {
  const { visite, ref, prospect } = useContexteVisite();
  const navigate = useNavigate();
  const reponses = useReponses(visite.id);
  const recommandations = useRecommandations(visite.id);
  const [titreNouveau, setTitreNouveau] = useState('');
  const [texteNouveau, setTexteNouveau] = useState('');
  const base = `/visites/${visite.id}`;

  // Les scores affichés sont recalculés en direct ; cette passe enregistre aussi scores et pistes pour les listes et exports.
  useEffect(() => {
    void recalculerScores(visite.id);
  }, [visite.id]);

  const resultat = useMemo(() => (reponses ? calculerScores(ref, reponses.table) : null), [ref, reponses]);
  if (!resultat || !recommandations) return <Chargement />;

  const { global, piliers } = resultat;
  const niveau = global.niveau;
  const retenues = recommandations.filter((r) => r.retenue).length;
  const libellePrestation = (id?: string | null) => ref.prestations.find((p) => p.id === id)?.libelle;

  const ajouter = () => {
    if (!titreNouveau.trim()) return;
    void ajouterRecommandationManuelle(visite.id, titreNouveau.trim(), texteNouveau.trim());
    setTitreNouveau('');
    setTexteNouveau('');
  };

  return (
    <Page titre="Synthèse" sousTitre={prospect?.raisonSociale} retour={base} libelleRetour="Retour au sommaire">
      <Carte className="space-y-3 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-slate-600">Score global</p>
        <p className={`mx-auto inline-block rounded-2xl px-6 py-2 text-5xl font-extrabold ${couleurScore(global.score)}`}>{global.score ?? '—'}<span className="text-2xl"> / 100</span></p>
        {niveau && <p className="text-2xl font-extrabold">{niveau.libelle}</p>}
        {niveau?.description && <p className="text-slate-700">{niveau.description}</p>}
        {global.couverture < 0.6 && (
          <Alerte type="attention">
            Seulement {Math.round(global.couverture * 100)} % du questionnaire est renseigné : le score est indicatif. <Link to={base} className="font-bold underline">Compléter</Link>
          </Alerte>
        )}
      </Carte>

      <Carte>
        <RadarPiliers points={piliers.map((p) => ({ libelle: p.libelleCourt, score: p.score }))} />
      </Carte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Score par pilier</h2>
        <ul className="space-y-3">
          {piliers.map((p) => (
            <li key={p.sectionId}>
              <Link to={`${base}/section/${p.sectionId}`} className="block">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">
                    {p.icone ? `${p.icone} ` : ''}
                    {p.libelle}
                  </span>
                  <Badge className={couleurScore(p.score)}>{p.score === null ? 'Non évalué' : `${p.score}`}</Badge>
                </div>
                <BarreProgression pourcentage={p.score ?? 0} etiquette={`Score ${p.libelle}`} className="mt-1" />
                {p.niveau && <span className="text-sm text-slate-700">{p.niveau.libelle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Carte>

      {resultat.pointsForts.length > 0 && (
        <Carte className="space-y-2">
          <h2 className="text-xl font-extrabold">Points forts</h2>
          <ul className="space-y-1">
            {resultat.pointsForts.map((f) => (
              <li key={f.questionId} className="flex gap-2">
                <span aria-hidden className="font-extrabold text-vert-700">✓</span>
                <span>{f.libelle}</span>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <Carte className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-extrabold">Pistes d'amélioration prioritaires</h2>
          <span className="text-sm font-bold text-slate-700">{retenues} retenue{retenues > 1 ? 's' : ''}</span>
        </div>
        {recommandations.length === 0 ? (
          <p className="text-slate-700">Aucune piste pour l'instant : elles apparaissent au fil des réponses négatives ou partielles.</p>
        ) : (
          <ul className="space-y-3">
            {recommandations.map((r) => (
              <LigneRecommandation key={r.id} reco={r} prestation={libellePrestation(r.prestationId)} />
            ))}
          </ul>
        )}
        <details className="rounded-xl border-2 border-dashed border-slate-400 p-3">
          <summary className="cursor-pointer text-base font-bold">Ajouter une piste</summary>
          <div className="mt-3 space-y-2">
            <ChampTexte valeur={titreNouveau} onChange={setTitreNouveau} placeholder="Titre de la piste" etiquetteAria="Titre de la nouvelle piste" />
            <ChampTexte valeur={texteNouveau} onChange={setTexteNouveau} multiligne placeholder="Détail (optionnel)" etiquetteAria="Détail de la nouvelle piste" />
            <Bouton variante="secondaire" disabled={!titreNouveau.trim()} onClick={ajouter}>
              Ajouter cette piste
            </Bouton>
          </div>
        </details>
      </Carte>

      <Carte className="space-y-2">
        <h2 className="text-xl font-extrabold">Observations de fin de visite</h2>
        <ChampTexte
          valeur={visite.notesSynthese ?? ''}
          onChange={(v) => void modifierVisite(visite.id, { notesSynthese: v })}
          multiligne
          lignes={4}
          placeholder="Impressions générales, points à ne pas oublier dans le rapport…"
          etiquetteAria="Observations de fin de visite"
        />
      </Carte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Accord du contact pour recevoir le rapport</h2>
        <CaseACocher
          coche={visite.consentementRapport}
          onChange={(c) =>
            void modifierVisite(visite.id, {
              consentementRapport: c,
              consentementRapportLe: c ? (visite.consentementRapportLe ?? maintenant()) : null,
              ...(c ? {} : { signature: null }),
            })
          }
        >
          Le contact accepte de recevoir le rapport de diagnostic.
        </CaseACocher>
        {visite.consentementRapport && <Signature valeur={visite.signature} onChange={(s) => void modifierVisite(visite.id, { signature: s })} />}
      </Carte>

      <Bouton className="w-full" onClick={() => navigate(`${base}/cloture`)}>
        Clôturer la visite →
      </Bouton>
    </Page>
  );
}
