# NeuroScope 3D backend

This backend provides MRI modality validation, TorchScript inference,
segmentation validation, NIfTI export, tumour-label measurements, an MRI
Integrity Passport, and a local FastAPI workflow for a research and educational
prototype. It is not for clinical diagnosis.

## Setup

Use Python 3.11, create and activate a virtual environment, then install the
backend dependencies. Install the CUDA 12.8 PyTorch wheel if you have a
compatible NVIDIA driver and GPU; the API falls back to CPU otherwise.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
```

Run the development API from this directory:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for Swagger UI. Upload four aligned NIfTI
files using `T1ce`, `T1`, `T2`, and `FLAIR` in **POST `/api/v1/cases`**. An
optional `expert_mask` upload may be included using BraTS codes 0, 1, 2, and 4
on the same grid. Then use the returned `case_id` with **POST
`/api/v1/cases/{case_id}/segment`**. Results include links for the NIfTI mask
and Integrity Passport. Swagger can also retrieve results and delete a case.
Cases are automatically removed before the configured 24-hour maximum age.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Lightweight process liveness |
| GET | `/health/ready` | Initializes/checks the model; returns 503 if unavailable |
| POST | `/api/v1/cases` | Upload four MRI modalities and an optional expert label map |
| POST | `/api/v1/cases/{case_id}/segment` | Run the synchronous segmentation workflow |
| GET | `/api/v1/cases/{case_id}/results` | Read case state and result metadata |
| GET | `/api/v1/cases/{case_id}/mask` | Download the verified `.nii.gz` mask |
| GET | `/api/v1/cases/{case_id}/report` | Download the JSON Integrity Passport |
| DELETE | `/api/v1/cases/{case_id}` | Delete the case inputs and generated artifacts |

The segment endpoint runs in FastAPI's worker threadpool; calls to the shared
model are serialized. Simultaneous segmentation of one case and deletion while
processing return HTTP 409. Cases and manifests are stored under
`backend/data/api_cases/` by default and are restored on application restart.
Uploads are streamed into server-generated filenames, checked by the existing
NIfTI validator, and removed if upload validation fails. Default limits are
64 MiB per file and 128 MiB total for the four files.
The default maximum image size is 10,000,000 voxels per modality. The NIfTI
header dimensions are checked against this limit before voxel arrays are
materialized, which also bounds expansion from compressed NIfTI uploads.
Constant-valued and all-zero MRI modalities are rejected. Non-finite values,
non-3D images, mismatched modality geometry, unknown spatial units, and
inconsistent affine/header spacing are rejected. Nonzero images are not, by
themselves, proof of a brain MRI or skull stripping. Any nonzero voxel on a
volume boundary emits a `foreground_touches_volume_boundary:<modality>`
warning for possible clipping or inadequate background margin. This
conservative geometry warning is not a skull-stripping or brain-tissue
classifier and cannot establish that an input is a brain MRI.

An optional expert mask must be a finite, integer-valued, 3D NIfTI using only
BraTS codes 0, 1 (NCR), 2 (ED), and 4 (ET), with dimensions, affine, spacing,
and `mm` units matching the reference MRI. When provided, results include the
reference volumes plus Dice and sensitivity for TC, WT, and ET. Regions are
nested. Empty-reference Dice is reported as 1 only when both masks are empty;
sensitivity is `null` and an explicit warning is included when the reference
region is empty. These per-case comparisons are not a held-out evaluation.

### Configuration

Set optional environment variables in PowerShell before starting Uvicorn:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEUROSCOPE_DATA_DIR` | `backend/data/api_cases` | Case storage directory; must remain inside `backend/` |
| `NEUROSCOPE_MODEL_PATH` | Inference service's bundle default | Existing local TorchScript model file |
| `NEUROSCOPE_MAX_UPLOAD_BYTES_PER_FILE` | `67108864` | Maximum bytes per modality |
| `NEUROSCOPE_MAX_UPLOAD_BYTES_TOTAL` | `134217728` | Maximum bytes across the upload |
| `NEUROSCOPE_MAX_VOXELS` | `10000000` | Maximum 3D voxel count per modality |
| `NEUROSCOPE_CASE_RETENTION_SECONDS` | `86400` | Maximum local case lifetime; values above 24 hours are rejected |
| `NEUROSCOPE_CORS_ORIGINS` | Vite on port 5173 and local port 3000 origins | Comma-separated explicit browser origins; wildcard is rejected |

Example:

