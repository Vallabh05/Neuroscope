from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal, Protocol, cast
from uuid import uuid4

import anyio
from fastapi import (
    FastAPI,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.services.inference import (
    REQUIRED_MODALITIES,
    InferenceError,
    InferenceResult,
    InferenceService,
    ValidatedModalities,
)
from app.services.expert_evaluation import (
    ExpertEvaluation,
    ExpertMaskValidationError,
    load_and_validate_expert_mask,
    evaluate_regions,
)
from app.services.integrity_report import (
    IntegrityReportError,
    build_integrity_report,
    generate_case_id,
    write_integrity_report,
)
from app.services.measurements import (
    SegmentationMeasurements,
    measure_segmentation,
)
from app.services.nifti_export import (
    NiftiExportError,
    export_segmentation,
)
from app.services.segmentation_validation import (
    SegmentationValidationError,
    validate_segmentation,
)
from app.services.validation import (
    DEFAULT_MAX_VOXELS,
    MRIValidationError,
    load_and_validate_modalities,
)


LOGGER = logging.getLogger("neuroscope.api")
_SAFE_CASE_ID = re.compile(r"^[a-f0-9]{32}$")
_CHUNK_BYTES = 1024 * 1024
_DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024
_DEFAULT_MAX_TOTAL_BYTES = 128 * 1024 * 1024
_DEFAULT_CASE_RETENTION_SECONDS = 24 * 60 * 60
_RETENTION_SWEEP_SECONDS = 60


@dataclass(frozen=True)
class ApiSettings:
    backend_root: Path = field(
        default_factory=lambda: Path(__file__).resolve().parents[1]
    )
    data_root: Path | None = None
    model_path: Path | None = None
    max_upload_bytes_per_file: int = _DEFAULT_MAX_FILE_BYTES
    max_upload_bytes_total: int = _DEFAULT_MAX_TOTAL_BYTES
    max_voxels: int = DEFAULT_MAX_VOXELS
    case_retention_seconds: int = _DEFAULT_CASE_RETENTION_SECONDS
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )

    def __post_init__(self) -> None:
        backend_root = self.backend_root.resolve()
        data_root = (
            self.data_root
            if self.data_root is not None
            else backend_root / "data" / "api_cases"
        ).resolve()
        if data_root == backend_root or not data_root.is_relative_to(backend_root):
            raise ValueError("API data directory must be inside the backend directory.")
        if self.max_upload_bytes_per_file <= 0 or self.max_upload_bytes_total <= 0:
            raise ValueError("Upload size limits must be positive.")
        if type(self.max_voxels) is not int or self.max_voxels <= 0:
            raise ValueError("Maximum MRI voxel count must be positive.")
        if (
            type(self.case_retention_seconds) is not int
            or not 0 < self.case_retention_seconds <= _DEFAULT_CASE_RETENTION_SECONDS
        ):
            raise ValueError("Case retention must be between 1 and 86400 seconds.")
        if self.max_upload_bytes_total < self.max_upload_bytes_per_file:
            raise ValueError(
                "Total upload size limit must be at least the per-file limit."
            )
        if "*" in self.cors_origins:
            raise ValueError("Wildcard CORS origins are not permitted.")
        for origin in self.cors_origins:
            if not origin.startswith(("http://", "https://")):
                raise ValueError("CORS origins must be explicit HTTP(S) origins.")
        object.__setattr__(self, "backend_root", backend_root)
        object.__setattr__(self, "data_root", data_root)
        if self.model_path is not None:
            object.__setattr__(self, "model_path", self.model_path.resolve())

    @classmethod
    def from_environment(cls) -> ApiSettings:
        backend_root = Path(__file__).resolve().parents[1]
        data_root_value = os.getenv("NEUROSCOPE_DATA_DIR")
        model_path_value = os.getenv("NEUROSCOPE_MODEL_PATH")
        origins_value = os.getenv(
            "NEUROSCOPE_CORS_ORIGINS",
            (
                "http://localhost:5173,http://127.0.0.1:5173,"
                "http://localhost:3000,http://127.0.0.1:3000"
            ),
        )
        try:
            max_file_bytes = int(
                os.getenv(
                    "NEUROSCOPE_MAX_UPLOAD_BYTES_PER_FILE",
                    str(_DEFAULT_MAX_FILE_BYTES),
                )
            )
            max_total_bytes = int(
                os.getenv(
                    "NEUROSCOPE_MAX_UPLOAD_BYTES_TOTAL",
                    str(_DEFAULT_MAX_TOTAL_BYTES),
                )
            )
            max_voxels = int(
                os.getenv(
                    "NEUROSCOPE_MAX_VOXELS",
                    str(DEFAULT_MAX_VOXELS),
                )
            )
            case_retention_seconds = int(
                os.getenv(
                    "NEUROSCOPE_CASE_RETENTION_SECONDS",
                    str(_DEFAULT_CASE_RETENTION_SECONDS),
                )
            )
        except ValueError as exc:
            raise ValueError(
                "Upload size and voxel limit configuration must be integers."
            ) from exc
        cors_origins = tuple(
            origin.strip()
            for origin in origins_value.split(",")
            if origin.strip()
        )
        return cls(
            backend_root=backend_root,
            data_root=Path(data_root_value) if data_root_value else None,
            model_path=Path(model_path_value) if model_path_value else None,
            max_upload_bytes_per_file=max_file_bytes,
            max_upload_bytes_total=max_total_bytes,
            max_voxels=max_voxels,
            case_retention_seconds=case_retention_seconds,
            cors_origins=cors_origins,
        )


