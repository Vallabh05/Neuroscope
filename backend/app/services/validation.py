from pathlib import Path
from typing import Mapping

import nibabel as nib
import numpy as np


REQUIRED_MODALITIES = ("T1ce", "T1", "T2", "FLAIR")
MODEL_SPACING_MM = (1.0, 1.0, 1.0)
DEFAULT_MAX_VOXELS = 10_000_000


class MRIValidationError(ValueError):
    """Raised when MRI inputs are invalid or incompatible."""


def load_and_validate_modalities(
    paths: Mapping[str, str | Path],
    affine_atol: float = 1e-3,
    max_voxels: int = DEFAULT_MAX_VOXELS,
) -> dict:
    """
    Load and validate four co-registered 3D NIfTI MRI modalities.

    Required model channel order: T1ce, T1, T2, FLAIR.

    This function validates existing geometry; it does not resample images.
    Voxel data is not materialized when the configured voxel limit is exceeded.
    """
    if type(max_voxels) is not int or max_voxels <= 0:
        raise ValueError("Maximum MRI voxel count must be a positive integer.")

    missing = [name for name in REQUIRED_MODALITIES if name not in paths]
    if missing:
        raise MRIValidationError(
            f"Missing required modalities: {', '.join(missing)}"
        )

    images = {}
    arrays = {}
    warnings: list[str] = []
    reference_shape = None
    reference_affine = None
    reference_zooms = None

    for modality in REQUIRED_MODALITIES:
        path = Path(paths[modality])

        if not path.is_file():
            raise MRIValidationError(
                f"{modality}: file does not exist: {path}"
            )

        try:
            image = nib.load(str(path))
        except Exception as exc:
            raise MRIValidationError(
                f"{modality}: cannot read NIfTI file: {exc}"
            ) from exc

        if len(image.shape) != 3:
            raise MRIValidationError(
                f"{modality}: expected a 3D MRI, got shape {image.shape}"
            )

        if any(int(dimension) <= 0 for dimension in image.shape):
            raise MRIValidationError(
                f"{modality}: invalid image dimensions {image.shape}"
            )
        voxel_count = 1
        for dimension in image.shape:
            voxel_count *= int(dimension)
        if voxel_count > max_voxels:
            raise MRIValidationError(
                f"{modality}: image contains {voxel_count} voxels, exceeding "
                f"the configured limit of {max_voxels}."
            )

        affine = np.asarray(image.affine, dtype=np.float64)
        zooms = np.asarray(image.header.get_zooms()[:3], dtype=np.float64)
        spatial_unit, _ = image.header.get_xyzt_units()

        if not np.isfinite(affine).all():
            raise MRIValidationError(
                f"{modality}: affine contains non-finite values"
            )

        if abs(np.linalg.det(affine[:3, :3])) < 1e-10:
            raise MRIValidationError(
                f"{modality}: affine is singular; spatial geometry is invalid"
            )

        if not np.isfinite(zooms).all() or np.any(zooms <= 0):
            raise MRIValidationError(
                f"{modality}: invalid voxel spacing {zooms.tolist()}"
            )
        if spatial_unit != "mm":
            raise MRIValidationError(
                f"{modality}: spatial units must be explicitly set to mm; "
                f"received {spatial_unit!r}"
            )
        affine_spacing = np.linalg.norm(affine[:3, :3], axis=0)
        if not np.allclose(
            affine_spacing,
            zooms,
            atol=affine_atol,
            rtol=0,
        ):
            raise MRIValidationError(
                f"{modality}: affine voxel dimensions do not match the "
                "declared NIfTI spacing."
            )

        if reference_shape is None:
            reference_shape = image.shape
            reference_affine = affine.copy()
            reference_zooms = zooms.copy()
        else:
            if image.shape != reference_shape:
                raise MRIValidationError(
                    f"{modality}: shape {image.shape} does not match "
                    f"reference shape {reference_shape}"
                )

            if not np.allclose(
                affine, reference_affine, atol=affine_atol, rtol=0
            ):
                raise MRIValidationError(
                    f"{modality}: affine differs from the reference image. "
                    "The modalities may not be spatially aligned."
                )

            if not np.allclose(
                zooms, reference_zooms, atol=affine_atol, rtol=0
            ):
                raise MRIValidationError(
                    f"{modality}: voxel spacing differs from the reference"
                )

        try:
            data = image.get_fdata(dtype=np.float32)
        except Exception as exc:
            raise MRIValidationError(
                f"{modality}: could not read image voxel data: {exc}"
            ) from exc

        if not np.isfinite(data).all():
            raise MRIValidationError(
                f"{modality}: image contains NaN or infinite voxel values"
            )

        if not np.any(data != 0):
            raise MRIValidationError(
                f"{modality}: image is entirely zero"
            )
        if float(np.min(data)) == float(np.max(data)):
            raise MRIValidationError(
                f"{modality}: image is constant and contains no usable intensity variation"
            )
        if any(
            np.any(np.take(data, edge, axis=axis) != 0)
            for axis in range(3)
            for edge in (0, -1)
        ):
            warnings.append(f"foreground_touches_volume_boundary:{modality}")

        images[modality] = image
        arrays[modality] = data

    return {
        "images": images,
        "arrays": arrays,
        "shape": reference_shape,
        "affine": reference_affine,
        "spacing_mm": reference_zooms,
        "channel_order": REQUIRED_MODALITIES,
        "warnings": tuple(warnings),
    }
