import { useEffect, useRef, useState } from 'react';
import type { Question, QuestionChoix, QuestionNombre, QuestionBool } from '../referentiel/schema';
import { referentielActif } from '../referentiel';
import { estRepondue, type ValeurReponse } from '../scoring/moteur';
import { LIBELLES_BOOL } from '../scoring/affichage';
import { IconeAide, IconeAppareilPhoto, IconeCoche } from './Icones';
import { ChampTexte } from './ChampTexte';
import { Compteur } from './Compteur';
import { GaleriePhotos } from './Photos';
import { Bouton } from './ui';

// Widgets de réponse : gros boutons, questions fermées d'abord, saisie libre en option.

interface PropsWidget<Q extends Question> {
  question: Q;
  valeur: ValeurReponse;
  onChange: (valeur: ValeurReponse) => void;
}

const STYLE_BOOL: Record<string, string> = {
  oui: 'border-green-800 bg-green-700 text-white',
  non: 'border-red-800 bg-red-700 text-white',
  partiel: 'border-amber-600 bg-amber-400 text-slate-900',
  nsp: 'border-slate-700 bg-slate-600 text-white',
  na: 'border-slate-700 bg-slate-600 text-white',
};

function ReponseBool({ question, valeur, onChange }: PropsWidget<QuestionBool>) {
  const options = [...(question.reponses ?? ['oui', 'non', 'partiel', 'nsp'])] as string[];
  if (question.sansObjet) options.push('na');
  return (
    <div className="grid grid-cols-2 gap-2" role="group">
      {options.map((o) => {
        const actif = valeur === o;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={actif}
            // Un second appui sur la réponse choisie l'annule.
            onClick={() => onChange(actif ? null : o)}
            className={`min-h-tactile rounded-xl border-2 px-3 py-3 text-lg font-bold transition active:scale-[0.97] ${
              actif ? STYLE_BOOL[o] : 'border-slate-400 bg-white text-slate-900'
            }`}
          >
            {actif && <IconeCoche className="mr-1 inline" width={20} height={20} />}
            {LIBELLES_BOOL[o]}
          </button>
        );
      })}
    </div>
  );
}

