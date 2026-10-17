# NeuroScope 3D frontend

React/Vite web UI for the local FastAPI backend. It uploads four required
co-registered NIfTI MRI modalities, optionally uploads a BraTS expert mask,
runs the synchronous segmentation endpoint, and presents the returned data.
It does not call a third-party imaging or AI service.

## Run locally (Windows PowerShell)

Use Node.js 20 or later and npm. Install frontend dependencies once:

```powershell
cd D:\NeuroScope\neuroscope3d\frontend
npm ci
```

In a separate PowerShell terminal, start the backend:

```powershell
cd D:\NeuroScope\neuroscope3d\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In the frontend terminal, point the app at the backend and start Vite:

```powershell
cd D:\NeuroScope\neuroscope3d\frontend
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). For a built
production bundle, run `npm run build`; this creates `dist/`. `dist/`,
`node_modules/`, and `.env.local` are ignored by Git.
The Vite development server proxies `/health` and `/api` to the local
FastAPI service, avoiding browser CORS errors for this local setup.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Same-origin API paths | Set to an absolute API base URL when the frontend and backend are hosted on separate origins; configure backend CORS for that frontend origin |
| `NEUROSCOPE_CORS_ORIGINS` | Vite port 5173 and local port 3000 origins | Needed for direct browser-to-backend requests; Vite's local proxy does not require it |

The backend enforces a default maximum of 64 MiB for each file and 128 MiB for
the multipart request. Those limits can be changed with
`NEUROSCOPE_MAX_UPLOAD_BYTES_PER_FILE` and
`NEUROSCOPE_MAX_UPLOAD_BYTES_TOTAL`; the UI's displayed values should be kept
in sync if the backend settings change. The four required sequences and
optional expert mask must share valid geometry and fit the total limit.

## API workflow

1. Select T1, T1ce/T1Gd, T2, and FLAIR NIfTI files in the matching slots.
   Filenames are only a user-facing hint; the selected slot defines the
   modality sent to the API.
2. Optionally select an expert reference mask encoded with BraTS values
   `0`, `1`, `2`, and `4` on the same grid.
3. The UI sends multipart fields `T1`, `T1ce`, `T2`, `FLAIR`, and optionally
   `expert_mask` to `POST /api/v1/cases`.
4. It calls `POST /api/v1/cases/{case_id}/segment`, then downloads the
   resulting NIfTI mask and JSON report using the returned case ID.
5. The original MRI files are parsed in the browser from the selected
   `File` objects; the browser does not fetch originals from the API. MRI,
   mask, and report are checked for matching dimensions and affine before
   visualization.
6. “Delete case and start new” calls `DELETE /api/v1/cases/{case_id}`.
   Backend cases also expire automatically within the configured 24-hour
   maximum retention.

The client calls these backend routes: `GET /health`, `POST
/api/v1/cases`, `POST /api/v1/cases/{case_id}/segment`, `GET
/api/v1/cases/{case_id}/mask`, `GET /api/v1/cases/{case_id}/report`, and
`DELETE /api/v1/cases/{case_id}`. See [../backend/README.md](../backend/README.md)
for request/response schemas and all API routes.

## Viewer behavior and limitations

- Orthogonal canvases display the input's voxel-aligned XY, XZ, and YZ
  planes. Letter markers use each axis' dominant affine direction; the UI
  does not reslice oblique inputs into canonical anatomical planes.
- Slice clicks and sliders update one shared voxel/world coordinate; the
  3D view places the crosshair using the image affine in millimetres.
- The 3D scene meshes the predicted WT, TC, and ET label surfaces. It does
  **not** reconstruct or render brain anatomy.
- Volumes use `voxel_count × abs(det(affine[:3,:3])) / 1000` for mL. WT, TC,
  and ET are nested regions and their values must not be added together.
- An optional expert mask provides only case-specific Dice/sensitivity.
  There are no held-out benchmark metrics in the app, and integrity checks
  do not establish biological or clinical accuracy.
- This is a local research/education prototype, has no authentication, and
  must not be exposed directly to the public internet. Do not upload real
  patient data. Public deployment requires authentication, HTTPS, and
  appropriate access, privacy, and retention controls.

## Build check

```powershell
npm ci
npm run build
```
