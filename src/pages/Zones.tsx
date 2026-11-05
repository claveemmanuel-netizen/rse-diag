import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChipChrono } from '../components/ChipChrono';
import { Compteur } from '../components/Compteur';
import { BoutonTest } from '../components/BoutonTest';
import { ChampTexte } from '../components/ChampTexte';
import { IconePoubelle } from '../components/Icones';
import { Page } from '../components/Page';
import { GaleriePhotos } from '../components/Photos';
import { Alerte, Bouton, Carte, Chargement } from '../components/ui';
import { useChrono } from '../hooks/chrono';
import { usePhotos, useZones } from '../hooks/donnees';
import type { Zone } from '../domain/types';
import { CLE_CHRONO_ZONES, dureesEffectives } from '../lib/chrono';
import { surfaceZone } from '../lib/zones';
import { ajouterZone, modifierZone, supprimerZone } from '../repository/depot';
import { ajouterZonesTest } from '../repository/donneesTest';
import { useContexteVisite } from './VisiteLayout';

function Pastilles({ options, valeur, onChoisir, etiquette }: { options: { id: string; libelle: string }[]; valeur?: string | null; onChoisir: (id: string | null) => void; etiquette: string }) {
  return (
    <div role="group" aria-label={etiquette} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valeur === o.id}
          onClick={() => onChoisir(valeur === o.id ? null : o.id)}
          className={`min-h-12 rounded-xl border-2 px-4 text-base font-bold ${valeur === o.id ? 'border-vert-800 bg-vert-700 text-white' : 'border-slate-400 bg-white text-slate-900'}`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

function CarteZone({ zone, ouverte, onBasculer }: { zone: Zone; ouverte: boolean; onBasculer: () => void }) {
  const { ref, visite } = useContexteVisite();
  const [confirmer, setConfirmer] = useState(false);
  const type = ref.zones.types.find((t) => t.id === zone.typeId);
  const etat = ref.zones.etats.find((e) => e.id === zone.etatId);
  const taille = ref.zones.tailles.find((t) => t.id === zone.tailleId);
  const surface = zone.surfaceM2 ?? null;

  return (
    <Carte className="space-y-3">
      <button type="button" onClick={onBasculer} aria-expanded={ouverte} className="flex w-full items-center gap-3 text-left">
        <span className="text-3xl" aria-hidden>
          {type?.icone ?? '📍'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold">{zone.nom || type?.libelle || zone.typeId}</span>
          <span className="block truncate text-sm text-slate-700">
            {[zone.nom ? type?.libelle : null, surface !== null ? `${surface} m²` : taille?.libelle, etat?.libelle].filter(Boolean).join(' · ') || 'À renseigner'}
          </span>
        </span>
        <span aria-hidden className="text-2xl text-slate-500">
          {ouverte ? '▾' : '▸'}
        </span>
      </button>

      {ouverte && (
        <div className="space-y-4 border-t border-slate-200 pt-3">
          <div>
            <span className="etiquette">Nom ou repère (facultatif)</span>
            <ChampTexte valeur={zone.nom ?? ''} onChange={(nom) => void modifierZone(zone.id, { nom })} placeholder="Ex. : pelouse côté parking" etiquetteAria="Nom de la zone" />
          </div>
          <div>
            <span className="etiquette">Taille estimée</span>
            <Pastilles
              etiquette="Taille estimée"
              options={ref.zones.tailles.map((t) => ({ id: t.id, libelle: `${t.libelle} (~${t.m2Indicatif} m²)` }))}
              valeur={zone.tailleId}
              onChoisir={(tailleId) => void modifierZone(zone.id, { tailleId })}
            />
          </div>
          <div>
            <span className="etiquette">Surface précise, si connue (m²)</span>
            <Compteur valeur={surface} onChange={(surfaceM2) => void modifierZone(zone.id, { surfaceM2 })} pas={10} unite="m²" etiquetteAria="Surface en mètres carrés" />
          </div>
          <div>
            <span className="etiquette">État</span>
            <Pastilles etiquette="État de la zone" options={ref.zones.etats} valeur={zone.etatId} onChoisir={(etatId) => void modifierZone(zone.id, { etatId })} />
          </div>
          <div>
            <span className="etiquette">Observations</span>
            <ChampTexte valeur={zone.note ?? ''} onChange={(note) => void modifierZone(zone.id, { note })} multiligne lignes={2} placeholder="Dictez une remarque (facultatif)" etiquetteAria="Observations sur la zone" />
          </div>
          <GaleriePhotos visiteId={visite.id} zoneId={zone.id} />
          {confirmer ? (
            <div className="flex gap-2">
              <Bouton variante="danger" className="flex-1" onClick={() => void supprimerZone(zone.id)}>
                Confirmer la suppression
              </Bouton>
              <Bouton variante="neutre" onClick={() => setConfirmer(false)}>
                Annuler
              </Bouton>
            </div>
          ) : (
            <Bouton variante="danger" className="w-full" onClick={() => setConfirmer(true)}>
              <IconePoubelle /> Supprimer cette zone
            </Bouton>
          )}
        </div>
      )}
    </Carte>
  );
}

/** Inventaire du site : l'utilisateur crée des zones typées avec surface, état et photo. */
export default function Zones() {
  const { ref, visite, prospect } = useContexteVisite();
  const zones = useZones(visite.id);
  const photos = usePhotos(visite.id);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const base = `/visites/${visite.id}`;

  // La première modification de l'inventaire (zone créée, modifiée, supprimée ou photographiée) déclenche le chrono.
  const signature = zones && photos ? `${JSON.stringify(zones.map((z) => [z.id, z.nom, z.surfaceM2, z.tailleId, z.etatId, z.note]))}#${photos.filter((p) => p.zoneId).length}` : undefined;
  const chrono = useChrono(visite.id, CLE_CHRONO_ZONES, visite.chronos?.[CLE_CHRONO_ZONES], signature);

  if (!zones) return <Chargement />;

  const total = zones.reduce((s, z) => s + (surfaceZone(ref, z) ?? 0), 0);

  return (
    <Page titre="Zones du site" sousTitre={prospect?.raisonSociale} retour={base} libelleRetour="Retour au sommaire">
      <div className="sticky top-[4.25rem] z-10 -mx-3 border-b border-slate-300 bg-slate-100/95 px-3 py-2 backdrop-blur">
        <ChipChrono chrono={chrono} estimationSecondes={dureesEffectives(ref).zones} />
      </div>
      <Carte className="space-y-3">
        <h2 className="text-lg font-extrabold">Ajouter une zone</h2>
        <div className="grid grid-cols-3 gap-2">
          {ref.zones.types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void ajouterZone(visite.id, t.id).then(setOuverte)}
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-vert-700 bg-vert-50 px-1 py-2 text-center text-sm font-bold text-vert-900 active:bg-vert-200"
            >
              <span className="text-2xl" aria-hidden>
                {t.icone ?? '📍'}
              </span>
              {t.libelle}
            </button>
          ))}
        </div>
      </Carte>

      <BoutonTest
        libelle="Ajouter des zones de test"
        action={async () => {
          const nombre = await ajouterZonesTest(visite.id);
          return nombre > 0 ? `${nombre} zone(s) fictive(s) ajoutée(s) ; les champs vides des zones existantes ont été complétés.` : 'Les zones de test existent déjà ; les champs vides des zones existantes ont été complétés.';
        }}
      />

      {zones.length === 0 ? (
        <Alerte type="info">Aucune zone pour l'instant. Touchez un type de zone ci-dessus pour en créer une.</Alerte>
      ) : (
        <>
          <p className="px-1 text-base font-semibold">
            {zones.length} zone{zones.length > 1 ? 's' : ''}
            {total > 0 && ` · environ ${Math.round(total).toLocaleString('fr-FR')} m² au total`}
          </p>
          {zones.map((z) => (
            <CarteZone key={z.id} zone={z} ouverte={ouverte === z.id} onBasculer={() => setOuverte(ouverte === z.id ? null : z.id)} />
          ))}
        </>
      )}
      <Link to={base} className="bouton-primaire w-full">
        Terminé, retour au sommaire
      </Link>
    </Page>
  );
}
