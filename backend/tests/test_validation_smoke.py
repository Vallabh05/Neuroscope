
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

        for name in ("T1ce", "T1", "T2", "FLAIR"):
            path = root / f"{name}.nii.gz"
            data = np.ones((16, 16, 16), dtype=np.float32)
            nib.save(nib.Nifti1Image(data, affine), str(path))
            paths[name] = path

        yield paths


def test_valid_aligned_mri(aligned_modalities):
    result = load_and_validate_modalities(aligned_modalities)
    assert result["shape"] == (16, 16, 16)
    assert result["channel_order"] == ("T1ce", "T1", "T2", "FLAIR")


def test_missing_modality_rejected(aligned_modalities):
    aligned_modalities.pop("FLAIR")

    with pytest.raises(MRIValidationError):
        load_and_validate_modalities(aligned_modalities)


def test_misaligned_modality_rejected(aligned_modalities):
    original = aligned_modalities["FLAIR"]
    shifted = np.diag([1.0, 1.0, 1.0, 1.0])
    shifted[0, 3] = 5.0

    data = np.ones((16, 16, 16), dtype=np.float32)
    nib.save(nib.Nifti1Image(data, shifted), str(original))

    with pytest.raises(MRIValidationError):
        load_and_validate_modalities(aligned_modalities)
