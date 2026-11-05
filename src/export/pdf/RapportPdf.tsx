import { Circle, Document, Image, Line, Page, Polygon, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { entreprise } from '../../config/entreprise';
import { STATUTS } from '../../domain/types';
import { formaterDateCourte } from '../../lib/outils';
import { surfaceZone } from '../../lib/zones';
import { referentielPour } from '../../referentiel';
import { libelleReponse } from '../../scoring/affichage';
import { calculerScores } from '../../scoring/moteur';
import type { DonneesVisite } from '../donnees';

// Pré-rapport PDF généré côté client. Police Helvetica (standard PDF) : les caractères hors Latin-1
// (émojis de la dictée, espaces fines…) sont nettoyés par `t()` pour éviter les carrés/illisibles.

const VERT = '#17501f';
const GRIS = '#475569';

/** Remplace les caractères que la police standard ne sait pas afficher. */
export function t(texte: string | null | undefined): string {
  return (texte ?? '')
    .replace(/[\u202f\u00a0\u2009]/g, ' ')
    .replace(/[\u2010\u2011\u2212]/g, '-')
    .replace(/→/g, '->')
    .replace(/[^\u0020-\u007e\u00a1-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u20ac\u2022\n]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a' },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: VERT, paddingBottom: 10, marginBottom: 14 },
  logo: { width: 90, height: 45, objectFit: 'contain' },
  nomEntreprise: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: VERT },
  coord: { fontSize: 8, color: GRIS, textAlign: 'right', lineHeight: 1.4 },
  badgeOffert: { alignSelf: 'flex-start', backgroundColor: VERT, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, marginBottom: 6 },
  titre: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: VERT, marginBottom: 4 },
  sousTitre: { fontSize: 11, color: GRIS, marginBottom: 12 },
  h2: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: VERT, marginTop: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 3 },
  ligne: { flexDirection: 'row', marginBottom: 3 },
  libelle: { width: '40%', color: GRIS },
  valeur: { width: '60%' },
  carteScore: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gros: { fontSize: 34, fontFamily: 'Helvetica-Bold', marginRight: 16 },
  ligneConstat: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0' },
  constatQ: { width: '58%', paddingRight: 8 },
  constatR: { width: '42%', fontFamily: 'Helvetica-Bold' },
  commentaire: { fontSize: 9, color: GRIS, fontStyle: 'italic', marginTop: 1 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  photo: { width: 120, marginRight: 8, marginBottom: 6 },
  photoImg: { width: 120, height: 90, objectFit: 'cover', borderRadius: 3 },
  legende: { fontSize: 7, color: GRIS, marginTop: 1 },
  reco: { marginBottom: 7, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: VERT },
  recoTitre: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  pied: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: GRIS, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', paddingTop: 5 },
  mention: { marginTop: 14, padding: 8, backgroundColor: '#f1f5f9', fontSize: 8, color: GRIS },
});

function couleurScore(score: number | null): string {
  if (score === null) return '#64748b';
  if (score >= 85) return '#14532d';
  if (score >= 65) return '#4d7c0f';
  if (score >= 40) return '#b45309';
  return '#b91c1c';
}

