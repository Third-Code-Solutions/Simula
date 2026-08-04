"""Cited aggregate population frames admitted by SIMULA.

This module contains no respondent records. The PSA frame is a frozen regional
count frame used only to allocate aggregate population weight; it does not add
age, sex, language, behavior, political, or campaign-response assumptions.
"""

from __future__ import annotations

from uuid import UUID

from simula_core.methodology import (
    DimensionValue,
    PopulationCell,
    PopulationFrameVersion,
    SourceProvenance,
)

PSA_2020_OPENSTAT_SOURCE_ID = "psa_openstat_cph_2020"
PSA_2020_OPENSTAT_SOURCE_VERSION = "table_1_9_2020"
PSA_2020_OPENSTAT_API_URL = (
    "https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/3S/C1/0091A2BPAS0.px"
)
PSA_2020_OPENSTAT_CSV_SHA256 = "31bba5110897c5f60b907cfa7b53a7e7ea33bae701f7413e825a5b90ff5159d1"
PSA_2020_REGIONAL_TOTAL = 109_033_245
PSA_2020_HEADLINE_NATIONAL_TOTAL = 109_035_343

_REGIONAL_ROWS: tuple[tuple[str, str, int], ...] = (
    ("barmm", "BARMM", 4_944_800),
    ("bicol", "V - Bicol Region", 6_082_165),
    ("cagayan_valley", "II - Cagayan Valley", 3_685_744),
    ("calabarzon", "IV-A CALABARZON", 16_195_042),
    ("car", "Cordillera Administrative Region", 1_797_660),
    ("caraga", "XIII - Caraga", 2_804_788),
    ("central_luzon", "III - Central Luzon", 12_422_172),
    ("central_visayas", "VII - Central Visayas", 8_081_988),
    ("davao", "XI Davao Region", 5_243_536),
    ("eastern_visayas", "VIII - Eastern Visayas", 4_547_150),
    ("ilocos", "I - Ilocos Region", 5_301_139),
    ("mimaropa", "MIMAROPA Region", 3_228_558),
    ("ncr", "National Capital Region", 13_484_462),
    ("northern_mindanao", "X - Northern Mindanao", 5_022_768),
    ("soccsksargen", "XII SOCCSKSARGEN", 4_360_974),
    ("western_visayas", "VI - Western Visayas", 7_954_723),
    ("zamboanga_peninsula", "IX - Zamboanga Peninsula", 3_875_576),
)


def psa_2020_regional_population_frame() -> PopulationFrameVersion:
    """Return the cited 2020 PSA 17-region frame with normalized weights."""

    if sum(count for _, _, count in _REGIONAL_ROWS) != PSA_2020_REGIONAL_TOTAL:
        raise RuntimeError("PSA regional population constants do not reconcile")

    return PopulationFrameVersion(
        id=UUID("00000000-0000-4000-8000-0000000005a1"),
        frame_id=UUID("00000000-0000-4000-8000-0000000005a0"),
        version=1,
        name="PSA 2020 regional population frame",
        geography="Philippines (17 regions)",
        target_population=(
            "Persons enumerated in the 17 Philippine administrative regions in the "
            "2020 Census of Population and Housing, total population, both sexes."
        ),
        inclusion=(
            "The 17 regional aggregate rows published by PSA OpenSTAT.",
            "Age Group = Total Population and Gender = Both Sexes.",
        ),
        exclusion=(
            "The 2,098-person difference between the PSA headline national total and "
            "the 17 regional rows, pending a source allocation note.",
            "Individual records, voter files, political attributes, behavior, and "
            "survey responses.",
        ),
        provenance=(
            SourceProvenance(
                source_id=PSA_2020_OPENSTAT_SOURCE_ID,
                source_version=PSA_2020_OPENSTAT_SOURCE_VERSION,
                owner="Philippine Statistics Authority (PSA)",
                license="CC BY 4.0 for PSA/GOVPH content unless otherwise stated",
                allowed_uses=(
                    "Aggregate population weighting.",
                    "Aggregate campaign research.",
                    "Source-grounded methodology validation.",
                ),
                collection_period="2020 Census enumeration; reference date 1 May 2020.",
                sampling_frame=(
                    "Persons enumerated in the 17 Philippine administrative regions; "
                    "total-population, both-sexes row."
                ),
                transformations=(
                    f"Selected PSA OpenSTAT Table 1.9 via {PSA_2020_OPENSTAT_API_URL}.",
                    "Normalized each regional count by the 17-region total; "
                    "no individual records retained.",
                    f"UTF-8 CSV response SHA-256: {PSA_2020_OPENSTAT_CSV_SHA256}.",
                ),
                known_biases=(
                    "The census frame is historical and is not a current population estimate.",
                    "Enumeration counts are not survey responses or campaign-response measures.",
                ),
                coverage_limitations=(
                    "Regional rows total 109,033,245; the PSA headline national total "
                    "is 109,035,343.",
                    "No age, sex, province, urban/rural, language, or behavioral "
                    "distributions are admitted.",
                    "No survey responses or historical campaign outcomes are attached.",
                ),
                validation_status="experimental",
            ),
        ),
        cells=tuple(
            PopulationCell(
                key=key,
                weight=count / PSA_2020_REGIONAL_TOTAL,
                dimensions=(DimensionValue(dimension="region", value=label),),
            )
            for key, label, count in _REGIONAL_ROWS
        ),
        validation_status="experimental",
        limitations=(
            "This is an official historical population frame, not a campaign outcome benchmark.",
            "The engine uses only regional population weights; behavioral outputs "
            "remain synthetic until calibrated.",
            "The 2,098-person national-versus-regional difference is excluded and disclosed.",
        ),
    )


__all__ = [
    "PSA_2020_HEADLINE_NATIONAL_TOTAL",
    "PSA_2020_OPENSTAT_API_URL",
    "PSA_2020_OPENSTAT_CSV_SHA256",
    "PSA_2020_OPENSTAT_SOURCE_ID",
    "PSA_2020_OPENSTAT_SOURCE_VERSION",
    "PSA_2020_REGIONAL_TOTAL",
    "psa_2020_regional_population_frame",
]
