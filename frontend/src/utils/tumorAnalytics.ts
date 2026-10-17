import type { SegmentationResult } from '../types';
import { voxelToWorld } from './coordinates';

export interface TumorAnalytics {
  voxelVolumeMm3: number;
  voxelVolumeMl: number;
  counts: {
    background: number;
    ncr: number;
    edema: number;
    et: number;
    tc: number;
    wt: number;
  };
  volumes: {
    wt: { ml: number; mm3: number; count: number };
    tc: { ml: number; mm3: number; count: number };
    et: { ml: number; mm3: number; count: number };
    ncr: { ml: number; mm3: number; count: number };
    edema: { ml: number; mm3: number; count: number };
  };
  ratios: {
    enhancingFraction: number; // ET / TC %
    coreToWholeRatio: number;  // TC / WT %
    edemaToCoreRatio: number;  // ED / TC
    necroticFraction: number;  // NCR / TC %
    edemaFraction: number;     // ED / WT %
  };
  centroids: {
    wt: { voxel: [number, number, number]; world: [number, number, number] };
    tc: { voxel: [number, number, number]; world: [number, number, number] };
    et: { voxel: [number, number, number]; world: [number, number, number] };
    ncr: { voxel: [number, number, number]; world: [number, number, number] };
    ed: { voxel: [number, number, number]; world: [number, number, number] };
  };
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
    sizeVoxels: [number, number, number];
    sizeMm: [number, number, number];
  } | null;
  maxDiameter3dMm: number;
  maxAxialDiameterMm: number;
  profiles: {
    axial: Uint32Array;
    coronal: Uint32Array;
    sagittal: Uint32Array;
    peaks: {
      axial: { slice: number; count: number };
      coronal: { slice: number; count: number };
      sagittal: { slice: number; count: number };
    };
  };
}

