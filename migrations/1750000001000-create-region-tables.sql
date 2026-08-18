-- Up Migration
-- Additive: three NEW lookup tables + one resolver function. `vdma_members` and
-- every other shared table stay untouched. City → state resolution happens in SQL
-- so the target list can filter and paginate on `state`.

CREATE TABLE IF NOT EXISTS public.region_states (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  country    text NOT NULL DEFAULT 'DE'
);

CREATE TABLE IF NOT EXISTS public.region_postal_ranges (
  id          serial PRIMARY KEY,
  country     text NOT NULL DEFAULT 'DE',
  postal_from integer NOT NULL,
  postal_to   integer NOT NULL,
  state_code  text NOT NULL REFERENCES public.region_states(code)
);

CREATE INDEX IF NOT EXISTS region_postal_ranges_lookup_idx
  ON public.region_postal_ranges (country, postal_from, postal_to);

CREATE TABLE IF NOT EXISTS public.region_cities (
  id              serial PRIMARY KEY,
  country         text NOT NULL DEFAULT 'DE',
  city_normalized text NOT NULL,
  postal_prefix   text,          -- NULL = name is unambiguous
  state_code      text NOT NULL REFERENCES public.region_states(code)
);

CREATE INDEX IF NOT EXISTS region_cities_lookup_idx
  ON public.region_cities (country, city_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS region_cities_unique_idx
  ON public.region_cities (country, city_normalized, coalesce(postal_prefix, ''));

INSERT INTO public.region_states (code, name, country) VALUES
  ('BW', 'Baden-Württemberg', 'DE'),
  ('BY', 'Bayern', 'DE'),
  ('BE', 'Berlin', 'DE'),
  ('BB', 'Brandenburg', 'DE'),
  ('HB', 'Bremen', 'DE'),
  ('HH', 'Hamburg', 'DE'),
  ('HE', 'Hessen', 'DE'),
  ('MV', 'Mecklenburg-Vorpommern', 'DE'),
  ('NI', 'Niedersachsen', 'DE'),
  ('NW', 'Nordrhein-Westfalen', 'DE'),
  ('RP', 'Rheinland-Pfalz', 'DE'),
  ('SL', 'Saarland', 'DE'),
  ('SN', 'Sachsen', 'DE'),
  ('ST', 'Sachsen-Anhalt', 'DE'),
  ('SH', 'Schleswig-Holstein', 'DE'),
  ('TH', 'Thüringen', 'DE')
ON CONFLICT (code) DO NOTHING;

-- German postal-code ranges. These are the documented *approximation* used as the
-- fallback when the city name is unknown: they follow the Leitregionen and are
-- correct for the vast majority of addresses, but a handful of border ranges span
-- two states. `region_cities` wins over these ranges, so known cities are exact.
DELETE FROM public.region_postal_ranges WHERE country = 'DE';
INSERT INTO public.region_postal_ranges (country, postal_from, postal_to, state_code) VALUES
  ('DE',  1000,  2999, 'SN'),
  ('DE',  3000,  3999, 'BB'),
  ('DE',  4000,  4899, 'SN'),
  ('DE',  4900,  4999, 'BB'),
  ('DE',  6000,  6999, 'ST'),
  ('DE',  7000,  7999, 'TH'),
  ('DE',  8000,  9999, 'SN'),
  ('DE', 10000, 14199, 'BE'),
  ('DE', 14400, 16999, 'BB'),
  ('DE', 17000, 17999, 'MV'),
  ('DE', 18000, 19999, 'MV'),
  ('DE', 20000, 21149, 'HH'),
  ('DE', 21150, 21449, 'NI'),
  ('DE', 21450, 21529, 'SH'),
  ('DE', 21530, 21799, 'NI'),
  ('DE', 22000, 22769, 'HH'),
  ('DE', 22800, 25999, 'SH'),
  ('DE', 26000, 27999, 'NI'),
  ('DE', 28000, 28999, 'HB'),
  ('DE', 29000, 31999, 'NI'),
  ('DE', 32000, 33999, 'NW'),
  ('DE', 34000, 36999, 'HE'),
  ('DE', 37000, 38799, 'NI'),
  ('DE', 38800, 38899, 'ST'),
  ('DE', 38900, 39999, 'ST'),
  ('DE', 40000, 48999, 'NW'),
  ('DE', 49000, 49999, 'NI'),
  ('DE', 50000, 53999, 'NW'),
  ('DE', 54000, 56999, 'RP'),
  ('DE', 57000, 57499, 'NW'),
  ('DE', 57500, 57699, 'RP'),
  ('DE', 58000, 59999, 'NW'),
  ('DE', 60000, 65999, 'HE'),
  ('DE', 66000, 66849, 'SL'),
  ('DE', 66850, 66999, 'RP'),
  ('DE', 67000, 67999, 'RP'),
  ('DE', 68000, 79999, 'BW'),
  ('DE', 80000, 87999, 'BY'),
  ('DE', 88000, 89999, 'BW'),
  ('DE', 90000, 97999, 'BY'),
  ('DE', 98000, 99999, 'TH');

-- Down Migration
DROP TABLE IF EXISTS public.region_cities;
DROP TABLE IF EXISTS public.region_postal_ranges;
DROP TABLE IF EXISTS public.region_states;
