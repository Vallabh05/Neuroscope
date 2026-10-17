# NeuroScope 3D — Implementation and Integration Report

**Report date:** 17 October 2026
**Scope:** Current backend implementation, latest validation/inference changes,
and integration guidance for a future browser frontend.
**Intended use:** Research and teaching prototype only. This report does not
claim clinical accuracy, clinical validation, regulatory clearance, or
diagnostic utility.

## 1. Executive summary

The backend accepts four aligned 3D NIfTI MRI modalities, validates their
content and geometry, runs the local MONAI/TorchScript model, restores the
segmentation to the original MRI grid, validates and exports the result, and
produces measurements plus a JSON Integrity Passport. An optional BraTS label
map can be supplied to compare one case's prediction against that reference.
A standalone command uses the same processing services without requiring the
HTTP API.

The central engineering aim is to make the output traceable and spatially
usable: output masks are checked against the input reference affine and
dimensions, the NIfTI export is reloaded and verified, and the report records
hashes and software/model provenance. These checks demonstrate data integrity
and processing consistency; **they do not demonstrate that the predicted
labels are correct**.

The backend can provide a NIfTI mask suitable as input to a future 3D renderer.
There is currently **no website or 3D viewer implemented**, no server endpoint
that returns a mesh, and no held-out labelled cohort or 10-case evaluation
report.

## 2. Processing flow

### 2.1 API case flow

1. The browser uploads files to `POST /api/v1/cases` as multipart form data:
   required keys `T1ce`, `T1`, `T2`, and `FLAIR`; optionally `expert_mask`.
2. The API streams bytes to server-generated filenames under the configured
   backend data directory. Client filenames are not used as disk paths.
3. Input validation checks NIfTI readability, 3D dimensions, finite and
   nonconstant voxel values, explicit millimetre units, voxel caps, and
   consistent shape, affine, and spacing across the four modalities. A
   boundary-touching foreground warning is emitted as a limited quality
   signal.
4. If supplied, the expert mask is checked for 3D shape, dimensions, affine,
   spacing, mm units, finite integer values, and BraTS codes `0`, `1`, `2`,
   and `4`.
5. `POST /api/v1/cases/{case_id}/segment` revalidates saved MRI inputs,
   obtains the lazily initialized inference service, and runs inference in
   FastAPI's worker threadpool. Model calls are serialized to protect shared
   model/GPU access; concurrent segmentation of a case is rejected.
6. Inference prepares canonical RAS model input at 1 mm spacing, normalizes
   channels, runs sliding-window inference, thresholds the three output
   channels, and nearest-neighbor maps categorical labels back to the original
   MRI grid.
7. The output is validated against the reference shape, affine, and spacing.
   Measurements are calculated. If an expert mask exists, the backend derives
   comparison metrics.
8. The mask is exported to NIfTI using the reference image metadata. The
   service reloads the export and checks its shape, affine, spacing, and
   labels. The report service hashes inputs and outputs and writes the JSON
   Passport.
9. The case becomes `completed` only after the workflow succeeds. Failed
   processing does not expose a successful result and removes incomplete
   generated artifacts where possible.
10. `GET /api/v1/cases/{case_id}/results` returns status and result metadata.
    Separate mask and report routes return the NIfTI and JSON files.
    `DELETE /api/v1/cases/{case_id}` deletes a case safely. A background
    retention worker removes cases before their configured maximum age of 24
    hours.

### 2.2 Standalone flow

`python -m app.predict` calls the same validation, inference, segmentation
validation, measurement, NIfTI export, and Integrity Passport services. It
accepts explicit paths for all four MRIs and an output directory. It does not
download a model or search a dataset.

## 3. Input, model, and spatial handling

### Inputs considered

- Required model input order: **T1ce, T1, T2, FLAIR**. T1ce is the challenge's
  T1Gd/contrast-enhanced T1 modality.
- Each file must be a readable, finite, nonconstant 3D NIfTI.
- Spatial units must be explicitly `mm`; affine-derived voxel dimensions must
  agree with header zooms.
- Modalities must have the same dimensions, affine, and spacing. Inputs are
  not silently registered, resampled relative to one another, or repaired.
