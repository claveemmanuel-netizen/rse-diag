import { Link, Navigate, useNavigate } from 'react-router-dom';
import { BoutonTest } from '../components/BoutonTest';
import { CarteVisite } from '../components/CarteVisite';
import { IconePlus } from '../components/Icones';
import { Page } from '../components/Page';
import { Bouton, Chargement } from '../components/ui';
import { entreprise } from '../config/entreprise';
import { useResumesVisites } from '../hooks/donnees';
import { useAuth } from '../hooks/useAuth';
import { creerVisiteTest } from '../repository/donneesTest';

/** Accueil du chargé d'affaires : ses visites à reprendre et terminées, et le bouton « Nouvelle visite ». */
export default function Accueil() {
  const { utilisateur, estBureau, deconnecter } = useAuth();
  const navigate = useNavigate();
  const visites = useResumesVisites(utilisateur?.id);

  if (estBureau) return <Navigate to="/bureau" replace />;
  if (!visites) return <Chargement />;

  const aReprendre = visites.filter((v) => v.visite.etat !== 'terminee');
  const terminees = visites.filter((v) => v.visite.etat === 'terminee');

  return (
    <Page
      titre="Mes visites"
      sousTitre={utilisateur ? `${utilisateur.nom} · ${entreprise.nom}` : undefined}
      actions={
        <Bouton variante="neutre" className="!min-h-11 !px-3 !py-1 !text-base" onClick={() => void deconnecter()}>
          Quitter
        </Bouton>
      }
    >
      <Link to="/visites/nouvelle" className="bouton-primaire w-full !text-xl">
        <IconePlus className="h-6 w-6" /> Nouvelle visite
      </Link>

      {utilisateur && (
        <BoutonTest
          libelle="Créer une visite de test complète"
          action={async () => {
            const id = await creerVisiteTest(utilisateur.id);
            navigate(`/visites/${id}`);
            return 'Visite de test créée.';
          }}
        />
      )}

      {visites.length === 0 && (
        <p className="carte text-center text-lg text-slate-700">Aucune visite pour l'instant. Préparez votre première visite avec le bouton ci-dessus.</p>
      )}

      {aReprendre.length > 0 && (
        <section className="space-y-2" aria-label="Visites à reprendre">
          <h2 className="px-1 text-lg font-extrabold">À préparer ou à reprendre</h2>
          {aReprendre.map((r) => (
            <CarteVisite key={r.visite.id} resume={r} />
          ))}
        </section>
      )}

      {terminees.length > 0 && (
        <section className="space-y-2" aria-label="Visites terminées">
          <h2 className="px-1 text-lg font-extrabold">Terminées</h2>
          {terminees.map((r) => (
            <CarteVisite key={r.visite.id} resume={r} />
          ))}
        </section>
      )}
    </Page>
  );
}
