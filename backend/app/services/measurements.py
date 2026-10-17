from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.services.segmentation_validation import (
    LABEL_NAMES,
    SegmentationValidationError,
)


_MM_PER_UNIT = {
    "meter": 1000.0,
    "mm": 1.0,
    "micron": 0.001,
}


@dataclass(frozen=True)
class RegionVolume:
    voxel_count: int
    volume_mm3: float
    volume_cm3: float


@dataclass(frozen=True)
class SegmentationMeasurements:
    voxel_volume_mm3: float
    background_voxel_count: int
    stored_label_counts: dict[int, int]
    regions: dict[str, RegionVolume]


def measure_segmentation(
    segmentation: np.ndarray,
    affine: np.ndarray,
    *,
    spatial_units: str = "mm",
) -> SegmentationMeasurements:
    """Measure nested BraTS regions and retain exclusive encoded-label counts."""
    if not isinstance(segmentation, np.ndarray) or segmentation.ndim != 3:
        raise SegmentationValidationError(
            "Segmentation measurements require a three-dimensional array."
        )
    if not np.issubdtype(segmentation.dtype, np.number) or np.issubdtype(
        segmentation.dtype, np.complexfloating
    ):
        raise SegmentationValidationError(
            "Segmentation measurements require real numeric labels."
        )
    if not np.isfinite(segmentation).all() or not np.equal(
        segmentation, np.floor(segmentation)
    ).all():
        raise SegmentationValidationError(
            "Segmentation measurements require finite integer labels."
        )

    labels = np.unique(segmentation)
    if any(label not in (0, 1, 2, 4) for label in labels):
        raise SegmentationValidationError(
            "Segmentation measurements found unsupported label values."
        )
    matrix = np.asarray(affine, dtype=np.float64)
    if (
        matrix.shape != (4, 4)
        or not np.isfinite(matrix).all()
        or not np.allclose(matrix[3], (0, 0, 0, 1), atol=1e-4, rtol=0)
        or abs(float(np.linalg.det(matrix[:3, :3]))) < 1e-10
    ):
        raise SegmentationValidationError(
            "A finite, non-singular 4x4 affine is required for measurements."
        )
    if spatial_units not in _MM_PER_UNIT:
        raise SegmentationValidationError(
            "Spatial units must be 'meter', 'mm', or 'micron' to report "
            "physical volumes in mm^3."
        )

    conversion = _MM_PER_UNIT[spatial_units]
    voxel_volume_mm3 = abs(float(np.linalg.det(matrix[:3, :3]))) * conversion**3
    stored_label_counts = {
        label: int(np.count_nonzero(segmentation == label))
        for label in (0, *LABEL_NAMES)
    }
    nested_labels = {
        "tumor_core": (1, 4),
        "whole_tumor": (1, 2, 4),
        "enhancing_tumor": (4,),
    }
    regions = {}
    for name, labels_for_region in nested_labels.items():
        voxel_count = sum(stored_label_counts[label] for label in labels_for_region)
        volume_mm3 = voxel_count * voxel_volume_mm3
        regions[name] = RegionVolume(
            voxel_count=voxel_count,
            volume_mm3=volume_mm3,
            volume_cm3=volume_mm3 / 1000.0,
        )

    return SegmentationMeasurements(
        voxel_volume_mm3=voxel_volume_mm3,
        background_voxel_count=stored_label_counts[0],
        stored_label_counts=stored_label_counts,
        regions=regions,
    )