class InferenceRunner(Protocol):
    def infer(self, validated: ValidatedModalities) -> InferenceResult: ...


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadyResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    model_initialized: bool
    message: str


class CaseCreatedResponse(BaseModel):
    case_id: str
    status: Literal["validated"]
    modalities: list[str]
    dimensions: tuple[int, int, int]
    spacing_mm: tuple[float, float, float]
    message: str
    expert_mask_provided: bool = False
    validation_warnings: list[str] = Field(default_factory=list)


class RegionMeasurementResponse(BaseModel):
    voxel_count: int
    volume_mm3: float
    volume_cm3: float


class RegionEvaluationResponse(BaseModel):
    dice: float
    sensitivity: float | None
    predicted_voxel_count: int
    reference_voxel_count: int
    intersection_voxel_count: int


class ExpertEvaluationResponse(BaseModel):
    label_counts: dict[str, int]
    region_volumes: dict[str, RegionMeasurementResponse]
    region_metrics: dict[str, RegionEvaluationResponse]
    warnings: list[str]


class CaseResultResponse(BaseModel):
    case_id: str
    status: Literal["uploaded", "processing", "completed", "failed"]
    modalities: list[str]
    dimensions: tuple[int, int, int] | None = None
    spacing_mm: tuple[float, float, float] | None = None
    model_identifier: str | None = None
    device: str | None = None
    inference_seconds: float | None = None
    label_counts: dict[str, int] | None = None
    region_volumes: dict[str, RegionMeasurementResponse] | None = None
    expert_evaluation: ExpertEvaluationResponse | None = None
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    mask_url: str | None = None
    report_url: str | None = None


class SegmentResponse(BaseModel):
    case_id: str
    status: Literal["completed"]
    model_identifier: str
    device: str
    inference_seconds: float
    dimensions: tuple[int, int, int]
    spacing_mm: tuple[float, float, float]
    label_counts: dict[str, int]
    region_volumes: dict[str, RegionMeasurementResponse]
    expert_evaluation: ExpertEvaluationResponse | None = None
    warnings: list[str]
    mask_url: str
    report_url: str


class DeleteResponse(BaseModel):
    case_id: str
    status: Literal["deleted"]


