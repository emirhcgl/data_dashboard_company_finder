-- Up Migration
-- Additive: state-name aliases (for `headquarters` parsing), the committed city
-- list, and the resolver used by the target query.

CREATE TABLE IF NOT EXISTS public.region_state_aliases (
  id         serial PRIMARY KEY,
  country    text NOT NULL DEFAULT 'DE',
  alias      text NOT NULL,
  state_code text NOT NULL REFERENCES public.region_states(code)
);

CREATE UNIQUE INDEX IF NOT EXISTS region_state_aliases_unique_idx
  ON public.region_state_aliases (country, alias);

DELETE FROM public.region_state_aliases WHERE country = 'DE';
INSERT INTO public.region_state_aliases (country, alias, state_code) VALUES
  ('DE', 'baden-württemberg', 'BW'),
  ('DE', 'baden-wuerttemberg', 'BW'),
  ('DE', 'baden-wurttemberg', 'BW'),
  ('DE', 'bayern', 'BY'),
  ('DE', 'bavaria', 'BY'),
  ('DE', 'berlin', 'BE'),
  ('DE', 'brandenburg', 'BB'),
  ('DE', 'bremen', 'HB'),
  ('DE', 'hamburg', 'HH'),
  ('DE', 'hessen', 'HE'),
  ('DE', 'hesse', 'HE'),
  ('DE', 'mecklenburg-vorpommern', 'MV'),
  ('DE', 'mecklenburg-western pomerania', 'MV'),
  ('DE', 'niedersachsen', 'NI'),
  ('DE', 'lower saxony', 'NI'),
  ('DE', 'nordrhein-westfalen', 'NW'),
  ('DE', 'north rhine-westphalia', 'NW'),
  ('DE', 'nrw', 'NW'),
  ('DE', 'rheinland-pfalz', 'RP'),
  ('DE', 'rhineland-palatinate', 'RP'),
  ('DE', 'saarland', 'SL'),
  ('DE', 'sachsen-anhalt', 'ST'),
  ('DE', 'saxony-anhalt', 'ST'),
  ('DE', 'sachsen', 'SN'),
  ('DE', 'saxony', 'SN'),
  ('DE', 'schleswig-holstein', 'SH'),
  ('DE', 'thüringen', 'TH'),
  ('DE', 'thueringen', 'TH'),
  ('DE', 'thuringia', 'TH');

