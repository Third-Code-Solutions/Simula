from math import fsum

import pytest
from simula_core.population_sources import (
    PSA_2020_HEADLINE_NATIONAL_TOTAL,
    PSA_2020_REGIONAL_TOTAL,
    psa_2020_regional_population_frame,
)


def test_psa_2020_frame_is_cited_regional_weighting_only() -> None:
    frame = psa_2020_regional_population_frame()

    assert len(frame.cells) == 17
    assert fsum(cell.weight for cell in frame.cells) == pytest.approx(1.0)
    assert frame.provenance[0].source_id == "psa_openstat_cph_2020"
    assert frame.validation_status == "experimental"
    assert PSA_2020_REGIONAL_TOTAL == 109_033_245
    assert PSA_2020_HEADLINE_NATIONAL_TOTAL - PSA_2020_REGIONAL_TOTAL == 2_098
    assert "voter" in " ".join(frame.exclusion)
    assert "behavioral outputs remain synthetic" in " ".join(frame.limitations)


def test_psa_2020_frame_weights_preserve_regional_order_and_checksum() -> None:
    frame = psa_2020_regional_population_frame()

    assert [cell.key for cell in frame.cells] == [
        "barmm",
        "bicol",
        "cagayan_valley",
        "calabarzon",
        "car",
        "caraga",
        "central_luzon",
        "central_visayas",
        "davao",
        "eastern_visayas",
        "ilocos",
        "mimaropa",
        "ncr",
        "northern_mindanao",
        "soccsksargen",
        "western_visayas",
        "zamboanga_peninsula",
    ]
    assert frame.checksum_sha256 == frame.compute_checksum(
        frame.model_dump(mode="json", exclude={"checksum_sha256"})
    )
    assert frame.cells[0].weight == pytest.approx(4_944_800 / PSA_2020_REGIONAL_TOTAL)
