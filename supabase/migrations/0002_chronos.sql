-- Chronomètre par section : temps passé sur chaque section de la visite (et sur l'inventaire des zones).
-- Format : { "<id de section>": { "secondes": 192, "debutLe": "2026-11-04T09:12:00.000Z" }, … }
-- La colonne est volontairement nullable : les visites créées avant cette version n'ont pas de chrono.

alter table public.visites add column if not exists chronos jsonb;