```powershell
$env:NEUROSCOPE_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
$env:NEUROSCOPE_MAX_UPLOAD_BYTES_PER_FILE = "67108864"
$env:NEUROSCOPE_MAX_UPLOAD_BYTES_TOTAL = "134217728"
$env:NEUROSCOPE_CASE_RETENTION_SECONDS = "86400"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API has no authentication or authorization. Keep this development server
bound to localhost; do not expose it to the public internet. A public
deployment requires authentication, HTTPS, access controls, appropriate
retention/privacy protections, and production-grade request/resource limits.

Run the complete backend test suite from this directory with:

```powershell
python -m pip install pytest
python -m pytest
```

## Model bundle

Model weights are intentionally excluded from Git. Obtain the
`brats_mri_segmentation` bundle from the
[official MONAI Model Zoo entry](https://github.com/Project-MONAI/model-zoo/tree/dev/models/brats_mri_segmentation),
review the bundle's `LICENSE` and `docs/data_license.txt`, and place the
extracted bundle under `models/brats_mri_segmentation/`. The Phase 1 inference
service loads the local TorchScript file at
`models/brats_mri_segmentation/models/model.ts`. The bundle's standard
`inference.json` describes loading the `model.pt` state dictionary into
SegResNet; the service instead uses the existing local TorchScript artifact
as requested. Supply a compatible licensed `model.ts` separately, because
model artifacts are ignored by Git. Create one `InferenceService` instance
and reuse it; initialization loads the model into memory.

`InferenceService.infer()` expects the dictionary returned by
`load_and_validate_modalities()`. It returns a uint8 segmentation on the
original MRI grid, its affine and spacing, the model identifier, device,
inference duration, output shape, and an empty `validation_warnings` tuple.
The input validator requires explicit NIfTI `mm` units and consistency between
the NIfTI zooms and affine. Inference reorients to closest canonical RAS,
resamples modalities to the bundle's 1x1x1 mm model grid, then nearest-neighbor
maps discrete labels back to the original input grid. Input files are never
modified; the passport records this spatial preprocessing.

The bundle configuration specifies input channels `T1c`, `T1`, `T2`, FLAIR
(the validated `T1ce` input supplies `T1c`), channel-wise nonzero intensity
normalization, and sliding-window inference with ROI `240 x 240 x 160`,
batch size 1, and 0.5 overlap. The service canonicalizes to RAS and resamples
intensities to a 1 mm model grid. It inverse-maps discrete labels using
nearest-neighbor interpolation to the original reference grid; output
dimensions, affine, and spacing therefore remain those of the original MRI.
It applies sigmoid activation and a 0.5 threshold. The
bundle's channel order is TC, WT, ET; its documented conversion gives
enhancing tumour label 4 precedence over tumour core label 1, then whole
tumour label 2.

## Segmentation validation, export, and integrity report

The processing API uses these services:

- `validate_segmentation()` checks the 3D shape, finite integer label values,
  allowed labels (`0`, `1`, `2`, `4`), and affine/spacing agreement with the
  reference grid. Empty masks and a single present tumour label are reported
  as warnings; no mask is silently resampled or reoriented.
- `measure_segmentation()` uses `abs(det(affine[:3, :3]))` for voxel volume.
  The exported mask stores exclusive classes using ET→TC→WT precedence.
  `label_counts` report those exact stored classes. Region volumes reconstruct
  the documented nested regions as TC = labels 1+4, WT = labels 1+2+4, and ET
  = label 4. These regional volumes overlap and must not be added together.
  Integrity Passport schema 1.3 records the exact label unions used, the model
  file hash, and Python, NumPy, PyTorch, MONAI, CUDA/cuDNN runtime, and device
  name for run traceability.
  Physical volumes require known spatial units.
- `export_segmentation()` requires an explicit output directory, a reference
  NIfTI image, the inference affine, and a safe case ID. It writes an integer
  NIfTI mask atomically, refuses to overwrite by default, and reloads the
  temporary output to verify shape, affine, spacing, and labels before
  publishing it. Export currently requires the reference NIfTI spatial units
  to be explicitly `mm`.
- `build_integrity_report()` creates a JSON-safe passport with modality file
  hashes, inference configuration and metadata, label counts and volumes,
  model SHA-256, runtime package/device versions, export hash, round-trip
  checks, warnings, and errors.
  `write_integrity_report()` writes it atomically to an explicitly supplied
  directory without overwriting by default. The passport omits input paths,
  source filenames, and MRI header metadata.

Hashes establish file integrity only; they do not establish segmentation
accuracy. The API workflow connects these services, but model smoke tests and
synthetic API tests do not establish accuracy on real patient scans.

The currently present local bundle identifies itself as version 0.5.1 and was
created for MONAI 1.3.1 and PyTorch 2.2.2. Verify compatibility before using
it with different library versions. The model's stated intended use is
research/example purposes, not diagnosis; its benchmark scores do not
establish accuracy on a new scan or population.

This checkout does not include a held-out labelled evaluation cohort or an
evaluation split manifest. Therefore it does not produce or claim the required
10-patient held-out Dice/sensitivity results, and overlap with the model's
training data has not been independently verified. Per-case expert-mask
metrics are available only when a corresponding label map is supplied; they
are not an independent evaluation. A 3D web viewer, linked slice/crosshair
views, uncertainty estimates, and a reliable brain/skull-stripping classifier
are also not implemented.

## Standalone prediction command

The local scoring pipeline can be run without starting FastAPI. From the
backend directory, provide all four modality paths and an explicit output
directory:

```powershell
python -m app.predict `
  --t1ce .\data\sample_case\T1ce.nii.gz `
  --t1 .\data\sample_case\T1.nii.gz `
  --t2 .\data\sample_case\T2.nii.gz `
  --flair .\data\sample_case\FLAIR.nii.gz `
  --output-dir .\outputs\sample
```

The command writes a verified BraTS-coded `{case-id}-seg.nii.gz` mask on the
reference image grid and a matching `{case-id}-integrity.json` Passport. A
random case ID is used unless `--case-id` is supplied. The output directory
must not already contain files with those generated names. To select a local
TorchScript artifact, pass `--model-path .\models\brats_mri_segmentation\models\model.ts`.
The command uses the installed local model only; it does not download models
or read a dataset at inference time.

## Clinical development status

This software is not clinically validated, cleared, or approved and must not
be used to guide diagnosis or treatment. The bundle documentation reports
validation Dice scores on its historical BraTS 2018 validation split; those
are source-reported results, not independently reproduced results for this
installation or evidence about the included sample case. The local sample
contains four MRI modalities but no reference segmentation, so this run could
verify processing and NIfTI geometry only—not segmentation accuracy.

Before any clinical-use consideration, a separate clinical development
program would need a defined intended use and patient population, qualified
reference annotations, a locked and versioned model/software configuration,
pre-specified independent multi-site evaluation, per-region metrics with
confidence intervals and subgroup analysis, human-factors and workflow
evaluation, risk management, privacy/security controls, and applicable
regulatory and institutional review. This repository does not provide those
controls or evidence.
