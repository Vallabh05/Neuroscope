import * as THREE from 'three';
import type { NiftiVolume, SegmentationResult } from '../types';

type RegionId = 'wt' | 'tc' | 'et';

const REGION_INCLUDES: Record<RegionId, (label: number) => boolean> = {
  wt: label => label === 1 || label === 2 || label === 4,
  tc: label => label === 1 || label === 4,
  et: label => label === 4,
};
const REGIONS: RegionId[] = ['wt', 'tc', 'et'];

const FACES: Array<{
  offset: [number, number, number];
  corners: Array<[number, number, number]>;
}> = [
  { offset: [-1, 0, 0], corners: [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]] },
  { offset: [1, 0, 0], corners: [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]] },
  { offset: [0, -1, 0], corners: [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]] },
  { offset: [0, 1, 0], corners: [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]] },
  { offset: [0, 0, -1], corners: [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,-.5,-.5],[.5,-.5,-.5]] },
  { offset: [0, 0, 1], corners: [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]] },
];

export function volumeCenterWorld(volume: NiftiVolume): [number, number, number] {
  const [x, y, z] = volume.dimensions.map(size => (size - 1) / 2);
  const a = volume.affine;
  return [
    a[0][0] * x + a[0][1] * y + a[0][2] * z + a[0][3],
    a[1][0] * x + a[1][1] * y + a[1][2] * z + a[1][3],
    a[2][0] * x + a[2][1] * y + a[2][2] * z + a[2][3],
  ];
}

export function volumeWorldExtent(volume: NiftiVolume): number {
  return Math.max(
    ...volume.dimensions.map((size, axis) => size * volume.spacing_mm[axis]),
  );
}

export function createLabelSurfaces(
  volume: NiftiVolume,
): Record<RegionId, THREE.BufferGeometry> {
  const [nx, ny, nz] = volume.dimensions;
  const labels = volume.data;
  if (!(labels instanceof Uint8Array)) {
    throw new Error('3D surface generation requires an integer label volume.');
  }

  const bounds = [nx, ny, nz, -1, -1, -1];
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] === 0) continue;
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.min(bounds[2], z);
    bounds[3] = Math.max(bounds[3], x);
    bounds[4] = Math.max(bounds[4], y);
    bounds[5] = Math.max(bounds[5], z);
  }
  const vertices: Record<RegionId, number[]> = { wt: [], tc: [], et: [] };
  const at = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return 0;
    return labels[x + nx * (y + ny * z)];
  };
  const toWorld = (x: number, y: number, z: number): [number, number, number] => {
    const affine = volume.affine;
    return [
      affine[0][0] * x + affine[0][1] * y + affine[0][2] * z + affine[0][3],
      affine[1][0] * x + affine[1][1] * y + affine[1][2] * z + affine[1][3],
      affine[2][0] * x + affine[2][1] * y + affine[2][2] * z + affine[2][3],
    ];
  };

  if (bounds[3] >= 0) {
    for (let z = bounds[2]; z <= bounds[5]; z += 1) {
      for (let y = bounds[1]; y <= bounds[4]; y += 1) {
        for (let x = bounds[0]; x <= bounds[3]; x += 1) {
          const label = at(x, y, z);
          if (label === 0) continue;
          for (const region of REGIONS) {
            const includes = REGION_INCLUDES[region];
            if (!includes(label)) continue;
            for (const face of FACES) {
              if (includes(at(
                x + face.offset[0],
                y + face.offset[1],
                z + face.offset[2],
              ))) continue;
              for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
                const corner = face.corners[cornerIndex];
                vertices[region].push(...toWorld(
                  x + corner[0],
                  y + corner[1],
                  z + corner[2],
                ));
              }
            }
          }
        }
      }
    }
  }

  const geometryFor = (region: RegionId): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices[region], 3),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };
  return { wt: geometryFor('wt'), tc: geometryFor('tc'), et: geometryFor('et') };
}

export interface BrainSurfaceOptions {
  step?: number;
  smoothIterations?: number;
  threshold?: number;
}

/**
 * Generates an anatomical 3D brain surface mesh from MRI volume data.
 * Uses downsampled boundary extraction with shared vertices and Laplacian smoothing
 * to produce an organic, continuous cortical shell in physical world coordinates.
 */
