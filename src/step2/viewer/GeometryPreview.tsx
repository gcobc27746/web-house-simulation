import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { FloorplanData } from "../../types/floorplan";
import { buildGeometryFromFloorplan } from "../geometry";

interface GeometryPreviewProps {
  floorplanData: FloorplanData;
  ceilingHeight: number;
  wallThickness: number;
  cameraHeight: number;
  moveSpeed: number;
  lookSensitivity: number;
}

const RENDER_BG = 0xf4f7ff;
const DEFAULT_CANVAS_HEIGHT = 520;
const PREVIEW_CAMERA_POSITION = new THREE.Vector3(8, 7, 8);

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
  cameraHeight,
  moveSpeed,
  lookSensitivity,
}: GeometryPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const contentRootRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousTimestampRef = useRef<number | null>(null);
  const shouldAnimateRef = useRef(false);
  const isFirstPersonModeRef = useRef(false);
  const isPointerLockedRef = useRef(false);
  const keyStateRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const lastSceneCenterRef = useRef(new THREE.Vector3(0, 0, 0));
  const previewLookAtRef = useRef(new THREE.Vector3(0, 0, 0));
  const [errors, setErrors] = useState<string[]>([]);
  const [isFirstPersonMode, setIsFirstPersonMode] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const renderScene = () => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!scene || !camera || !renderer) return;
    renderer.render(scene, camera);
  };

  const resetToPreviewCamera = () => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.position.copy(PREVIEW_CAMERA_POSITION);
    camera.lookAt(previewLookAtRef.current);
  };

  const resetFirstPersonPose = () => {
    const camera = cameraRef.current;
    if (!camera) return;

    camera.position.set(
      lastSceneCenterRef.current.x,
      cameraHeight,
      lastSceneCenterRef.current.z + 1.2,
    );
    camera.lookAt(lastSceneCenterRef.current.x, cameraHeight, lastSceneCenterRef.current.z);
  };

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;

    const width = Math.max(mountElement.clientWidth, 320);
    const height = DEFAULT_CANVAS_HEIGHT;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(RENDER_BG);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    camera.position.copy(PREVIEW_CAMERA_POSITION);
    camera.lookAt(previewLookAtRef.current);

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

    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.pointerSpeed = lookSensitivity;

    const onControlLock = () => {
      isPointerLockedRef.current = true;
      setIsPointerLocked(true);
    };
    const onControlUnlock = () => {
      isPointerLockedRef.current = false;
      setIsPointerLocked(false);
      if (isFirstPersonModeRef.current) {
        isFirstPersonModeRef.current = false;
        setIsFirstPersonMode(false);
      }
    };

    controls.addEventListener("lock", onControlLock);
    controls.addEventListener("unlock", onControlUnlock);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyW") keyStateRef.current.forward = true;
      if (event.code === "KeyS") keyStateRef.current.backward = true;
      if (event.code === "KeyA") keyStateRef.current.left = true;
      if (event.code === "KeyD") keyStateRef.current.right = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyW") keyStateRef.current.forward = false;
      if (event.code === "KeyS") keyStateRef.current.backward = false;
      if (event.code === "KeyA") keyStateRef.current.left = false;
      if (event.code === "KeyD") keyStateRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    mountElement.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    contentRootRef.current = contentRoot;
    controlsRef.current = controls;
    shouldAnimateRef.current = true;

    const worldForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const upVector = new THREE.Vector3(0, 1, 0);
    const moveDirection = new THREE.Vector3();

    const animate = (timestamp: number) => {
      if (!shouldAnimateRef.current) return;

      const previous = previousTimestampRef.current;
      const delta = previous === null ? 0 : (timestamp - previous) / 1000;
      previousTimestampRef.current = timestamp;

      if (
        delta > 0 &&
        isFirstPersonModeRef.current &&
        isPointerLockedRef.current &&
        controlsRef.current
      ) {
        controlsRef.current.getDirection(worldForward);
        worldForward.y = 0;
        if (worldForward.lengthSq() > 0) {
          worldForward.normalize();
        }
        rightVector.crossVectors(worldForward, upVector).normalize();

        moveDirection.set(0, 0, 0);
        if (keyStateRef.current.forward) moveDirection.add(worldForward);
        if (keyStateRef.current.backward) moveDirection.sub(worldForward);
        if (keyStateRef.current.right) moveDirection.add(rightVector);
        if (keyStateRef.current.left) moveDirection.sub(rightVector);

        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();
          camera.position.addScaledVector(moveDirection, moveSpeed * delta);
          camera.position.y = cameraHeight;
        }
      }

      renderer.render(scene, camera);
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.max(entries[0]?.contentRect.width ?? width, 320);
      const nextHeight = height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mountElement);
    renderScene();

    return () => {
      shouldAnimateRef.current = false;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      previousTimestampRef.current = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      controls.removeEventListener("lock", onControlLock);
      controls.removeEventListener("unlock", onControlUnlock);
      controls.unlock();
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
      controlsRef.current = null;
    };
  }, [cameraHeight, lookSensitivity, moveSpeed]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.pointerSpeed = lookSensitivity;
    }
  }, [lookSensitivity]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const contentRoot = contentRootRef.current;
    if (!scene || !camera || !contentRoot) return;

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
      lastSceneCenterRef.current.copy(center);
      previewLookAtRef.current.copy(center);
      const radius = Math.max(size.x, size.y, size.z, 1) * 1.1;
      if (!isFirstPersonModeRef.current) {
        camera.position.set(center.x + radius, center.y + radius * 0.8, center.z + radius);
        camera.lookAt(center);
      }
    } else {
      lastSceneCenterRef.current.set(0, 0, 0);
      previewLookAtRef.current.set(0, 0, 0);
      if (!isFirstPersonModeRef.current) {
        resetToPreviewCamera();
      }
    }

    setErrors(result.errors.map((error) => error.message));
    renderScene();
  }, [ceilingHeight, floorplanData, wallThickness]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    if (isFirstPersonMode) {
      resetFirstPersonPose();
    } else {
      resetToPreviewCamera();
      if (controlsRef.current?.isLocked) {
        controlsRef.current.unlock();
      }
    }
    renderScene();
  }, [cameraHeight, isFirstPersonMode]);

  const onToggleFirstPersonMode = () => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isFirstPersonModeRef.current) {
      isFirstPersonModeRef.current = false;
      setIsFirstPersonMode(false);
      controls.unlock();
      return;
    }

    isFirstPersonModeRef.current = true;
    setIsFirstPersonMode(true);
    resetFirstPersonPose();
    controls.lock();
  };

  const onResetView = () => {
    if (isFirstPersonModeRef.current) {
      resetFirstPersonPose();
    } else {
      resetToPreviewCamera();
    }
    renderScene();
  };

  return (
    <section className="panel geometry-preview">
      <h3>Step2 2.5 相機與控制</h3>
      <div className="geometry-toolbar">
        <button type="button" className="btn" onClick={onToggleFirstPersonMode}>
          {isFirstPersonMode ? "退出第一人稱" : "進入第一人稱"}
        </button>
        <button type="button" className="btn" onClick={onResetView}>
          重置視角
        </button>
      </div>
      <p className="pointer-lock-hint">
        狀態：{isPointerLocked ? "已鎖定游標（WASD + 滑鼠）" : "未鎖定游標"}
      </p>
      <p className="pointer-lock-hint">
        操作提示：按「進入第一人稱」後點擊畫面，滑鼠控制視角，WASD 移動，Esc 退出。
      </p>
      <div className="geometry-canvas-wrapper">
        <div ref={mountRef} className="geometry-canvas" />
        {isFirstPersonMode && <div className="crosshair" aria-hidden="true" />}
      </div>
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

