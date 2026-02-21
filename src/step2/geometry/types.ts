import * as THREE from "three";

export interface GeometryBuildError {
  code: string;
  message: string;
  wallId?: string;
  polygonId?: string;
  windowId?: string;
}

export interface GeometryBuildOptions {
  ceilingHeight: number;
  wallThickness: number;
}

export interface WallMeshEntry {
  wallId: string;
  mesh: THREE.Mesh;
}

export interface GeometryBuildResult {
  floorMesh: THREE.Mesh | null;
  wallMeshes: WallMeshEntry[];
  errors: GeometryBuildError[];
}

