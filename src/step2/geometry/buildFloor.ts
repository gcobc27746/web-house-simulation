import * as THREE from "three";
import type { FloorplanData } from "../../types/floorplan";

export function buildFloorMesh(data: FloorplanData): THREE.Mesh | null {
  const closedPolygons = data.polygons.filter(
    (polygon) => polygon.closed && polygon.vertices.length >= 3,
  );

  if (closedPolygons.length === 0) {
    return null;
  }

  const shapes = closedPolygons.map((polygon) => {
    const shape = new THREE.Shape();
    const [first, ...rest] = polygon.vertices;
    shape.moveTo(first.x, first.y);
    for (const vertex of rest) {
      shape.lineTo(vertex.x, vertex.y);
    }
    shape.closePath();
    return shape;
  });

  const floorGeometry = new THREE.ShapeGeometry(shapes);
  // Keep 2D Y direction aligned with 3D Z direction (avoid mirrored layout).
  floorGeometry.rotateX(Math.PI / 2);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xb3d7ff,
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0.1,
  });

  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.name = "floorMesh";
  floorMesh.receiveShadow = true;
  floorMesh.userData.polygonIds = closedPolygons.map((polygon) => polygon.id);
  return floorMesh;
}

