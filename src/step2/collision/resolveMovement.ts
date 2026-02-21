import * as THREE from "three";
import type { CollisionData, CollisionWallData } from "./buildCollisionData";

export interface ResolveMovementInput {
  currentPosition: THREE.Vector3;
  predictedPosition: THREE.Vector3;
  collisionRadius: number;
  collisionData: CollisionData;
}

export interface ResolveMovementResult {
  position: THREE.Vector3;
  hit: boolean;
}

const EPSILON = 1e-6;
const ITERATION_COUNT = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isWallRelevant(wall: CollisionWallData, point: THREE.Vector2, radius: number, cameraY: number): boolean {
  if (cameraY < wall.minY - radius || cameraY > wall.maxY + radius) return false;
  if (point.x < wall.aabbMin.x - radius || point.x > wall.aabbMax.x + radius) return false;
  if (point.y < wall.aabbMin.y - radius || point.y > wall.aabbMax.y + radius) return false;
  return true;
}

function signWithFallback(value: number, fallback: number): number {
  if (value > EPSILON) return 1;
  if (value < -EPSILON) return -1;
  if (fallback > EPSILON) return 1;
  if (fallback < -EPSILON) return -1;
  return 1;
}

function resolveOneWall(
  wall: CollisionWallData,
  point: THREE.Vector2,
  delta: THREE.Vector2,
  radius: number,
): THREE.Vector2 | null {
  const relativeX = point.x - wall.center.x;
  const relativeZ = point.y - wall.center.y;
  const localT = relativeX * wall.tangent.x + relativeZ * wall.tangent.y;
  const localN = relativeX * wall.normal.x + relativeZ * wall.normal.y;

  const closestT = clamp(localT, -wall.halfLength, wall.halfLength);
  const closestN = clamp(localN, -wall.halfThickness, wall.halfThickness);
  const diffT = localT - closestT;
  const diffN = localN - closestN;
  const distanceSq = diffT * diffT + diffN * diffN;
  const radiusSq = radius * radius;

  if (distanceSq >= radiusSq - EPSILON) return null;

  if (distanceSq > EPSILON) {
    const distance = Math.sqrt(distanceSq);
    const push = radius - distance;
    const localDirT = diffT / distance;
    const localDirN = diffN / distance;
    return new THREE.Vector2(
      wall.tangent.x * localDirT * push + wall.normal.x * localDirN * push,
      wall.tangent.y * localDirT * push + wall.normal.y * localDirN * push,
    );
  }

  const penetrationToSide = wall.halfThickness + radius - Math.abs(localN);
  const penetrationToCap = wall.halfLength + radius - Math.abs(localT);
  const deltaAlongNormal = delta.x * wall.normal.x + delta.y * wall.normal.y;
  const deltaAlongTangent = delta.x * wall.tangent.x + delta.y * wall.tangent.y;

  if (penetrationToSide <= penetrationToCap) {
    const sideSign = signWithFallback(localN, deltaAlongNormal);
    const targetN = sideSign * (wall.halfThickness + radius);
    const localPushN = targetN - localN;
    return new THREE.Vector2(wall.normal.x * localPushN, wall.normal.y * localPushN);
  }

  const capSign = signWithFallback(localT, deltaAlongTangent);
  const targetT = capSign * (wall.halfLength + radius);
  const localPushT = targetT - localT;
  return new THREE.Vector2(wall.tangent.x * localPushT, wall.tangent.y * localPushT);
}

export function resolveMovement(input: ResolveMovementInput): ResolveMovementResult {
  const radius = Math.max(input.collisionRadius, EPSILON);
  const point = new THREE.Vector2(input.predictedPosition.x, input.predictedPosition.z);
  const current = new THREE.Vector2(input.currentPosition.x, input.currentPosition.z);
  const delta = point.clone().sub(current);
  let hit = false;

  for (let iteration = 0; iteration < ITERATION_COUNT; iteration += 1) {
    let moved = false;
    for (const wall of input.collisionData.walls) {
      if (!isWallRelevant(wall, point, radius, input.predictedPosition.y)) continue;
      const correction = resolveOneWall(wall, point, delta, radius);
      if (!correction) continue;
      point.add(correction);
      moved = true;
      hit = true;
    }
    if (!moved) break;
  }

  return {
    position: new THREE.Vector3(point.x, input.predictedPosition.y, point.y),
    hit,
  };
}
