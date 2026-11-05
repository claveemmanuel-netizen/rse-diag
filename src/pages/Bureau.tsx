import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BadgeStatut, COULEUR_ETAT, LIBELLE_ETAT } from '../components/CarteVisite';
import { BoutonTest } from '../components/BoutonTest';
import { IconePlus } from '../components/Icones';
import { Page } from '../components/Page';
import { Alerte, Badge, Bouton, Chargement, couleurScore } from '../components/ui';
import { db } from '../db/base';
import { STATUTS, type StatutVisite } from '../domain/types';
import { telechargerCsvVisites } from '../export/csv';
import { useResumesVisites, type ResumeVisite } from '../hooks/donnees';
import { useAuth } from '../hooks/useAuth';
import { aujourdhui, formaterDateCourte } from '../lib/outils';
import { definirStatutCommercial } from '../repository/depot';
import { creerVisiteTest } from '../repository/donneesTest';

type Filtre = 'tous' | 'relances' | StatutVisite;

/** Une relance est à faire dès que sa date est atteinte (elle disparaît quand on la marque « faite » ou qu'on la reporte). */
const relanceAFaire = (r: ResumeVisite, jour: string): boolean => Boolean(r.statut?.dateRelance && r.statut.dateRelance <= jour);

function Compteur({ valeur, libelle, alerte }: { valeur: number; libelle: string; alerte?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${alerte && valeur > 0 ? 'border-red-700 bg-red-50' : 'border-slate-300 bg-white'}`}>
      <p className="text-3xl font-extrabold">{valeur}</p>
      <p className="text-sm font-semibold text-slate-700">{libelle}</p>
    </div>
  );
}

function LigneVisite({ resume, chargeAffaires, jour }: { resume: ResumeVisite; chargeAffaires: string; jour: string }) {
  const { visite, site, prospect, statut, scoreGlobal } = resume;
  const { utilisateur } = useAuth();
  const parId = utilisateur?.id ?? '';
  const enRetard = relanceAFaire(resume, jour);

  return (
    <li className="carte space-y-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/visites/${visite.id}`} className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold underline-offset-2 hover:underline">{prospect?.raisonSociale || 'Prospect sans nom'}</p>
          <p className="truncate text-slate-700">{[site?.adresse, site?.ville].filter(Boolean).join(', ') || 'Adresse non renseignée'}</p>
          <p className="text-sm text-slate-600">
            {chargeAffaires ? `${chargeAffaires} · ` : ''}
            {formaterDateCourte(visite.dateDebut ?? visite.datePrevue ?? visite.updatedAt)}
          </p>
        </Link>
        {scoreGlobal !== null && <span className={`shrink-0 rounded-xl px-3 py-1 text-xl font-extrabold ${couleurScore(scoreGlobal)}`}>{scoreGlobal}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className={COULEUR_ETAT[visite.etat]}>{LIBELLE_ETAT[visite.etat]}</Badge>
        <BadgeStatut statut={statut?.statut} />
        {enRetard && <Badge className="bg-red-700 text-white">Relance à faire</Badge>}
        {resume.nbPhotos > 0 && <span className="text-sm text-slate-600">{resume.nbPhotos} photo{resume.nbPhotos > 1 ? 's' : ''}</span>}
      </div>
      {statut?.prochaineAction && <p className="text-base">➜ {statut.prochaineAction}</p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select
          className="champ"
          aria-label={`Statut de ${prospect?.raisonSociale ?? 'la visite'}`}
          value={statut?.statut ?? 'a_rediger'}
          onChange={(e) => void definirStatutCommercial(visite.id, { statut: e.target.value as StatutVisite }, parId)}
        >
          {STATUTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="champ"
          aria-label={`Date de relance de ${prospect?.raisonSociale ?? 'la visite'}`}
          value={statut?.dateRelance ?? ''}
          onChange={(e) => void definirStatutCommercial(visite.id, { dateRelance: e.target.value || null }, parId)}
        />
        {enRetard && (
          <Bouton variante="secondaire" onClick={() => void definirStatutCommercial(visite.id, { dateRelance: null }, parId)}>
            Relance faite
          </Bouton>
        )}
      </div>
    </li>
  );
}

/** Tableau de bord bureau : toutes les visites, filtres par statut, relances à faire, export Excel/CSV. */
export default function Bureau() {
  const { utilisateur, estBureau, deconnecter } = useAuth();
  const visites = useResumesVisites();
  const utilisateurs = useLiveQuery(() => db.utilisateurs.toArray(), [], []);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [recherche, setRecherche] = useState('');
  const [export_, setExport] = useState<{ etat: 'repos' | 'cours' | 'ok' | 'erreur'; texte?: string }>({ etat: 'repos' });
  const jour = aujourdhui();

  const noms = useMemo(() => new Map(utilisateurs.map((u) => [u.id, u.nom])), [utilisateurs]);

  const liste = useMemo(() => {
    if (!visites) return [];
    const q = recherche.trim().toLowerCase();
    const filtrees = visites.filter((r) => {
      if (filtre === 'relances' && !relanceAFaire(r, jour)) return false;
      if (filtre !== 'tous' && filtre !== 'relances' && (r.statut?.statut ?? 'a_rediger') !== filtre) return false;
      if (!q) return true;
      return [r.prospect?.raisonSociale, r.site?.ville, r.site?.adresse, noms.get(r.visite.utilisateurId)].some((t) => t?.toLowerCase().includes(q));
    });
    return filtre === 'relances' ? filtrees.sort((a, b) => (a.statut?.dateRelance ?? '').localeCompare(b.statut?.dateRelance ?? '')) : filtrees;
  }, [visites, filtre, recherche, jour, noms]);

  if (!estBureau && utilisateur) return <Navigate to="/" replace />;
  if (!visites) return <Chargement />;

  const nb = (id: StatutVisite) => visites.filter((r) => (r.statut?.statut ?? 'a_rediger') === id).length;
  const nbRelances = visites.filter((r) => relanceAFaire(r, jour)).length;
  const filtres: { id: Filtre; libelle: string; nombre: number }[] = [
    { id: 'tous', libelle: 'Toutes', nombre: visites.length },
    { id: 'relances', libelle: 'Relances à faire', nombre: nbRelances },
    ...STATUTS.map((s) => ({ id: s.id as Filtre, libelle: s.libelle, nombre: nb(s.id) })),
  ];

  const exporter = async () => {
    setExport({ etat: 'cours' });
    try {
      const n = await telechargerCsvVisites();
      setExport({ etat: 'ok', texte: `${n} visite${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''} (CSV, ouvrable dans Excel ou Google Sheets).` });
    } catch (e) {
      setExport({ etat: 'erreur', texte: e instanceof Error ? e.message : 'Export impossible.' });
    }
  };

  return (
    <Page
      large
      titre="Tableau de bord"
      sousTitre={utilisateur?.nom}
      actions={
        <Bouton variante="neutre" className="!min-h-11 !px-3 !py-1 !text-base" onClick={() => void deconnecter()}>
          Quitter
        </Bouton>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Compteur valeur={visites.length} libelle="Visites" />
        <Compteur valeur={nb('a_rediger')} libelle="À rédiger" />
        <Compteur valeur={nb('devis_a_faire')} libelle="Devis à faire" />
        <Compteur valeur={nbRelances} libelle="Relances à faire" alerte />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/visites/nouvelle" className="bouton-primaire">
          <IconePlus className="h-6 w-6" /> Nouvelle visite
        </Link>
        <Bouton variante="secondaire" disabled={visites.length === 0 || export_.etat === 'cours'} onClick={() => void exporter()}>
          {export_.etat === 'cours' ? 'Export…' : '⬇ Exporter toutes les visites (CSV)'}
        </Bouton>
      </div>
      {export_.etat === 'ok' && <Alerte type="succes">{export_.texte}</Alerte>}
      {export_.etat === 'erreur' && <Alerte type="erreur">{export_.texte}</Alerte>}

      {utilisateur && (
        <BoutonTest
          libelle="Créer une visite de test complète"
          action={async () => {
            await creerVisiteTest(utilisateur.id);
            return 'Visite de test créée (réponses, zones, photos, statut et relance) : elle apparaît dans la liste ci-dessous.';
          }}
        />
      )}
      <div className="space-y-2">
        <input
          type="search"
          className="champ"
          placeholder="Rechercher une entreprise, une ville, un chargé d'affaires…"
          aria-label="Rechercher une visite"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <div role="group" aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
          {filtres.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtre === f.id}
              onClick={() => setFiltre(f.id)}
              className={`min-h-12 rounded-full border-2 px-4 text-base font-bold ${
                filtre === f.id ? 'border-vert-800 bg-vert-700 text-white' : f.id === 'relances' && f.nombre > 0 ? 'border-red-700 bg-red-50 text-red-900' : 'border-slate-400 bg-white'
              }`}
            >
              {f.libelle} ({f.nombre})
            </button>
          ))}
        </div>
      </div>

      {liste.length === 0 ? (
        <p className="carte text-center text-lg text-slate-700">{visites.length === 0 ? 'Aucune visite pour le moment.' : 'Aucune visite ne correspond à ces filtres.'}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {liste.map((r) => (
            <LigneVisite key={r.visite.id} resume={r} chargeAffaires={noms.get(r.visite.utilisateurId) ?? ''} jour={jour} />
          ))}
        </ul>
      )}
    </Page>
  );
}
