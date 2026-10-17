import nibabel as nib
import numpy as np

from app.predict import run_prediction
from app.services.inference import InferenceResult
from app.services.validation import REQUIRED_MODALITIES


class FakeInference:
    def infer(self, validated):
        segmentation = np.zeros(validated["shape"], dtype=np.uint8)
        segmentation[0, 0, 0] = 1
        return InferenceResult(
            segmentation=segmentation,
            output_shape=validated["shape"],
            affine=np.asarray(validated["affine"]).copy(),
            spacing_mm=tuple(float(value) for value in validated["spacing_mm"]),
            device="cpu",
            model_identifier="test-model",
            inference_seconds=0.01,
            model_sha256="a" * 64,
            runtime_provenance={
                "python_version": "3.11.9",
                "numpy_version": "2.4.6",
                "torch_version": "2.11.0",
                "monai_version": "1.6.1",
                "cuda_runtime_version": None,
                "cudnn_version": None,
                "device_name": "CPU",
            },
            validation_warnings=(),
            inference_configuration={"threshold": 0.5},
        )


def test_standalone_prediction_writes_mask_and_report(tmp_path):
    affine = np.diag([1.0, 1.0, 2.0, 1.0])
    input_paths = {}
    for modality in REQUIRED_MODALITIES:
        path = tmp_path / f"{modality}.nii"
        image = nib.Nifti1Image(
            np.arange(8**3, dtype=np.float32).reshape((8, 8, 8)),
            affine,
        )
        image.header.set_xyzt_units("mm")
        nib.save(image, str(path))
        input_paths[modality] = path

    output_dir = tmp_path / "output"
    mask, report_path = run_prediction(
        t1ce=input_paths["T1ce"],
        t1=input_paths["T1"],
        t2=input_paths["T2"],
        flair=input_paths["FLAIR"],
        output_directory=output_dir,
        case_id="cli-smoke-test",
        inference_service=FakeInference(),
    )

    saved_mask = nib.load(str(output_dir / mask.filename))
    assert saved_mask.shape == (8, 8, 8)
    np.testing.assert_allclose(saved_mask.affine, affine, atol=1e-4)
    assert int(np.count_nonzero(np.asanyarray(saved_mask.dataobj) == 1)) == 1
    assert report_path.is_file()
