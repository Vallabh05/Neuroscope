import * as nifti from 'nifti-reader-js';
import type { NiftiVolume } from '../types';

function typedValues(header: nifti.NIFTI1 | nifti.NIFTI2, image: ArrayBuffer): Float32Array {
  const bytesPerValue = header.numBitsPerVoxel / 8;
  if (!Number.isInteger(bytesPerValue) || bytesPerValue < 1) {
    throw new Error('The NIfTI datatype is not supported by the viewer.');
  }
  const count = image.byteLength / bytesPerValue;
  if (!Number.isInteger(count)) {
    throw new Error('NIfTI image payload has an invalid length.');
  }

  const view = new DataView(image);
  const values = new Float32Array(count);
  const littleEndian = header.littleEndian;
  const slope = Number.isFinite(header.scl_slope) && header.scl_slope !== 0
    ? header.scl_slope
    : 1;
  const intercept = Number.isFinite(header.scl_inter) ? header.scl_inter : 0;

  const readers: Record<number, (offset: number) => number> = {
    2: offset => view.getUint8(offset),
    4: offset => view.getInt16(offset, littleEndian),
    8: offset => view.getInt32(offset, littleEndian),
    16: offset => view.getFloat32(offset, littleEndian),
    64: offset => view.getFloat64(offset, littleEndian),
    256: offset => view.getInt8(offset),
    512: offset => view.getUint16(offset, littleEndian),
    768: offset => view.getUint32(offset, littleEndian),
  };
  const readValue = readers[header.datatypeCode];
  if (!readValue) {
    throw new Error(`NIfTI datatype ${header.datatypeCode} is not supported by the viewer.`);
  }
  for (let index = 0; index < count; index += 1) {
    values[index] = readValue(index * bytesPerValue) * slope + intercept;
  }
  return values;
}

function toArrayBuffer(data: ArrayBufferLike): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return new Uint8Array(data).slice().buffer;
}

export async function parseNifti(
  file: File | Blob,
  options: { labels?: boolean } = {},
): Promise<NiftiVolume> {
  let data = await file.arrayBuffer();
  if (nifti.isCompressed(data)) {
    data = toArrayBuffer(nifti.decompress(data));
  }
  const header = nifti.readHeader(data);
  if (!header) {
    throw new Error('Could not read the NIfTI header.');
  }
  const dimensions = [
    Number(header.dims[1]),
    Number(header.dims[2]),
    Number(header.dims[3]),
  ] as [number, number, number];
  if (
    header.dims[0] !== 3 ||
    dimensions.some(value => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new Error('The viewer requires a three-dimensional NIfTI volume.');
  }
  const expectedVoxels = dimensions.reduce((total, value) => total * value, 1);
  const imageBytes = nifti.readImage(header, data);
  const values = typedValues(header, imageBytes);
  if (values.length !== expectedVoxels) {
    throw new Error('NIfTI image dimensions do not match its voxel payload.');
  }
  if (!header.affine || header.affine.length !== 4) {
    throw new Error('The NIfTI image does not contain a usable spatial affine.');
  }
  const affine = header.affine.map(row => row.map(Number));
  if (!affine.flat().every(Number.isFinite)) {
    throw new Error('NIfTI affine contains non-finite coordinates.');
  }
  const spacing = [0, 1, 2].map(axis => Math.hypot(
    affine[0][axis],
    affine[1][axis],
    affine[2][axis],
  )) as [number, number, number];
  if (!spacing.every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('NIfTI affine has invalid voxel spacing.');
  }

  let output: Float32Array | Uint8Array;
  let displayRange: [number, number] | undefined;
  if (options.labels) {
    const labels = new Uint8Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value) || ![0, 1, 2, 4].includes(value)) {
        throw new Error('Segmentation NIfTI contains unsupported label values.');
      }
      labels[index] = value;
    }
    output = labels;
  } else {
    if (!values.every(Number.isFinite)) {
      throw new Error('MRI image contains non-finite intensities.');
    }
    output = values;
    const sampled: number[] = [];
    const stride = Math.max(1, Math.floor(values.length / 100000));
    for (let index = 0; index < values.length; index += stride) {
      if (values[index] !== 0) sampled.push(values[index]);
    }
    sampled.sort((left, right) => left - right);
    if (sampled.length) {
      const lower = sampled[Math.floor((sampled.length - 1) * 0.01)];
      const upper = sampled[Math.floor((sampled.length - 1) * 0.99)];
      displayRange = upper > lower ? [lower, upper] : [lower, lower + 1];
    } else {
      displayRange = [0, 1];
    }
  }

  return {
    dimensions,
    spacing_mm: spacing,
    affine,
    data: output,
    display_range: displayRange,
  };
}

export function assertSameGrid(left: NiftiVolume, right: NiftiVolume): void {
  if (
    left.dimensions.some((value, index) => value !== right.dimensions[index]) ||
    left.affine.some((row, rowIndex) =>
      row.some((value, columnIndex) =>
        Math.abs(value - right.affine[rowIndex][columnIndex]) > 1e-3,
      ),
    )
  ) {
    throw new Error('The downloaded segmentation grid does not match the uploaded MRI.');
  }
}
