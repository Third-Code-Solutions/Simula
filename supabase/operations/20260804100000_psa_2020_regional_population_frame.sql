-- Admit the cited PSA aggregate frame as a global, read-only methodology source.
-- This is population weighting only: no respondents, voters, or behavior are stored.

set role postgres;

with source_manifest as (
  select $json$
  {
    "schema_version": 1,
    "kind": "verified_public_dataset",
    "source_export_sha256": "31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1",
    "source_url": "https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__3S__C1/0091A2BPAS0.px/",
    "api_url": "https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/3S/C1/0091A2BPAS0.px",
    "target_population": "Persons enumerated in the 17 Philippine administrative regions in the 2020 Census of Population and Housing, total population, both sexes.",
    "geography": "Philippines (17 regions)",
    "inclusion": [
      "The 17 regional aggregate rows published by PSA OpenSTAT.",
      "Age Group = Total Population and Gender = Both Sexes."
    ],
    "exclusion": [
      "The 2,098-person difference between the PSA headline national total and the 17 regional rows, pending a source allocation note.",
      "Individual records, voter files, political attributes, behavior, and survey responses."
    ],
    "provenance": [
      {
        "source_id": "psa_openstat_cph_2020",
        "source_version": "table_1_9_2020",
        "owner": "Philippine Statistics Authority (PSA)",
        "license": "CC BY 4.0 for PSA/GOVPH content unless otherwise stated",
        "allowed_uses": [
          "Aggregate population weighting.",
          "Aggregate campaign research.",
          "Source-grounded methodology validation."
        ],
        "collection_period": "2020 Census enumeration; reference date 1 May 2020.",
        "sampling_frame": "Persons enumerated in the 17 Philippine administrative regions; total-population, both-sexes row.",
        "transformations": [
          "Selected PSA OpenSTAT Table 1.9 via the documented OpenSTAT API.",
          "Normalized each regional count by the 17-region total; no individual records retained.",
          "UTF-8 CSV response SHA-256: 31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1."
        ],
        "known_biases": [
          "The census frame is historical and is not a current population estimate.",
          "Enumeration counts are not survey responses or campaign-response measures."
        ],
        "coverage_limitations": [
          "Regional rows total 109,033,245; the PSA headline national total is 109,035,343.",
          "No age, sex, province, urban/rural, language, or behavioral distributions are admitted.",
          "No survey responses or historical campaign outcomes are attached."
        ]
      }
    ],
    "cells": [
      {"key": "barmm", "weight": 0.045351305466512, "dimensions": {"region": "BARMM"}},
      {"key": "bicol", "weight": 0.055782665186201, "dimensions": {"region": "V - Bicol Region"}},
      {"key": "cagayan_valley", "weight": 0.033803854961851, "dimensions": {"region": "II - Cagayan Valley"}},
      {"key": "calabarzon", "weight": 0.148533064387839, "dimensions": {"region": "IV-A CALABARZON"}},
      {"key": "car", "weight": 0.016487264962168, "dimensions": {"region": "Cordillera Administrative Region"}},
      {"key": "caraga", "weight": 0.025724154132989, "dimensions": {"region": "XIII - Caraga"}},
      {"key": "central_luzon", "weight": 0.113930132043672, "dimensions": {"region": "III - Central Luzon"}},
      {"key": "central_visayas", "weight": 0.074124071057410, "dimensions": {"region": "VII - Central Visayas"}},
      {"key": "davao", "weight": 0.048091167056433, "dimensions": {"region": "XI Davao Region"}},
      {"key": "eastern_visayas", "weight": 0.041704252679997, "dimensions": {"region": "VIII - Eastern Visayas"}},
      {"key": "ilocos", "weight": 0.048619473812781, "dimensions": {"region": "I - Ilocos Region"}},
      {"key": "mimaropa", "weight": 0.029610766881239, "dimensions": {"region": "MIMAROPA Region"}},
      {"key": "ncr", "weight": 0.123672940303666, "dimensions": {"region": "National Capital Region"}},
      {"key": "northern_mindanao", "weight": 0.046066390117987, "dimensions": {"region": "X - Northern Mindanao"}},
      {"key": "soccsksargen", "weight": 0.039996736775100, "dimensions": {"region": "XII SOCCSKSARGEN"}},
      {"key": "western_visayas", "weight": 0.072956858249977, "dimensions": {"region": "VI - Western Visayas"}},
      {"key": "zamboanga_peninsula", "weight": 0.035544901924179, "dimensions": {"region": "IX - Zamboanga Peninsula"}}
    ]
  }
  $json$::jsonb as manifest
), existing_frame as (
  select id
  from api.population_frames
  where organization_id is null
    and name = 'PSA 2020 regional population frame'
  order by created_at, id
  limit 1
), inserted_frame as (
  insert into api.population_frames (
    id, organization_id, name, geography, target_population,
    validation_status, created_by
  )
  select
    pg_catalog.gen_random_uuid(),
    null,
    'PSA 2020 regional population frame',
    manifest.manifest ->> 'geography',
    manifest.manifest ->> 'target_population',
    'experimental',
    null
  from source_manifest as manifest
  where not exists (select 1 from existing_frame)
  returning id
), selected_frame as (
  select id from existing_frame
  union all
  select id from inserted_frame
)
insert into api.population_frame_versions (
  id, organization_id, population_frame_id, version, manifest,
  checksum_sha256, validation_status, limitations, created_by
)
select
  pg_catalog.gen_random_uuid(),
  null,
  selected_frame.id,
  1,
  source_manifest.manifest,
  pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(source_manifest.manifest::text, 'UTF8'), 'sha256'),
    'hex'
  ),
  'experimental',
  array[
    'This is an official historical population frame, not a campaign outcome benchmark.',
    'The engine uses only regional population weights; behavioral outputs remain synthetic until calibrated.',
    'The 2,098-person national-versus-regional difference is excluded and disclosed.'
  ]::text[],
  null
from selected_frame
cross join source_manifest
where not exists (
  select 1
  from api.population_frame_versions as versions
  where versions.population_frame_id = selected_frame.id
    and versions.version = 1
);

set role postgres;
