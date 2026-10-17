export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatVolume(ml: number): string {
  return `${ml.toFixed(2)} mL`;
}

// Transform voxel coordinate (i, j, k) to world physical coordinate (x, y, z) in mm using 4x4 affine matrix
export function voxelToWorld(
  voxel: [number, number, number],
  affine: number[][]
): [number, number, number] {
  const [i, j, k] = voxel;
  const x = affine[0][0] * i + affine[0][1] * j + affine[0][2] * k + affine[0][3];
  const y = affine[1][0] * i + affine[1][1] * j + affine[1][2] * k + affine[1][3];
  const z = affine[2][0] * i + affine[2][1] * j + affine[2][2] * k + affine[2][3];
  return [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2)), parseFloat(z.toFixed(2))];
}

// Invert 4x4 affine matrix (for standard orthogonal affine with translation) to convert world coordinates to voxel indices
export function worldToVoxel(
  world: [number, number, number],
  affine: number[][]
): [number, number, number] {
  const [x, y, z] = world;
  const matrix = affine.slice(0, 3).map(row => row.slice(0, 3));
  const translated = [
    x - affine[0][3],
    y - affine[1][3],
    z - affine[2][3],
  ];
  const [a, b, c] = matrix;
  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error('Cannot map world coordinates through a singular NIfTI affine.');
  }
  const inverse = [
    [
      (b[1] * c[2] - b[2] * c[1]) / determinant,
      (a[2] * c[1] - a[1] * c[2]) / determinant,
      (a[1] * b[2] - a[2] * b[1]) / determinant,
    ],
    [
      (b[2] * c[0] - b[0] * c[2]) / determinant,
      (a[0] * c[2] - a[2] * c[0]) / determinant,
      (a[2] * b[0] - a[0] * b[2]) / determinant,
    ],
    [
      (b[0] * c[1] - b[1] * c[0]) / determinant,
      (a[1] * c[0] - a[0] * c[1]) / determinant,
      (a[0] * b[1] - a[1] * b[0]) / determinant,
    ],
  ];
  return inverse.map(row => Math.round(
    row[0] * translated[0] +
    row[1] * translated[1] +
    row[2] * translated[2],
  )) as [number, number, number];
}
