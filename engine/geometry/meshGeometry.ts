import type { SkeletalMeshAsset, StaticMeshAsset } from '@/types';

/**
 * Recomputes AABB from current vertex positions and invalidates any cached BVH.
 *
 * IMPORTANT: Selection & picking rely on asset.geometry.aabb and asset.topology.bvh.
 * If vertices move (sculpt / vertex drag), we must update the AABB and invalidate
 * the BVH so it can be rebuilt against the new vertex positions.
 */
export function updateMeshBounds(asset: StaticMeshAsset | SkeletalMeshAsset) {
  const v = asset.geometry.vertices;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < v.length; i += 3) {
    const x = v[i],
      y = v[i + 1],
      z = v[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  asset.geometry.aabb = {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };

  // BVH is built against vertices; any deformation invalidates it.
  if ((asset as any).topology) {
    (asset as any).topology.bvh = undefined;
  }
}

/**
 * Simple smooth vertex normals from indexed triangles (in-place).
 *
 * Notes:
 * - This is intentionally simple: it creates smooth normals across shared vertices.
 * - If you need hard-edge normals, that should be handled by splitting vertices /
 *   generating separate normals per face group.
 */
export function recomputeVertexNormalsInPlace(
  vertices: Float32Array,
  indices: Uint16Array | Uint32Array | number[],
  outNormals?: Float32Array,
) {
  const normals = outNormals && outNormals.length === vertices.length ? outNormals : new Float32Array(vertices.length);
  normals.fill(0);

  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = (indices as any)[t * 3] as number;
    const i1 = (indices as any)[t * 3 + 1] as number;
    const i2 = (indices as any)[t * 3 + 2] as number;

    const o0 = i0 * 3;
    const o1 = i1 * 3;
    const o2 = i2 * 3;

    const v0x = vertices[o0],
      v0y = vertices[o0 + 1],
      v0z = vertices[o0 + 2];
    const v1x = vertices[o1],
      v1y = vertices[o1 + 1],
      v1z = vertices[o1 + 2];
    const v2x = vertices[o2],
      v2y = vertices[o2 + 1],
      v2z = vertices[o2 + 2];

    const e1x = v1x - v0x,
      e1y = v1y - v0y,
      e1z = v1z - v0z;
    const e2x = v2x - v0x,
      e2y = v2y - v0y,
      e2z = v2z - v0z;

    // Face normal (unnormalized)
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[o0] += nx;
    normals[o0 + 1] += ny;
    normals[o0 + 2] += nz;
    normals[o1] += nx;
    normals[o1 + 1] += ny;
    normals[o1 + 2] += nz;
    normals[o2] += nx;
    normals[o2 + 1] += ny;
    normals[o2 + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i],
      ny = normals[i + 1],
      nz = normals[i + 2];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;
    normals[i] = nx / l;
    normals[i + 1] = ny / l;
    normals[i + 2] = nz / l;
  }

  return normals;
}