@dataclass
class CaseRecord:
    case_id: str
    directory: Path
    input_paths: dict[str, Path]
    dimensions: tuple[int, int, int]
    spacing_mm: tuple[float, float, float]
    created_at: str
    expert_mask_path: Path | None = None
    validation_warnings: tuple[str, ...] = ()
    status: str = "uploaded"
    result: dict[str, object] | None = None
    error: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class CaseManager:
    def __init__(
        self,
        settings: ApiSettings,
        inference_service: InferenceRunner | None = None,
    ) -> None:
        self.settings = settings
        self._cases: dict[str, CaseRecord] = {}
        self._cases_lock = threading.RLock()
        self._model_init_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._inference_service = inference_service
        self._load_existing_cases()

    def _load_existing_cases(self) -> None:
        if not self.settings.data_root.is_dir():
            return
        try:
            directories = list(self.settings.data_root.iterdir())
        except OSError:
            LOGGER.error("Could not inspect the configured case data directory.")
            return
        for directory in directories:
            if (
                not directory.is_dir()
                or directory.is_symlink()
                or not _SAFE_CASE_ID.fullmatch(directory.name)
            ):
                continue
            try:
                manifest = json.loads(
                    (directory / "case.json").read_text(encoding="utf-8")
                )
                input_paths = {}
                for modality in REQUIRED_MODALITIES:
                    candidates = (
                        directory / "inputs" / f"{modality}.nii.gz",
                        directory / "inputs" / f"{modality}.nii",
                    )
                    existing = [path for path in candidates if path.is_file()]
                    if len(existing) != 1:
                        raise ValueError("Case input files are incomplete.")
                    input_paths[modality] = existing[0]
                expert_mask_path = None
                if manifest.get("expert_mask_filename") is not None:
                    expert_filename = str(manifest["expert_mask_filename"])
                    if Path(expert_filename).name != expert_filename:
                        raise ValueError("Expert mask filename is invalid.")
                    expert_mask_path = directory / "inputs" / expert_filename
                    if not expert_mask_path.is_file():
                        raise ValueError("Expert mask file is unavailable.")

                dimensions = tuple(int(value) for value in manifest["dimensions"])
                spacing = tuple(float(value) for value in manifest["spacing_mm"])
                if len(dimensions) != 3 or len(spacing) != 3:
                    raise ValueError("Case geometry is invalid.")
                case = CaseRecord(
                    case_id=directory.name,
                    directory=directory,
                    input_paths=input_paths,
                    dimensions=dimensions,
                    spacing_mm=spacing,
                    created_at=str(manifest["created_at"]),
                    expert_mask_path=expert_mask_path,
                    validation_warnings=tuple(
                        str(value)
                        for value in manifest.get("validation_warnings", [])
                    ),
                    status=str(manifest["status"]),
                    result=manifest.get("result"),
                    error=manifest.get("error"),
                )
                if case.status not in ("uploaded", "completed", "failed"):
                    case.status = "failed"
                    case.result = None
                    case.error = "Processing was interrupted; retry this case."
                if case.status == "completed":
                    try:
                        mask_name = str(case.result["mask_filename"])
                        report_name = str(case.result["report_filename"])
                        if (
                            Path(mask_name).name != mask_name
                            or Path(report_name).name != report_name
                            or not (directory / "artifacts" / mask_name).is_file()
                            or not (directory / "artifacts" / report_name).is_file()
                        ):
                            raise ValueError("Completed artifacts are unavailable.")
                    except (KeyError, TypeError):
                        case.status = "failed"
                        case.result = None
                        case.error = (
                            "Completed artifacts are unavailable; retry this case."
                        )
                with self._cases_lock:
                    self._cases[case.case_id] = case
                if case.status == "failed":
                    self.persist_case(case)
            except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
                LOGGER.warning(
                    "Ignoring an unreadable or incomplete case manifest (%s).",
                    directory.name,
                )

    @property
    def model_initialized(self) -> bool:
        return self._inference_service is not None

    def get_inference_service(self) -> InferenceRunner:
        with self._model_init_lock:
            if self._inference_service is None:
                self._inference_service = InferenceService(
                    model_path=self.settings.model_path
                )
            return self._inference_service

    def get_case(self, case_id: str) -> CaseRecord:
        if not _SAFE_CASE_ID.fullmatch(case_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case not found.",
            )
        with self._cases_lock:
            case = self._cases.get(case_id)
        if case is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Case not found.",
            )
        return case

    def persist_case(self, case: CaseRecord) -> None:
        manifest = {
            "case_id": case.case_id,
            "status": case.status,
            "created_at": case.created_at,
            "modalities": list(REQUIRED_MODALITIES),
            "dimensions": list(case.dimensions),
            "spacing_mm": list(case.spacing_mm),
            "expert_mask_filename": (
                case.expert_mask_path.name
                if case.expert_mask_path is not None
                else None
            ),
            "validation_warnings": list(case.validation_warnings),
            "result": case.result,
            "error": case.error,
        }
        manifest_path = case.directory / "case.json"
        temporary_path = case.directory / ".case.json.tmp"
        try:
            temporary_path.write_text(
                json.dumps(manifest, allow_nan=False, indent=2),
                encoding="utf-8",
            )
            os.replace(temporary_path, manifest_path)
        except (OSError, TypeError, ValueError) as exc:
            temporary_path.unlink(missing_ok=True)
            raise RuntimeError("Could not persist case status.") from exc

    def case_file(self, case: CaseRecord, filename: str) -> Path:
        if Path(filename).name != filename:
            raise HTTPException(status_code=404, detail="Artifact not found.")
        artifact_directory = case.directory / "artifacts"
        candidate = (artifact_directory / filename).resolve()
        if not candidate.is_relative_to(artifact_directory.resolve()):
            raise HTTPException(status_code=404, detail="Artifact not found.")
        if not candidate.is_file():
            raise HTTPException(status_code=404, detail="Artifact not found.")
        return candidate

    def delete_case(self, case: CaseRecord) -> None:
        expected_directory = (self.settings.data_root / case.case_id).resolve()
        if (
            case.directory.resolve() != expected_directory
            or not expected_directory.is_relative_to(self.settings.data_root)
            or case.directory.is_symlink()
        ):
            raise RuntimeError("Case directory failed its storage safety check.")
        shutil.rmtree(expected_directory)
        with self._cases_lock:
            self._cases.pop(case.case_id, None)

    def cleanup_expired_cases(
        self,
        *,
        now: datetime | None = None,
    ) -> int:
        """Delete inactive cases before their configured maximum retention age."""
        current_time = now or datetime.now(timezone.utc)
        if current_time.tzinfo is None or current_time.utcoffset() is None:
            raise ValueError("Cleanup time must include a timezone.")
        sweep_margin = min(
            _RETENTION_SWEEP_SECONDS,
            max(1, self.settings.case_retention_seconds // 2),
        )
        cutoff = current_time - timedelta(
            seconds=self.settings.case_retention_seconds - sweep_margin
        )
        with self._cases_lock:
            cases = tuple(self._cases.values())
        removed = 0
        for case in cases:
            try:
                created_at = datetime.fromisoformat(case.created_at)
                if created_at.tzinfo is None or created_at >= cutoff:
                    continue
                if not case.lock.acquire(blocking=False):
                    continue
                try:
                    self.delete_case(case)
                finally:
                    case.lock.release()
                removed += 1
            except (OSError, ValueError, RuntimeError) as exc:
                LOGGER.error(
                    "Could not remove an expired case (%s).",
                    type(exc).__name__,
                )
        return removed


def _volume_payload(
    measurements: SegmentationMeasurements,
) -> dict[str, dict[str, int | float]]:
    return {
        name: {
            "voxel_count": volume.voxel_count,
            "volume_mm3": volume.volume_mm3,
            "volume_cm3": volume.volume_cm3,
        }
        for name, volume in measurements.regions.items()
    }


def _expert_evaluation_payload(
    evaluation: ExpertEvaluation,
) -> dict[str, object]:
    return {
        "label_counts": {
            str(label): count
            for label, count in evaluation.measurements.stored_label_counts.items()
        },
        "region_volumes": _volume_payload(evaluation.measurements),
        "region_metrics": {
            name: {
                "dice": metrics.dice,
                "sensitivity": metrics.sensitivity,
                "predicted_voxel_count": metrics.predicted_voxel_count,
                "reference_voxel_count": metrics.reference_voxel_count,
                "intersection_voxel_count": metrics.intersection_voxel_count,
            }
            for name, metrics in evaluation.regions.items()
        },
        "warnings": list(evaluation.warnings),
    }


def _case_result(case: CaseRecord) -> CaseResultResponse:
    result = case.result or {}
    return CaseResultResponse(
        case_id=case.case_id,
        status=cast(
            Literal["uploaded", "processing", "completed", "failed"],
            case.status,
        ),
        modalities=list(REQUIRED_MODALITIES),
        dimensions=case.dimensions,
        spacing_mm=case.spacing_mm,
        model_identifier=result.get("model_identifier"),
        device=result.get("device"),
        inference_seconds=result.get("inference_seconds"),
        label_counts=result.get("label_counts"),
        region_volumes=result.get("region_volumes"),
        expert_evaluation=result.get("expert_evaluation"),
        warnings=list(result.get("warnings", case.validation_warnings)),
        error=case.error,
        mask_url=f"/api/v1/cases/{case.case_id}/mask"
        if case.status == "completed"
        else None,
        report_url=f"/api/v1/cases/{case.case_id}/report"
        if case.status == "completed"
        else None,
    )


def create_app(
    settings: ApiSettings | None = None,
    *,
    inference_service: InferenceRunner | None = None,
) -> FastAPI:
    configured = settings or ApiSettings.from_environment()
    manager = CaseManager(configured, inference_service=inference_service)

    @asynccontextmanager
    async def lifespan(_application: FastAPI):
        async def retention_worker() -> None:
            interval = min(
                _RETENTION_SWEEP_SECONDS,
                max(1, configured.case_retention_seconds // 2),
            )
            while True:
                await run_in_threadpool(manager.cleanup_expired_cases)
                await asyncio.sleep(interval)

        task = asyncio.create_task(retention_worker())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    application = FastAPI(
        title="NeuroScope 3D API",
        description=(
            "Research and educational brain MRI segmentation prototype. "
            "Not for clinical diagnosis."
        ),
        version="0.2.0",
        lifespan=lifespan,
    )
    application.state.case_manager = manager
    if configured.cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=list(configured.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type"],
        )

    @application.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "project": "NeuroScope 3D",
            "status": "running",
            "notice": "Research and educational prototype; not for clinical diagnosis.",
        }

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @application.get(
        "/health/ready",
        response_model=ReadyResponse,
        responses={503: {"model": ReadyResponse}},
    )
    def readiness(response: Response) -> ReadyResponse:
        try:
            manager.get_inference_service()
        except Exception as exc:
            LOGGER.error(
                "Model readiness initialization failed (%s).",
                type(exc).__name__,
            )
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return ReadyResponse(
                status="not_ready",
                model_initialized=False,
                message="The segmentation model is not available.",
            )
        return ReadyResponse(
            status="ready",
            model_initialized=True,
            message="The segmentation service is initialized.",
        )

    @application.post(
        "/api/v1/cases",
        response_model=CaseCreatedResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_case(
        request: Request,
        T1ce: Annotated[UploadFile, File(description="T1ce NIfTI MRI")],
        T1: Annotated[UploadFile, File(description="T1 NIfTI MRI")],
        T2: Annotated[UploadFile, File(description="T2 NIfTI MRI")],
        FLAIR: Annotated[UploadFile, File(description="FLAIR NIfTI MRI")],
        expert_mask: Annotated[
            UploadFile | None,
            File(description="Optional BraTS label map in codes 0, 1, 2, 4"),
        ] = None,
    ) -> CaseCreatedResponse:
        uploads = {"T1ce": T1ce, "T1": T1, "T2": T2, "FLAIR": FLAIR}
        uploads_to_close = [*uploads.values()]
        if expert_mask is not None:
            uploads_to_close.append(expert_mask)
        case_id = generate_case_id()
        case_directory = configured.data_root / case_id
        created_directory = False
        case_persisted = False
        validated: dict = {}
        try:
            form = await request.form(max_files=5, max_fields=0)
            entries = list(form.multi_items())
            names = [name for name, _ in entries]
            expected_names = {*REQUIRED_MODALITIES, "expert_mask"}
            if not set(REQUIRED_MODALITIES).issubset(names) or set(names) - expected_names:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Upload T1ce, T1, T2, and FLAIR, with at most one "
                        "optional expert_mask."
                    ),
                )
            if any(names.count(name) != 1 for name in REQUIRED_MODALITIES):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Duplicate modality uploads are not allowed.",
                )
            if names.count("expert_mask") > 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only one expert_mask upload is allowed.",
                )

            case_directory.mkdir(parents=True, exist_ok=False)
            created_directory = True
            input_directory = case_directory / "inputs"
            input_directory.mkdir()
            input_paths: dict[str, Path] = {}
            total_bytes = 0
            for modality in REQUIRED_MODALITIES:
                upload = uploads[modality]
                temporary_path = input_directory / f".{uuid4().hex}.part"
                first_chunk = True
                file_bytes = 0
                compressed = False
                async with await anyio.open_file(temporary_path, "wb") as stream:
                    while chunk := await upload.read(_CHUNK_BYTES):
                        file_bytes += len(chunk)
                        total_bytes += len(chunk)
                        if file_bytes > configured.max_upload_bytes_per_file:
                            raise HTTPException(
                                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                                detail=f"{modality} exceeds the configured per-file upload limit.",
                            )
                        if total_bytes > configured.max_upload_bytes_total:
                            raise HTTPException(
                                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                                detail="Uploads exceed the configured total size limit.",
                            )
                        if first_chunk:
                            compressed = chunk.startswith(b"\x1f\x8b")
                            first_chunk = False
                        await stream.write(chunk)
                if file_bytes == 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"{modality} upload is empty.",
                    )
                extension = ".nii.gz" if compressed else ".nii"
                destination = input_directory / f"{modality}{extension}"
                os.replace(temporary_path, destination)
                input_paths[modality] = destination

            try:
                validated = await run_in_threadpool(
                    load_and_validate_modalities,
                    input_paths,
                    max_voxels=configured.max_voxels,
                )
            except MRIValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        "Uploaded MRI files failed validation. Check that each "
                        "required modality is a readable, finite, nonzero, "
                        "aligned, nonconstant 3D NIfTI image."
                    ),
                ) from exc

            expert_path = None
            if expert_mask is not None:
                temporary_path = input_directory / f".{uuid4().hex}.part"
                file_bytes = 0
                first_chunk = True
                compressed = False
                async with await anyio.open_file(temporary_path, "wb") as stream:
                    while chunk := await expert_mask.read(_CHUNK_BYTES):
                        file_bytes += len(chunk)
                        total_bytes += len(chunk)
                        if file_bytes > configured.max_upload_bytes_per_file:
                            raise HTTPException(
                                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                                detail=(
                                    "expert_mask exceeds the configured "
                                    "per-file upload limit."
                                ),
                            )
                        if total_bytes > configured.max_upload_bytes_total:
                            raise HTTPException(
                                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                                detail="Uploads exceed the configured total size limit.",
                            )
                        if first_chunk:
                            compressed = chunk.startswith(b"\x1f\x8b")
                            first_chunk = False
                        await stream.write(chunk)
                if file_bytes == 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="expert_mask upload is empty.",
                    )
                expert_path = input_directory / (
                    "expert-mask.nii.gz" if compressed else "expert-mask.nii"
                )
                os.replace(temporary_path, expert_path)
                try:
                    await run_in_threadpool(
                        load_and_validate_expert_mask,
                        expert_path,
                        reference_shape=tuple(validated["shape"]),
                        reference_affine=validated["affine"],
                        max_voxels=configured.max_voxels,
                    )
                except ExpertMaskValidationError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=f"Expert mask failed validation: {exc}",
                    ) from exc

            record = CaseRecord(
                case_id=case_id,
                directory=case_directory,
                input_paths=input_paths,
                dimensions=tuple(int(value) for value in validated["shape"]),
                spacing_mm=tuple(
                    float(value) for value in validated["spacing_mm"]
                ),
                created_at=datetime.now(timezone.utc).isoformat(),
                expert_mask_path=expert_path,
                validation_warnings=tuple(validated.get("warnings", ())),
            )
            manager.persist_case(record)
            with manager._cases_lock:
                manager._cases[case_id] = record
            case_persisted = True
            return CaseCreatedResponse(
                case_id=case_id,
                status="validated",
                modalities=list(REQUIRED_MODALITIES),
                dimensions=record.dimensions,
                spacing_mm=record.spacing_mm,
                message="All four MRI modalities passed validation.",
                expert_mask_provided=expert_path is not None,
                validation_warnings=list(record.validation_warnings),
            )
        except HTTPException:
            raise
        except Exception as exc:
            LOGGER.error(
                "Case upload failed during validation (%s).",
                type(exc).__name__,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not safely store and validate the MRI uploads.",
            ) from exc
        finally:
            for upload in uploads_to_close:
                await upload.close()
            if created_directory and not case_persisted:
                for image in validated.get("images", {}).values():
                    image.uncache()
                validated.clear()
                try:
                    shutil.rmtree(case_directory)
                except FileNotFoundError:
                    pass
                except OSError as exc:
                    LOGGER.error(
                        "Could not remove incomplete uploaded case (%s).",
                        type(exc).__name__,
                    )

    @application.post(
        "/api/v1/cases/{case_id}/segment",
        response_model=SegmentResponse,
    )
    def segment_case(case_id: str) -> SegmentResponse:
        case = manager.get_case(case_id)
        if not case.lock.acquire(blocking=False):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This case is already being segmented.",
            )
        stage = "case state"
        artifact_directory = case.directory / "artifacts"
        mask_path = artifact_directory / f"{case_id}-seg.nii.gz"
        report_path = artifact_directory / f"{case_id}-integrity.json"
        try:
            if case.status == "processing":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This case is already being segmented.",
                )
            if case.status == "completed":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This case has already been segmented.",
                )
            case.status = "processing"
            case.error = None
            case.result = None
            manager.persist_case(case)

            stage = "MRI validation"
            validated = load_and_validate_modalities(
                case.input_paths,
                max_voxels=configured.max_voxels,
            )

            stage = "model inference"
            inference = manager.get_inference_service()
            with manager._inference_lock:
                inference_result = inference.infer(validated)

            reference_image = validated["images"]["T1ce"]
            stage = "segmentation validation"
            output_validation = validate_segmentation(
                inference_result.segmentation,
                reference_shape=validated["shape"],
                reference_affine=validated["affine"],
                output_affine=inference_result.affine,
                reference_spacing_mm=validated["spacing_mm"],
                output_spacing_mm=inference_result.spacing_mm,
            )

            expert_evaluation = None
            if case.expert_mask_path is not None:
                stage = "expert-mask validation and comparison"
                expert_mask, _ = load_and_validate_expert_mask(
                    case.expert_mask_path,
                    reference_shape=tuple(validated["shape"]),
                    reference_affine=validated["affine"],
                    max_voxels=configured.max_voxels,
                )
                expert_evaluation = evaluate_regions(
                    output_validation.segmentation,
                    expert_mask,
                    affine=inference_result.affine,
                )

            stage = "region measurements"
            spatial_unit, _ = reference_image.header.get_xyzt_units()
            measurements = measure_segmentation(
                output_validation.segmentation,
                inference_result.affine,
                spatial_units=spatial_unit,
            )

            stage = "NIfTI export"
            export_result = export_segmentation(
                output_validation.segmentation,
                reference_image=reference_image,
                segmentation_affine=inference_result.affine,
                output_directory=artifact_directory,
                case_id=case_id,
            )

            stage = "Integrity Passport"
            report = build_integrity_report(
                case_id=case_id,
                input_paths=case.input_paths,
                validated_modalities=validated,
                inference_result=inference_result,
                output_validation=output_validation,
                measurements=measurements,
                export_result=export_result,
                expert_mask_path=case.expert_mask_path,
                expert_evaluation=expert_evaluation,
                input_validation_warnings=case.validation_warnings,
            )
            write_integrity_report(
                report,
                output_directory=artifact_directory,
                case_id=case_id,
            )

            volume_payload = _volume_payload(measurements)
            warnings = list(
                dict.fromkeys(
                    [
                        *inference_result.validation_warnings,
                        *case.validation_warnings,
                        *output_validation.warnings,
                        *export_result.warnings,
                        *(
                            expert_evaluation.warnings
                            if expert_evaluation is not None
                            else ()
                        ),
                    ]
                )
            )
            expert_payload = (
                _expert_evaluation_payload(expert_evaluation)
                if expert_evaluation is not None
                else None
            )
            case.result = {
                "model_identifier": inference_result.model_identifier,
                "device": inference_result.device,
                "inference_seconds": inference_result.inference_seconds,
                "label_counts": {
                    str(label): count
                    for label, count in output_validation.label_counts.items()
                },
                "region_volumes": volume_payload,
                "expert_evaluation": expert_payload,
                "warnings": warnings,
                "mask_filename": export_result.filename,
                "report_filename": f"{case_id}-integrity.json",
            }
            case.status = "completed"
            manager.persist_case(case)
            return SegmentResponse(
                case_id=case_id,
                status="completed",
                model_identifier=inference_result.model_identifier,
                device=inference_result.device,
                inference_seconds=inference_result.inference_seconds,
                dimensions=case.dimensions,
                spacing_mm=case.spacing_mm,
                label_counts=case.result["label_counts"],  # type: ignore[arg-type]
                region_volumes=volume_payload,
                expert_evaluation=expert_payload,
                warnings=warnings,
                mask_url=f"/api/v1/cases/{case_id}/mask",
                report_url=f"/api/v1/cases/{case_id}/report",
            )
        except HTTPException:
            raise
        except (MRIValidationError, ExpertMaskValidationError, InferenceError, SegmentationValidationError,
                NiftiExportError, IntegrityReportError, OSError, ValueError,
                RuntimeError) as exc:
            LOGGER.error(
                "Segmentation failed for case %s during %s (%s).",
                case_id,
                stage,
                type(exc).__name__,
            )
            mask_path.unlink(missing_ok=True)
            report_path.unlink(missing_ok=True)
            case.status = "failed"
            case.result = None
            case.error = f"Processing failed during {stage}; inputs may be retried."
            try:
                manager.persist_case(case)
            except RuntimeError:
                LOGGER.error(
                    "Could not persist failure state for case %s.",
                    case_id,
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=case.error,
            ) from exc
        except Exception as exc:
            LOGGER.error(
                "Unexpected segmentation failure for case %s during %s (%s).",
                case_id,
                stage,
                type(exc).__name__,
            )
            mask_path.unlink(missing_ok=True)
            report_path.unlink(missing_ok=True)
            case.status = "failed"
            case.result = None
            case.error = f"Processing failed during {stage}; inputs may be retried."
            try:
                manager.persist_case(case)
            except RuntimeError:
                LOGGER.error(
                    "Could not persist failure state for case %s.",
                    case_id,
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=case.error,
            ) from exc
        finally:
            case.lock.release()

    @application.get(
        "/api/v1/cases/{case_id}/results",
        response_model=CaseResultResponse,
    )
    def get_results(case_id: str) -> CaseResultResponse:
        return _case_result(manager.get_case(case_id))

    @application.get("/api/v1/cases/{case_id}/mask")
    def get_mask(case_id: str) -> FileResponse:
        case = manager.get_case(case_id)
        if case.status != "completed" or case.result is None:
            raise HTTPException(status_code=404, detail="Segmentation mask not found.")
        path = manager.case_file(case, str(case.result["mask_filename"]))
        return FileResponse(
            path,
            media_type="application/gzip",
            filename=str(case.result["mask_filename"]),
        )

    @application.get("/api/v1/cases/{case_id}/report")
    def get_report(case_id: str) -> FileResponse:
        case = manager.get_case(case_id)
        if case.status != "completed" or case.result is None:
            raise HTTPException(status_code=404, detail="Integrity report not found.")
        path = manager.case_file(case, str(case.result["report_filename"]))
        return FileResponse(
            path,
            media_type="application/json",
            filename=str(case.result["report_filename"]),
        )

    @application.delete(
        "/api/v1/cases/{case_id}",
        response_model=DeleteResponse,
    )
    def delete_case(case_id: str) -> DeleteResponse:
        case = manager.get_case(case_id)
        if not case.lock.acquire(blocking=False):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a case while it is being processed.",
            )
        try:
            manager.delete_case(case)
        except Exception as exc:
            LOGGER.error(
                "Case deletion failed for case %s (%s).",
                case_id,
                type(exc).__name__,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not safely delete this case.",
            ) from exc
        finally:
            case.lock.release()
        return DeleteResponse(case_id=case_id, status="deleted")

    return application


app = create_app()
