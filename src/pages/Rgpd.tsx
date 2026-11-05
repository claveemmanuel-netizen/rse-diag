import { useNavigate } from 'react-router-dom';
import { Page } from '../components/Page';
import { Alerte, Bouton, Carte, CaseACocher } from '../components/ui';
import { informationRgpd } from '../config/entreprise';
import { maintenant } from '../lib/outils';
import { modifierVisite } from '../repository/depot';
import { useContexteVisite } from './VisiteLayout';

/** Information RGPD à lire au contact avant la collecte, et recueil de son accord pour recevoir le rapport. */
export default function Rgpd() {
  const { visite, prospect, ref } = useContexteVisite();
  const navigate = useNavigate();
  const base = `/visites/${visite.id}`;
  const premiereSection = `${base}/section/${ref.sections[0].id}`;

  return (
    <Page titre="Information RGPD" sousTitre={prospect?.raisonSociale} retour={base} libelleRetour="Retour au sommaire">
      <Alerte type="info">À lire ou à présenter au contact avant de commencer la collecte.</Alerte>

      <Carte className="space-y-3">
        <h2 className="text-xl font-extrabold">{informationRgpd.titre}</h2>
        {informationRgpd.paragraphes.map((p) => (
          <p key={p} className="text-lg leading-snug">
            {p}
          </p>
        ))}
      </Carte>

      <div className="space-y-3">
        <CaseACocher coche={visite.rgpdInformee} onChange={(c) => void modifierVisite(visite.id, { rgpdInformee: c, rgpdInformeeLe: c ? maintenant() : null })}>
          J'ai présenté cette information au contact.
        </CaseACocher>
        <CaseACocher
          coche={visite.consentementRapport}
          onChange={(c) => void modifierVisite(visite.id, { consentementRapport: c, consentementRapportLe: c ? maintenant() : null })}
        >
          Le contact accepte de recevoir le rapport de diagnostic.
        </CaseACocher>
        <p className="px-1 text-sm text-slate-700">Le consentement peut aussi être recueilli, avec signature, à l'étape de synthèse.</p>
      </div>

      <Bouton className="w-full" onClick={() => navigate(visite.rgpdInformee ? premiereSection : base)}>
        {visite.rgpdInformee ? 'Commencer la qualification →' : 'Retour au sommaire'}
      </Bouton>
    </Page>
  );
}
