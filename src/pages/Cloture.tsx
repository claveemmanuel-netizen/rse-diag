import { useState } from 'react';
import { ChampTexte } from '../components/ChampTexte';
import { Page } from '../components/Page';
import { Alerte, Bouton, Carte, CaseACocher, Chargement } from '../components/ui';
import { config } from '../config/entreprise';
import { STATUTS, type StatutVisite } from '../domain/types';
import { preparerExportVisite, telechargerJson } from '../export/json';
import { telechargerPdf } from '../export/pdf/generer';
import { useStatut } from '../hooks/donnees';
import { useAuth } from '../hooks/useAuth';
import { useEnLigne } from '../hooks/useEnLigne';
import { ajouterJours, aujourdhui, formaterDateHeure, maintenant } from '../lib/outils';
import { depotDistant } from '../repository';
import { definirStatutCommercial, modifierVisite, rouvrirVisite, terminerVisite } from '../repository/depot';
import { useContexteVisite } from './VisiteLayout';

type Operation = 'json' | 'pdf' | 'brouillon' | null;

/** Brouillon de diagnostic généré par l'IA : toujours modifiable et à valider par un humain avant tout envoi. */
function PanneauBrouillon({ visiteId }: { visiteId: string }) {
  const { visite } = useContexteVisite();
  const { utilisateur } = useAuth();
  const enLigne = useEnLigne();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const texte = visite.brouillonTexte ?? '';
  const valide = Boolean(visite.brouillonValideLe);

  const generer = async () => {
    if (!depotDistant) return;
    if (texte && !window.confirm('Remplacer le brouillon actuel par un nouveau ? Vos modifications seront perdues.')) return;
    setEnCours(true);
    setErreur(null);
    try {
      // Données de contact retirées : le modèle n'a pas besoin de ces informations personnelles.
      const brouillon = await depotDistant.genererBrouillon(await preparerExportVisite(visiteId, { anonymiser: true }));
      await modifierVisite(visiteId, { brouillonTexte: brouillon, brouillonGenereLe: maintenant(), brouillonValidePar: null, brouillonValideLe: null });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Génération impossible.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Carte className="space-y-3">
      <h2 className="text-xl font-extrabold">Brouillon du diagnostic (IA)</h2>
      <p className="text-sm text-slate-700">
        Le texte est généré à partir des réponses de la visite. C'est un brouillon : relisez-le, corrigez-le et complétez les passages « [à compléter] » avant de le valider.
      </p>
      {!depotDistant && <Alerte type="attention">Le brouillon nécessite un serveur configuré (mode local : indisponible).</Alerte>}
      {depotDistant && !enLigne && <Alerte type="attention">Pas de réseau : la génération sera possible dès le retour d'une connexion.</Alerte>}
      <Bouton variante="secondaire" className="w-full" disabled={!depotDistant || !enLigne || enCours} onClick={() => void generer()}>
        {enCours ? 'Rédaction en cours…' : texte ? 'Régénérer le brouillon' : 'Générer le brouillon du diagnostic'}
      </Bouton>
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}

      {texte && (
        <>
          <ChampTexte
            valeur={texte}
            multiligne
            lignes={14}
            etiquetteAria="Brouillon du diagnostic"
            onChange={(v) => {
              if (v !== texte) void modifierVisite(visiteId, { brouillonTexte: v, brouillonValidePar: null, brouillonValideLe: null });
            }}
          />
          <CaseACocher
            coche={valide}
            onChange={(c) => void modifierVisite(visiteId, { brouillonValidePar: c ? (utilisateur?.nom ?? null) : null, brouillonValideLe: c ? maintenant() : null })}
          >
            J'ai relu et validé ce texte{valide ? ` (${visite.brouillonValidePar ?? ''}, ${formaterDateHeure(visite.brouillonValideLe)})` : ''}.
          </CaseACocher>
          <Bouton
            variante="neutre"
            className="w-full"
            onClick={() => {
              void navigator.clipboard?.writeText(texte).then(() => {
                setCopie(true);
                setTimeout(() => setCopie(false), 2500);
              });
            }}
          >
            {copie ? 'Texte copié ✓' : 'Copier le texte'}
          </Bouton>
        </>
      )}
    </Carte>
  );
}

/** Clôture : statut commercial, prochaine action, date de relance, fin de visite et exports. */
export default function Cloture() {
  const { visite, prospect } = useContexteVisite();
  const { utilisateur } = useAuth();
  const statut = useStatut(visite.id);
  const [operation, setOperation] = useState<Operation>(null);
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur' | 'attention'; texte: string } | null>(null);
  const base = `/visites/${visite.id}`;

  if (statut === undefined) return <Chargement />;
  const parId = utilisateur?.id ?? '';
  const terminee = visite.etat === 'terminee';

  const exporter = async (type: 'json' | 'pdf') => {
    setOperation(type);
    setMessage(null);
    try {
      if (type === 'json') {
        await telechargerJson(visite.id);
        setMessage({ type: 'succes', texte: 'Fichier JSON téléchargé.' });
      } else {
        const r = await telechargerPdf(visite.id);
        setMessage(
          r.photosManquantes > 0
            ? { type: 'attention', texte: `PDF téléchargé, mais ${r.photosManquantes} photo(s) n'ont pas pu y être intégrées (pas encore synchronisées et hors ligne ?).` }
            : { type: 'succes', texte: 'PDF téléchargé.' },
        );
      }
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Export impossible.' });
    } finally {
      setOperation(null);
    }
  };

  return (
    <Page titre="Clôture" sousTitre={prospect?.raisonSociale} retour={base} libelleRetour="Retour au sommaire">
      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Statut de la visite</h2>
        <div role="group" aria-label="Statut commercial" className="grid grid-cols-2 gap-2">
          {STATUTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={statut?.statut === s.id}
              onClick={() => void definirStatutCommercial(visite.id, { statut: s.id as StatutVisite }, parId)}
              className={`min-h-tactile rounded-xl border-2 px-3 py-2 text-lg font-bold ${statut?.statut === s.id ? 'border-vert-800 bg-vert-700 text-white' : 'border-slate-400 bg-white'}`}
            >
              {s.libelle}
            </button>
          ))}
        </div>
      </Carte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Prochaine action</h2>
        <ChampTexte
          valeur={statut?.prochaineAction ?? ''}
          onChange={(v) => void definirStatutCommercial(visite.id, { prochaineAction: v }, parId)}
          placeholder="ex. Envoyer le rapport, proposer un devis d'entretien…"
          etiquetteAria="Prochaine action"
        />
        <div>
          <label className="etiquette" htmlFor="date-relance">
            Date de relance
          </label>
          <input
            id="date-relance"
            type="date"
            className="champ"
            value={statut?.dateRelance ?? ''}
            onChange={(e) => void definirStatutCommercial(visite.id, { dateRelance: e.target.value || null }, parId)}
          />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[7, 15, 30].map((n) => (
              <Bouton key={n} variante="neutre" className="!px-2" onClick={() => void definirStatutCommercial(visite.id, { dateRelance: ajouterJours(aujourdhui(), n) }, parId)}>
                +{n} j
              </Bouton>
            ))}
            <Bouton variante="neutre" className="!px-2" disabled={!statut?.dateRelance} onClick={() => void definirStatutCommercial(visite.id, { dateRelance: null }, parId)}>
              Aucune
            </Bouton>
          </div>
        </div>
      </Carte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Fin de visite</h2>
        {terminee ? (
          <>
            <Alerte type="succes">Visite terminée le {formaterDateHeure(visite.dateFin)}.</Alerte>
            <Bouton variante="neutre" className="w-full" onClick={() => void rouvrirVisite(visite.id)}>
              Rouvrir la visite
            </Bouton>
          </>
        ) : (
          <Bouton className="w-full" onClick={() => void terminerVisite(visite.id)}>
            Terminer la visite
          </Bouton>
        )}
      </Carte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">Exports</h2>
        <Bouton variante="secondaire" className="w-full" disabled={operation !== null} onClick={() => void exporter('pdf')}>
          {operation === 'pdf' ? 'Génération du PDF…' : '📄 Pré-rapport PDF'}
        </Bouton>
        <Bouton variante="secondaire" className="w-full" disabled={operation !== null} onClick={() => void exporter('json')}>
          {operation === 'json' ? 'Préparation…' : '{ } Données de la visite (JSON)'}
        </Bouton>
        {message && <Alerte type={message.type}>{message.texte}</Alerte>}
      </Carte>

      {config.brouillonIa && <PanneauBrouillon visiteId={visite.id} />}
    </Page>
  );
}
