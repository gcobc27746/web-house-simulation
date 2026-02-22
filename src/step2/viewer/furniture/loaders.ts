import * as THREE from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import type { FurnitureCatalogItem } from "../../../types/floorplan";

const templateCache = new Map<string, Promise<THREE.Group>>();

function loadMaterials(url: string): Promise<MTLLoader.MaterialCreator> {
  const loader = new MTLLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (materials) => {
        materials.preload();
        resolve(materials);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

function loadObj(url: string, materials: MTLLoader.MaterialCreator): Promise<THREE.Group> {
  const loader = new OBJLoader();
  loader.setMaterials(materials);
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (group) => resolve(group),
      undefined,
      (error) => reject(error),
    );
  });
}

function loadDae(url: string): Promise<THREE.Group> {
  const loader = new ColladaLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (collada) => {
        if (!collada?.scene) {
          reject(new Error("DAE scene is empty"));
          return;
        }
        const group = new THREE.Group();
        group.add(collada.scene);
        resolve(group);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

export function loadFurnitureTemplate(catalog: FurnitureCatalogItem): Promise<THREE.Group> {
  const cacheKey = `${catalog.id}:${catalog.model.format}`;
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;

  const task = (async () => {
    if (catalog.model.format === "dae") {
      return loadDae(catalog.model.daeUrl);
    }
    const materials = await loadMaterials(catalog.model.mtlUrl);
    return loadObj(catalog.model.objUrl, materials);
  })();

  templateCache.set(cacheKey, task);
  return task;
}
