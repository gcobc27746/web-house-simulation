import * as THREE from "three";
import type { WallMeshEntry } from "../geometry";
import type { FloorplanData, WindowOpening } from "../../types/floorplan";

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface CollisionWallData {
  id: string;
  source: "wall" | "window";
  center: THREE.Vector2;
  tangent: THREE.Vector2;
  normal: THREE.Vector2;
  halfLength: number;
  halfThickness: number;
  minY: number;
  maxY: number;
  aabbMin: THREE.Vector2;
  aabbMax: THREE.Vector2;
}

export interface CollisionData {
  walls: CollisionWallData[];
}

export interface CollisionBuildOptions {
  floorplanData?: FloorplanData;
  wallThickness?: number;
  ceilingHeight?: number;
}
const PASSABLE_WINDOW_TYPES = new Set<WindowOpening["type"]>(["floor"]);

function createAabb(
  center: THREE.Vector2,
  tangent: THREE.Vector2,
  normal: THREE.Vector2,
  halfLength: number,
  halfThickness: number,
) {
  const extentX = Math.abs(tangent.x) * halfLength + Math.abs(normal.x) * halfThickness;
  const extentZ = Math.abs(tangent.y) * halfLength + Math.abs(normal.y) * halfThickness;
  return {
    min: new THREE.Vector2(center.x - extentX, center.y - extentZ),
    max: new THREE.Vector2(center.x + extentX, center.y + extentZ),
  };
}

function pushCollisionBox(
  walls: CollisionWallData[],
  id: string,
  source: "wall" | "window",
  center: THREE.Vector2,
  tangent: THREE.Vector2,
  normal: THREE.Vector2,
  halfLength: number,
  halfThickness: number,
  minY: number,
  maxY: number,
) {
  const aabb = createAabb(center, tangent, normal, halfLength, halfThickness);
  walls.push({
    id,
    source,
    center,
    tangent,
    normal,
    halfLength,
    halfThickness,
    minY,
    maxY,
    aabbMin: aabb.min,
    aabbMax: aabb.max,
  });
}

function resolveOpeningTop(windowOpening: WindowOpening, ceilingHeight: number): number {
  if (windowOpening.type === "balcony") return ceilingHeight;
  return Math.min(ceilingHeight, windowOpening.sillHeight + windowOpening.openingHeight);
}

export function buildCollisionData(
  wallMeshes: WallMeshEntry[],
  options: CollisionBuildOptions = {},
): CollisionData {
  const walls: CollisionWallData[] = [];

  for (const wallMesh of wallMeshes) {
    const { mesh, wallId } = wallMesh;
    const geometry = mesh.geometry as THREE.BoxGeometry;
    const params = geometry.parameters;
    const width = typeof params.width === "number" ? params.width : 0;
    const depth = typeof params.depth === "number" ? params.depth : 0;
    const height = typeof params.height === "number" ? params.height : 0;
    if (width <= 0 || depth <= 0 || height <= 0) continue;

    const tangent3 = X_AXIS.clone().applyQuaternion(mesh.quaternion).normalize();
    const normal3 = Z_AXIS.clone().applyQuaternion(mesh.quaternion).normalize();
    const tangent = new THREE.Vector2(tangent3.x, tangent3.z).normalize();
    const normal = new THREE.Vector2(normal3.x, normal3.z).normalize();
    const center = new THREE.Vector2(mesh.position.x, mesh.position.z);
    const halfLength = width / 2;
    const halfThickness = depth / 2;
    pushCollisionBox(
      walls,
      `${wallId}-${mesh.uuid}`,
      "wall",
      center,
      tangent,
      normal,
      halfLength,
      halfThickness,
      mesh.position.y - height / 2,
      mesh.position.y + height / 2,
    );
  }

  if (options.floorplanData && options.wallThickness && options.ceilingHeight) {
    const wallById = new Map(options.floorplanData.walls.map((wall) => [wall.id, wall]));
    for (const opening of options.floorplanData.windows ?? []) {
      if (PASSABLE_WINDOW_TYPES.has(opening.type)) continue;
      const wall = wallById.get(opening.wallId);
      if (!wall) continue;

      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.y - wall.start.y;
      const wallLength = Math.hypot(dx, dz);
      if (wallLength <= 1e-6) continue;

      const startOffset = Math.max(0, Math.min(opening.startOffset, wallLength));
      const endOffset = Math.max(0, Math.min(opening.endOffset, wallLength));
      const openingLength = endOffset - startOffset;
      if (openingLength <= 1e-6) continue;

      const minY = Math.max(0, opening.sillHeight);
      const maxY = resolveOpeningTop(opening, options.ceilingHeight);
      if (maxY - minY <= 1e-6) continue;

      const ux = dx / wallLength;
      const uz = dz / wallLength;
      const centerOffset = (startOffset + endOffset) / 2;
      const center = new THREE.Vector2(
        wall.start.x + ux * centerOffset,
        wall.start.y + uz * centerOffset,
      );
      const tangent = new THREE.Vector2(ux, uz);
      const normal = new THREE.Vector2(-uz, ux);
      pushCollisionBox(
        walls,
        `window-${opening.id}`,
        "window",
        center,
        tangent,
        normal,
        openingLength / 2,
        options.wallThickness / 2,
        minY,
        maxY,
      );
    }
  }

  return { walls };
}
