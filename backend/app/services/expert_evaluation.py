from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import nibabel as nib
import numpy as np

from app.services.measurements import SegmentationMeasurements, measure_segmentation
from app.services.segmentation_validation import SegmentationValidationError


REGION_LABELS = {
    "tumor_core": (1, 4),
    "whole_tumor": (1, 2, 4),
    "enhancing_tumor": (4,),
}


class ExpertMaskValidationError(ValueError):
    """Raised when an expert label map is invalid or spatially incompatible."""


@dataclass(frozen=True)
class RegionEvaluation:
    dice: float
    sensitivity: float | None
    predicted_voxel_count: int
    reference_voxel_count: int
    intersection_voxel_count: int


@dataclass(frozen=True)
class ExpertEvaluation:
    measurements: SegmentationMeasurements
    regions: dict[str, RegionEvaluation]
    warnings: tuple[str, ...]


def load_and_validate_expert_mask(
    path: str | Path,
    *,
    reference_shape: tuple[int, int, int],
    reference_affine: np.ndarray,
    max_voxels: int,
) -> tuple[np.ndarray, SegmentationMeasurements]:
    try:
        image = nib.load(str(path))
    except Exception as exc:
        raise ExpertMaskValidationError(
            "Expert mask is not a readable NIfTI image."
        ) from exc

    if len(image.shape) != 3 or tuple(image.shape) != reference_shape:
        raise ExpertMaskValidationError(
            "Expert mask dimensions must match the reference MRI grid."
        )
    voxel_count = int(np.prod(image.shape, dtype=np.int64))
    if voxel_count > max_voxels:
        raise ExpertMaskValidationError(
            "Expert mask exceeds the configured voxel limit."
        )
    if not np.allclose(
        np.asarray(image.affine, dtype=np.float64),
        np.asarray(reference_affine, dtype=np.float64),
        atol=1e-3,
        rtol=0,
    ):
        raise ExpertMaskValidationError(
            "Expert mask affine does not match the reference MRI geometry."
        )
    affine_spacing = np.linalg.norm(
        np.asarray(reference_affine, dtype=np.float64)[:3, :3],
        axis=0,
    )
    if not np.allclose(
        np.asarray(image.header.get_zooms()[:3], dtype=np.float64),
        affine_spacing,
        atol=1e-3,
        rtol=0,
    ):
        raise ExpertMaskValidationError(
            "Expert mask voxel spacing does not match its affine."
        )
    spatial_unit, _ = image.header.get_xyzt_units()
    if spatial_unit != "mm":
        raise ExpertMaskValidationError(
            "Expert mask spatial units must be explicitly set to mm."
        )

    try:
        data = image.get_fdata(dtype=np.float32)
    except Exception as exc:
        raise ExpertMaskValidationError(
            "Could not read expert mask voxel values."
        ) from exc
    if not np.isfinite(data).all():
        raise ExpertMaskValidationError(
            "Expert mask contains NaN or infinite values."
        )
    if not np.equal(data, np.floor(data)).all():
        raise ExpertMaskValidationError(
            "Expert mask contains fractional labels."
        )
    if not np.isin(data, (0, 1, 2, 4)).all():
        raise ExpertMaskValidationError(
            "Expert mask labels must use BraTS codes 0, 1, 2, and 4."
        )

    mask = data.astype(np.uint8)
    try:
        measurements = measure_segmentation(
            mask,
            reference_affine,
            spatial_units=spatial_unit,
        )
    except SegmentationValidationError as exc:
        raise ExpertMaskValidationError(
            "Expert mask geometry or labels cannot be measured."
        ) from exc
    return mask, measurements


def evaluate_regions(
    prediction: np.ndarray,
    reference: np.ndarray,
    *,
    affine: np.ndarray,
) -> ExpertEvaluation:
    if (
        not isinstance(prediction, np.ndarray)
        or not isinstance(reference, np.ndarray)
        or prediction.ndim != 3
        or reference.ndim != 3
        or prediction.shape != reference.shape
    ):
        raise ExpertMaskValidationError(
            "Prediction and expert mask must be 3D arrays on the same grid."
        )

    reference_measurements = measure_segmentation(reference, affine)
    regions: dict[str, RegionEvaluation] = {}
    warnings: list[str] = []
    for name, labels in REGION_LABELS.items():
        predicted_region = np.isin(prediction, labels)
        reference_region = np.isin(reference, labels)
        predicted_count = int(np.count_nonzero(predicted_region))
        reference_count = int(np.count_nonzero(reference_region))
        intersection = int(
            np.count_nonzero(predicted_region & reference_region)
        )
        denominator = predicted_count + reference_count
        dice = 1.0 if denominator == 0 else 2.0 * intersection / denominator
        sensitivity = (
            None if reference_count == 0 else intersection / reference_count
        )
        if reference_count == 0:
            warnings.append(f"empty_reference_region:{name}")
        regions[name] = RegionEvaluation(
            dice=dice,
            sensitivity=sensitivity,
            predicted_voxel_count=predicted_count,
            reference_voxel_count=reference_count,
            intersection_voxel_count=intersection,
        )

    return ExpertEvaluation(
        measurements=reference_measurements,
        regions=regions,
        warnings=tuple(warnings),
    )
