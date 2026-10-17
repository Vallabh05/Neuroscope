import * as THREE from 'three';
import type { NiftiVolume } from '../types';

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
  { offset: [0, 0, -1], corners: [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]] },
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
