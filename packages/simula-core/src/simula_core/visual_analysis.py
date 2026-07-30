"""Governed visual-stimulus profiling primitives.

This module measures bounded technical image signals. It does not perform OCR,
object recognition, aesthetic scoring, behavioral interpretation, or outcome
prediction.
"""

from __future__ import annotations

import warnings
from collections import Counter
from collections.abc import Sequence
from hashlib import sha256
from io import BytesIO
from math import fsum, log2, sqrt
from typing import Annotated, Literal, Protocol, Self, cast
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from PIL import ImageOps as ImageOps
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from simula_core.json_codec import canonical_json_dumps_bounded

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Key = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_.-]{0,63}$")]
Label = Annotated[str, StringConstraints(min_length=1, max_length=160)]
ImageMediaType = Literal["image/jpeg", "image/png", "image/webp"]
Orientation = Literal["landscape", "portrait", "square"]
SignalKind = Literal["measured_technical_signal", "heuristic_technical_signal"]
VisualSignalKey = Literal[
    "alpha_coverage",
    "blue_mean",
    "edge_density",
    "green_mean",
    "luminance_contrast",
    "luminance_entropy",
    "luminance_mean",
    "red_mean",
    "saturation_mean",
]

MAX_VISUAL_ASSET_BYTES = 16_777_216
MAX_DECODED_PIXELS = 40_000_000
MAX_SAMPLE_EDGE = 256
MAX_PROFILE_BYTES = 64_000
VISUAL_METHODOLOGY_VERSION: Literal["technical_image_signals_v1"] = "technical_image_signals_v1"
VISUAL_LIMITATIONS: tuple[str, str] = (
    (
        "Measures technical image signals only; it does not identify objects, text, "
        "brand meaning, emotion, persuasion, or aesthetic quality."
    ),
    "It is not observed human evidence or evidence of campaign performance.",
)
_PIL_FORMATS: dict[ImageMediaType, str] = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


class FrozenModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


def _checksum(value: object) -> str:
    return sha256(canonical_json_dumps_bounded(value, maximum_bytes=MAX_PROFILE_BYTES)).hexdigest()


class VisualAssetIdentity(FrozenModel):
    asset_id: UUID
    organization_id: UUID
    stimulus_id: UUID
    media_type: ImageMediaType
    byte_size: int = Field(ge=1, le=MAX_VISUAL_ASSET_BYTES)
    content_sha256: Sha256


class VisualProviderDescriptor(FrozenModel):
    provider_id: Key
    provider_version: Label
    model_id: Label
    template_id: Label
    analysis_kind: Literal["image_signal_profile"] = "image_signal_profile"


class VisualAnalysisCommand(FrozenModel):
    analysis_id: UUID
    asset: VisualAssetIdentity
    provider: VisualProviderDescriptor
    methodology_version: Literal["technical_image_signals_v1"] = VISUAL_METHODOLOGY_VERSION


class VisualDimensions(FrozenModel):
    width_px: int = Field(ge=1, le=MAX_DECODED_PIXELS)
    height_px: int = Field(ge=1, le=MAX_DECODED_PIXELS)
    pixel_count: int = Field(ge=1, le=MAX_DECODED_PIXELS)
    aspect_ratio: float = Field(gt=0.0, le=float(MAX_DECODED_PIXELS))
    orientation: Orientation

    @model_validator(mode="after")
    def internally_consistent(self) -> Self:
        if self.pixel_count != self.width_px * self.height_px:
            raise ValueError("visual dimensions pixel count mismatch")
        expected_ratio = round(self.width_px / self.height_px, 6)
        if self.aspect_ratio != expected_ratio:
            raise ValueError("visual dimensions aspect ratio mismatch")
        expected_orientation: Orientation
        if self.width_px == self.height_px:
            expected_orientation = "square"
        elif self.width_px > self.height_px:
            expected_orientation = "landscape"
        else:
            expected_orientation = "portrait"
        if self.orientation != expected_orientation:
            raise ValueError("visual dimensions orientation mismatch")
        return self


class VisualSamplingReceipt(FrozenModel):
    algorithm: Literal["exif_transpose_lanczos_rgba_v1"] = "exif_transpose_lanczos_rgba_v1"
    sample_width_px: int = Field(ge=1, le=MAX_SAMPLE_EDGE)
    sample_height_px: int = Field(ge=1, le=MAX_SAMPLE_EDGE)
    sampled_pixel_count: int = Field(ge=1, le=MAX_SAMPLE_EDGE**2)

    @model_validator(mode="after")
    def internally_consistent(self) -> Self:
        if self.sampled_pixel_count != self.sample_width_px * self.sample_height_px:
            raise ValueError("visual sample pixel count mismatch")
        return self