-- Committed city list. `city_normalized` values are already in the shape produced
-- by region_normalize_city() (lowercase, umlauts transliterated, suffixes dropped).
-- A non-null `postal_prefix` marks an ambiguous name that the postal code decides.
DELETE FROM public.region_cities WHERE country = 'DE';
INSERT INTO public.region_cities (country, city_normalized, postal_prefix, state_code) VALUES
  -- ambiguous names: postal prefix decides
  ('DE', 'frankfurt', '60', 'HE'),
  ('DE', 'frankfurt', '65', 'HE'),
  ('DE', 'frankfurt', '15', 'BB'),
  ('DE', 'halle', '06', 'ST'),
  ('DE', 'halle', '33', 'NW'),
  ('DE', 'neustadt', '67', 'RP'),
  ('DE', 'neustadt', '91', 'BY'),
  ('DE', 'neustadt', '96', 'BY'),
  ('DE', 'neustadt', '23', 'SH'),
  ('DE', 'neustadt', '31', 'NI'),
  ('DE', 'muehlhausen', '99', 'TH'),
  ('DE', 'muehlhausen', '72', 'BW'),
  ('DE', 'lichtenau', '33', 'NW'),
  ('DE', 'lichtenau', '77', 'BW'),
  -- Baden-Württemberg
  ('DE', 'stuttgart', NULL, 'BW'),
  ('DE', 'karlsruhe', NULL, 'BW'),
  ('DE', 'mannheim', NULL, 'BW'),
  ('DE', 'freiburg', NULL, 'BW'),
  ('DE', 'heidelberg', NULL, 'BW'),
  ('DE', 'heilbronn', NULL, 'BW'),
  ('DE', 'ulm', NULL, 'BW'),
  ('DE', 'pforzheim', NULL, 'BW'),
  ('DE', 'reutlingen', NULL, 'BW'),
  ('DE', 'esslingen', NULL, 'BW'),
  ('DE', 'ludwigsburg', NULL, 'BW'),
  ('DE', 'tuebingen', NULL, 'BW'),
  ('DE', 'villingen-schwenningen', NULL, 'BW'),
  ('DE', 'konstanz', NULL, 'BW'),
  ('DE', 'aalen', NULL, 'BW'),
  ('DE', 'sindelfingen', NULL, 'BW'),
  ('DE', 'boeblingen', NULL, 'BW'),
  ('DE', 'goeppingen', NULL, 'BW'),
  ('DE', 'schwaebisch gmuend', NULL, 'BW'),
  ('DE', 'ravensburg', NULL, 'BW'),
  ('DE', 'friedrichshafen', NULL, 'BW'),
  ('DE', 'offenburg', NULL, 'BW'),
  ('DE', 'baden-baden', NULL, 'BW'),
  ('DE', 'waiblingen', NULL, 'BW'),
  ('DE', 'schwenningen', NULL, 'BW'),
  ('DE', 'albstadt', NULL, 'BW'),
  ('DE', 'bruchsal', NULL, 'BW'),
  -- Bayern
  ('DE', 'muenchen', NULL, 'BY'),
  ('DE', 'munich', NULL, 'BY'),
  ('DE', 'nuernberg', NULL, 'BY'),
  ('DE', 'nuremberg', NULL, 'BY'),
  ('DE', 'augsburg', NULL, 'BY'),
  ('DE', 'regensburg', NULL, 'BY'),
  ('DE', 'ingolstadt', NULL, 'BY'),
  ('DE', 'wuerzburg', NULL, 'BY'),
  ('DE', 'fuerth', NULL, 'BY'),
  ('DE', 'erlangen', NULL, 'BY'),
  ('DE', 'bayreuth', NULL, 'BY'),
  ('DE', 'bamberg', NULL, 'BY'),
  ('DE', 'aschaffenburg', NULL, 'BY'),
  ('DE', 'landshut', NULL, 'BY'),
  ('DE', 'kempten', NULL, 'BY'),
  ('DE', 'rosenheim', NULL, 'BY'),
  ('DE', 'schweinfurt', NULL, 'BY'),
  ('DE', 'passau', NULL, 'BY'),
  ('DE', 'coburg', NULL, 'BY'),
  ('DE', 'straubing', NULL, 'BY'),
  ('DE', 'amberg', NULL, 'BY'),
  ('DE', 'memmingen', NULL, 'BY'),
  ('DE', 'garching', NULL, 'BY'),
  ('DE', 'unterhaching', NULL, 'BY'),
  -- Berlin / Bremen / Hamburg (city states)
  ('DE', 'berlin', NULL, 'BE'),
  ('DE', 'bremen', NULL, 'HB'),
  ('DE', 'bremerhaven', NULL, 'HB'),
  ('DE', 'hamburg', NULL, 'HH'),
  -- Brandenburg
  ('DE', 'potsdam', NULL, 'BB'),
  ('DE', 'cottbus', NULL, 'BB'),
  ('DE', 'brandenburg an der havel', NULL, 'BB'),
  ('DE', 'oranienburg', NULL, 'BB'),
  ('DE', 'eberswalde', NULL, 'BB'),
  ('DE', 'ludwigsfelde', NULL, 'BB'),
  ('DE', 'senftenberg', NULL, 'BB'),
  -- Hessen
  ('DE', 'wiesbaden', NULL, 'HE'),
  ('DE', 'kassel', NULL, 'HE'),
  ('DE', 'darmstadt', NULL, 'HE'),
  ('DE', 'offenbach', NULL, 'HE'),
  ('DE', 'giessen', NULL, 'HE'),
  ('DE', 'marburg', NULL, 'HE'),
  ('DE', 'fulda', NULL, 'HE'),
  ('DE', 'hanau', NULL, 'HE'),
  ('DE', 'ruesselsheim', NULL, 'HE'),
  ('DE', 'bad homburg', NULL, 'HE'),
  ('DE', 'wetzlar', NULL, 'HE'),
  ('DE', 'limburg', NULL, 'HE'),
  -- Mecklenburg-Vorpommern
  ('DE', 'rostock', NULL, 'MV'),
  ('DE', 'schwerin', NULL, 'MV'),
  ('DE', 'neubrandenburg', NULL, 'MV'),
  ('DE', 'stralsund', NULL, 'MV'),
  ('DE', 'greifswald', NULL, 'MV'),
  ('DE', 'wismar', NULL, 'MV'),
  -- Niedersachsen
  ('DE', 'hannover', NULL, 'NI'),
  ('DE', 'hanover', NULL, 'NI'),
  ('DE', 'braunschweig', NULL, 'NI'),
  ('DE', 'osnabrueck', NULL, 'NI'),
  ('DE', 'oldenburg', NULL, 'NI'),
  ('DE', 'wolfsburg', NULL, 'NI'),
  ('DE', 'goettingen', NULL, 'NI'),
  ('DE', 'salzgitter', NULL, 'NI'),
  ('DE', 'hildesheim', NULL, 'NI'),
  ('DE', 'delmenhorst', NULL, 'NI'),
  ('DE', 'wilhelmshaven', NULL, 'NI'),
  ('DE', 'lueneburg', NULL, 'NI'),
  ('DE', 'celle', NULL, 'NI'),
  ('DE', 'garbsen', NULL, 'NI'),
  ('DE', 'emden', NULL, 'NI'),
  ('DE', 'lingen', NULL, 'NI'),
  ('DE', 'peine', NULL, 'NI'),
  -- Nordrhein-Westfalen
  ('DE', 'koeln', NULL, 'NW'),
  ('DE', 'cologne', NULL, 'NW'),
  ('DE', 'duesseldorf', NULL, 'NW'),
  ('DE', 'dortmund', NULL, 'NW'),
  ('DE', 'essen', NULL, 'NW'),
  ('DE', 'duisburg', NULL, 'NW'),
  ('DE', 'bochum', NULL, 'NW'),
  ('DE', 'wuppertal', NULL, 'NW'),
  ('DE', 'bielefeld', NULL, 'NW'),
  ('DE', 'bonn', NULL, 'NW'),
  ('DE', 'muenster', NULL, 'NW'),
  ('DE', 'moenchengladbach', NULL, 'NW'),
  ('DE', 'gelsenkirchen', NULL, 'NW'),
  ('DE', 'aachen', NULL, 'NW'),
  ('DE', 'krefeld', NULL, 'NW'),
  ('DE', 'oberhausen', NULL, 'NW'),
  ('DE', 'hagen', NULL, 'NW'),
  ('DE', 'hamm', NULL, 'NW'),
  ('DE', 'muelheim', NULL, 'NW'),
  ('DE', 'leverkusen', NULL, 'NW'),
  ('DE', 'solingen', NULL, 'NW'),
  ('DE', 'herne', NULL, 'NW'),
  ('DE', 'neuss', NULL, 'NW'),
  ('DE', 'paderborn', NULL, 'NW'),
  ('DE', 'bottrop', NULL, 'NW'),
  ('DE', 'recklinghausen', NULL, 'NW'),
  ('DE', 'bergisch gladbach', NULL, 'NW'),
  ('DE', 'remscheid', NULL, 'NW'),
  ('DE', 'siegen', NULL, 'NW'),
  ('DE', 'guetersloh', NULL, 'NW'),
  ('DE', 'witten', NULL, 'NW'),
  ('DE', 'iserlohn', NULL, 'NW'),
  ('DE', 'luedenscheid', NULL, 'NW'),
  ('DE', 'velbert', NULL, 'NW'),
  ('DE', 'minden', NULL, 'NW'),
  ('DE', 'bielefeld-sennestadt', NULL, 'NW'),
  ('DE', 'arnsberg', NULL, 'NW'),
  ('DE', 'detmold', NULL, 'NW'),
  ('DE', 'wesel', NULL, 'NW'),
  ('DE', 'kempen', NULL, 'NW'),
  -- Rheinland-Pfalz
  ('DE', 'mainz', NULL, 'RP'),
  ('DE', 'ludwigshafen', NULL, 'RP'),
  ('DE', 'koblenz', NULL, 'RP'),
  ('DE', 'trier', NULL, 'RP'),
  ('DE', 'kaiserslautern', NULL, 'RP'),
  ('DE', 'worms', NULL, 'RP'),
  ('DE', 'speyer', NULL, 'RP'),
  ('DE', 'pirmasens', NULL, 'RP'),
  ('DE', 'idar-oberstein', NULL, 'RP'),
  -- Saarland
  ('DE', 'saarbruecken', NULL, 'SL'),
  ('DE', 'neunkirchen', NULL, 'SL'),
  ('DE', 'homburg', NULL, 'SL'),
  ('DE', 'voelklingen', NULL, 'SL'),
  ('DE', 'saarlouis', NULL, 'SL'),
  -- Sachsen
  ('DE', 'dresden', NULL, 'SN'),
  ('DE', 'leipzig', NULL, 'SN'),
  ('DE', 'chemnitz', NULL, 'SN'),
  ('DE', 'zwickau', NULL, 'SN'),
  ('DE', 'goerlitz', NULL, 'SN'),
  ('DE', 'plauen', NULL, 'SN'),
  ('DE', 'bautzen', NULL, 'SN'),
  ('DE', 'freiberg', NULL, 'SN'),
  ('DE', 'riesa', NULL, 'SN'),
  -- Sachsen-Anhalt
  ('DE', 'magdeburg', NULL, 'ST'),
  ('DE', 'dessau-rosslau', NULL, 'ST'),
  ('DE', 'wittenberg', NULL, 'ST'),
  ('DE', 'halberstadt', NULL, 'ST'),
  ('DE', 'bitterfeld-wolfen', NULL, 'ST'),
  ('DE', 'stendal', NULL, 'ST'),
  ('DE', 'weissenfels', NULL, 'ST'),
  -- Schleswig-Holstein
  ('DE', 'kiel', NULL, 'SH'),
  ('DE', 'luebeck', NULL, 'SH'),
  ('DE', 'flensburg', NULL, 'SH'),
  ('DE', 'norderstedt', NULL, 'SH'),
  ('DE', 'pinneberg', NULL, 'SH'),
  ('DE', 'itzehoe', NULL, 'SH'),
  ('DE', 'elmshorn', NULL, 'SH'),
  ('DE', 'rendsburg', NULL, 'SH'),
  -- Thüringen
  ('DE', 'erfurt', NULL, 'TH'),
  ('DE', 'jena', NULL, 'TH'),
  ('DE', 'gera', NULL, 'TH'),
  ('DE', 'weimar', NULL, 'TH'),
  ('DE', 'gotha', NULL, 'TH'),
  ('DE', 'eisenach', NULL, 'TH'),
  ('DE', 'suhl', NULL, 'TH'),
  ('DE', 'nordhausen', NULL, 'TH');

