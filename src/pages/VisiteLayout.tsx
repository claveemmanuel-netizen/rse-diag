import { useEffect } from 'react';
import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { NoteVocaleFab } from '../components/NoteVocale';
import { Page } from '../components/Page';
import { Chargement } from '../components/ui';
import { useDossierVisite, type DossierVisite } from '../hooks/donnees';
import { useAuth } from '../hooks/useAuth';
import { referentielPour } from '../referentiel';
import type { Referentiel } from '../referentiel/schema';
import { memoriserRoute } from '../repository/depot';

export interface ContexteVisite extends DossierVisite {
  ref: Referentiel;
  /** Le bureau peut consulter et corriger, mais seul le propriétaire fait avancer « reprendre ». */
  proprietaire: boolean;
}

export const useContexteVisite = () => useOutletContext<ContexteVisite>();

/** Contexte d'une visite : charge le dossier, mémorise l'écran courant (reprise) et affiche la note vocale partout. */
export function VisiteLayout() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { utilisateur } = useAuth();
  const dossier = useDossierVisite(id);
  const proprietaire = Boolean(dossier && utilisateur && dossier.visite.utilisateurId === utilisateur.id);

  useEffect(() => {
    if (id && proprietaire) void memoriserRoute(id, pathname);
  }, [id, pathname, proprietaire]);

  if (dossier === undefined) return <Chargement />;
  if (dossier === null) {
    return (
      <Page titre="Visite introuvable" retour="/">
        <p className="carte">
          Cette visite n'existe pas sur cet appareil. Si elle a été créée ailleurs, reconnectez-vous au réseau pour la synchroniser.{' '}
          <Link to="/" className="font-bold underline">
            Retour à l'accueil
          </Link>
        </p>
      </Page>
    );
  }

  const contexte: ContexteVisite = { ...dossier, ref: referentielPour(dossier.visite.referentielVersion), proprietaire };
  const contextePage = pathname.replace(`/visites/${id}`, '').replace(/^\//, '') || 'sommaire';
  return (
    <>
      <Outlet context={contexte} />
      <NoteVocaleFab visiteId={dossier.visite.id} contexte={contextePage} />
    </>
  );
}