class VisualSignal(FrozenModel):
    key: VisualSignalKey
    value: float = Field(ge=0.0, le=1.0)
    unit: Literal["normalized_0_1"] = "normalized_0_1"
    kind: SignalKind
    method: Label


class VisualStimulusProfile(FrozenModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    analysis_id: UUID
    asset: VisualAssetIdentity
    provider: VisualProviderDescriptor
    methodology_version: Literal["technical_image_signals_v1"] = VISUAL_METHODOLOGY_VERSION
    analysis_scope: Literal["technical_image_signals_only"] = "technical_image_signals_only"
    validation_label: Literal["experimental"] = "experimental"
    dimensions: VisualDimensions
    sampling: VisualSamplingReceipt
    signals: tuple[VisualSignal, ...] = Field(min_length=9, max_length=9)
    behavioral_interpretation: Literal[False] = False
    population_inference: Literal[False] = False
    retained_embedded_metadata: Literal[False] = False
    limitations: tuple[str, str] = VISUAL_LIMITATIONS
    checksum_sha256: Sha256 = "0" * 64

    @field_validator("signals")
    @classmethod
    def canonical_signals(cls, value: tuple[VisualSignal, ...]) -> tuple[VisualSignal, ...]:
        keys = tuple(signal.key for signal in value)
        if keys != tuple(sorted(keys)) or len(keys) != len(set(keys)):
            raise ValueError("visual signals must be unique and canonically ordered")
        return value

    @model_validator(mode="after")
    def content_is_bound(self) -> Self:
        payload = self.model_dump(mode="json", exclude={"checksum_sha256"})
        expected = _checksum(payload)
        if self.checksum_sha256 == "0" * 64:
            object.__setattr__(self, "checksum_sha256", expected)
        elif self.checksum_sha256 != expected:
            raise ValueError("visual profile checksum mismatch")
        return self


class VisualProfileProvider(Protocol):
    @property
    def descriptor(self) -> VisualProviderDescriptor: ...

    def profile(
        self,
        command: VisualAnalysisCommand,
        content: bytes,
    ) -> VisualStimulusProfile: ...


def _rounded(value: float) -> float:
    return round(min(1.0, max(0.0, value)), 6)


def _orientation(width: int, height: int) -> Orientation:
    if width == height:
        return "square"
    return "landscape" if width > height else "portrait"


def _validate_image_dimensions(image: Image.Image) -> tuple[int, int]:
    width, height = image.size
    if width < 1 or height < 1 or width * height > MAX_DECODED_PIXELS:
        raise ValueError("visual asset decoded dimensions exceed the admitted envelope")
    return width, height


def _luminance(red: int, green: int, blue: int) -> float:
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255.0


def _entropy(values: Sequence[float]) -> float:
    counts = Counter(min(15, int(value * 16.0)) for value in values)
    total = len(values)
    return -fsum((count / total) * log2(count / total) for count in counts.values()) / 4.0


def _image_signals(image: Image.Image) -> tuple[VisualSignal, ...]:
    sample = image.convert("RGBA")
    sample.thumbnail((MAX_SAMPLE_EDGE, MAX_SAMPLE_EDGE), Image.Resampling.LANCZOS)
    width, height = sample.size
    pixels = cast(
        list[tuple[int, int, int, int]],
        list(sample.get_flattened_data()),
    )
    if not pixels:
        raise ValueError("visual asset decoded to no pixels")

    reds = [pixel[0] / 255.0 for pixel in pixels]
    greens = [pixel[1] / 255.0 for pixel in pixels]
    blues = [pixel[2] / 255.0 for pixel in pixels]
    alphas = [pixel[3] / 255.0 for pixel in pixels]
    luminances = [_luminance(pixel[0], pixel[1], pixel[2]) for pixel in pixels]
    mean_luminance = fsum(luminances) / len(luminances)
    contrast = sqrt(fsum((value - mean_luminance) ** 2 for value in luminances) / len(luminances))
    saturations = []
    for pixel in pixels:
        maximum = max(pixel[0], pixel[1], pixel[2]) / 255.0
        minimum = min(pixel[0], pixel[1], pixel[2]) / 255.0
        saturations.append(0.0 if maximum == 0.0 else (maximum - minimum) / maximum)

    edge_count = 0
    edge_opportunities = 0
    for y in range(height):
        row = y * width
        for x in range(width):
            index = row + x
            if x + 1 < width:
                edge_opportunities += 1
                edge_count += abs(luminances[index] - luminances[index + 1]) >= 0.12
            if y + 1 < height:
                edge_opportunities += 1
                edge_count += abs(luminances[index] - luminances[index + width]) >= 0.12
    edge_density = edge_count / edge_opportunities if edge_opportunities else 0.0

    raw: dict[VisualSignalKey, tuple[float, SignalKind, str]] = {
        "alpha_coverage": (
            fsum(alphas) / len(alphas),
            "measured_technical_signal",
            "mean decoded alpha coverage",
        ),
        "blue_mean": (
            fsum(blues) / len(blues),
            "measured_technical_signal",
            "mean sRGB blue channel",
        ),
        "edge_density": (
            edge_density,
            "heuristic_technical_signal",
            "adjacent luminance difference at threshold 0.12",
        ),
        "green_mean": (
            fsum(greens) / len(greens),
            "measured_technical_signal",
            "mean sRGB green channel",
        ),
        "luminance_contrast": (
            contrast,
            "measured_technical_signal",
            "population standard deviation of relative luminance",
        ),
        "luminance_entropy": (
            _entropy(luminances),
            "heuristic_technical_signal",
            "normalized Shannon entropy across 16 luminance bins",
        ),
        "luminance_mean": (
            mean_luminance,
            "measured_technical_signal",
            "mean Rec. 709 relative luminance",
        ),
        "red_mean": (
            fsum(reds) / len(reds),
            "measured_technical_signal",
            "mean sRGB red channel",
        ),
        "saturation_mean": (
            fsum(saturations) / len(saturations),
            "measured_technical_signal",
            "mean HSV saturation",
        ),
    }
    return tuple(
        VisualSignal(
            key=key,
            value=_rounded(value),
            kind=kind,
            method=method,
        )
        for key, (value, kind, method) in sorted(raw.items())
    )


class TechnicalImageSignalProvider:
    descriptor = VisualProviderDescriptor(
        provider_id="simula_technical_image_signals",
        provider_version="1.0.0",
        model_id="pillow-12.3.0",
        template_id="technical_image_signals_v1",
    )

    def profile(
        self,
        command: VisualAnalysisCommand,
        content: bytes,
    ) -> VisualStimulusProfile:
        asset = command.asset
        if command.provider != self.descriptor:
            raise ValueError("the exact visual provider descriptor is not admitted")
        if len(content) != asset.byte_size:
            raise ValueError("visual asset byte size mismatch")
        if sha256(content).hexdigest() != asset.content_sha256:
            raise ValueError("visual asset checksum mismatch")
        expected_format = _PIL_FORMATS[asset.media_type]
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(
                    BytesIO(content),
                    formats=(expected_format,),
                ) as candidate:
                    if candidate.format != expected_format:
                        raise ValueError("visual asset media type mismatch")
                    _validate_image_dimensions(candidate)
                    candidate.verify()
                with Image.open(
                    BytesIO(content),
                    formats=(expected_format,),
                ) as source:
                    if source.format != expected_format:
                        raise ValueError("visual asset media type mismatch")
                    _validate_image_dimensions(source)
                    image = ImageOps.exif_transpose(source)
                    image.load()
        except (
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            OSError,
            SyntaxError,
            UnidentifiedImageError,
        ) as error:
            raise ValueError("visual asset is not a safe decodable image") from error

        width, height = _validate_image_dimensions(image)
        pixel_count = width * height
        sample = image.copy()
        sample.thumbnail((MAX_SAMPLE_EDGE, MAX_SAMPLE_EDGE), Image.Resampling.LANCZOS)
        sample_width, sample_height = sample.size
        return VisualStimulusProfile(
            analysis_id=command.analysis_id,
            asset=asset,
            provider=self.descriptor,
            dimensions=VisualDimensions(
                width_px=width,
                height_px=height,
                pixel_count=pixel_count,
                aspect_ratio=round(width / height, 6),
                orientation=_orientation(width, height),
            ),
            sampling=VisualSamplingReceipt(
                sample_width_px=sample_width,
                sample_height_px=sample_height,
                sampled_pixel_count=sample_width * sample_height,
            ),
            signals=_image_signals(image),
        )


def execute_visual_analysis(
    command: VisualAnalysisCommand,
    content: bytes,
    *,
    provider: VisualProfileProvider,
) -> VisualStimulusProfile:
    if provider.descriptor != command.provider:
        raise ValueError("the exact visual provider descriptor is not admitted")
    result = provider.profile(command, content)
    if (
        result.analysis_id != command.analysis_id
        or result.asset != command.asset
        or result.provider != command.provider
        or result.methodology_version != command.methodology_version
    ):
        raise ValueError("visual profile response binding mismatch")
    return result
