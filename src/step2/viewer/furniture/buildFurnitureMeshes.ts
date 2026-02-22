import * as THREE from "three";
import { getFurnitureCatalogItem } from "../../../furniture/catalog";
import type { FurnitureItem } from "../../../types/floorplan";
import { loadFurnitureTemplate } from "./loaders";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((item) => item.clone());
  }
  return material.clone();
}

function cloneTemplate(template: THREE.Group): THREE.Group {
  const clone = template.clone(true);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry = mesh.geometry.clone();
      mesh.material = cloneMaterial(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return clone;
}

export async function buildFurnitureMeshes(items: FurnitureItem[]): Promise<THREE.Group[]> {
  const meshes: THREE.Group[] = [];

  for (const item of items) {
    const catalog = getFurnitureCatalogItem(item.catalogId);
    if (!catalog) continue;

    const template = await loadFurnitureTemplate(catalog);
    const instance = cloneTemplate(template);
    const baseCorrection =
      catalog.model.format === "obj"
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
        : new THREE.Quaternion();
    const yawAroundWorldUp = new THREE.Quaternion().setFromAxisAngle(
      WORLD_UP,
      (-item.rotationDeg * Math.PI) / 180,
    );
    // OBJ 需先做座標系校正；DAE（含 up-axis 資訊）不再額外做 -90 度修正。
    instance.quaternion.copy(yawAroundWorldUp).multiply(baseCorrection);

    const width = item.width > 0 ? item.width : catalog.footprint.width;
    const depth = item.depth > 0 ? item.depth : catalog.footprint.depth;
    const sx = width / catalog.model.sourceSize.width;
    const sz = depth / catalog.model.sourceSize.depth;
    const sy = catalog.model.targetHeight / catalog.model.sourceSize.height;
    instance.scale.set(sx, sy, sz);

    const bounds = new THREE.Box3().setFromObject(instance);
    const floorOffset = Number.isFinite(bounds.min.y) ? -bounds.min.y : 0;
    instance.position.set(item.position.x, floorOffset, item.position.y);
    instance.name = `furniture-${item.id}`;

    meshes.push(instance);
  }

  return meshes;
}