- The default upload caps are 64 MiB per file, 128 MiB total, and 10,000,000
  voxels per image. These are configurable. The file-size cap is intentionally
  lower than the challenge's 1 GB failure-test threshold; deployment settings
  and memory budgets must be considered before raising it.
- A nonzero foreground voxel on a volume boundary creates
  `foreground_touches_volume_boundary:<modality>`. This can flag clipping or
  insufficient background margin; it cannot identify brain tissue or prove
  skull stripping.

### Spatial preprocessing

The model configuration expects 1 mm isotropic input. To support an
anisotropic or differently oriented input without losing reference geometry:

1. Reorient to closest canonical RAS.
2. Resample each intensity volume to 1 mm model spacing using trilinear
   interpolation.
3. Perform inference on the resulting model grid.
4. Map categorical segmentation labels back to the original reference shape
   and affine with nearest-neighbor interpolation.

The original uploaded MRI files are not modified. The exported mask is on the
original input reference grid, not the temporary model grid. As with any
interpolation, this preprocessing can affect predictions and must be included
in any future independent validation.

### Model inference

The local bundle is identified as **BraTS MRI segmentation 0.5.1**. The
configured model channel order is TC, WT, ET; sigmoid activation and a
threshold of `0.5` are applied. The current sliding-window configuration
records its ROI, batch size, and overlap in the report. The model bundle
documentation identifies the model as an example/research artifact rather
than a diagnostic system. Historical benchmark scores from the bundle are
not results from this installation or the sample run.

The three predicted regions are nested. To export one integer label per voxel,
the implementation assigns labels with precedence **ET = 4, then TC = 1,
then WT = 2, else background = 0**. Thus the stored classes are exclusive,
while the reported region masks are rebuilt by unions:

- **ET:** `{4}`
- **TC:** `{1, 4}`
- **WT:** `{1, 2, 4}`

This matches region-level comparison semantics while preserving one
BraTS-coded label map. TC, WT, and ET measurements overlap; they must not be
summed as disjoint volumes. In the reference BraTS mask, the individual codes
conventionally mean `1=NCR`, `2=ED`, `4=ET`; model output code `1` is the
exclusive portion of the model's TC prediction after ET precedence. Metrics
are computed from the specified region unions, not by assuming all three
regions are mutually exclusive.

## 4. Measurement and comparison formulas

### Affine-based voxel and region volumes

Let `A` be the 4×4 NIfTI affine. Let `A₃` be its upper-left 3×3 spatial
matrix. Its absolute determinant gives voxel volume in the affine's spatial
units cubed, including for rotated or sheared geometry:

```text
voxel_volume_mm3 = abs(det(A₃)) × unit_conversion³

unit_conversion:
  mm      -> 1
  meter   -> 1000
  micron  -> 0.001
```

For a region containing `N` voxels:

```text
region_volume_mm3 = N × voxel_volume_mm3
region_volume_cm3 = region_volume_mm3 / 1000
region_volume_mL  = region_volume_cm3
```

For the judge's 20×20×20 voxel region at spacing 1×1×2 mm, voxel volume is
`abs(1 × 1 × 2) = 2 mm³`; region volume is
`8,000 × 2 = 16,000 mm³ = 16 cm³ = 16 mL`.

The affine determinant is used rather than just multiplying header zooms, so
the measurement is based on spatial geometry. The input validator separately
checks affine dimensions against the declared zooms.

### Dice and sensitivity with an optional expert mask

For each union-derived region, let `P` be predicted voxels, `R` be reference
voxels, and `I = |P ∩ R|`:

```text
Dice        = 2I / (|P| + |R|)
Sensitivity = I / |R|
```

When both predicted and reference regions are empty, Dice is explicitly set
to 1; sensitivity is `null` when the reference region is empty, and the report
adds an `empty_reference_region:<region>` warning. Such cases require careful
interpretation and are not aggregated into a held-out score by this API.

These are **per-case comparison metrics** only. They do not constitute
evaluation on 10 held-out patients, and no patient-level split, confidence
interval, training-data overlap analysis, or population performance is
provided.

## 5. Integrity Passport and data handling

