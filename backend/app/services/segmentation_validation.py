from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np


ALLOWED_LABELS = (0, 1, 2, 4)
LABEL_NAMES = {
    1: "tumor_core",
    2: "whole_tumor",
    4: "enhancing_tumor",
}
GEOMETRY_ATOL = 1e-4


class SegmentationValidationError(ValueError):
    """Raised when a segmentation is invalid or spatially incompatible."""


@dataclass(frozen=True)
class SegmentationValidationResult:
    segmentation: np.ndarray
    label_counts: dict[int, int]
    warnings: tuple[str, ...]


def _validated_affine(affine: object, name: str) -> np.ndarray:
    try:
        matrix = np.asarray(affine, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise SegmentationValidationError(
            f"{name} affine must be a numeric 4x4 matrix."
        ) from exc

    if matrix.shape != (4, 4) or not np.isfinite(matrix).all():
        raise SegmentationValidationError(
            f"{name} affine must be a finite 4x4 matrix."
        )
    if not np.allclose(matrix[3], (0, 0, 0, 1), atol=GEOMETRY_ATOL, rtol=0):
        raise SegmentationValidationError(
            f"{name} affine has an invalid homogeneous-coordinate row."
        )
    if abs(float(np.linalg.det(matrix[:3, :3]))) < 1e-10:
        raise SegmentationValidationError(f"{name} affine is singular.")
    return matrix


def _validated_spacing(spacing: Sequence[float], name: str) -> np.ndarray:
    try:
        values = np.asarray(spacing, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise SegmentationValidationError(
            f"{name} voxel spacing must contain three numeric values."
        ) from exc
    if (
        values.shape != (3,)
        or not np.isfinite(values).all()
        or np.any(values <= 0)
    ):
        raise SegmentationValidationError(
            f"{name} voxel spacing must contain three finite positive values."
        )
    return values


def validate_segmentation(
    segmentation: np.ndarray,
    *,
    reference_shape: Sequence[int],
    reference_affine: np.ndarray,
    output_affine: np.ndarray,
    reference_spacing_mm: Sequence[float],
    output_spacing_mm: Sequence[float] | None = None,
) -> SegmentationValidationResult:
    """Validate label values and prove the output uses the reference voxel grid."""
    if not isinstance(segmentation, np.ndarray) or segmentation.ndim != 3:
        raise SegmentationValidationError(
            "Segmentation must be a three-dimensional NumPy array."
        )

    try:
        expected_shape = tuple(int(size) for size in reference_shape)
    except (TypeError, ValueError) as exc:
        raise SegmentationValidationError(
            "Reference dimensions must contain three positive integers."
        ) from exc
    if (
        len(expected_shape) != 3
        or any(size <= 0 for size in expected_shape)
        or any(
            isinstance(size, (bool, np.bool_))
            or int(size) != size
            for size in reference_shape
        )
    ):
        raise SegmentationValidationError(
            "Reference dimensions must contain three positive integers."
        )
    if segmentation.shape != expected_shape:
        raise SegmentationValidationError(
            f"Segmentation shape {segmentation.shape} does not match reference "
            f"shape {expected_shape}."
        )
    if not np.issubdtype(segmentation.dtype, np.number) or np.issubdtype(
        segmentation.dtype, np.complexfloating
    ):
        raise SegmentationValidationError(
            "Segmentation values must be real numeric labels."
        )
    if not np.isfinite(segmentation).all():
        raise SegmentationValidationError(
            "Segmentation contains NaN or infinite values."
        )
    if not np.equal(segmentation, np.floor(segmentation)).all():
        raise SegmentationValidationError(
            "Segmentation contains fractional labels; labels must be integers."
        )

    labels = np.unique(segmentation)
    invalid_labels = [
        int(label) for label in labels if label not in ALLOWED_LABELS
    ]
    if invalid_labels:
        raise SegmentationValidationError(
            f"Segmentation contains unsupported labels: {invalid_labels}."
        )

    reference_matrix = _validated_affine(reference_affine, "Reference")
    output_matrix = _validated_affine(output_affine, "Output")
    if not np.allclose(
        output_matrix, reference_matrix, atol=GEOMETRY_ATOL, rtol=0
    ):
        raise SegmentationValidationError(
            "Segmentation affine does not match the reference MRI geometry."
        )

    reference_spacing = _validated_spacing(
        reference_spacing_mm, "Reference"
    )
    affine_spacing = np.linalg.norm(reference_matrix[:3, :3], axis=0)
    if not np.allclose(
        reference_spacing, affine_spacing, atol=GEOMETRY_ATOL, rtol=0
    ):
        raise SegmentationValidationError(
            "Reference voxel spacing does not match the reference affine."
        )
    if output_spacing_mm is not None:
        output_spacing = _validated_spacing(output_spacing_mm, "Output")
        output_affine_spacing = np.linalg.norm(
            output_matrix[:3, :3], axis=0
        )
        if not np.allclose(
            output_spacing,
            output_affine_spacing,
            atol=GEOMETRY_ATOL,
            rtol=0,
        ) or not np.allclose(
            output_spacing, reference_spacing, atol=GEOMETRY_ATOL, rtol=0
        ):
            raise SegmentationValidationError(
                "Segmentation voxel spacing does not match the reference MRI."
            )

    integer_segmentation = segmentation.astype(np.uint8, copy=False)
    counts = {
        label: int(np.count_nonzero(integer_segmentation == label))
        for label in ALLOWED_LABELS
    }
    warnings: list[str] = []
    present_tumor_labels = [
        label for label in LABEL_NAMES if counts[label] > 0
    ]
    if not present_tumor_labels:
        warnings.append("empty_segmentation")
    elif len(present_tumor_labels) == 1:
        warnings.append("single_tumor_label_present")

    return SegmentationValidationResult(
        segmentation=integer_segmentation,
        label_counts=counts,
        warnings=tuple(warnings),
    )
