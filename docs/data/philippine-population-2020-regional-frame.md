# PSA 2020 regional population frame

This checked-in derivative contains aggregate counts only. It is admitted for
population weighting, not as survey evidence, behavioral evidence, a current
population estimate, or a campaign-outcome benchmark.

- Source:
  [PSA OpenSTAT Table 1.9, Population by Age Group, Sex, and Region: 2020](https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__3S__C1/0091A2BPAS0.px/?rxid=7f66e4d3-1b06-4621-b5f3-b125c3f54820)
- API endpoint:
  `https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/3S/C1/0091A2BPAS0.px`
- Query: Region codes `1..17`; Age Group `0` (Total Population); Gender `0`
  (Both Sexes); response `csv`.
- Retrieved: 2026-08-04.
- Raw UTF-8 CSV response SHA-256:
  `31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1`.
- Regional total represented by this frame: `109,033,245` persons.
- PSA headline national total: `109,035,343` persons; the `2,098`-person
  difference is excluded and disclosed until the source allocation is resolved.
- License: PSA/GOVPH content is licensed under
  [CC BY 4.0 unless otherwise stated](https://psa.gov.ph/content/highlights-philippine-population-2020-census-population-and-housing-2020-cph?vcode=e2fUK).

The regional weights are `population_count / 109,033,245`. No respondent rows,
voter records, political attributes, or behavioral assumptions are included.
Age, sex, province, urban/rural, language, survey, and historical-outcome
dimensions remain unavailable until a separately cited and lawfully admitted
source is supplied.