CREATE OR REPLACE FUNCTION public.region_is_germany(p_country text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_country IS NULL
      OR btrim(p_country) = ''
      OR lower(btrim(p_country)) IN (
           'de', 'deu', 'ger', 'germany', 'deutschland', 'de-de',
           'bundesrepublik deutschland', 'd'
         );
$$;

-- Resolution order: city + postal prefix -> unambiguous city -> postal range ->
-- headquarters string -> NULL ("Unknown", still visible and filterable).
CREATE OR REPLACE FUNCTION public.resolve_state_code(
  p_country      text,
  p_city         text,
  p_postal       text,
  p_headquarters text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN NOT public.region_is_germany(p_country) THEN NULL
    ELSE COALESCE(
      (SELECT c.state_code
         FROM public.region_cities c
        WHERE c.country = 'DE'
          AND c.city_normalized = public.region_normalize_city(p_city)
          AND c.postal_prefix = left(lpad(
                public.region_normalize_postal(p_postal)::text, 5, '0'), 2)
        LIMIT 1),
      (SELECT c.state_code
         FROM public.region_cities c
        WHERE c.country = 'DE'
          AND c.city_normalized = public.region_normalize_city(p_city)
          AND c.postal_prefix IS NULL
        LIMIT 1),
      (SELECT r.state_code
         FROM public.region_postal_ranges r
        WHERE r.country = 'DE'
          AND public.region_normalize_postal(p_postal)
              BETWEEN r.postal_from AND r.postal_to
        LIMIT 1),
      (SELECT a.state_code
         FROM public.region_state_aliases a
        WHERE a.country = 'DE'
          AND p_headquarters IS NOT NULL
          AND lower(p_headquarters) LIKE '%' || a.alias || '%'
        ORDER BY length(a.alias) DESC
        LIMIT 1),
      (SELECT c.state_code
         FROM public.region_cities c
        WHERE c.country = 'DE'
          AND c.postal_prefix IS NULL
          AND c.city_normalized =
              public.region_normalize_city(split_part(p_headquarters, ',', 1))
        LIMIT 1)
    )
  END;
$$;

-- Down Migration
DROP FUNCTION IF EXISTS public.resolve_state_code(text, text, text, text);
DROP FUNCTION IF EXISTS public.region_is_germany(text);
DROP TABLE IF EXISTS public.region_state_aliases;