export function calculateTumorAnalytics(result: SegmentationResult): TumorAnalytics {
  const maskData = result.mask.data as Uint8Array;
  const [dimX, dimY, dimZ] = result.dimensions;
  const affine = result.affine;
  const voxelSpacing = result.voxel_spacing_mm;

  // Affine determinant for voxel volume in mm3
  const a = affine;
  const voxelVolumeMm3 = Math.abs(
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]),
  );

  let count0 = 0;
  let count1 = 0; // NCR/NET (Label 1)
  let count2 = 0; // ED (Label 2)
  let count4 = 0; // ET (Label 4)

  let sumX_wt = 0, sumY_wt = 0, sumZ_wt = 0, count_wt = 0;
  let sumX_tc = 0, sumY_tc = 0, sumZ_tc = 0, count_tc = 0;
  let sumX_et = 0, sumY_et = 0, sumZ_et = 0;
  let sumX_ncr = 0, sumY_ncr = 0, sumZ_ncr = 0;
  let sumX_ed = 0, sumY_ed = 0, sumZ_ed = 0;

  let minX = dimX, maxX = -1;
  let minY = dimY, maxY = -1;
  let minZ = dimZ, maxZ = -1;

  const axialProfile = new Uint32Array(dimZ);
  const coronalProfile = new Uint32Array(dimY);
  const sagittalProfile = new Uint32Array(dimX);

  for (let z = 0; z < dimZ; z++) {
    for (let y = 0; y < dimY; y++) {
      const rowOffset = (y + dimY * z) * dimX;
      for (let x = 0; x < dimX; x++) {
        const label = maskData[rowOffset + x];
        if (label === 0) {
          count0++;
          continue;
        }

        count_wt++;
        sumX_wt += x;
        sumY_wt += y;
        sumZ_wt += z;

        axialProfile[z]++;
        coronalProfile[y]++;
        sagittalProfile[x]++;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;

        if (label === 1) {
          count1++;
          sumX_ncr += x;
          sumY_ncr += y;
          sumZ_ncr += z;
          count_tc++;
          sumX_tc += x;
          sumY_tc += y;
          sumZ_tc += z;
        } else if (label === 2) {
          count2++;
          sumX_ed += x;
          sumY_ed += y;
          sumZ_ed += z;
        } else if (label === 4) {
          count4++;
          sumX_et += x;
          sumY_et += y;
          sumZ_et += z;
          count_tc++;
          sumX_tc += x;
          sumY_tc += y;
          sumZ_tc += z;
        }
      }
    }
  }

  const calcCentroid = (
    sumX: number,
    sumY: number,
    sumZ: number,
    count: number,
  ): { voxel: [number, number, number]; world: [number, number, number] } => {
    if (count === 0) {
      const mid: [number, number, number] = [
        Math.floor(dimX / 2),
        Math.floor(dimY / 2),
        Math.floor(dimZ / 2),
      ];
      return { voxel: mid, world: voxelToWorld(mid, affine) };
    }
    const v: [number, number, number] = [
      Math.round(sumX / count),
      Math.round(sumY / count),
      Math.round(sumZ / count),
    ];
    return { voxel: v, world: voxelToWorld(v, affine) };
  };

  const centroidWT = calcCentroid(sumX_wt, sumY_wt, sumZ_wt, count_wt);
  const centroidTC = calcCentroid(sumX_tc, sumY_tc, sumZ_tc, count_tc);
  const centroidET = calcCentroid(sumX_et, sumY_et, sumZ_et, count4);
  const centroidNCR = calcCentroid(sumX_ncr, sumY_ncr, sumZ_ncr, count1);
  const centroidED = calcCentroid(sumX_ed, sumY_ed, sumZ_ed, count2);

  const hasTumor = count_wt > 0;
  const bbox = hasTumor
    ? {
        min: [minX, minY, minZ] as [number, number, number],
        max: [maxX, maxY, maxZ] as [number, number, number],
        sizeVoxels: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1] as [number, number, number],
        sizeMm: [
          (maxX - minX + 1) * voxelSpacing[0],
          (maxY - minY + 1) * voxelSpacing[1],
          (maxZ - minZ + 1) * voxelSpacing[2],
        ] as [number, number, number],
      }
    : null;

  const maxDiameter3dMm = bbox ? Math.hypot(...bbox.sizeMm) : 0;
  const maxAxialDiameterMm = bbox ? Math.hypot(bbox.sizeMm[0], bbox.sizeMm[1]) : 0;

  let peakAxial = 0, maxAxialCount = 0;
  for (let z = 0; z < dimZ; z++) {
    if (axialProfile[z] > maxAxialCount) {
      maxAxialCount = axialProfile[z];
      peakAxial = z;
    }
  }

  let peakCoronal = 0, maxCoronalCount = 0;
  for (let y = 0; y < dimY; y++) {
    if (coronalProfile[y] > maxCoronalCount) {
      maxCoronalCount = coronalProfile[y];
      peakCoronal = y;
    }
  }

  let peakSagittal = 0, maxSagittalCount = 0;
  for (let x = 0; x < dimX; x++) {
    if (sagittalProfile[x] > maxSagittalCount) {
      maxSagittalCount = sagittalProfile[x];
      peakSagittal = x;
    }
  }

  return {
    voxelVolumeMm3,
    voxelVolumeMl: voxelVolumeMm3 / 1000,
    counts: {
      background: count0,
      ncr: count1,
      edema: count2,
      et: count4,
      tc: count_tc,
      wt: count_wt,
    },
    volumes: {
      wt: { ml: (count_wt * voxelVolumeMm3) / 1000, mm3: count_wt * voxelVolumeMm3, count: count_wt },
      tc: { ml: (count_tc * voxelVolumeMm3) / 1000, mm3: count_tc * voxelVolumeMm3, count: count_tc },
      et: { ml: (count4 * voxelVolumeMm3) / 1000, mm3: count4 * voxelVolumeMm3, count: count4 },
      ncr: { ml: (count1 * voxelVolumeMm3) / 1000, mm3: count1 * voxelVolumeMm3, count: count1 },
      edema: { ml: (count2 * voxelVolumeMm3) / 1000, mm3: count2 * voxelVolumeMm3, count: count2 },
    },
    ratios: {
      enhancingFraction: count_tc > 0 ? (count4 / count_tc) * 100 : 0,
      coreToWholeRatio: count_wt > 0 ? (count_tc / count_wt) * 100 : 0,
      edemaToCoreRatio: count_tc > 0 ? count2 / count_tc : 0,
      necroticFraction: count_tc > 0 ? (count1 / count_tc) * 100 : 0,
      edemaFraction: count_wt > 0 ? (count2 / count_wt) * 100 : 0,
    },
    centroids: {
      wt: centroidWT,
      tc: centroidTC,
      et: centroidET,
      ncr: centroidNCR,
      ed: centroidED,
    },
    bbox,
    maxDiameter3dMm,
    maxAxialDiameterMm,
    profiles: {
      axial: axialProfile,
      coronal: coronalProfile,
      sagittal: sagittalProfile,
      peaks: {
        axial: { slice: peakAxial, count: maxAxialCount },
        coronal: { slice: peakCoronal, count: maxCoronalCount },
        sagittal: { slice: peakSagittal, count: maxSagittalCount },
      },
    },
  };
}
