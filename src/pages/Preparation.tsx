import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChampTexte } from '../components/ChampTexte';
import { BoutonTest } from '../components/BoutonTest';
import { Compteur } from '../components/Compteur';
import { Page } from '../components/Page';
import { Alerte, Bouton, Carte } from '../components/ui';
import { db } from '../db/base';
import { useAuth } from '../hooks/useAuth';
import { useEnLigne } from '../hooks/useEnLigne';
import { champsVidesDeLaFiche, ficheTest } from '../lib/donneesTest';
import { aujourdhui, lienSatellite } from '../lib/outils';
import { normaliserSiret, rechercherParSiret, siretComplet } from '../lib/siret';
import { creerVisite, mettreAJourProspectEtSite, modifierVisite } from '../repository/depot';
import { useContexteVisite } from './VisiteLayout';

// Préparation de la visite (au bureau, avant de partir) : fiche prospect, pré-remplissage SIRET, vue satellite.

interface ValeursFiche {
  raisonSociale: string;
  siret: string;
  secteur: string;
  effectif: string;
  adresse: string;
  codePostal: string;
  ville: string;
  lat: number | null;
  lng: number | null;
  surfaceEstimeeM2: number | null;
  contactNom: string;
  contactFonction: string;
  contactEmail: string;
  contactTel: string;
  datePrevue: string;
}

const FICHE_VIDE: ValeursFiche = {
  raisonSociale: '',
  siret: '',
  secteur: '',
  effectif: '',
  adresse: '',
  codePostal: '',
  ville: '',
  lat: null,
  lng: null,
  surfaceEstimeeM2: null,
  contactNom: '',
  contactFonction: '',
  contactEmail: '',
  contactTel: '',
  datePrevue: '',
};

const CLES_PROSPECT = ['raisonSociale', 'siret', 'secteur', 'effectif', 'contactNom', 'contactFonction', 'contactEmail', 'contactTel'] as const;
const CLES_SITE = ['adresse', 'codePostal', 'ville', 'lat', 'lng', 'surfaceEstimeeM2'] as const;

/** Répartit une modification de la fiche entre le prospect, le site et la visite. */
function separer(patch: Partial<ValeursFiche>) {
  const prospect: Record<string, unknown> = {};
  const site: Record<string, unknown> = {};
  const visite: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(patch)) {
    if ((CLES_PROSPECT as readonly string[]).includes(cle)) prospect[cle] = valeur === '' ? undefined : valeur;
    else if ((CLES_SITE as readonly string[]).includes(cle)) site[cle] = cle === 'adresse' ? (valeur ?? '') : valeur === '' ? undefined : valeur;
    else if (cle === 'datePrevue') visite.datePrevue = valeur || null;
  }
  return { prospect, site, visite };
}

function Rubrique({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <Carte className="space-y-3">
      <h2 className="text-lg font-extrabold text-vert-900">{titre}</h2>
      {children}
    </Carte>
  );
}

function Etiquette({ texte, children }: { texte: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="etiquette">{texte}</span>
      {children}
    </div>
  );
}

