-- ============================================================================
-- Diagnostic RSE des espaces extérieurs — schéma Supabase (migration 0001)
-- À exécuter une seule fois : Supabase > SQL Editor, ou `supabase db push`.
--
-- Contrat avec l'application (src/repository/sync.ts + supabase/distant.ts) :
--   * les colonnes sont le snake_case des champs locaux (surfaceEstimeeM2 -> surface_estimee_m2) ;
--   * chaque table a id (texte, fourni par le client), updated_at, deleted_at (suppression
--     logique) et serveur_le (horodatage serveur servant de curseur de synchronisation) ;
--   * pas de clés étrangères : l'ordre d'arrivée des lignes hors ligne n'est pas garanti,
--     et une ligne défectueuse ne doit jamais bloquer les autres.
-- ============================================================================

-- Les fonctions ci-dessous référencent des tables créées plus bas : on désactive la vérification à la création.
set check_function_bodies = off;

-- ─── Profils et rôles ───────────────────────────────────────────────────────

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nom text,
  role text not null default 'terrain' check (role in ('terrain', 'bureau')),
  cree_le timestamptz not null default now()
);

-- Le rôle ne se modifie jamais depuis l'application : un administrateur le passe
-- à 'bureau' dans le SQL Editor (voir README). Un utilisateur peut seulement corriger son nom.
revoke update on public.profils from anon, authenticated;
grant update (nom) on public.profils to authenticated;

-- Fonctions « security definer » : elles lisent les tables en contournant la RLS,
-- ce qui évite les récursions infinies dans les politiques.
create function public.est_bureau() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'bureau');
$$;

create function public.peut_acceder_visite(p_visite text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.visites v
    where v.id = p_visite and (v.utilisateur_id = auth.uid() or public.est_bureau())
  );
$$;

-- Un prospect est « assigné » à un chargé d'affaires dès qu'une de ses visites lui est attribuée.
create function public.prospect_assigne(p_prospect text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sites s join public.visites v on v.site_id = s.id
    where s.prospect_id = p_prospect and v.utilisateur_id = auth.uid()
  );
$$;

-- Attention : ces fonctions interrogent des lignes DÉJÀ enregistrées (prospects, sites, visites).
-- Les politiques d'un prospect testent donc ses propres colonnes (cree_par), car une fonction ne voit pas
-- la ligne en cours d'insertion.
create function public.peut_acceder_prospect(p_prospect text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_bureau()
    or exists (select 1 from public.prospects p where p.id = p_prospect and p.cree_par = auth.uid())
    or public.prospect_assigne(p_prospect);
$$;

create function public.peut_acceder_site(p_site text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_bureau()
    or exists (select 1 from public.visites v where v.site_id = p_site and v.utilisateur_id = auth.uid());
$$;

-- Création automatique du profil à la première connexion (rôle « terrain » par défaut).
create function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, email, nom)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data ->> 'nom', ''), new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger sur_creation_utilisateur
after insert on auth.users
for each row execute function public.creer_profil();

-- Profils des utilisateurs déjà existants au moment de la migration.
insert into public.profils (id, email, nom)
select id, email, coalesce(nullif(raw_user_meta_data ->> 'nom', ''), email) from auth.users
on conflict (id) do nothing;

alter table public.profils enable row level security;
create policy profils_lecture on public.profils for select to authenticated
  using (id = auth.uid() or public.est_bureau());
create policy profils_nom on public.profils for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ─── Tables métier ──────────────────────────────────────────────────────────

create table public.prospects (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  raison_sociale text,
  siret text,
  secteur text,
  effectif text,
  contact_nom text,
  contact_fonction text,
  contact_email text,
  contact_tel text,
  cree_par uuid not null
);

create table public.sites (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  prospect_id text not null,
  adresse text,
  code_postal text,
  ville text,
  lat double precision,
  lng double precision,
  surface_estimee_m2 double precision,
  notes text
);

create table public.visites (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  site_id text not null,
  utilisateur_id uuid not null,
  referentiel_version text not null,
  date_prevue date,
  date_debut timestamptz,
  date_fin timestamptz,
  etat text not null default 'preparee' check (etat in ('preparee', 'en_cours', 'terminee')),
  sections_ignorees jsonb not null default '[]'::jsonb,
  derniere_route text,
  rgpd_informee boolean not null default false,
  rgpd_informee_le timestamptz,
  consentement_rapport boolean not null default false,
  consentement_rapport_le timestamptz,
  signature text,
  notes_synthese text,
  brouillon_texte text,
  brouillon_genere_le timestamptz,
  brouillon_valide_par text,
  brouillon_valide_le timestamptz
);

create table public.zones (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  type_id text,
  nom text,
  surface_m2 double precision,
  taille_id text,
  etat_id text,
  note text,
  ordre integer not null default 0
);

-- id = « visite:question » : une seule réponse par question et par visite.
create table public.reponses (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  question_id text not null,
  valeur jsonb,
  commentaire text
);

-- Le fichier image est dans le Storage (bucket privé « photos ») ; ici, seulement ses métadonnées.
create table public.photos (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  question_id text,
  zone_id text,
  mime text,
  largeur integer,
  hauteur integer,
  pris_le timestamptz,
  lat double precision,
  lng double precision,
  precision_m double precision,
  storage_path text,
  legende text
);

create table public.notes_vocales (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  contexte text,
  texte text
);