function ReponseChoix({ question, valeur, onChange }: PropsWidget<QuestionChoix>) {
  const choisies = Array.isArray(valeur) ? valeur : typeof valeur === 'string' && valeur ? [valeur] : [];

  const basculer = (v: string, exclusif?: boolean) => {
    if (!question.multiple) {
      onChange(choisies[0] === v ? null : v);
      return;
    }
    if (choisies.includes(v)) {
      const reste = choisies.filter((c) => c !== v);
      onChange(reste.length ? reste : null);
      return;
    }
    const exclusifs = new Set(question.options.filter((o) => o.exclusif).map((o) => o.valeur));
    onChange(exclusif ? [v] : [...choisies.filter((c) => !exclusifs.has(c)), v]);
  };

  return (
    <div className="space-y-2" role="group">
      {question.multiple && <p className="text-sm font-semibold text-slate-700">Plusieurs réponses possibles</p>}
      {question.options.map((o) => {
        const actif = choisies.includes(o.valeur);
        return (
          <button
            key={o.valeur}
            type="button"
            aria-pressed={actif}
            onClick={() => basculer(o.valeur, o.exclusif)}
            className={`flex min-h-tactile w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg font-semibold transition active:scale-[0.99] ${
              actif ? 'border-vert-800 bg-vert-700 text-white' : 'border-slate-400 bg-white text-slate-900'
            }`}
          >
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 ${question.multiple ? 'rounded-md' : 'rounded-full'} ${
                actif ? 'border-white bg-white text-vert-800' : 'border-slate-500'
              }`}
            >
              {actif && <IconeCoche width={18} height={18} />}
            </span>
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}

function ReponseNombre({ question, valeur, onChange }: PropsWidget<QuestionNombre>) {
  const n = typeof valeur === 'number' ? valeur : null;
  if (question.affichage === 'curseur') return <Curseur question={question} valeur={n} onChange={onChange} />;
  return (
    <Compteur
      valeur={n}
      onChange={onChange}
      pas={question.pas}
      min={question.min}
      max={question.max}
      unite={question.unite}
      etiquetteAria={question.libelle}
    />
  );
}

function Curseur({ question, valeur, onChange }: { question: QuestionNombre; valeur: number | null; onChange: (v: ValeurReponse) => void }) {
  const min = question.min ?? 0;
  const max = question.max ?? 100;
  const pas = question.pas ?? 1;
  const [local, setLocal] = useState<number | null>(valeur);
  const touche = useRef(false);

  useEffect(() => {
    if (!touche.current) setLocal(valeur);
  }, [valeur]);

  const valider = (v: number) => {
    touche.current = false;
    onChange(v);
  };

  return (
    <div className="space-y-2">
      <p className="text-center text-3xl font-extrabold" aria-live="polite">
        {local === null ? <span className="text-slate-500">Non renseigné</span> : `${local}${question.unite ? ` ${question.unite}` : ''}`}
      </p>
      <input
        type="range"
        aria-label={question.libelle}
        min={min}
        max={max}
        step={pas}
        value={local ?? min}
        onChange={(e) => {
          touche.current = true;
          setLocal(Number(e.target.value));
        }}
        onPointerUp={(e) => valider(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => valider(Number((e.target as HTMLInputElement).value))}
        onBlur={(e) => touche.current && valider(Number(e.target.value))}
        className="h-12 w-full cursor-pointer accent-vert-700"
      />
      <div className="flex justify-between text-sm font-semibold text-slate-700">
        <span>
          {min}
          {question.unite ? ` ${question.unite}` : ''}
        </span>
        <span>
          {max}
          {question.unite ? ` ${question.unite}` : ''}
        </span>
      </div>
      {valeur !== null && (
        <button
          type="button"
          className="text-sm font-semibold text-slate-700 underline"
          onClick={() => {
            touche.current = false;
            setLocal(null);
            onChange(null);
          }}
        >
          Effacer
        </button>
      )}
    </div>
  );
}

export function ChampReponse({ question, valeur, onChange, visiteId }: PropsWidget<Question> & { visiteId: string }) {
  switch (question.type) {
    case 'bool':
      return <ReponseBool question={question} valeur={valeur} onChange={onChange} />;
    case 'choix':
      return <ReponseChoix question={question} valeur={valeur} onChange={onChange} />;
    case 'nombre':
      return <ReponseNombre question={question} valeur={valeur} onChange={onChange} />;
    case 'texte':
      return (
        <ChampTexte
          valeur={typeof valeur === 'string' ? valeur : ''}
          onChange={(v) => onChange(v.trim() ? v : null)}
          multiligne={question.multiligne ?? true}
          etiquetteAria={question.libelle}
          placeholder="Dictez ou tapez ici (facultatif)"
          lignes={4}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          className="champ"
          aria-label={question.libelle}
          value={typeof valeur === 'string' ? valeur : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case 'photo':
      return <GaleriePhotos visiteId={visiteId} questionId={question.id} libelle="Prendre une photo" />;
  }
}

interface PropsCarte {
  question: Question;
  visiteId: string;
  valeur: ValeurReponse;
  commentaire: string;
  nbPhotos: number;
  onValeur: (valeur: ValeurReponse) => void;
  onCommentaire: (commentaire: string) => void;
}

/** Carte d'une question : libellé, réponse, « pourquoi c'est important », note libre et photo. */
export function CarteQuestion({ question, visiteId, valeur, commentaire, nbPhotos, onValeur, onCommentaire }: PropsCarte) {
  const [aide, setAide] = useState(false);
  const [note, setNote] = useState(Boolean(commentaire));
  const [photo, setPhoto] = useState(false);
  const prestation = question.prestation ? referentielActif.prestations.find((p) => p.id === question.prestation) : undefined;
  const repondue = question.type === 'photo' ? nbPhotos > 0 : estRepondue(valeur);

  return (
    <article id={`q-${question.id}`} className={`carte space-y-3 ${repondue ? 'border-l-8 border-l-vert-600' : 'border-l-8 border-l-slate-300'}`}>
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-lg font-bold leading-snug">{question.libelle}</h3>
        {repondue && <IconeCoche className="mt-1 shrink-0 text-vert-700" aria-label="Répondu" />}
      </div>

      <ChampReponse question={question} valeur={valeur} onChange={onValeur} visiteId={visiteId} />

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
        {question.pourquoi && (
          <Bouton variante="neutre" className="!min-h-11 !px-3 !py-1.5 !text-base" aria-expanded={aide} onClick={() => setAide((a) => !a)}>
            <IconeAide width={20} height={20} /> Pourquoi ?
          </Bouton>
        )}
        {question.type !== 'texte' && question.type !== 'photo' && (
          <Bouton variante="neutre" className="!min-h-11 !px-3 !py-1.5 !text-base" aria-expanded={note} onClick={() => setNote((n) => !n)}>
            Note{commentaire ? ' ✓' : ''}
          </Bouton>
        )}
        {question.type !== 'photo' && (
          <Bouton variante="neutre" className="!min-h-11 !px-3 !py-1.5 !text-base" aria-expanded={photo} onClick={() => setPhoto((p) => !p)}>
            <IconeAppareilPhoto width={20} height={20} /> Photo{nbPhotos > 0 ? ` (${nbPhotos})` : ''}
          </Bouton>
        )}
      </div>

      {aide && question.pourquoi && (
        <div className="rounded-xl bg-sky-50 p-3 text-base text-sky-950">
          <p className="font-bold">Pourquoi c'est important</p>
          <p>{question.pourquoi}</p>
          {prestation && <p className="mt-2 text-sm text-sky-900">Prestation associée : {prestation.libelle}</p>}
        </div>
      )}
      {note && question.type !== 'texte' && question.type !== 'photo' && (
        <ChampTexte valeur={commentaire} onChange={onCommentaire} multiligne lignes={2} placeholder="Précision, remarque (dictée possible)" etiquetteAria={`Note sur : ${question.libelle}`} />
      )}
      {photo && question.type !== 'photo' && <GaleriePhotos visiteId={visiteId} questionId={question.id} />}
    </article>
  );
}
