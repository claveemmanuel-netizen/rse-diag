import { useState } from 'react';
import { useNotesVocales } from '../hooks/donnees';
import { useDictee } from '../hooks/useDictee';
import { ajouterNoteVocale, supprimerNoteVocale } from '../repository/depot';
import { IconeCroix, IconeMicro, IconePoubelle } from './Icones';
import { Bouton } from './ui';

const joindre = (avant: string, ajout: string) => (avant && !/\s$/.test(avant) ? `${avant} ${ajout}` : `${avant}${ajout}`);

/** Bouton flottant « note vocale libre », disponible sur tous les écrans d'une visite. */
export function NoteVocaleFab({ visiteId, contexte }: { visiteId: string; contexte: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="fixed bottom-4 right-4 z-30 flex h-16 items-center gap-2 rounded-full border-2 border-white bg-vert-800 px-5 text-lg font-bold text-white shadow-xl active:bg-vert-900"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Note vocale libre"
      >
        <IconeMicro width={28} height={28} />
        Note
      </button>
      {ouvert && <FeuilleNote visiteId={visiteId} contexte={contexte} onFermer={() => setOuvert(false)} />}
    </>
  );
}

function FeuilleNote({ visiteId, contexte, onFermer }: { visiteId: string; contexte: string; onFermer: () => void }) {
  const [texte, setTexte] = useState('');
  const notes = useNotesVocales(visiteId);
  const dictee = useDictee((t) => setTexte((avant) => joindre(avant, t)));

  const fermer = async () => {
    dictee.arreter();
    if (texte.trim()) await ajouterNoteVocale(visiteId, texte.trim(), contexte);
    onFermer();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Note vocale libre" className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60">
      <div className="max-h-[92%] space-y-3 overflow-y-auto rounded-t-3xl bg-white p-4 pied-securise">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">Note vocale libre</h2>
          <button type="button" onClick={() => void fermer()} aria-label="Enregistrer et fermer" className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200">
            <IconeCroix />
          </button>
        </div>

        <button
          type="button"
          onClick={() => (dictee.utilisable ? dictee.basculer() : undefined)}
          disabled={!dictee.utilisable}
          className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl text-xl font-extrabold text-white disabled:bg-slate-400 ${
            dictee.ecoute ? 'animate-pulse bg-red-700' : 'bg-vert-700'
          }`}
        >
          <IconeMicro width={36} height={36} />
          {dictee.ecoute ? 'Parlez… (toucher pour arrêter)' : 'Toucher pour dicter'}
        </button>
        {dictee.indisponibilite && <p className="text-base text-slate-700">{dictee.indisponibilite}</p>}
        {dictee.erreur && <p className="font-semibold text-red-800">{dictee.erreur}</p>}
        {dictee.provisoire && <p className="italic text-slate-700">{dictee.provisoire}</p>}

        <textarea
          className="champ"
          rows={5}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Votre note apparaît ici. Vous pouvez la corriger au clavier."
          aria-label="Texte de la note"
        />
        <Bouton className="w-full" onClick={() => void fermer()}>
          {texte.trim() ? 'Enregistrer la note' : 'Fermer'}
        </Bouton>

        {notes && notes.length > 0 && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <h3 className="font-bold">Notes de cette visite ({notes.length})</h3>
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2 rounded-xl bg-slate-100 p-3">
                <p className="flex-1 whitespace-pre-wrap text-base">{n.texte}</p>
                <button type="button" aria-label="Supprimer la note" onClick={() => void supprimerNoteVocale(n.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-800">
                  <IconePoubelle />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