function FicheProspect({ valeurs, onChange }: { valeurs: ValeursFiche; onChange: (patch: Partial<ValeursFiche>) => void }) {
  const enLigne = useEnLigne();
  const [recherche, setRecherche] = useState<{ etat: 'repos' | 'cours' | 'ok' | 'introuvable' | 'erreur'; message?: string }>({ etat: 'repos' });
  const satellite = valeurs.adresse ? lienSatellite(valeurs.adresse, valeurs.codePostal, valeurs.ville, valeurs.lat, valeurs.lng) : null;

  const rechercher = async () => {
    setRecherche({ etat: 'cours' });
    try {
      const fiche = await rechercherParSiret(valeurs.siret);
      if (!fiche) {
        setRecherche({ etat: 'introuvable' });
        return;
      }
      const patch: Partial<ValeursFiche> = { siret: fiche.siret };
      if (fiche.raisonSociale) patch.raisonSociale = fiche.raisonSociale;
      if (fiche.adresse) patch.adresse = fiche.adresse;
      if (fiche.codePostal) patch.codePostal = fiche.codePostal;
      if (fiche.ville) patch.ville = fiche.ville;
      if (fiche.lat !== null && fiche.lng !== null) Object.assign(patch, { lat: fiche.lat, lng: fiche.lng });
      if (fiche.secteur) patch.secteur = fiche.secteur;
      if (fiche.effectif) patch.effectif = fiche.effectif;
      onChange(patch);
      setRecherche({ etat: 'ok' });
    } catch (e) {
      setRecherche({ etat: 'erreur', message: e instanceof Error ? e.message : 'Recherche impossible.' });
    }
  };

  return (
    <>
      <BoutonTest
        libelle="Pré-remplir la fiche (test)"
        action={async () => {
          const patch: Partial<ValeursFiche> = champsVidesDeLaFiche(valeurs, ficheTest(Date.now()));
          if (!valeurs.datePrevue) patch.datePrevue = aujourdhui();
          const nombre = Object.keys(patch).length;
          if (nombre > 0) onChange(patch);
          return nombre > 0 ? `${nombre} champ(s) vide(s) pré-rempli(s) avec des données fictives.` : 'Tous les champs sont déjà renseignés : rien à ajouter.';
        }}
      />
      <Rubrique titre="Entreprise">
        <Etiquette texte="SIRET (14 chiffres)">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <ChampTexte valeur={valeurs.siret} onChange={(v) => onChange({ siret: v })} sansMicro inputMode="numeric" placeholder="123 456 789 00012" etiquetteAria="SIRET" />
            </div>
            <Bouton variante="secondaire" disabled={!siretComplet(valeurs.siret) || !enLigne || recherche.etat === 'cours'} onClick={() => void rechercher()}>
              {recherche.etat === 'cours' ? '…' : 'Pré-remplir'}
            </Bouton>
          </div>
        </Etiquette>
        {!enLigne && <p className="text-sm text-slate-700">Hors ligne : le pré-remplissage SIRET nécessite internet, saisissez la fiche à la main.</p>}
        {recherche.etat === 'ok' && <Alerte type="succes">Fiche pré-remplie depuis l'annuaire des entreprises. Vérifiez les informations.</Alerte>}
        {recherche.etat === 'introuvable' && <Alerte type="attention">Aucun établissement trouvé pour ce SIRET. Vérifiez le numéro ou saisissez la fiche à la main.</Alerte>}
        {recherche.etat === 'erreur' && <Alerte type="erreur">{recherche.message}</Alerte>}

        <Etiquette texte="Raison sociale">
          <ChampTexte valeur={valeurs.raisonSociale} onChange={(v) => onChange({ raisonSociale: v })} etiquetteAria="Raison sociale" autoComplete="organization" />
        </Etiquette>
        <Etiquette texte="Secteur d'activité">
          <ChampTexte valeur={valeurs.secteur} onChange={(v) => onChange({ secteur: v })} etiquetteAria="Secteur d'activité" />
        </Etiquette>
        <Etiquette texte="Effectif">
          <ChampTexte valeur={valeurs.effectif} onChange={(v) => onChange({ effectif: v })} etiquetteAria="Effectif" placeholder="ex. 20 à 49 salariés" />
        </Etiquette>
      </Rubrique>

      <Rubrique titre="Site à visiter">
        <Etiquette texte="Adresse">
          <ChampTexte valeur={valeurs.adresse} onChange={(v) => onChange({ adresse: v })} etiquetteAria="Adresse" autoComplete="street-address" />
        </Etiquette>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <Etiquette texte="Code postal">
            <ChampTexte valeur={valeurs.codePostal} onChange={(v) => onChange({ codePostal: v })} sansMicro inputMode="numeric" etiquetteAria="Code postal" autoComplete="postal-code" />
          </Etiquette>
          <Etiquette texte="Ville">
            <ChampTexte valeur={valeurs.ville} onChange={(v) => onChange({ ville: v })} etiquetteAria="Ville" />
          </Etiquette>
        </div>
        {satellite && (
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={satellite.google} target="_blank" rel="noopener noreferrer" className="bouton-secondaire">
              🛰️ Vue satellite (Google Maps)
            </a>
            {satellite.geoportail && (
              <a href={satellite.geoportail} target="_blank" rel="noopener noreferrer" className="bouton-secondaire">
                🗺️ Photo aérienne (Géoportail)
              </a>
            )}
          </div>
        )}
        <Etiquette texte="Surface extérieure estimée avant la visite">
          <Compteur valeur={valeurs.surfaceEstimeeM2} onChange={(v) => onChange({ surfaceEstimeeM2: v })} pas={100} unite="m²" etiquetteAria="Surface extérieure estimée en mètres carrés" />
        </Etiquette>
        <Etiquette texte="Date prévue de la visite">
          <input type="date" className="champ" value={valeurs.datePrevue} min={aujourdhui()} onChange={(e) => onChange({ datePrevue: e.target.value })} />
        </Etiquette>
      </Rubrique>

      <Rubrique titre="Contact (données minimales)">
        <Etiquette texte="Nom">
          <ChampTexte valeur={valeurs.contactNom} onChange={(v) => onChange({ contactNom: v })} etiquetteAria="Nom du contact" autoComplete="name" />
        </Etiquette>
        <Etiquette texte="Fonction">
          <ChampTexte valeur={valeurs.contactFonction} onChange={(v) => onChange({ contactFonction: v })} etiquetteAria="Fonction du contact" />
        </Etiquette>
        <Etiquette texte="E-mail professionnel">
          <ChampTexte valeur={valeurs.contactEmail} onChange={(v) => onChange({ contactEmail: v })} sansMicro type="email" inputMode="email" etiquetteAria="E-mail du contact" autoComplete="email" />
        </Etiquette>
        <Etiquette texte="Téléphone professionnel">
          <ChampTexte valeur={valeurs.contactTel} onChange={(v) => onChange({ contactTel: v })} sansMicro type="tel" inputMode="tel" etiquetteAria="Téléphone du contact" autoComplete="tel" />
        </Etiquette>
      </Rubrique>
    </>
  );
}

/** Sélecteur de chargé d'affaires (bureau uniquement). */
function ChoixChargeAffaires({ valeur, onChange }: { valeur: string; onChange: (id: string) => void }) {
  const utilisateurs = useLiveQuery(() => db.utilisateurs.toArray(), [], []);
  if (utilisateurs.length < 2) return null;
  return (
    <Rubrique titre="Chargé d'affaires">
      <select className="champ" value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Chargé d'affaires qui réalisera la visite">
        {utilisateurs.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nom} ({u.role === 'bureau' ? 'bureau' : 'terrain'})
          </option>
        ))}
      </select>
    </Rubrique>
  );
}