The report schema is **1.3**. It records:

- UTC report generation time and non-identifying case ID.
- Input modality names and SHA-256 file hashes; no MRI header dump, original
  filename, or raw input path.
- Input validation result and warnings.
- Model identifier and hash, relevant inference settings, runtime package
  versions, device, and inference duration.
- Input/output dimensions, spacing, and affine.
- Stored-label counts and nested region voxel counts/volumes.
- Export filename and SHA-256 hash plus NIfTI round-trip checks.
- If given an expert mask: its hash, region volumes, Dice/sensitivity, and
  metric warnings.

SHA-256 establishes file identity/integrity only. It cannot establish
segmentation quality or clinical correctness. Cases are stored locally under
the backend data root by default and are subject to the configured
maximum-24-hour retention. The API does not implement authentication or
authorization; it must remain a localhost development service unless
appropriate security, privacy, and operational controls are added.

## 6. API contract for a web frontend

Swagger/OpenAPI is available at `http://127.0.0.1:8000/docs`; the schema is
at `http://127.0.0.1:8000/openapi.json`.

| Method | Route | Frontend use |
| --- | --- | --- |
| `GET` | `/health` | Lightweight process liveness |
| `GET` | `/health/ready` | Initializes/checks model readiness; may take longer on first call |
| `POST` | `/api/v1/cases` | Multipart upload of four MRI files; optional expert mask |
| `POST` | `/api/v1/cases/{case_id}/segment` | Synchronous segmentation; returns measurements and URLs |
| `GET` | `/api/v1/cases/{case_id}/results` | Poll/read uploaded, processing, completed, or failed status |
| `GET` | `/api/v1/cases/{case_id}/mask` | Download exported `.nii.gz` mask |
| `GET` | `/api/v1/cases/{case_id}/report` | Download JSON Integrity Passport |
| `DELETE` | `/api/v1/cases/{case_id}` | Delete the case and its artifacts |

### Browser upload example (TypeScript/JavaScript)

```ts
const API_BASE = "http://127.0.0.1:8000";

async function uploadCase(files: {
  t1ce: File;
  t1: File;
  t2: File;
  flair: File;
  expertMask?: File;
}) {
  const body = new FormData();
  body.append("T1ce", files.t1ce);
  body.append("T1", files.t1);
  body.append("T2", files.t2);
  body.append("FLAIR", files.flair);
  if (files.expertMask) body.append("expert_mask", files.expertMask);

  const response = await fetch(`${API_BASE}/api/v1/cases`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<{
    case_id: string;
    status: "validated";
    dimensions: [number, number, number];
    spacing_mm: [number, number, number];
    expert_mask_provided: boolean;
    validation_warnings: string[];
  }>;
}

async function segmentCase(caseId: string) {
  const response = await fetch(
    `${API_BASE}/api/v1/cases/${encodeURIComponent(caseId)}/segment`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Segmentation failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}
```

Do **not** manually set `Content-Type` for `FormData`; the browser must add the
multipart boundary. The client should use returned `mask_url` and `report_url`
against `API_BASE`, check HTTP errors, show validation warnings, show a
persistent research-only disclaimer, and allow users to delete cases. Since
segmentation is currently synchronous, the browser must handle a long-running
request and suitable network/proxy timeouts; the results route is available
for status reads, but this is not yet a background-job API.

The browser origin must be explicitly added to
`NEUROSCOPE_CORS_ORIGINS`. For example:

```powershell
$env:NEUROSCOPE_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
```

There is no authentication token, user identity, or API-key parameter today.
Do not expose the development service to the public internet. A deployed
website requires a separately designed authenticated HTTPS backend, access
controls, privacy/retention review, resource limits, and security testing.

## 7. Starting the backend and standalone command

Run PowerShell in `D:\NeuroScope\neuroscope3d\backend`:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

This listens only on the local machine. Open Swagger at
`http://127.0.0.1:8000/docs`. Do not change the host to `0.0.0.0` for public
access.

Example standalone run from the backend directory:

