
import tempfile
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from app.services.validation import (
    MRIValidationError,
    load_and_validate_modalities,
)


@pytest.fixture
def aligned_modalities():
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        affine = np.diag([1.0, 1.0, 1.0, 1.0])
        paths = {}

        for index, name in enumerate(("T1ce", "T1", "T2", "FLAIR")):
            path = root / f"{name}.nii.gz"
            data = np.arange(16**3, dtype=np.float32).reshape((16, 16, 16))
            data += index
            image = nib.Nifti1Image(data, affine)
            image.header.set_xyzt_units("mm")
            nib.save(image, str(path))
            paths[name] = path

        yield paths


def test_valid_aligned_mri(aligned_modalities):
    result = load_and_validate_modalities(aligned_modalities)
    assert result["shape"] == (16, 16, 16)
    assert result["channel_order"] == ("T1ce", "T1", "T2", "FLAIR")
    assert "foreground_touches_volume_boundary:T1ce" in result["warnings"]


def test_missing_modality_rejected(aligned_modalities):
    aligned_modalities.pop("FLAIR")

    with pytest.raises(MRIValidationError):
        load_and_validate_modalities(aligned_modalities)


def test_misaligned_modality_rejected(aligned_modalities):
    original = aligned_modalities["FLAIR"]
    shifted = np.diag([1.0, 1.0, 1.0, 1.0])
    shifted[0, 3] = 5.0

    data = np.arange(16**3, dtype=np.float32).reshape((16, 16, 16))
    image = nib.Nifti1Image(data, shifted)
    image.header.set_xyzt_units("mm")
    nib.save(image, str(original))

    with pytest.raises(MRIValidationError):
        load_and_validate_modalities(aligned_modalities)


def test_aligned_anisotropic_mri_is_accepted_for_model_preprocessing(
    aligned_modalities,
):
    affine = np.diag([1.0, 1.0, 2.0, 1.0])
    for path in aligned_modalities.values():
        image = nib.Nifti1Image(
            np.arange(16**3, dtype=np.float32).reshape((16, 16, 16)),
            affine,
        )
        image.header.set_xyzt_units("mm")
        nib.save(image, str(path))

    result = load_and_validate_modalities(aligned_modalities)

    np.testing.assert_allclose(result["spacing_mm"], (1.0, 1.0, 2.0))


def test_unknown_spatial_units_are_rejected(aligned_modalities):
    path = aligned_modalities["T1ce"]
    image = nib.Nifti1Image(
        np.arange(16**3, dtype=np.float32).reshape((16, 16, 16)),
        np.eye(4),
    )
    image.header.set_xyzt_units("unknown")
    nib.save(image, str(path))

    with pytest.raises(MRIValidationError, match="spatial units"):
        load_and_validate_modalities(aligned_modalities)


def test_affine_spacing_must_match_declared_zooms(aligned_modalities):
    path = aligned_modalities["T1ce"]
    image = nib.Nifti1Image(
        np.ones((16, 16, 16), dtype=np.float32),
        np.diag([2.0, 1.0, 1.0, 1.0]),
    )
    image.header.set_xyzt_units("mm")
    image.header.set_zooms((1.0, 1.0, 1.0))
    nib.save(image, str(path))

    with pytest.raises(MRIValidationError, match="affine voxel dimensions"):
        load_and_validate_modalities(aligned_modalities)


def test_voxel_limit_rejects_before_loading_voxel_data(aligned_modalities):
    with pytest.raises(MRIValidationError, match="exceeding the configured limit"):
        load_and_validate_modalities(aligned_modalities, max_voxels=1000)


def test_invalid_voxel_limit_is_rejected(aligned_modalities):
    with pytest.raises(ValueError, match="positive integer"):
        load_and_validate_modalities(aligned_modalities, max_voxels=0)


def test_constant_nonzero_modality_is_rejected(aligned_modalities):
    path = aligned_modalities["T1ce"]
    image = nib.Nifti1Image(
        np.ones((16, 16, 16), dtype=np.float32),
        np.eye(4),
    )
    image.header.set_xyzt_units("mm")
    nib.save(image, str(path))

    with pytest.raises(MRIValidationError, match="constant"):
        load_and_validate_modalities(aligned_modalities)


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (np.zeros((16, 16, 16), dtype=np.float32), "entirely zero"),
        (
            np.full((16, 16, 16), np.nan, dtype=np.float32),
            "NaN or infinite",
        ),
    ],
)
def test_zero_or_nonfinite_modality_is_rejected(
    aligned_modalities,
    data,
    message,
):
    path = aligned_modalities["T1ce"]
    image = nib.Nifti1Image(data, np.eye(4))
    image.header.set_xyzt_units("mm")
    nib.save(image, str(path))

    with pytest.raises(MRIValidationError, match=message):
        load_and_validate_modalities(aligned_modalities)