/** Création d'une visite : la fiche est conservée en mémoire jusqu'au bouton « Créer la visite ». */
export function NouvelleVisite() {
  const { utilisateur, estBureau } = useAuth();
  const navigate = useNavigate();
  const [valeurs, setValeurs] = useState<ValeursFiche>({ ...FICHE_VIDE, datePrevue: aujourdhui() });
  const [responsable, setResponsable] = useState(utilisateur?.id ?? '');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!utilisateur) return null;
  const valide = valeurs.raisonSociale.trim().length > 0;

  const creer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const id = await creerVisite({
        prospect: {
          raisonSociale: valeurs.raisonSociale.trim(),
          siret: normaliserSiret(valeurs.siret) || undefined,
          secteur: valeurs.secteur || undefined,
          effectif: valeurs.effectif || undefined,
          contactNom: valeurs.contactNom || undefined,
          contactFonction: valeurs.contactFonction || undefined,
          contactEmail: valeurs.contactEmail || undefined,
          contactTel: valeurs.contactTel || undefined,
          creePar: utilisateur.id,
        },
        site: {
          adresse: valeurs.adresse,
          codePostal: valeurs.codePostal || undefined,
          ville: valeurs.ville || undefined,
          lat: valeurs.lat,
          lng: valeurs.lng,
          surfaceEstimeeM2: valeurs.surfaceEstimeeM2,
        },
        utilisateurId: estBureau ? responsable || utilisateur.id : utilisateur.id,
        datePrevue: valeurs.datePrevue || null,
      });
      navigate(`/visites/${id}`, { replace: true });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de créer la visite.');
      setEnCours(false);
    }
  };

  return (
    <Page titre="Nouvelle visite" retour={estBureau ? '/bureau' : '/'}>
      <FicheProspect valeurs={valeurs} onChange={(patch) => setValeurs((v) => ({ ...v, ...patch }))} />
      {estBureau && <ChoixChargeAffaires valeur={responsable} onChange={setResponsable} />}
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Bouton className="w-full" disabled={!valide || enCours} onClick={() => void creer()}>
        Créer la visite
      </Bouton>
      {!valide && <p className="text-center text-sm text-slate-700">La raison sociale suffit pour commencer : le reste peut se compléter sur place.</p>}
    </Page>
  );
}

/** Fiche d'une visite existante : chaque modification est enregistrée automatiquement. */
export default function Preparation() {
  const { visite, site, prospect, proprietaire } = useContexteVisite();
  const { estBureau } = useAuth();
  const navigate = useNavigate();

  const valeurs: ValeursFiche = {
    raisonSociale: prospect?.raisonSociale ?? '',
    siret: prospect?.siret ?? '',
    secteur: prospect?.secteur ?? '',
    effectif: prospect?.effectif ?? '',
    adresse: site?.adresse ?? '',
    codePostal: site?.codePostal ?? '',
    ville: site?.ville ?? '',
    lat: site?.lat ?? null,
    lng: site?.lng ?? null,
    surfaceEstimeeM2: site?.surfaceEstimeeM2 ?? null,
    contactNom: prospect?.contactNom ?? '',
    contactFonction: prospect?.contactFonction ?? '',
    contactEmail: prospect?.contactEmail ?? '',
    contactTel: prospect?.contactTel ?? '',
    datePrevue: visite.datePrevue ?? '',
  };

  const enregistrer = (patch: Partial<ValeursFiche>) => {
    const { prospect: p, site: s, visite: v } = separer(patch);
    void mettreAJourProspectEtSite(visite.id, p, s, v);
  };

  return (
    <Page titre="Préparation" sousTitre={prospect?.raisonSociale} retour={`/visites/${visite.id}`} libelleRetour="Retour au sommaire">
      <FicheProspect valeurs={valeurs} onChange={enregistrer} />
      {estBureau && <ChoixChargeAffaires valeur={visite.utilisateurId} onChange={(id) => void modifierVisite(visite.id, { utilisateurId: id })} />}
      {!proprietaire && !estBureau && <Alerte type="attention">Cette visite est attribuée à un autre chargé d'affaires.</Alerte>}
      <Bouton className="w-full" onClick={() => navigate(`/visites/${visite.id}`)}>
        Enregistré — retour au sommaire
      </Bouton>
    </Page>
  );
}