/** Radar dessiné en SVG (les graphiques Recharts ne sont pas utilisables dans un PDF). */
export function RadarPdf({ points, taille = 340 }: { points: { libelle: string; score: number | null }[]; taille?: number }): ReactElement {
  const cx = taille / 2;
  const cy = taille / 2;
  // Marge réservée aux intitulés des axes, qui s'écrivent de part et d'autre du radar.
  const rayon = taille / 2 - 80;
  const n = points.length;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const xy = (i: number, r: number): [number, number] => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  const chaine = (i: number, r: number) => xy(i, r).map((v) => v.toFixed(1)).join(',');
  const niveaux = [25, 50, 75, 100];

  return (
    <Svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
      {niveaux.map((niv) => (
        <Polygon key={niv} points={points.map((_, i) => chaine(i, (rayon * niv) / 100)).join(' ')} stroke="#94a3b8" strokeWidth={0.6} fill="none" />
      ))}
      {points.map((_, i) => {
        const [x, y] = xy(i, rayon);
        return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" strokeWidth={0.6} />;
      })}
      <Polygon points={points.map((p, i) => chaine(i, (rayon * (p.score ?? 0)) / 100)).join(' ')} stroke={VERT} strokeWidth={2} fill={VERT} fillOpacity={0.35} />
      {points.map((p, i) => {
        const [x, y] = xy(i, (rayon * (p.score ?? 0)) / 100);
        return <Circle key={i} cx={x} cy={y} r={2.5} fill={VERT} />;
      })}
      {points.map((p, i) => {
        const [x, y] = xy(i, rayon + 14);
        const ancre = Math.abs(x - cx) < 6 ? 'middle' : x < cx ? 'end' : 'start';
        return (
          <Text key={i} x={x} y={y + 3} style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }} textAnchor={ancre}>
            {t(p.libelle)}
          </Text>
        );
      })}
    </Svg>
  );
}

export interface PropsRapport {
  donnees: DonneesVisite;
  /** Photos converties en data URL (JPEG), par identifiant de photo. */
  images: Record<string, string>;
  logo?: string | null;
}

