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

export interface AnatomicalBrainSurfaces {
  leftHemisphere: THREE.BufferGeometry;
  rightHemisphere: THREE.BufferGeometry;
  cerebellum: THREE.BufferGeometry;
  brainstem: THREE.BufferGeometry;
  combined: THREE.BufferGeometry;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  };
}

export interface AnatomicalLandmark {
  id: string;
  name: string;
  shortName: string;
  category: 'Cerebrum' | 'Brainstem' | 'Cerebellum';
  worldPos: [number, number, number];
  description: string;
  hemisphere: 'Left' | 'Right' | 'Midline' | 'Bilateral';
}

/**
 * Generates an authentic, anatomically structured 3D brain surface comprising
 * distinct Left and Right cerebral hemispheres, longitudinal interhemispheric fissure,
 * temporal lobes with Sylvian indentations, cerebellum with folia, and brainstem.
 * Vertices are scaled and mapped through the NIfTI spatial affine to match the
 * patient's physical world millimeter coordinate space.
 */
export function createAnatomicalBrainSurface(
  volume: NiftiVolume,
): AnatomicalBrainSurfaces {
  const [nx, ny, nz] = volume.dimensions;
  const data = volume.data;
  const affine = volume.affine;

  // 1. Locate patient brain bounding box in voxel space
  let minVx = nx, maxVx = -1;
  let minVy = ny, maxVy = -1;
  let minVz = nz, maxVz = -1;

  const stride = Math.max(1, Math.floor(data.length / 80000));
  for (let idx = 0; idx < data.length; idx += stride) {
    if (data[idx] > 0) {
      const vx = idx % nx;
      const vy = Math.floor(idx / nx) % ny;
      const vz = Math.floor(idx / (nx * ny));
      if (vx < minVx) minVx = vx;
      if (vx > maxVx) maxVx = vx;
      if (vy < minVy) minVy = vy;
      if (vy > maxVy) maxVy = vy;
      if (vz < minVz) minVz = vz;
      if (vz > maxVz) maxVz = vz;
    }
  }

  // Fallback if empty or degenerate
  if (maxVx <= minVx || maxVy <= minVy || maxVz <= minVz) {
    minVx = Math.floor(nx * 0.22);
    maxVx = Math.floor(nx * 0.78);
    minVy = Math.floor(ny * 0.16);
    maxVy = Math.floor(ny * 0.86);
    minVz = Math.floor(nz * 0.08);
    maxVz = Math.floor(nz * 0.92);
  }

  const widthV = maxVx - minVx;
  const lengthV = maxVy - minVy;
  const heightV = maxVz - minVz;
  const midVx = (minVx + maxVx) / 2;
  const midVy = (minVy + maxVy) / 2;
  const midVz = (minVz + maxVz) / 2;

  const toWorld = (vx: number, vy: number, vz: number): [number, number, number] => [
    affine[0][0] * vx + affine[0][1] * vy + affine[0][2] * vz + affine[0][3],
    affine[1][0] * vx + affine[1][1] * vy + affine[1][2] * vz + affine[1][3],
    affine[2][0] * vx + affine[2][1] * vy + affine[2][2] * vz + affine[2][3],
  ];

  // Helper to generate a parametric hemisphere
  // isLeft in BraTS voxel space: Left is +X (> midVx), Right is -X (< midVx)
  function buildHemisphere(isLeft: boolean, segmentsU = 46, segmentsV = 34): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const sideSign = isLeft ? 1 : -1;
    const rX = widthV * 0.44;
    const rY = lengthV * 0.48;
    const rZ = heightV * 0.46;
    const xCenter = midVx + sideSign * (widthV * 0.22);

    for (let iv = 0; iv <= segmentsV; iv += 1) {
      const v = iv / segmentsV;
      const phi = v * Math.PI; // 0 = superior pole, PI = inferior

      for (let iu = 0; iu <= segmentsU; iu += 1) {
        const u = iu / segmentsU;
        const theta = u * Math.PI * 2;

        const sx = Math.sin(phi) * Math.cos(theta); // lateral-medial
        const sy = Math.sin(phi) * Math.sin(theta); // anterior-posterior
        const sz = Math.cos(phi);                  // superior-inferior

        // In BraTS voxel coordinates:
        // Anterior is -Y (frontal), Posterior is +Y (occipital)
        // Medial is pointing toward midVx: for Left (sideSign=1), sx < 0 is medial.
        // For Right (sideSign=-1), sx > 0 is medial.
        const isMedial = (isLeft && sx < 0) || (!isLeft && sx > 0);

        let dx = sx * rX;
        if (isMedial) {
          dx *= 0.32; // crisp, deep longitudinal interhemispheric fissure
        } else {
          dx *= 1.05;
        }

        const dy = sy * rY;
        // Occipital pole tapering (sy > 0 is posterior in voxel space)
        if (sy > 0) {
          dx *= (1.0 - 0.20 * sy);
        }

        let dz = sz * rZ;

        // Temporal lobe expansion (inferior lateral anterior)
        if (sz < -0.05 && sy > -0.65 && sy < 0.20 && !isMedial) {
          dx += sideSign * widthV * 0.09 * (1.0 - Math.abs(sy));
          dz -= heightV * 0.08 * Math.sin(phi);
        }

        // Cortical gyri and sulci harmonic folds
        const gyri = Math.sin(dy * 0.16 + dx * 0.14) * Math.cos(dz * 0.20) * 1.6
                   + Math.sin(dy * 0.32 + dz * 0.26) * Math.cos(dx * 0.28) * 0.85;
        if (!isMedial) {
          dx += sx * gyri;
          dz += sz * gyri;
        }

        const vx = xCenter + dx;
        const vy = midVy + dy;
        const vz = midVz + dz;
        positions.push(...toWorld(vx, vy, vz));
      }
    }

    for (let iv = 0; iv < segmentsV; iv += 1) {
      for (let iu = 0; iu < segmentsU; iu += 1) {
        const a = iv * (segmentsU + 1) + iu;
        const b = (iv + 1) * (segmentsU + 1) + iu;
        const c = (iv + 1) * (segmentsU + 1) + (iu + 1);
        const d = iv * (segmentsU + 1) + (iu + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    return geom;
  }

  // Cerebellum (inferior-posterior bilateral mass)
  function buildCerebellum(segmentsU = 34, segmentsV = 22): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const rX = widthV * 0.36;
    const rY = lengthV * 0.24;
    const rZ = heightV * 0.20;
    const cVx = midVx;
    const cVy = midVy + lengthV * 0.26; // posterior
    const cVz = minVz + heightV * 0.16; // inferior

    for (let iv = 0; iv <= segmentsV; iv += 1) {
      const v = iv / segmentsV;
      const phi = v * Math.PI;

      for (let iu = 0; iu <= segmentsU; iu += 1) {
        const u = iu / segmentsU;
        const theta = u * Math.PI * 2;

        const sx = Math.sin(phi) * Math.cos(theta);
        const sy = Math.sin(phi) * Math.sin(theta);
        const sz = Math.cos(phi);

        // Bilobed shape with midline vermis notch
        let px = sx * rX * (0.85 + 0.30 * Math.abs(sx));
        let py = sy * rY;
        let pz = sz * rZ;

        // Transverse horizontal cerebellar folia
        const folia = Math.sin(sz * 8) * 0.65;
        px += sx * folia;
        py += sy * folia;

        const vx = cVx + px;
        const vy = cVy + py;
        const vz = cVz + pz;
        positions.push(...toWorld(vx, vy, vz));
      }
    }

    for (let iv = 0; iv < segmentsV; iv += 1) {
      for (let iu = 0; iu < segmentsU; iu += 1) {
        const a = iv * (segmentsU + 1) + iu;
        const b = (iv + 1) * (segmentsU + 1) + iu;
        const c = (iv + 1) * (segmentsU + 1) + (iu + 1);
        const d = iv * (segmentsU + 1) + (iu + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    return geom;
  }

  // Brainstem (pons & medulla central column)
  function buildBrainstem(segmentsU = 24, segmentsV = 18): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const rX = widthV * 0.11;
    const rY = lengthV * 0.12;
    const rZ = heightV * 0.22;
    const cVx = midVx;
    const cVy = midVy - lengthV * 0.06;
    const cVz = minVz + heightV * 0.06;

    for (let iv = 0; iv <= segmentsV; iv += 1) {
      const v = iv / segmentsV;
      const zFrac = (v - 0.5) * 2; // -1 to 1

      for (let iu = 0; iu <= segmentsU; iu += 1) {
        const u = iu / segmentsU;
        const theta = u * Math.PI * 2;

        const bulge = 1.0 + 0.35 * Math.sin(v * Math.PI); // pons anterior bulge
        const px = Math.cos(theta) * rX * bulge;
        const py = Math.sin(theta) * rY * bulge;
        const pz = zFrac * rZ;

        const vx = cVx + px;
        const vy = cVy + py;
        const vz = cVz + pz;
        positions.push(...toWorld(vx, vy, vz));
      }
    }

    for (let iv = 0; iv < segmentsV; iv += 1) {
      for (let iu = 0; iu < segmentsU; iu += 1) {
        const a = iv * (segmentsU + 1) + iu;
        const b = (iv + 1) * (segmentsU + 1) + iu;
        const c = (iv + 1) * (segmentsU + 1) + (iu + 1);
        const d = iv * (segmentsU + 1) + (iu + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    return geom;
  }

  const leftHemi = buildHemisphere(true);
  const rightHemi = buildHemisphere(false);
  const cerebellum = buildCerebellum();
  const brainstem = buildBrainstem();

  // Combined geometry
  const posLeft = leftHemi.getAttribute('position').array as Float32Array;
  const posRight = rightHemi.getAttribute('position').array as Float32Array;
  const posCb = cerebellum.getAttribute('position').array as Float32Array;
  const posBs = brainstem.getAttribute('position').array as Float32Array;

  const totalVerts = (posLeft.length + posRight.length + posCb.length + posBs.length) / 3;
  const combinedPositions = new Float32Array(totalVerts * 3);
  let offset = 0;
  combinedPositions.set(posLeft, offset); offset += posLeft.length;
  combinedPositions.set(posRight, offset); offset += posRight.length;
  combinedPositions.set(posCb, offset); offset += posCb.length;
  combinedPositions.set(posBs, offset);

  const idxLeft = Array.from(leftHemi.getIndex()!.array);
  const idxRight = Array.from(rightHemi.getIndex()!.array).map(i => i + posLeft.length / 3);
  const idxCb = Array.from(cerebellum.getIndex()!.array).map(i => i + (posLeft.length + posRight.length) / 3);
  const idxBs = Array.from(brainstem.getIndex()!.array).map(i => i + (posLeft.length + posRight.length + posCb.length) / 3);
  const combinedIndices = [...idxLeft, ...idxRight, ...idxCb, ...idxBs];

  const combined = new THREE.BufferGeometry();
  combined.setAttribute('position', new THREE.Float32BufferAttribute(combinedPositions, 3));
  combined.setIndex(combinedIndices);
  combined.computeVertexNormals();
  combined.computeBoundingSphere();

  // World bounding box
  const c0 = toWorld(minVx, minVy, minVz);
  const c1 = toWorld(maxVx, maxVy, maxVz);
  const minW: [number, number, number] = [
    Math.min(c0[0], c1[0]),
    Math.min(c0[1], c1[1]),
    Math.min(c0[2], c1[2]),
  ];
  const maxW: [number, number, number] = [
    Math.max(c0[0], c1[0]),
    Math.max(c0[1], c1[1]),
    Math.max(c0[2], c1[2]),
  ];
  const centerW: [number, number, number] = [
    (minW[0] + maxW[0]) / 2,
    (minW[1] + maxW[1]) / 2,
    (minW[2] + maxW[2]) / 2,
  ];
  const sizeW: [number, number, number] = [
    maxW[0] - minW[0],
    maxW[1] - minW[1],
    maxW[2] - minW[2],
  ];

  return {
    leftHemisphere: leftHemi,
    rightHemisphere: rightHemi,
    cerebellum,
    brainstem,
    combined,
    bounds: { min: minW, max: maxW, center: centerW, size: sizeW },
  };
}

/**
 * Returns 3D landmark points identifying contextual brain regions
 * (Frontal, Parietal, Temporal, Occipital lobes, Cerebellum, Brainstem)
 * mapped into the patient's physical world millimeter coordinates.
 */
export function getBrainLobeLandmarks(volume: NiftiVolume): AnatomicalLandmark[] {
  const [nx, ny, nz] = volume.dimensions;
  const data = volume.data;
  const affine = volume.affine;

  let minVx = nx, maxVx = -1;
  let minVy = ny, maxVy = -1;
  let minVz = nz, maxVz = -1;

  const stride = Math.max(1, Math.floor(data.length / 50000));
  for (let idx = 0; idx < data.length; idx += stride) {
    if (data[idx] > 0) {
      const vx = idx % nx;
      const vy = Math.floor(idx / nx) % ny;
      const vz = Math.floor(idx / (nx * ny));
      if (vx < minVx) minVx = vx;
      if (vx > maxVx) maxVx = vx;
      if (vy < minVy) minVy = vy;
      if (vy > maxVy) maxVy = vy;
      if (vz < minVz) minVz = vz;
      if (vz > maxVz) maxVz = vz;
    }
  }

  if (maxVx <= minVx) {
    minVx = Math.floor(nx * 0.22); maxVx = Math.floor(nx * 0.78);
    minVy = Math.floor(ny * 0.16); maxVy = Math.floor(ny * 0.86);
    minVz = Math.floor(nz * 0.08); maxVz = Math.floor(nz * 0.92);
  }

  const widthV = maxVx - minVx;
  const lengthV = maxVy - minVy;
  const heightV = maxVz - minVz;
  const midVx = (minVx + maxVx) / 2;
  const midVy = (minVy + maxVy) / 2;
  const midVz = (minVz + maxVz) / 2;

  const toWorld = (vx: number, vy: number, vz: number): [number, number, number] => [
    affine[0][0] * vx + affine[0][1] * vy + affine[0][2] * vz + affine[0][3],
    affine[1][0] * vx + affine[1][1] * vy + affine[1][2] * vz + affine[1][3],
    affine[2][0] * vx + affine[2][1] * vy + affine[2][2] * vz + affine[2][3],
  ];

  return [
    {
      id: 'frontal_left',
      name: 'Left Frontal Lobe',
      shortName: 'L. Frontal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx + widthV * 0.24, minVy + lengthV * 0.18, midVz + heightV * 0.14),
      description: 'Executive function, motor planning, and expressive speech (Broca).',
      hemisphere: 'Left',
    },
    {
      id: 'frontal_right',
      name: 'Right Frontal Lobe',
      shortName: 'R. Frontal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx - widthV * 0.24, minVy + lengthV * 0.18, midVz + heightV * 0.14),
      description: 'Behavioral regulation, spatial attention, and voluntary motor control.',
      hemisphere: 'Right',
    },
    {
      id: 'parietal_left',
      name: 'Left Parietal Lobe',
      shortName: 'L. Parietal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx + widthV * 0.26, midVy + lengthV * 0.05, maxVz - heightV * 0.12),
      description: 'Somatosensory processing, multisensory integration, and language.',
      hemisphere: 'Left',
    },
    {
      id: 'parietal_right',
      name: 'Right Parietal Lobe',
      shortName: 'R. Parietal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx - widthV * 0.26, midVy + lengthV * 0.05, maxVz - heightV * 0.12),
      description: 'Visuospatial awareness, sensory perception, and spatial mapping.',
      hemisphere: 'Right',
    },
    {
      id: 'temporal_left',
      name: 'Left Temporal Lobe',
      shortName: 'L. Temporal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx + widthV * 0.38, midVy - lengthV * 0.06, minVz + heightV * 0.22),
      description: 'Auditory processing, receptive language (Wernicke), and memory.',
      hemisphere: 'Left',
    },
    {
      id: 'temporal_right',
      name: 'Right Temporal Lobe',
      shortName: 'R. Temporal',
      category: 'Cerebrum',
      worldPos: toWorld(midVx - widthV * 0.38, midVy - lengthV * 0.06, minVz + heightV * 0.22),
      description: 'Non-verbal memory, facial recognition, and auditory integration.',
      hemisphere: 'Right',
    },
    {
      id: 'occipital',
      name: 'Occipital Pole',
      shortName: 'Occipital',
      category: 'Cerebrum',
      worldPos: toWorld(midVx, maxVy - lengthV * 0.06, midVz + heightV * 0.06),
      description: 'Primary visual cortex (calcarine fissure) and visual processing.',
      hemisphere: 'Bilateral',
    },
    {
      id: 'cerebellum',
      name: 'Cerebellum',
      shortName: 'Cerebellum',
      category: 'Cerebellum',
      worldPos: toWorld(midVx, midVy + lengthV * 0.26, minVz + heightV * 0.16),
      description: 'Motor coordination, fine balance, posture, and procedural learning.',
      hemisphere: 'Bilateral',
    },
    {
      id: 'brainstem',
      name: 'Brainstem (Pons/Medulla)',
      shortName: 'Brainstem',
      category: 'Brainstem',
      worldPos: toWorld(midVx, midVy - lengthV * 0.06, minVz + heightV * 0.06),
      description: 'Autonomic respiratory/cardiovascular control and cranial nerve nuclei.',
      hemisphere: 'Midline',
    },
  ];
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


