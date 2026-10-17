from __future__ import annotations

import hashlib
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

import nibabel as nib
import numpy as np

from app.services.segmentation_validation import (
    SegmentationValidationError,
    validate_segmentation,
)


_SAFE_CASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
_ROUND_TRIP_ATOL = 1e-4


class NiftiExportError(RuntimeError):
    """Raised when a segmentation cannot be exported and verified."""


@dataclass(frozen=True)
class NiftiExportResult:
    path: Path
    filename: str
    sha256: str
    shape: tuple[int, int, int]
    affine: tuple[tuple[float, ...], ...]
    spacing_mm: tuple[float, float, float]
    verification: dict[str, bool]
    warnings: tuple[str, ...]


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    try:
        with Path(path).open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise NiftiExportError(
            "Could not read a file while computing its integrity hash."
        ) from exc
    return digest.hexdigest()


def _reserve_target(target: Path) -> bool:
    try:
        descriptor = os.open(
            target,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
    except FileExistsError:
        return False
    os.close(descriptor)
    return True


def export_segmentation(
    segmentation: np.ndarray,
    *,
    reference_image: nib.spatialimages.SpatialImage,
    segmentation_affine: np.ndarray,
    output_directory: str | Path,
    case_id: str,
    allow_overwrite: bool = False,
) -> NiftiExportResult:
    """Atomically export a validated mask and verify the saved NIfTI round-trip."""
    if not isinstance(case_id, str) or not _SAFE_CASE_ID.fullmatch(case_id):
        raise NiftiExportError(
            "Case ID must contain 1-64 letters, digits, underscores, or hyphens."
        )
    if len(reference_image.shape) != 3:
        raise NiftiExportError("Reference MRI must be a three-dimensional image.")

    reference_affine = np.asarray(reference_image.affine, dtype=np.float64)
    reference_spacing = np.asarray(
        reference_image.header.get_zooms()[:3], dtype=np.float64
    )
    spatial_unit, _ = reference_image.header.get_xyzt_units()
    if spatial_unit != "mm":
        raise NiftiExportError(
            "Reference MRI spatial units must be explicitly set to mm before "
            "export so geometry and volume metadata are unambiguous."
        )

    try:
        validated = validate_segmentation(
            segmentation,
            reference_shape=reference_image.shape,
            reference_affine=reference_affine,
            output_affine=segmentation_affine,
            reference_spacing_mm=reference_spacing,
            output_spacing_mm=reference_spacing,
        )
    except SegmentationValidationError as exc:
        raise NiftiExportError(
            f"Segmentation validation failed; NIfTI export was blocked: {exc}"
        ) from exc

    output_dir = Path(output_directory)
    filename = f"{case_id}-seg.nii.gz"
    target = output_dir / filename
    reserved_target = False
    temporary_path: Path | None = None
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        if not allow_overwrite:
            reserved_target = _reserve_target(target)
            if not reserved_target:
                raise NiftiExportError(
                    f"Output already exists: {filename}. Use a new case ID or "
                    "explicitly allow overwrite."
                )

        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{case_id}-",
            suffix=".nii.gz",
            dir=output_dir,
        )
        os.close(descriptor)
        temporary_path = Path(temporary_name)

        header = nib.Nifti1Header()
        header.set_data_shape(validated.segmentation.shape)
        header.set_data_dtype(np.uint8)
        header.set_xyzt_units("mm")
        header.set_zooms(tuple(float(value) for value in reference_spacing))
        exported = nib.Nifti1Image(
            validated.segmentation,
            reference_affine,
            header=header,
        )
        exported.set_sform(reference_affine, code=1)
        exported.header.set_qform(None, code=0)
        nib.save(exported, str(temporary_path))

        reopened = nib.load(str(temporary_path))
        reopened_data = np.asanyarray(reopened.dataobj)
        reopened_affine = np.asarray(reopened.affine, dtype=np.float64)
        reopened_spacing = np.asarray(
            reopened.header.get_zooms()[:3], dtype=np.float64
        )
        reopened_unit, _ = reopened.header.get_xyzt_units()
        verification = {
            "shape_matches": tuple(reopened.shape) == tuple(reference_image.shape),
            "affine_matches": bool(
                np.allclose(
                    reopened_affine,
                    reference_affine,
                    atol=_ROUND_TRIP_ATOL,
                    rtol=0,
                )
            ),
            "spacing_matches": bool(
                reopened_unit == "mm"
                and np.allclose(
                    reopened_spacing,
                    reference_spacing,
                    atol=_ROUND_TRIP_ATOL,
                    rtol=0,
                )
            ),
            "labels_match": bool(
                reopened_data.dtype.kind in "ui"
                and np.array_equal(reopened_data, validated.segmentation)
            ),
        }
        failed_checks = [name for name, passed in verification.items() if not passed]
        if failed_checks:
            raise NiftiExportError(
                "Saved NIfTI failed round-trip verification: "
                + ", ".join(failed_checks)
                + "."
            )

        digest = sha256_file(temporary_path)
        os.replace(temporary_path, target)
        temporary_path = None
        reserved_target = False
        return NiftiExportResult(
            path=target,
            filename=filename,
            sha256=digest,
            shape=tuple(int(size) for size in reopened.shape),
            affine=tuple(
                tuple(float(value) for value in row)
                for row in reopened_affine
            ),
            spacing_mm=tuple(float(value) for value in reopened_spacing),
            verification=verification,
            warnings=validated.warnings,
        )
    except NiftiExportError:
        raise
    except Exception as exc:
        raise NiftiExportError(
            "Could not save and verify the NIfTI segmentation."
        ) from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        if reserved_target:
            target.unlink(missing_ok=True)