export function createBrainSurface(
  volume: NiftiVolume,
  options: BrainSurfaceOptions = {},
): THREE.BufferGeometry {
  const step = options.step ?? 3;
  const smoothIterations = options.smoothIterations ?? 3;
  const [nx, ny, nz] = volume.dimensions;
  const data = volume.data;

  // Determine intensity threshold for brain tissue
  let threshold = 0;
  if (options.threshold !== undefined) {
    threshold = options.threshold;
  } else if (volume.display_range && volume.display_range[0] > 0) {
    threshold = volume.display_range[0] * 0.15;
  }

  const sx = Math.floor(nx / step);
  const sy = Math.floor(ny / step);
  const sz = Math.floor(nz / step);

  // 1. Build downsampled occupancy grid and find bounding box
  const sub = new Uint8Array(sx * sy * sz);
  let minX = sx, minY = sy, minZ = sz;
  let maxX = -1, maxY = -1, maxZ = -1;

  for (let cz = 0; cz < sz; cz += 1) {
    const vz = Math.min(nz - 1, cz * step + 1);
    for (let cy = 0; cy < sy; cy += 1) {
      const vy = Math.min(ny - 1, cy * step + 1);
      for (let cx = 0; cx < sx; cx += 1) {
        const vx = Math.min(nx - 1, cx * step + 1);
        const val = data[vx + nx * (vy + ny * vz)];
        if (val > threshold) {
          sub[cx + sx * (cy + sy * cz)] = 1;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cz < minZ) minZ = cz;
          if (cz > maxZ) maxZ = cz;
        }
      }
    }
  }

  if (maxX < minX || maxY < minY || maxZ < minZ) {
    return new THREE.BufferGeometry();
  }

  // 2. Extract shared-vertex boundary faces
  const faces = [
    { offset: [-1, 0, 0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
    { offset: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
    { offset: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    { offset: [0, 1, 0],  corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
    { offset: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
    { offset: [0, 0, 1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  ];

  const gridWidth = sx + 1;
  const gridHeight = sy + 1;
  const gridDepth = sz + 1;
  const vGrid = new Int32Array(gridWidth * gridHeight * gridDepth).fill(-1);

  const rawPositions: number[] = [];
  const indices: number[] = [];

  const getVertex = (gx: number, gy: number, gz: number): number => {
    const idx = gx + gridWidth * (gy + gridHeight * gz);
    let vid = vGrid[idx];
    if (vid === -1) {
      vid = rawPositions.length / 3;
      vGrid[idx] = vid;
      rawPositions.push(gx * step, gy * step, gz * step);
    }
    return vid;
  };

  const atSub = (x: number, y: number, z: number): number => {
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return 0;
    return sub[x + sx * (y + sy * z)];
  };

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (atSub(x, y, z) === 0) continue;
        for (const face of faces) {
          if (atSub(x + face.offset[0], y + face.offset[1], z + face.offset[2]) === 1) continue;
          const v0 = getVertex(x + face.corners[0][0], y + face.corners[0][1], z + face.corners[0][2]);
          const v1 = getVertex(x + face.corners[1][0], y + face.corners[1][1], z + face.corners[1][2]);
          const v2 = getVertex(x + face.corners[2][0], y + face.corners[2][1], z + face.corners[2][2]);
          const v3 = getVertex(x + face.corners[3][0], y + face.corners[3][1], z + face.corners[3][2]);
          indices.push(v0, v1, v2, v0, v2, v3);
        }
      }
    }
  }

  const numVerts = rawPositions.length / 3;
  if (numVerts === 0) return new THREE.BufferGeometry();

  // 3. Fast Laplacian smoothing in voxel space
  const posArray = new Float32Array(rawPositions);
  const sumX = new Float32Array(numVerts);
  const sumY = new Float32Array(numVerts);
  const sumZ = new Float32Array(numVerts);
  const deg = new Uint16Array(numVerts);

  for (let pass = 0; pass < smoothIterations; pass += 1) {
    sumX.fill(0); sumY.fill(0); sumZ.fill(0); deg.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      sumX[a] += posArray[b * 3]; sumY[a] += posArray[b * 3 + 1]; sumZ[a] += posArray[b * 3 + 2]; deg[a] += 1;
      sumX[b] += posArray[a * 3]; sumY[b] += posArray[a * 3 + 1]; sumZ[b] += posArray[a * 3 + 2]; deg[b] += 1;
      sumX[b] += posArray[c * 3]; sumY[b] += posArray[c * 3 + 1]; sumZ[b] += posArray[c * 3 + 2]; deg[b] += 1;
      sumX[c] += posArray[b * 3]; sumY[c] += posArray[b * 3 + 1]; sumZ[c] += posArray[b * 3 + 2]; deg[c] += 1;
      sumX[c] += posArray[a * 3]; sumY[c] += posArray[a * 3 + 1]; sumZ[c] += posArray[a * 3 + 2]; deg[c] += 1;
      sumX[a] += posArray[c * 3]; sumY[a] += posArray[c * 3 + 1]; sumZ[a] += posArray[c * 3 + 2]; deg[a] += 1;
    }
    for (let v = 0; v < numVerts; v += 1) {
      if (deg[v] > 0) {
        const inv = 1 / deg[v];
        posArray[v * 3]     = 0.5 * posArray[v * 3]     + 0.5 * (sumX[v] * inv);
        posArray[v * 3 + 1] = 0.5 * posArray[v * 3 + 1] + 0.5 * (sumY[v] * inv);
        posArray[v * 3 + 2] = 0.5 * posArray[v * 3 + 2] + 0.5 * (sumZ[v] * inv);
      }
    }
  }

  // 4. Transform smoothed voxel coordinates to physical world coordinates using affine
  const worldPositions = new Float32Array(numVerts * 3);
  const affine = volume.affine;
  for (let v = 0; v < numVerts; v += 1) {
    const vx = posArray[v * 3];
    const vy = posArray[v * 3 + 1];
    const vz = posArray[v * 3 + 2];
    worldPositions[v * 3]     = affine[0][0] * vx + affine[0][1] * vy + affine[0][2] * vz + affine[0][3];
    worldPositions[v * 3 + 1] = affine[1][0] * vx + affine[1][1] * vy + affine[1][2] * vz + affine[1][3];
    worldPositions[v * 3 + 2] = affine[2][0] * vx + affine[2][1] * vy + affine[2][2] * vz + affine[2][3];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(worldPositions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface TumorAnatomicalLocation {
  hemisphere: 'Left Hemisphere' | 'Right Hemisphere' | 'Bilateral / Midline';
  predominantLobe: 'Frontal' | 'Parietal' | 'Temporal' | 'Occipital' | 'Fronto-Parietal' | 'Temporo-Parietal' | 'Deep Subcortical';
  depth: 'Cortical' | 'Subcortical' | 'Deep';
  summary: string;
}

/**
 * Computes anatomical referencing metrics for the segmented tumor within the brain,
 * determining its hemisphere, anatomical lobe, and depth profile.
 */
export function computeTumorAnatomy(result: SegmentationResult): TumorAnatomicalLocation | null {
  const mask = result.mask;
  const labels = mask.data;
  const [nx, ny, nz] = mask.dimensions;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let count = 0;

  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] > 0) {
      const x = i % nx;
      const y = Math.floor(i / nx) % ny;
      const z = Math.floor(i / (nx * ny));
      sumX += x;
      sumY += y;
      sumZ += z;
      count += 1;
    }
  }

  if (count === 0) return null;

  const meanX = sumX / count;
  const meanY = sumY / count;
  const meanZ = sumZ / count;

  const midX = nx / 2;
  const midY = ny / 2;

  // Determine patient Left vs Right from affine:
  // In NIfTI, if affine[0][0] < 0 (BraTS standard LPS), increasing voxel X goes towards patient Left.
  const isIncreasingLeft = result.affine[0][0] < 0;
  let hemisphere: TumorAnatomicalLocation['hemisphere'] = 'Bilateral / Midline';
  const deltaX = meanX - midX;
  if (Math.abs(deltaX) > nx * 0.04) {
    const isLeft = isIncreasingLeft ? (deltaX > 0) : (deltaX < 0);
    hemisphere = isLeft ? 'Left Hemisphere' : 'Right Hemisphere';
  }

  // Determine Lobe along Y (Anterior -> Posterior) and Z (Inferior -> Superior)
  const isLowYAnterior = result.affine[1][1] < 0;
  const normAntPost = isLowYAnterior ? (meanY / ny) : (1 - meanY / ny); // 0 = Anterior, 1 = Posterior
  const normInfSup = meanZ / nz; // 0 = Inferior, 1 = Superior

  let predominantLobe: TumorAnatomicalLocation['predominantLobe'] = 'Deep Subcortical';
  if (normInfSup < 0.42 && normAntPost > 0.25 && normAntPost < 0.70) {
    predominantLobe = 'Temporal';
  } else if (normAntPost < 0.40) {
    predominantLobe = 'Frontal';
  } else if (normAntPost >= 0.40 && normAntPost <= 0.68) {
    if (normAntPost < 0.50) {
      predominantLobe = 'Fronto-Parietal';
    } else {
      predominantLobe = 'Parietal';
    }
  } else if (normAntPost > 0.68) {
    predominantLobe = 'Occipital';
  }

  // Depth estimation: relative to radial distance from volume center
  let depth: TumorAnatomicalLocation['depth'] = 'Subcortical';
  const distFromCenter = Math.hypot((meanX - midX) / (nx * 0.45), (meanY - midY) / (ny * 0.45));
  if (distFromCenter > 0.68) {
    depth = 'Cortical';
  } else if (distFromCenter < 0.32) {
    depth = 'Deep';
  }

  const hemiShort = hemisphere === 'Left Hemisphere' ? 'Left' : hemisphere === 'Right Hemisphere' ? 'Right' : 'Midline';
  const summary = `${hemiShort} ${predominantLobe}`;

  return { hemisphere, predominantLobe, depth, summary };
}

