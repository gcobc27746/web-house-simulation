import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FloorplanData } from "../../types/floorplan";
import { buildGeometryFromFloorplan } from "../geometry";

interface GeometryPreviewProps {
  floorplanData: FloorplanData;
  ceilingHeight: number;
  wallThickness: number;
}

const RENDER_BG = 0xf4f7ff;

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

function disposeObject3D(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh;
  if (mesh.geometry) {
    mesh.geometry.dispose();
  }
  if (mesh.material) {
    disposeMaterial(mesh.material);
  }
}

export function GeometryPreview({
  floorplanData,
  ceilingHeight,
  wallThickness,
}: GeometryPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const contentRootRef = useRef<THREE.Group | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;

    const width = Math.max(mountElement.clientWidth, 320);
    const height = 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(RENDER_BG);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    camera.position.set(8, 7, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.75);
    directionalLight.position.set(8, 12, 6);
    scene.add(directionalLight);

    const grid = new THREE.GridHelper(40, 40, 0xa8b7d7, 0xd8e2f7);
    scene.add(grid);

    const axesHelper = new THREE.AxesHelper(1.6);
    axesHelper.position.set(0, 0.01, 0);
    scene.add(axesHelper);

    const contentRoot = new THREE.Group();
    scene.add(contentRoot);

    mountElement.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    contentRootRef.current = contentRoot;

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.max(entries[0]?.contentRect.width ?? width, 320);
      const nextHeight = height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      renderer.render(scene, camera);
    });
    resizeObserver.observe(mountElement);
    renderer.render(scene, camera);

    return () => {
      resizeObserver.disconnect();
      contentRoot.traverse(disposeObject3D);
      scene.remove(contentRoot);
      if (renderer.domElement.parentElement === mountElement) {
        mountElement.removeChild(renderer.domElement);
      }
      renderer.dispose();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      contentRootRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const contentRoot = contentRootRef.current;
    if (!scene || !camera || !renderer || !contentRoot) return;

    while (contentRoot.children.length > 0) {
      const child = contentRoot.children[0];
      contentRoot.remove(child);
      child.traverse(disposeObject3D);
    }

    const result = buildGeometryFromFloorplan(floorplanData, {
      ceilingHeight,
      wallThickness,
    });

    if (result.floorMesh) {
      contentRoot.add(result.floorMesh);
    }
    for (const wallEntry of result.wallMeshes) {
      contentRoot.add(wallEntry.mesh);
    }

    if (contentRoot.children.length > 0) {
      const bounds = new THREE.Box3().setFromObject(contentRoot);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 1) * 1.1;
      camera.position.set(center.x + radius, center.y + radius * 0.8, center.z + radius);
      camera.lookAt(center);
    } else {
      camera.position.set(8, 7, 8);
      camera.lookAt(0, 0, 0);
    }

    setErrors(result.errors.map((error) => error.message));
    renderer.render(scene, camera);
  }, [ceilingHeight, floorplanData, wallThickness]);

  return (
    <section className="panel geometry-preview">
      <h3>Step2 2.4 幾何預覽</h3>
      <div ref={mountRef} className="geometry-canvas" />
      {errors.length > 0 && (
        <div className="error-box geometry-errors">
          <div>
            <strong>幾何錯誤</strong>
            <ul>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