create table public.scores (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  pilier text,
  score double precision,
  niveau_id text,
  couverture double precision
);

create table public.recommandations (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  question_id text,
  pilier text,
  titre text,
  texte text,
  priorite integer,
  prestation_id text,
  source text check (source in ('auto', 'manuelle')),
  retenue boolean not null default true
);

-- id = id de la visite : un seul statut commercial par visite.
create table public.statuts_commerciaux (
  id text primary key,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  serveur_le timestamptz not null default clock_timestamp(),
  visite_id text not null,
  statut text not null default 'a_rediger' check (statut in ('a_rediger', 'redige', 'envoye', 'devis_a_faire')),
  prochaine_action text,
  date_relance date,
  historique jsonb not null default '[]'::jsonb
);

-- Index : curseur de synchronisation et rattachement à la visite.
create index on public.prospects (serveur_le);
create index on public.sites (serveur_le);
create index on public.sites (prospect_id);
create index on public.visites (serveur_le);
create index on public.visites (utilisateur_id);
create index on public.visites (site_id);
create index on public.zones (serveur_le);
create index on public.zones (visite_id);
create index on public.reponses (serveur_le);
create index on public.reponses (visite_id);
create index on public.photos (serveur_le);
create index on public.photos (visite_id);
create index on public.notes_vocales (serveur_le);
create index on public.notes_vocales (visite_id);
create index on public.scores (serveur_le);
create index on public.scores (visite_id);
create index on public.recommandations (serveur_le);
create index on public.recommandations (visite_id);
create index on public.statuts_commerciaux (serveur_le);
create index on public.statuts_commerciaux (visite_id);
create index on public.statuts_commerciaux (date_relance) where date_relance is not null;

-- ─── Synchronisation : horodatage serveur et arbitrage « dernière modification gagne » ──

create function public.preparer_ligne() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    -- Écriture plus ancienne que celle du serveur (appareil resté hors ligne) : elle est ignorée.
    -- On « republie » la version du serveur pour que cet appareil la récupère à sa prochaine synchro.
    execute format('update public.%I set serveur_le = clock_timestamp() where id = $1', tg_table_name) using old.id;
    return null;
  end if;
  new.serveur_le := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['prospects', 'sites', 'visites', 'zones', 'reponses', 'photos',
                           'notes_vocales', 'scores', 'recommandations', 'statuts_commerciaux']
  loop
    execute format('create trigger preparer_ligne before insert or update on public.%I
                    for each row execute function public.preparer_ligne()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─── Sécurité par ligne (RLS) ───────────────────────────────────────────────
-- « terrain » : uniquement ses visites (et leurs données) ; « bureau » : tout.
-- Aucune politique de suppression : l'application ne supprime jamais physiquement.

create policy prospects_acces on public.prospects for select to authenticated
  using (cree_par = auth.uid() or public.est_bureau() or public.prospect_assigne(id));
-- L'« ajout » accepte aussi un prospect déjà assigné : l'application envoie des « upsert », dont le contrôle
-- d'insertion s'applique avant la détection du conflit (cas du chargé d'affaires qui corrige la fiche
-- préparée par le bureau).
create policy prospects_ajout on public.prospects for insert to authenticated
  with check (cree_par = auth.uid() or public.est_bureau() or public.prospect_assigne(id));
create policy prospects_maj on public.prospects for update to authenticated
  using (cree_par = auth.uid() or public.est_bureau() or public.prospect_assigne(id))
  with check (cree_par = auth.uid() or public.est_bureau() or public.prospect_assigne(id));

create policy sites_acces on public.sites for select to authenticated
  using (public.peut_acceder_site(id) or public.peut_acceder_prospect(prospect_id));
create policy sites_ajout on public.sites for insert to authenticated
  with check (public.peut_acceder_prospect(prospect_id));
create policy sites_maj on public.sites for update to authenticated
  using (public.peut_acceder_site(id) or public.peut_acceder_prospect(prospect_id))
  with check (public.peut_acceder_prospect(prospect_id));

create policy visites_acces on public.visites for select to authenticated
  using (utilisateur_id = auth.uid() or public.est_bureau());
create policy visites_ajout on public.visites for insert to authenticated
  with check (utilisateur_id = auth.uid() or public.est_bureau());
create policy visites_maj on public.visites for update to authenticated
  using (utilisateur_id = auth.uid() or public.est_bureau())
  with check (utilisateur_id = auth.uid() or public.est_bureau());

do $$
declare t text;
begin
  foreach t in array array['zones', 'reponses', 'photos', 'notes_vocales', 'scores', 'recommandations', 'statuts_commerciaux']
  loop
    execute format('create policy %1$I on public.%2$I for select to authenticated using (public.peut_acceder_visite(visite_id))', t || '_acces', t);
    execute format('create policy %1$I on public.%2$I for insert to authenticated with check (public.peut_acceder_visite(visite_id))', t || '_ajout', t);
    execute format('create policy %1$I on public.%2$I for update to authenticated using (public.peut_acceder_visite(visite_id)) with check (public.peut_acceder_visite(visite_id))', t || '_maj', t);
  end loop;
end $$;

-- Les rôles anonymes n'ont aucun accès aux données.
revoke all on all tables in schema public from anon;

-- ─── Storage : bucket privé « photos » (chemin = {utilisateur}/{visite}/{photo}.jpg) ──

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_lecture on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.est_bureau()));
create policy photos_envoi on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_remplacement on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
