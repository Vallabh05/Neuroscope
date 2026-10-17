from __future__ import annotations

import gzip
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import nibabel as nib
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import ApiSettings, create_app
from app.services.inference import InferenceResult, REQUIRED_MODALITIES


def nifti_bytes(
    value: float = 1.0,
    spacing_mm: float = 1.0,
    shape: tuple[int, int, int] = (8, 8, 8),
) -> bytes:
    data = np.full(shape, value, dtype=np.float32)
    data.flat[0] = 0.0
    affine = np.diag([spacing_mm, spacing_mm, spacing_mm, 1.0])
    image = nib.Nifti1Image(data, affine)
    image.header.set_xyzt_units("mm")
    return image.to_bytes()


def expert_mask_bytes(labels: np.ndarray | None = None) -> bytes:
    data = np.zeros((8, 8, 8), dtype=np.uint8) if labels is None else labels
    image = nib.Nifti1Image(data, np.eye(4))
    image.header.set_xyzt_units("mm")
    return image.to_bytes()


def upload_files(
    *,
    values: dict[str, bytes] | None = None,
    duplicate: bool = False,
    filenames: dict[str, str] | None = None,
    expert_mask: bytes | None = None,
):
    values = values or {}
    filenames = filenames or {}
    files = [
        (
            modality,
            (
                filenames.get(modality, f"{modality}.nii"),
                values.get(modality, nifti_bytes(index + 1)),
                "application/octet-stream",
            ),
        )
        for index, modality in enumerate(REQUIRED_MODALITIES)
    ]
    if duplicate:
        files.append(("T1", ("second.nii", nifti_bytes(), "application/octet-stream")))
    if expert_mask is not None:
        files.append(
            ("expert_mask", ("expert.nii", expert_mask, "application/octet-stream"))
        )
    return files


