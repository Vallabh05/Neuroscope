from pathlib import Path
from typing import Mapping

import nibabel as nib
import numpy as np


REQUIRED_MODALITIES = ("T1ce", "T1", "T2", "FLAIR")


class MRIValidationError(ValueError):
    """Raised when MRI inputs are invalid or incompatible."""


def load_and_validate_modalities(
    paths: Mapping[str, str | Path],
    affine_atol: float = 1e-3,
) -> dict:
    """
    Load and validate four co-registered 3D NIfTI MRI modalities.

    Required model channel order: T1ce, T1, T2, FLAIR.

    This function validates existing geometry; it does not resample images.
    """
    missing = [name for name in REQUIRED_MODALITIES if name not in paths]
    if missing:
        raise MRIValidationError(
            f"Missing required modalities: {', '.join(missing)}"
        )

    images = {}
    arrays = {}
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

        affine = np.asarray(image.affine, dtype=np.float64)
        zooms = np.asarray(image.header.get_zooms()[:3], dtype=np.float64)

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

        images[modality] = image
        arrays[modality] = data

    return {
        "images": images,
        "arrays": arrays,
        "shape": reference_shape,
        "affine": reference_affine,
        "spacing_mm": reference_zooms,
        "channel_order": REQUIRED_MODALITIES,
    }