```powershell
python -m app.predict `
  --t1ce .\data\sample_case\T1ce.nii.gz `
  --t1 .\data\sample_case\T1.nii.gz `
  --t2 .\data\sample_case\T2.nii.gz `
  --flair .\data\sample_case\FLAIR.nii.gz `
  --output-dir .\outputs\sample
```

Required parameters: `--t1ce`, `--t1`, `--t2`, `--flair`, and `--output-dir`.
Optional parameters: `--case-id` (must be safe for filenames) and
`--model-path` (local `model.ts`). Output names are generated from the case
ID; existing output files are not overwritten.

## 8. What is distinctive here—and what is not

The implementation emphasizes a set of safeguards that are often missing
from quick demonstration pipelines when those pipelines return only an array
or image:

- Explicit checks that prediction dimensions, affine, spacing, and labels
  match the intended reference grid.
- Nearest-neighbor inverse mapping for discrete labels after canonical
  orientation and intensity resampling.
- NIfTI export followed by reload and geometry/label verification.
- Affine-determinant physical volume measurements and explicitly documented
  nested-region unions.
- Input/model/output hashes and runtime/configuration provenance in a
  patient-identifier-minimizing report.
- Safe generated case identifiers, bounded uploads/voxel counts, serialized
  model access, failed-artifact cleanup, and automatic expiry.
- Optional expert comparison integrated into the same case workflow.

These are engineering features, not claims of novelty, and related
capabilities exist in other imaging systems. They do not supply missing
clinical validation, access control, uncertainty calibration, independent
testing, or a user-facing viewer. The feature most differentiating to a judge
should be the explicit combination of spatial fidelity checks, reproducible
run provenance, region-specific measurements, and transparent limits—not a
claim that no other system provides them.

## 9. 3D tumour visualization: current answer

**Can the project generate the data needed for a 3D view? Yes. Does it display
the view today? No.**

The mask endpoint downloads a label-valued NIfTI on the input MRI grid. A
frontend can load the MRI and mask, construct separate surfaces for the
`WT`, `TC`, and `ET` unions, transform surface vertices through the NIfTI
affine into millimetre world coordinates, and render them with opacity and
visibility controls. A viewer library or marching-cubes implementation can
support mesh generation. The MRI should provide the anatomical background;
the mask alone renders the labelled regions, not a complete brain surface.

To meet the requested viewer behavior, frontend work still needs to implement
NIfTI loading, axial/coronal/sagittal views, consistent orientation labels,
one crosshair mapped between voxel and world coordinates, the affine
transformation into the 3D scene, region toggles/opacity, and a persistent
disclaimer. This repository currently has no frontend directory/package and
no endpoint that serves precomputed mesh geometry. No viewer or 3D scene has
been generated or visually tested yet.

## 10. Verification and current gaps

The last recorded backend test run completed with **69 passing tests**,
including synthetic API, expert-mask, export/report, preprocessing, and CLI
tests. A real local sample inference was also run: output shape was
`240×240×155`, spacing was 1 mm, report schema was 1.3, and the export
round-trip checks for affine, labels, shape, and spacing all passed. The local
sample did not include an expert mask, so this run did not measure accuracy.

The project still does not satisfy every challenge deliverable:

- No browser frontend/3D or linked slice viewer.
- No held-out labelled cohort, patient-level split, 10-case Dice/sensitivity
  results, confidence intervals, or verified training-set overlap disclosure.
- No reliable automated brain/skull-stripping classifier. The boundary
  warning is deliberately limited and must not be presented as one.
- No calibrated uncertainty, HD95 reporting, DICOM support, temporal
  comparison, or modality-ablation explanations.
- No authentication/authorization; no public-deployment readiness.
- The default upload caps remain well below 1 GB and should not be raised
  without resource-capacity analysis.

These gaps should be addressed before claiming that all challenge requirements
are met. None of the software checks or provenance hashes imply clinical
accuracy.

## 11. Git and commit note

The workspace contains staged and unstaged work from earlier phases as well
as the current phase. `backend/tests/test_main.py` is already staged as a
deletion; it was not restored. Because that deletion and other earlier
changes are already staged, a commit of the full index would include work
beyond this report and would preserve that deletion. Review `git status
--short` and the staged diff before committing. This report itself does not
commit, push, or deploy anything.