export function RapportPdf({ donnees: d, images, logo }: PropsRapport): ReactElement {
  const ref = referentielPour(d.visite.referentielVersion);
  const table = Object.fromEntries(d.reponses.map((r) => [r.questionId, r.valeur]));
  const resultat = calculerScores(ref, table);
  const commentaires = new Map(d.reponses.filter((r) => r.commentaire).map((r) => [r.questionId, r.commentaire as string]));
  const piliersNotes = resultat.piliers;
  const statut = STATUTS.find((x) => x.id === d.statut?.statut)?.libelle;
  const recommandations = d.recommandations.filter((r) => r.retenue);
  const photosAffichables = d.photos.filter((p) => images[p.id]);
  const surfaceTotale = d.zones.reduce((somme, z) => somme + (surfaceZone(ref, z) ?? 0), 0);
  const date = formaterDateCourte(d.visite.dateDebut ?? d.visite.datePrevue ?? d.visite.updatedAt);

  const Pied = () => (
    <View style={s.pied} fixed>
      <Text>
        {t(entreprise.nom)} - {t(d.prospect?.raisonSociale)} - Pré-rapport, document de travail à valider
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );

  const Entete = () => (
    <View style={s.entete} fixed>
      {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.nomEntreprise}>{t(entreprise.nom)}</Text>}
      <View>
        <Text style={s.coord}>{t(entreprise.nom)}</Text>
        <Text style={s.coord}>{t(entreprise.adresse)}</Text>
        <Text style={s.coord}>
          {t(entreprise.telephone)} - {t(entreprise.email)}
        </Text>
        <Text style={s.coord}>{t(entreprise.siteWeb)}</Text>
      </View>
    </View>
  );

  return (
    <Document title={`Diagnostic RSE - ${t(d.prospect?.raisonSociale)}`} author={t(entreprise.nom)} subject="Diagnostic RSE des espaces extérieurs">
      <Page size="A4" style={s.page}>
        <Entete />
        <Text style={s.badgeOffert}>{t(entreprise.mentionOffert).toUpperCase()}</Text>
        <Text style={s.titre}>Diagnostic RSE des espaces extérieurs</Text>
        <Text style={s.sousTitre}>
          {t(d.prospect?.raisonSociale)} - visite du {date}
        </Text>

        <View style={s.ligne}>
          <Text style={s.libelle}>Site</Text>
          <Text style={s.valeur}>{t([d.site?.adresse, [d.site?.codePostal, d.site?.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</Text>
        </View>
        {d.prospect?.contactNom ? (
          <View style={s.ligne}>
            <Text style={s.libelle}>Interlocuteur</Text>
            <Text style={s.valeur}>{t([d.prospect.contactNom, d.prospect.contactFonction].filter(Boolean).join(', '))}</Text>
          </View>
        ) : null}
        <View style={s.ligne}>
          <Text style={s.libelle}>Visite réalisée par</Text>
          <Text style={s.valeur}>{t(d.chargeAffaires?.nom) || '[à compléter]'}</Text>
        </View>
        {statut ? (
          <View style={s.ligne}>
            <Text style={s.libelle}>Statut</Text>
            <Text style={s.valeur}>{t(statut)}</Text>
          </View>
        ) : null}
        <View style={s.ligne}>
          <Text style={s.libelle}>Référentiel</Text>
          <Text style={s.valeur}>
            {t(ref.nom)} (v{ref.version})
          </Text>
        </View>

        <Text style={s.h2}>Synthèse</Text>
        <View style={s.carteScore}>
          <Text style={[s.gros, { color: couleurScore(resultat.global.score) }]}>{resultat.global.score ?? '-'} / 100</Text>
          <View>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold' }}>{t(resultat.global.niveau?.libelle) || 'Non évalué'}</Text>
            <Text style={{ color: GRIS, maxWidth: 300 }}>{t(resultat.global.niveau?.description)}</Text>
            {resultat.global.couverture < 0.6 && <Text style={{ color: '#b91c1c', marginTop: 2 }}>Questionnaire partiellement renseigné : score indicatif.</Text>}
          </View>
        </View>

        <View style={{ alignItems: 'center' }}>
          <RadarPdf points={piliersNotes.map((p) => ({ libelle: p.libelleCourt, score: p.score }))} />
        </View>

        {piliersNotes.map((p) => (
          <View key={p.sectionId} style={s.ligne}>
            <Text style={{ width: '50%' }}>{t(p.libelle)}</Text>
            <Text style={{ width: '20%', fontFamily: 'Helvetica-Bold', color: couleurScore(p.score) }}>{p.score === null ? 'Non évalué' : `${p.score} / 100`}</Text>
            <Text style={{ width: '30%', color: GRIS }}>{t(p.niveau?.libelle)}</Text>
          </View>
        ))}

        {resultat.pointsForts.length > 0 && (
          <>
            <Text style={s.h2} minPresenceAhead={60}>Points forts</Text>
            {resultat.pointsForts.map((f) => (
              <Text key={f.questionId} style={{ marginBottom: 2 }}>
                • {t(f.libelle)}
              </Text>
            ))}
          </>
        )}

        <Text style={s.h2} minPresenceAhead={60}>Pistes d'amélioration prioritaires</Text>
        {recommandations.length === 0 ? (
          <Text style={{ color: GRIS }}>Aucune piste retenue.</Text>
        ) : (
          recommandations.map((r, i) => {
            const prestation = ref.prestations.find((p) => p.id === r.prestationId);
            return (
              <View key={r.id} style={s.reco} wrap={false}>
                <Text style={s.recoTitre}>
                  {i + 1}. {t(r.titre)}
                </Text>
                <Text>{t(r.texte)}</Text>
                {prestation && <Text style={{ color: VERT, marginTop: 1 }}>Prestation associée : {t(prestation.libelle)}</Text>}
              </View>
            );
          })
        )}

        {d.zones.length > 0 && (
          <>
            <Text style={s.h2} minPresenceAhead={60}>Inventaire du site</Text>
            <Text style={{ marginBottom: 4, color: GRIS }}>
              {d.zones.length} zone{d.zones.length > 1 ? 's' : ''} - environ {Math.round(surfaceTotale)} m² au total
            </Text>
            {d.zones.map((z) => {
              const type = ref.zones.types.find((x) => x.id === z.typeId)?.libelle ?? z.typeId;
              const surface = surfaceZone(ref, z);
              const etat = ref.zones.etats.find((x) => x.id === z.etatId)?.libelle;
              return (
                <View key={z.id} style={s.ligneConstat} wrap={false}>
                  <View style={s.constatQ}>
                    <Text>{t(z.nom ? `${type} - ${z.nom}` : type)}</Text>
                    {z.note ? <Text style={s.commentaire}>{t(z.note)}</Text> : null}
                  </View>
                  <Text style={s.constatR}>
                    {[surface !== null ? `${Math.round(surface)} m²${z.surfaceM2 == null ? ' (estimé)' : ''}` : null, etat ? t(etat) : null].filter(Boolean).join(' - ') || 'Non renseigné'}
                  </Text>
                </View>
              );
            })}
            <View style={s.photos}>
              {photosAffichables
                .filter((p) => p.zoneId)
                .slice(0, 6)
                .map((p) => {
                  const zone = d.zones.find((z) => z.id === p.zoneId);
                  return (
                    <View key={p.id} style={s.photo} wrap={false}>
                      <Image src={images[p.id]} style={s.photoImg} />
                      <Text style={s.legende}>{t(p.legende || zone?.nom || ref.zones.types.find((x) => x.id === zone?.typeId)?.libelle)}</Text>
                    </View>
                  );
                })}
            </View>
          </>
        )}
        <Pied />
      </Page>

      {ref.sections
        .filter((sec) => sec.type === 'pilier')
        .map((section) => {
          const pilier = piliersNotes.find((p) => p.sectionId === section.id);
          const visibles = section.questions.filter((q) => resultat.visibles.has(q.id));
          const repondues = visibles.filter((q) => libelleReponse(q, table[q.id]) !== '');
          const ids = new Set(section.questions.map((q) => q.id));
          const photos = photosAffichables.filter((p) => p.questionId && ids.has(p.questionId)).slice(0, 6);
          const manquantes = visibles.length - repondues.length;
          return (
            <Page key={section.id} size="A4" style={s.page}>
              <Entete />
              <Text style={s.h2}>
                {t(section.libelle)} - {pilier?.score == null ? 'non évalué' : `${pilier.score} / 100 (${t(pilier.niveau?.libelle)})`}
              </Text>
              {repondues.length === 0 && <Text style={{ color: GRIS }}>Aucune réponse enregistrée pour ce pilier : [à compléter].</Text>}
              {repondues.map((q) => {
                const score = resultat.parQuestion[q.id];
                return (
                  <View key={q.id} style={s.ligneConstat} wrap={false}>
                    <View style={s.constatQ}>
                      <Text>{t(q.libelle)}</Text>
                      {commentaires.get(q.id) ? <Text style={s.commentaire}>{t(commentaires.get(q.id))}</Text> : null}
                    </View>
                    <Text style={[s.constatR, { color: score == null ? '#0f172a' : couleurScore(score) }]}>{t(libelleReponse(q, table[q.id]))}</Text>
                  </View>
                );
              })}
              {manquantes > 0 && (
                <Text style={{ color: GRIS, marginTop: 4 }}>
                  {manquantes} question{manquantes > 1 ? 's' : ''} non renseignée{manquantes > 1 ? 's' : ''}.
                </Text>
              )}
              {photos.length > 0 && (
                <View style={s.photos}>
                  {photos.map((p) => (
                    <View key={p.id} style={s.photo} wrap={false}>
                      <Image src={images[p.id]} style={s.photoImg} />
                      <Text style={s.legende}>{t(p.legende || section.questions.find((q) => q.id === p.questionId)?.libelle)}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pied />
            </Page>
          );
        })}

      <Page size="A4" style={s.page}>
        <Entete />
        <Text style={s.h2}>Mentions</Text>
        <Text>
          {t(entreprise.mentionOffert)} par {t(entreprise.nom)}, sans engagement. Ce pré-rapport est un document de travail : il doit être relu et validé par un chargé d'affaires avant tout envoi.
        </Text>
        <Text style={s.mention}>
          Données personnelles :{' '}
          {d.visite.consentementRapport
            ? `le contact a accepté de recevoir ce rapport${d.visite.consentementRapportLe ? ` (le ${formaterDateCourte(d.visite.consentementRapportLe)})` : ''}`
            : "l'accord du contact pour recevoir ce rapport n'est pas enregistré"}
          . Droits d'accès, de rectification et d'effacement : {t(entreprise.emailRgpd)}.
        </Text>
        <Pied />
      </Page>
    </Document>
  );
}