class FakeInference:
    def __init__(self, *, gate: threading.Event | None = None):
        self.gate = gate
        self.fail = False
        self.calls = 0

    def infer(self, validated):
        self.calls += 1
        if self.gate is not None:
            self.gate.wait(timeout=10)
        if self.fail:
            raise RuntimeError("private server failure detail")
        shape = validated["shape"]
        segmentation = np.zeros(shape, dtype=np.uint8)
        segmentation[0, 0, 0] = 1
        segmentation[0, 0, 1] = 2
        segmentation[0, 0, 2] = 4
        return InferenceResult(
            segmentation=segmentation,
            output_shape=shape,
            affine=np.asarray(validated["affine"]).copy(),
            spacing_mm=tuple(float(x) for x in validated["spacing_mm"]),
            device="cpu",
            model_identifier="fake model 1.0",
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


@pytest.fixture
def app_settings(tmp_path):
    return ApiSettings(
        backend_root=tmp_path,
        data_root=tmp_path / "cases",
        max_upload_bytes_per_file=65536,
        max_upload_bytes_total=262144,
        max_voxels=1000,
        case_retention_seconds=120,
        cors_origins=("http://localhost:3000",),
    )


@pytest.fixture
def test_client(app_settings):
    service = FakeInference()
    application = create_app(app_settings, inference_service=service)
    with TestClient(application) as client:
        yield client, service, app_settings


def create_case(
    client: TestClient,
    *,
    expert_mask: bytes | None = None,
) -> str:
    response = client.post(
        "/api/v1/cases",
        files=upload_files(expert_mask=expert_mask),
    )
    assert response.status_code == 201, response.text
    return response.json()["case_id"]


def test_health_and_ready_endpoints(test_client):
    client, _, _ = test_client

    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {
        "status": "ready",
        "model_initialized": True,
        "message": "The segmentation service is initialized.",
    }


@pytest.mark.parametrize(
    "origin",
    ("http://localhost:5173", "http://127.0.0.1:5173"),
)
def test_default_cors_allows_vite_origins(tmp_path, origin):
    settings = ApiSettings(backend_root=tmp_path, data_root=tmp_path / "cases")
    client = TestClient(create_app(settings, inference_service=FakeInference()))

    response = client.options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_readiness_reports_missing_model_without_paths(tmp_path):
    settings = ApiSettings(
        backend_root=tmp_path,
        data_root=tmp_path / "cases",
        model_path=tmp_path / "missing.ts",
        cors_origins=(),
    )
    client = TestClient(create_app(settings))

    response = client.get("/health/ready")
    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert str(tmp_path) not in response.text


def test_upload_requires_every_modality(test_client):
    client, _, settings = test_client
    files = upload_files()[:-1]

    response = client.post("/api/v1/cases", files=files)

    assert response.status_code == 422
    assert list((settings.data_root).glob("*")) == []


def test_successful_upload_stores_only_server_named_files(test_client):
    client, _, settings = test_client

    response = client.post(
        "/api/v1/cases",
        files=upload_files(
            filenames={
                "T1ce": "..\\escape.nii",
                "T1": "patient-name-private.nii",
            }
        ),
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "validated"
    assert payload["modalities"] == list(REQUIRED_MODALITIES)
    case_dir = settings.data_root / payload["case_id"]
    assert sorted(path.name for path in (case_dir / "inputs").iterdir()) == [
        "FLAIR.nii",
        "T1.nii",
        "T1ce.nii",
        "T2.nii",
    ]
    assert "patient-name-private" not in str(case_dir)


def test_optional_expert_mask_is_validated_and_compared(test_client):
    client, _, settings = test_client
    labels = np.zeros((8, 8, 8), dtype=np.uint8)
    labels[0, 0, 0] = 1
    labels[0, 0, 1] = 2
    labels[0, 0, 2] = 4

    upload = client.post(
        "/api/v1/cases",
        files=upload_files(expert_mask=expert_mask_bytes(labels)),
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["expert_mask_provided"] is True
    case_id = upload.json()["case_id"]
    assert (settings.data_root / case_id / "inputs" / "expert-mask.nii").is_file()

    segmented = client.post(f"/api/v1/cases/{case_id}/segment")
    assert segmented.status_code == 200, segmented.text
    result = segmented.json()["expert_evaluation"]
    assert result["region_metrics"]["tumor_core"]["dice"] == 1.0
    assert result["region_metrics"]["whole_tumor"]["sensitivity"] == 1.0
    assert result["region_volumes"]["whole_tumor"]["volume_mm3"] == 3.0
    report = client.get(f"/api/v1/cases/{case_id}/report").json()
    assert report["inputs"]["expert_mask"]["validation"]["status"] == "passed"
    assert len(report["inputs"]["expert_mask"]["sha256"]) == 64
    assert report["expert_comparison"]["region_metrics"]["enhancing_tumor"][
        "dice"
    ] == 1.0


def test_invalid_expert_mask_is_rejected_without_creating_case(test_client):
    client, _, settings = test_client
    invalid_labels = np.zeros((8, 8, 8), dtype=np.uint8)
    invalid_labels[1, 1, 1] = 3

    response = client.post(
        "/api/v1/cases",
        files=upload_files(expert_mask=expert_mask_bytes(invalid_labels)),
    )

    assert response.status_code == 422
    assert "BraTS codes" in response.json()["detail"]
    assert list(settings.data_root.glob("*")) == []


def test_duplicate_modality_is_rejected_and_upload_cleaned(test_client):
    client, _, settings = test_client

    response = client.post(
        "/api/v1/cases",
        files=upload_files(duplicate=True),
    )

    assert response.status_code == 400
    assert list(settings.data_root.glob("*")) == []


def test_empty_invalid_and_oversized_uploads_are_rejected(test_client):
    client, _, settings = test_client

    empty_values = {"T1ce": b""}
    empty_response = client.post(
        "/api/v1/cases",
        files=upload_files(values=empty_values),
    )
    assert empty_response.status_code == 400

    invalid_response = client.post(
        "/api/v1/cases",
        files=upload_files(values={"T1ce": b"not a NIfTI image"}),
    )
    assert invalid_response.status_code == 422

    oversized_response = client.post(
        "/api/v1/cases",
        files=upload_files(values={"T1ce": b"x" * 65537}),
    )
    assert oversized_response.status_code == 413
    assert list(settings.data_root.glob("*")) == []


def test_upload_accepts_aligned_anisotropic_spacing_for_preprocessing(
    test_client,
):
    client, _, settings = test_client
    anisotropic = nifti_bytes(spacing_mm=2.0)

    response = client.post(
        "/api/v1/cases",
        files=upload_files(
            values={
                name: anisotropic
                for name in ("T1ce", "T1", "T2", "FLAIR")
            }
        ),
    )

    assert response.status_code == 201, response.text
    case_dir = settings.data_root / response.json()["case_id"]
    assert case_dir.is_dir()
    assert list(settings.data_root.glob("*")) == [case_dir]


def test_upload_rejects_excess_voxels_without_creating_a_case(test_client):
    client, _, settings = test_client

    response = client.post(
        "/api/v1/cases",
        files=upload_files(
            values={"T1ce": nifti_bytes(shape=(11, 11, 11))}
        ),
    )

    assert response.status_code == 422
    assert list(settings.data_root.glob("*")) == []


def test_unknown_case_and_path_traversal_are_not_found(test_client):
    client, _, _ = test_client
    for case_id in ("not-a-case", "..", "0" * 32):
        response = client.get(f"/api/v1/cases/{case_id}/results")
        assert response.status_code == 404


def test_full_mocked_pipeline_and_artifact_retrieval(test_client):
    client, service, _ = test_client
    case_id = create_case(client)

    response = client.post(f"/api/v1/cases/{case_id}/segment")

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "completed"
    assert result["model_identifier"] == "fake model 1.0"
    assert result["label_counts"] == {"0": 509, "1": 1, "2": 1, "4": 1}
    assert result["region_volumes"]["tumor_core"]["volume_mm3"] == 2
    assert result["region_volumes"]["whole_tumor"]["volume_mm3"] == 3
    assert result["region_volumes"]["enhancing_tumor"]["volume_mm3"] == 1
    assert service.calls == 1

    results_response = client.get(f"/api/v1/cases/{case_id}/results")
    assert results_response.status_code == 200
    assert results_response.json()["status"] == "completed"
    mask = client.get(f"/api/v1/cases/{case_id}/mask")
    report = client.get(f"/api/v1/cases/{case_id}/report")
    assert mask.status_code == 200
    assert mask.headers["content-disposition"].endswith(
        f'{case_id}-seg.nii.gz"'
    )
    assert nib.Nifti1Image.from_bytes(gzip.decompress(mask.content)).shape == (8, 8, 8)
    assert report.status_code == 200
    assert report.json()["case_id"] == case_id
    assert report.json()["export"]["status"] == "verified"
    assert report.json()["segmentation"]["region_volumes"]["tumor_core"][
        "voxel_count"
    ] == 2


def test_failed_inference_has_safe_error_and_does_not_publish_artifacts(test_client):
    client, service, settings = test_client
    case_id = create_case(client)
    service.fail = True

    response = client.post(f"/api/v1/cases/{case_id}/segment")

    assert response.status_code == 500
    assert "private server failure detail" not in response.text
    assert client.get(f"/api/v1/cases/{case_id}/results").json()["status"] == "failed"
    assert client.get(f"/api/v1/cases/{case_id}/mask").status_code == 404
    assert client.get(f"/api/v1/cases/{case_id}/report").status_code == 404
    assert not list((settings.data_root / case_id / "artifacts").glob("*"))


def test_failed_export_does_not_mark_case_complete(test_client, monkeypatch):
    client, _, _ = test_client
    case_id = create_case(client)

    monkeypatch.setattr(
        "app.main.export_segmentation",
        Mock(side_effect=OSError("private path and export details")),
    )
    response = client.post(f"/api/v1/cases/{case_id}/segment")

    assert response.status_code == 500
    assert "private path" not in response.text
    assert client.get(f"/api/v1/cases/{case_id}/results").json()["status"] == "failed"
    assert client.get(f"/api/v1/cases/{case_id}/mask").status_code == 404


def test_delete_removes_case_and_artifacts(test_client):
    client, _, settings = test_client
    case_id = create_case(client)

    response = client.delete(f"/api/v1/cases/{case_id}")

    assert response.status_code == 200
    assert response.json() == {"case_id": case_id, "status": "deleted"}
    assert not (settings.data_root / case_id).exists()
    assert client.get(f"/api/v1/cases/{case_id}/results").status_code == 404


def test_expired_cases_are_removed_safely(test_client):
    client, _, settings = test_client
    case_id = create_case(client)
    case_directory = settings.data_root / case_id
    manager = client.app.state.case_manager
    now = datetime.now(timezone.utc)
    manager.get_case(case_id).created_at = (
        now - timedelta(seconds=180)
    ).isoformat()

    assert manager.cleanup_expired_cases(now=now) == 1
    assert not case_directory.exists()
    assert client.get(f"/api/v1/cases/{case_id}/results").status_code == 404


def test_duplicate_segmentation_is_conflicted(test_client):
    client, service, _ = test_client
    case_id = create_case(client)
    gate = threading.Event()
    service.gate = gate

    with ThreadPoolExecutor(max_workers=1) as pool:
        first_request = pool.submit(
            client.post,
            f"/api/v1/cases/{case_id}/segment",
        )
        for _ in range(100):
            if service.calls:
                break
            threading.Event().wait(0.02)
        second_response = client.post(f"/api/v1/cases/{case_id}/segment")
        gate.set()
        first_response = first_request.result(timeout=20)

    assert second_response.status_code == 409
    assert first_response.status_code == 200
    assert service.calls == 1


def test_case_state_survives_app_recreation(test_client):
    client, _, settings = test_client
    case_id = create_case(client)
    second_client = TestClient(create_app(settings, inference_service=FakeInference()))

    response = second_client.get(f"/api/v1/cases/{case_id}/results")

    assert response.status_code == 200
    assert response.json()["status"] == "uploaded"


def test_data_root_must_remain_inside_backend(tmp_path):
    with pytest.raises(ValueError, match="inside the backend"):
        ApiSettings(
            backend_root=tmp_path,
            data_root=tmp_path.parent / "outside",
            cors_origins=(),
        )


def test_cors_configuration_rejects_wildcard(tmp_path):
    with pytest.raises(ValueError, match="Wildcard"):
        ApiSettings(
            backend_root=tmp_path,
            data_root=tmp_path / "cases",
            cors_origins=("*",),
        )
