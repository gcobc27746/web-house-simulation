import * as THREE from "three";
import type { FloorplanData, WallSegment } from "../../types/floorplan";
import type { GeometryBuildError, WallMeshEntry } from "./types";

const MIN_WALL_LENGTH = 1e-6;

function createWallMesh(
  wall: WallSegment,
  ceilingHeight: number,
  wallThickness: number,
): THREE.Mesh {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);

  const geometry = new THREE.BoxGeometry(wallLength, ceilingHeight, wallThickness);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe8edf7,
    roughness: 0.75,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geometry, material);
  const centerX = (wall.start.x + wall.end.x) / 2;
  const centerZ = -((wall.start.y + wall.end.y) / 2);
  const yaw = Math.atan2(-dy, dx);

  mesh.position.set(centerX, ceilingHeight / 2, centerZ);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `wall-${wall.id}`;
  mesh.userData.wallId = wall.id;
  return mesh;
}

export function buildWallMeshes(
  data: FloorplanData,
  ceilingHeight: number,
  wallThickness: number,
): { wallMeshes: WallMeshEntry[]; errors: GeometryBuildError[] } {
  const wallMeshes: WallMeshEntry[] = [];
  const errors: GeometryBuildError[] = [];

  for (const wall of data.walls) {
    const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (wallLength <= MIN_WALL_LENGTH) {
      errors.push({
        code: "WALL_ZERO_LENGTH",
        message: `wall ${wall.id} 長度為 0，已略過。`,
        wallId: wall.id,
      });
      continue;
    }

    wallMeshes.push({
      wallId: wall.id,
      mesh: createWallMesh(wall, ceilingHeight, wallThickness),
    });
  }

  return { wallMeshes, errors };
}

