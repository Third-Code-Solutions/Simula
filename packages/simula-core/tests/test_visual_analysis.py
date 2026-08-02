from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from uuid import UUID

import pytest
from PIL import Image
from pydantic import ValidationError
from simula_core import visual_analysis
from simula_core.visual_analysis import (
    TechnicalImageSignalProvider,
    VisualAnalysisCommand,
    VisualAssetIdentity,
    VisualProviderDescriptor,
    VisualStimulusProfile,
    execute_visual_analysis,
)

ANALYSIS_ID = UUID("00000000-0000-4000-8000-000000000001")
ASSET_ID = UUID("00000000-0000-4000-8000-000000000002")
ORGANIZATION_ID = UUID("00000000-0000-4000-8000-000000000003")
STIMULUS_ID = UUID("00000000-0000-4000-8000-000000000004")


def _image_bytes(
    *,
    format_name: str = "PNG",
    size: tuple[int, int] = (4, 2),
    color: tuple[int, int, int, int] = (255, 0, 0, 255),
    exif: Image.Exif | None = None,
) -> bytes:
    output = BytesIO()
    options = {} if exif is None else {"exif": exif}
    Image.new("RGBA", size, color).convert("RGB" if format_name == "JPEG" else "RGBA").save(
        output, format=format_name, **options
    )
    return output.getvalue()


def _command(
    content: bytes,
    *,
    media_type: str = "image/png",
    provider: VisualProviderDescriptor | None = None,
) -> VisualAnalysisCommand:
    return VisualAnalysisCommand.model_validate(
        {
            "analysis_id": str(ANALYSIS_ID),
            "asset": {
                "asset_id": str(ASSET_ID),
                "organization_id": str(ORGANIZATION_ID),
                "stimulus_id": str(STIMULUS_ID),
                "media_type": media_type,
                "byte_size": len(content),
                "content_sha256": sha256(content).hexdigest(),
            },
            "provider": (provider or TechnicalImageSignalProvider.descriptor).model_dump(
                mode="json"
            ),
        }
    )


def test_profiles_bound_image_signals_deterministically() -> None:
    content = _image_bytes()
    command = _command(content)
    provider = TechnicalImageSignalProvider()

    first = execute_visual_analysis(command, content, provider=provider)
    second = execute_visual_analysis(command, content, provider=provider)

    assert first == second
    assert first.checksum_sha256 == second.checksum_sha256
    assert first.provider.model_id == "pillow-12.3.0"
    assert first.dimensions.model_dump() == {
        "width_px": 4,
        "height_px": 2,
        "pixel_count": 8,
        "aspect_ratio": 2.0,
        "orientation": "landscape",
    }
    assert first.sampling.sampled_pixel_count == 8
    signals = {signal.key: signal for signal in first.signals}
    assert signals["red_mean"].value == 1.0
    assert signals["green_mean"].value == 0.0
    assert signals["blue_mean"].value == 0.0
    assert signals["alpha_coverage"].value == 1.0
    assert signals["edge_density"].kind == "heuristic_technical_signal"
    assert first.analysis_scope == "technical_image_signals_only"
    assert first.behavioral_interpretation is False
    assert first.population_inference is False
    assert first.retained_embedded_metadata is False


def test_applies_exif_orientation_without_retaining_metadata() -> None:
    exif = Image.Exif()
    exif[274] = 6
    content = _image_bytes(format_name="JPEG", exif=exif)

    result = execute_visual_analysis(
        _command(content, media_type="image/jpeg"),
        content,
        provider=TechnicalImageSignalProvider(),
    )

    assert result.dimensions.width_px == 2
    assert result.dimensions.height_px == 4
    assert result.dimensions.orientation == "portrait"
    assert result.retained_embedded_metadata is False


@pytest.mark.parametrize(
    ("content", "media_type"),
    (
        (b"not-an-image", "image/png"),
        (_image_bytes(), "image/jpeg"),
        (_image_bytes(format_name="JPEG"), "image/webp"),
    ),
)
def test_rejects_corrupt_or_media_mismatched_images(
    content: bytes,
    media_type: str,
) -> None:
    with pytest.raises(ValueError, match=r"safe decodable image|media type mismatch"):
        execute_visual_analysis(
            _command(content, media_type=media_type),
            content,
            provider=TechnicalImageSignalProvider(),
        )


def test_rejects_content_not_bound_to_reserved_size_or_checksum() -> None:
    content = _image_bytes()
    command = _command(content)

    with pytest.raises(ValueError, match="byte size mismatch"):
        execute_visual_analysis(
            command,
            content + b"x",
            provider=TechnicalImageSignalProvider(),
        )
    corrupted = bytearray(content)
    corrupted[-1] ^= 1
    with pytest.raises(ValueError, match="checksum mismatch"):
        execute_visual_analysis(
            command,
            bytes(corrupted),
            provider=TechnicalImageSignalProvider(),
        )


def test_rejects_oversized_dimensions_before_exif_copy_or_pixel_load(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = _image_bytes()
    monkeypatch.setattr(visual_analysis, "MAX_DECODED_PIXELS", 1)

    def unexpected_exif_copy(_image: Image.Image) -> Image.Image:
        raise AssertionError("oversized image reached EXIF copy")

    monkeypatch.setattr(visual_analysis.ImageOps, "exif_transpose", unexpected_exif_copy)

    with pytest.raises(ValueError, match="dimensions exceed"):
        execute_visual_analysis(
            _command(content),
            content,
            provider=TechnicalImageSignalProvider(),
        )


def test_rejects_unadmitted_provider_and_tampered_profile_checksum() -> None:
    content = _image_bytes()
    other = TechnicalImageSignalProvider.descriptor.model_copy(update={"provider_version": "2.0.0"})
    command = _command(content, provider=other)

    with pytest.raises(ValueError, match="not admitted"):
        execute_visual_analysis(
            command,
            content,
            provider=TechnicalImageSignalProvider(),
        )

    valid = execute_visual_analysis(
        _command(content),
        content,
        provider=TechnicalImageSignalProvider(),
    )
    payload = valid.model_dump(mode="json")
    payload["checksum_sha256"] = "f" * 64
    with pytest.raises(ValidationError, match="checksum mismatch"):
        VisualStimulusProfile.model_validate(payload)


def test_asset_identity_accepts_only_supported_still_images() -> None:
    content = _image_bytes()
    base = _command(content).asset.model_dump(mode="json")
    base["media_type"] = "video/mp4"

    with pytest.raises(ValidationError):
        VisualAssetIdentity.model_validate(base)
