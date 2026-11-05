import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BoutonTest } from '../components/BoutonTest';
import { ChipChrono } from '../components/ChipChrono';
import { CarteQuestion } from '../components/Questions';
import { Page } from '../components/Page';
import { Alerte, BarreProgression, Bouton, Chargement } from '../components/ui';
import { useChrono } from '../hooks/chrono';
import { useProgressionVisite } from '../hooks/progression';
import { secondesEstimeesSection } from '../lib/chrono';
import { basculerSectionIgnoree, enregistrerReponse } from '../repository/depot';
import { remplirSectionTest } from '../repository/donneesTest';
import { useContexteVisite } from './VisiteLayout';

/** Écran d'une section du questionnaire (qualification ou pilier RSE) : questions visibles, sauvegarde à chaque réponse. */
export default function Questionnaire() {
  const { sectionId } = useParams();
  // Remontage à chaque changement de section : le chronomètre repart de l'état enregistré de la nouvelle section.
  return <EcranSection key={sectionId} sectionId={sectionId ?? ''} />;
}

function EcranSection({ sectionId }: { sectionId: string }) {
  const { ref, visite, prospect } = useContexteVisite();
  const navigate = useNavigate();
  const progression = useProgressionVisite(ref, visite.id);
  const index = ref.sections.findIndex((s) => s.id === sectionId);

  // Toute évolution des réponses, commentaires ou photos de la section déclenche le chrono (première modification).
  const signature =
    progression && index >= 0
      ? JSON.stringify(ref.sections[index].questions.map((q) => [progression.reponses[q.id] ?? null, progression.commentaires[q.id] ?? '', progression.photosParQuestion[q.id] ?? 0]))
      : undefined;
  const chrono = useChrono(visite.id, sectionId, visite.chronos?.[sectionId], signature);

  if (index < 0) return <Navigate to={`/visites/${visite.id}`} replace />;
  if (!progression) return <Chargement />;

  const section = ref.sections[index];
  const precedente = ref.sections[index - 1];
  const suivante = ref.sections[index + 1];
  const p = progression.parSection[section.id];
  const ignoree = visite.sectionsIgnorees.includes(section.id);
  const base = `/visites/${visite.id}`;
  const questions = section.questions.filter((q) => progression.visibles.has(q.id));

  const vers = (id: string) => navigate(`${base}/section/${id}`);

  return (
    <Page titre={`${section.icone ? `${section.icone} ` : ''}${section.libelle}`} sousTitre={prospect?.raisonSociale} retour={base} libelleRetour="Retour au sommaire">
      <div className="sticky top-[4.25rem] z-10 -mx-3 space-y-1 border-b border-slate-300 bg-slate-100/95 px-3 py-2 backdrop-blur">
        <div className="flex justify-between text-sm font-bold">
          <span>
            {p.repondues} / {p.total} questions
          </span>
          <span>{p.pourcentage} %</span>
        </div>
        <BarreProgression pourcentage={p.pourcentage} etiquette={`Progression de la section ${section.libelle}`} />
        <ChipChrono chrono={chrono} estimationSecondes={secondesEstimeesSection(ref, section, progression.visibles)} />
      </div>

      {!visite.rgpdInformee && (
        <Alerte type="attention">
          L'information RGPD n'a pas encore été donnée au contact.{' '}
          <Link className="font-bold underline" to={`${base}/rgpd`}>
            La présenter maintenant
          </Link>
        </Alerte>
      )}
      {ignoree && <Alerte type="info">Section mise de côté : répondez à une question pour la réactiver.</Alerte>}
      {section.description && <p className="px-1 text-slate-700">{section.description}</p>}

      <BoutonTest
        libelle="Remplir cette section (test)"
        action={async () => {
          const nombre = await remplirSectionTest(visite.id, section.id);
          return nombre > 0 ? `${nombre} réponse(s) fictive(s) ajoutée(s). Les réponses déjà données n'ont pas été modifiées.` : 'Toutes les questions visibles ont déjà une réponse.';
        }}
      />

      {questions.map((q) => (
        <CarteQuestion
          key={q.id}
          question={q}
          visiteId={visite.id}
          valeur={progression.reponses[q.id]}
          commentaire={progression.commentaires[q.id] ?? ''}
          nbPhotos={progression.photosParQuestion[q.id] ?? 0}
          onValeur={(valeur) => {
            if (ignoree) void basculerSectionIgnoree(visite.id, section.id, false);
            void enregistrerReponse(visite.id, q.id, { valeur });
          }}
          onCommentaire={(commentaire) => void enregistrerReponse(visite.id, q.id, { commentaire })}
        />
      ))}

      <div className="space-y-2 pt-2">
        {p.pourcentage === 100 && <Alerte type="succes">Section terminée, bravo !</Alerte>}
        <div className="grid grid-cols-2 gap-2">
          <Bouton variante="neutre" disabled={!precedente} onClick={() => precedente && vers(precedente.id)}>
            ← Précédente
          </Bouton>
          <Bouton variante="primaire" onClick={() => (suivante ? vers(suivante.id) : navigate(`${base}/synthese`))}>
            {suivante ? 'Suivante →' : 'Synthèse →'}
          </Bouton>
        </div>
        {p.pourcentage < 100 && (
          <Bouton
            variante="secondaire"
            className="w-full"
            onClick={() => {
              void basculerSectionIgnoree(visite.id, section.id, true);
              navigate(base);
            }}
          >
            Passer cette section et y revenir plus tard
          </Bouton>
        )}
        <Link to={base} className="bouton-neutre w-full">
          Retour au sommaire
        </Link>
      </div>
    </Page>
  );
}
