import { useEffect, useRef, useState } from 'react';
import type { Photo } from '../domain/types';
import { usePhotos } from '../hooks/donnees';
import { useEnLigne } from '../hooks/useEnLigne';
import { positionActuelle } from '../lib/geoloc';
import { formaterDateHeure, maintenant } from '../lib/outils';
import { compresserImage } from '../lib/photos';
import { depotDistant } from '../repository';
import { ajouterPhoto, modifierPhoto, supprimerPhoto } from '../repository/depot';
import { IconeAppareilPhoto, IconeCroix, IconePoubelle } from './Icones';
import { Bouton } from './ui';

const attendre = (ms: number) => new Promise<null>((ok) => setTimeout(() => ok(null), ms));

/** URL affichable d'une photo : fichier local si présent, sinon lien temporaire du Storage (en ligne uniquement). */
export function useUrlPhoto(photo: Photo): string | null {
  const enLigne = useEnLigne();
  const [url, setUrl] = useState<string | null>(null);
  const { blob, storagePath } = photo;

  useEffect(() => {
    let actif = true;
    let objet: string | null = null;
    if (blob) {
      objet = URL.createObjectURL(blob);
      setUrl(objet);
    } else if (storagePath && depotDistant && enLigne) {
      void depotDistant.urlPhoto(storagePath).then((u) => actif && setUrl(u));
    } else {
      setUrl(null);
    }
    return () => {
      actif = false;
      if (objet) URL.revokeObjectURL(objet);
    };
  }, [blob, storagePath, enLigne]);

  return url;
}

interface PropsBouton {
  visiteId: string;
  questionId?: string | null;
  zoneId?: string | null;
  libelle?: string;
  compact?: boolean;
}

/** Ouvre l'appareil photo, compresse (1600 px max), horodate et géolocalise la photo, puis l'enregistre. */
export function BoutonPhoto({ visiteId, questionId = null, zoneId = null, libelle = 'Prendre une photo', compact }: PropsBouton) {
  const entree = useRef<HTMLInputElement>(null);
  const position = useRef<ReturnType<typeof positionActuelle> | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ouvrir = () => {
    setErreur(null);
    // La position est demandée dès le clic : le GPS a le temps de se caler pendant la prise de vue.
    position.current = positionActuelle(15_000);
    entree.current?.click();
  };

  const traiter = async (fichiers: FileList | null) => {
    if (!fichiers || fichiers.length === 0) return;
    setEnCours(true);
    try {
      const pos = await Promise.race([position.current ?? Promise.resolve(null), attendre(2500)]);
      for (const fichier of Array.from(fichiers)) {
        const image = await compresserImage(fichier);
        await ajouterPhoto({
          visiteId,
          questionId,
          zoneId,
          blob: image.blob,
          mime: 'image/jpeg',
          largeur: image.largeur,
          hauteur: image.hauteur,
          prisLe: maintenant(),
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          precisionM: pos?.precisionM ?? null,
        });
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La photo n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
      if (entree.current) entree.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={entree}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void traiter(e.target.files)}
        aria-label={libelle}
      />
      <Bouton variante="secondaire" onClick={ouvrir} disabled={enCours} className={compact ? '!min-h-12 !px-4 !text-base' : 'w-full'}>
        <IconeAppareilPhoto />
        {enCours ? 'Enregistrement…' : libelle}
      </Bouton>
      {erreur && <p className="mt-1 text-sm font-semibold text-red-800">{erreur}</p>}
    </div>
  );
}

function Vignette({ photo, onOuvrir }: { photo: Photo; onOuvrir: () => void }) {
  const url = useUrlPhoto(photo);
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-slate-400 bg-slate-200"
      aria-label={`Voir la photo prise le ${formaterDateHeure(photo.prisLe)}`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-xs text-slate-600">Photo envoyée (hors ligne)</span>
      )}
      {photo.dirty === 1 && <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white" title="En attente d'envoi" />}
    </button>
  );
}

function VisionneusePhoto({ photo, onFermer }: { photo: Photo; onFermer: () => void }) {
  const url = useUrlPhoto(photo);
  const [legende, setLegende] = useState(photo.legende ?? '');
  const [confirmer, setConfirmer] = useState(false);
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3">
      <div className="flex justify-end">
        <button type="button" onClick={onFermer} aria-label="Fermer" className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-900">
          <IconeCroix />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {url ? <img src={url} alt="Photo du site" className="max-h-full max-w-full rounded-lg object-contain" /> : <p className="text-white">Photo non disponible hors ligne.</p>}
      </div>
      <div className="mt-3 space-y-2 rounded-xl bg-white p-3">
        <p className="text-sm text-slate-700">
          {formaterDateHeure(photo.prisLe)}
          {photo.lat != null && photo.lng != null ? ` · ${photo.lat.toFixed(5)}, ${photo.lng.toFixed(5)} (±${photo.precisionM ?? '?'} m)` : ' · sans position GPS'}
        </p>
        <input
          className="champ"
          value={legende}
          placeholder="Légende (facultatif)"
          onChange={(e) => setLegende(e.target.value)}
          onBlur={() => void modifierPhoto(photo.id, { legende })}
          aria-label="Légende de la photo"
        />
        {confirmer ? (
          <div className="flex gap-2">
            <Bouton variante="danger" className="flex-1" onClick={() => void supprimerPhoto(photo.id).then(onFermer)}>
              Confirmer la suppression
            </Bouton>
            <Bouton variante="neutre" onClick={() => setConfirmer(false)}>
              Annuler
            </Bouton>
          </div>
        ) : (
          <Bouton variante="danger" className="w-full" onClick={() => setConfirmer(true)}>
            <IconePoubelle /> Supprimer la photo
          </Bouton>
        )}
      </div>
    </div>
  );
}

/** Photos rattachées à une question ou une zone, avec le bouton pour en ajouter. */
export function GaleriePhotos({ visiteId, questionId, zoneId, libelle }: { visiteId: string; questionId?: string | null; zoneId?: string | null; libelle?: string }) {
  const toutes = usePhotos(visiteId);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const liste = (toutes ?? []).filter((p) => (questionId ? p.questionId === questionId : zoneId ? p.zoneId === zoneId : false));
  const courante = liste.find((p) => p.id === ouverte);

  return (
    <div className="space-y-2">
      {liste.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {liste.map((p) => (
            <Vignette key={p.id} photo={p} onOuvrir={() => setOuverte(p.id)} />
          ))}
        </div>
      )}
      <BoutonPhoto visiteId={visiteId} questionId={questionId} zoneId={zoneId} libelle={libelle ?? (liste.length ? 'Ajouter une photo' : 'Prendre une photo')} compact={liste.length > 0} />
      {courante && <VisionneusePhoto photo={courante} onFermer={() => setOuverte(null)} />}
    </div>
  );
}
