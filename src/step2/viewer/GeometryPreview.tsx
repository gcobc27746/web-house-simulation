import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { FloorplanData } from "../../types/floorplan";
import { buildCollisionData, resolveMovement } from "../collision";
import { buildGeometryFromFloorplan } from "../geometry";

interface GeometryPreviewProps {
  floorplanData: FloorplanData;
  ceilingHeight: number;
  wallThickness: number;
  cameraHeight: number;
  moveSpeed: number;
  lookSensitivity: number;
  collisionRadius: number;
  showCollisionDebug: boolean;
  onCeilingHeightChange: (value: number) => void;
  onWallThicknessChange: (value: number) => void;
  onCameraHeightChange: (value: number) => void;
  onMoveSpeedChange: (value: number) => void;
  onLookSensitivityChange: (value: number) => void;
  onCollisionRadiusChange: (value: number) => void;
  onShowCollisionDebugChange: (value: boolean) => void;
}

const RENDER_BG = 0xf4f7ff;
const DEFAULT_CANVAS_HEIGHT = 520;
const PREVIEW_CAMERA_POSITION = new THREE.Vector3(8, 7, 8);
const MINIMAP_VIEWBOX_SIZE = 200;

interface MinimapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface MinimapPose {
  x: number;
  y: number;
  angleDeg: number;
}

function clampBoundsSpan(min: number, max: number): { min: number; max: number } {
  const span = max - min;
  if (span >= 1e-4) return { min, max };
  return { min: min - 0.5, max: max + 0.5 };
}

function normalizeToMinimap(
  x: number,
  y: number,
  bounds: MinimapBounds,
): { x: number; y: number } {
  const xSpan = Math.max(bounds.maxX - bounds.minX, 1e-4);
  const ySpan = Math.max(bounds.maxY - bounds.minY, 1e-4);
  return {
    x: ((x - bounds.minX) / xSpan) * MINIMAP_VIEWBOX_SIZE,
    y: ((y - bounds.minY) / ySpan) * MINIMAP_VIEWBOX_SIZE,
  };
}

function angleDelta(a: number, b: number): number {
  const delta = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(delta);
}

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
  collisionRadius,
  showCollisionDebug,
  onCeilingHeightChange,
  onWallThicknessChange,
  onCameraHeightChange,
  onMoveSpeedChange,
  onLookSensitivityChange,
  onCollisionRadiusChange,
  onShowCollisionDebugChange,
}: GeometryPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const contentRootRef = useRef<THREE.Group | null>(null);
  const debugRootRef = useRef<THREE.Group | null>(null);
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
  const collisionDataRef = useRef(buildCollisionData([]));
  const collisionHitRef = useRef(false);
  const minimapBoundsRef = useRef<MinimapBounds>({
    minX: -5,
    maxX: 5,
    minY: -5,
    maxY: 5,
  });
  const minimapPoseRef = useRef<MinimapPose | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isFirstPersonMode, setIsFirstPersonMode] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isCollisionHit, setIsCollisionHit] = useState(false);
  const [minimapPose, setMinimapPose] = useState<MinimapPose | null>(null);

  const minimapBounds = useMemo<MinimapBounds>(() => {
    const walls = floorplanData.walls ?? [];
    if (walls.length === 0) {
      return {
        minX: -5,
        maxX: 5,
        minY: -5,
        maxY: 5,
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const wall of walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    }

    const xRange = maxX - minX;
    const yRange = maxY - minY;
    const padding = Math.max(xRange, yRange, 1) * 0.12;
    const xSpan = clampBoundsSpan(minX - padding, maxX + padding);
    const ySpan = clampBoundsSpan(minY - padding, maxY + padding);
    return {
      minX: xSpan.min,
      maxX: xSpan.max,
      minY: ySpan.min,
      maxY: ySpan.max,
    };
  }, [floorplanData.walls]);

  useEffect(() => {
    minimapBoundsRef.current = minimapBounds;
  }, [minimapBounds]);

  const minimapWallPaths = useMemo(() => {
    const walls = floorplanData.walls ?? [];
    return walls.map((wall) => {
      const start = normalizeToMinimap(wall.start.x, wall.start.y, minimapBounds);
      const end = normalizeToMinimap(wall.end.x, wall.end.y, minimapBounds);
      return {
        id: wall.id,
        start,
        end,
      };
    });
  }, [floorplanData.walls, minimapBounds]);

  const rebuildDebugVisuals = () => {
    const debugRoot = debugRootRef.current;
    if (!debugRoot) return;

    while (debugRoot.children.length > 0) {
      const child = debugRoot.children[0];
      debugRoot.remove(child);
      child.traverse(disposeObject3D);
    }

    if (!showCollisionDebug) return;
    for (const wall of collisionDataRef.current.walls) {
      const min = new THREE.Vector3(wall.aabbMin.x, wall.minY, wall.aabbMin.y);
      const max = new THREE.Vector3(wall.aabbMax.x, wall.maxY, wall.aabbMax.y);
      const helperColor = wall.source === "window" ? 0x16a34a : 0xf97316;
      const helper = new THREE.Box3Helper(new THREE.Box3(min, max), helperColor);
      debugRoot.add(helper);
    }
  };

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
    const height = Math.max(mountElement.clientHeight, DEFAULT_CANVAS_HEIGHT);

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
    const debugRoot = new THREE.Group();
    scene.add(debugRoot);

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
    debugRootRef.current = debugRoot;
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
          const predictedPosition = camera.position
            .clone()
            .addScaledVector(moveDirection, moveSpeed * delta);
          predictedPosition.y = cameraHeight;

          const movementResult = resolveMovement({
            currentPosition: camera.position,
            predictedPosition,
            collisionRadius,
            collisionData: collisionDataRef.current,
          });
          camera.position.copy(movementResult.position);

          if (collisionHitRef.current !== movementResult.hit) {
            collisionHitRef.current = movementResult.hit;
            setIsCollisionHit(movementResult.hit);
          }
        } else if (collisionHitRef.current) {
          collisionHitRef.current = false;
          setIsCollisionHit(false);
        }
      }

      const forwardForMap = new THREE.Vector3();
      if (controlsRef.current) {
        controlsRef.current.getDirection(forwardForMap);
      } else {
        camera.getWorldDirection(forwardForMap);
      }
      forwardForMap.y = 0;
      if (forwardForMap.lengthSq() < 1e-6) {
        forwardForMap.set(0, 0, -1);
      } else {
        forwardForMap.normalize();
      }

      const projected = normalizeToMinimap(
        camera.position.x,
        camera.position.z,
        minimapBoundsRef.current,
      );
      const pose: MinimapPose = {
        x: projected.x,
        y: projected.y,
        angleDeg: (Math.atan2(forwardForMap.x, -forwardForMap.z) * 180) / Math.PI,
      };
      const previousPose = minimapPoseRef.current;
      if (
        !previousPose ||
        Math.hypot(previousPose.x - pose.x, previousPose.y - pose.y) > 0.2 ||
        angleDelta((previousPose.angleDeg * Math.PI) / 180, (pose.angleDeg * Math.PI) / 180) >
          0.015
      ) {
        minimapPoseRef.current = pose;
        setMinimapPose(pose);
      }

      renderer.render(scene, camera);
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.max(entries[0]?.contentRect.width ?? width, 320);
      const nextHeight = Math.max(entries[0]?.contentRect.height ?? height, DEFAULT_CANVAS_HEIGHT);
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
      debugRoot.traverse(disposeObject3D);
      scene.remove(contentRoot);
      scene.remove(debugRoot);
      if (renderer.domElement.parentElement === mountElement) {
        mountElement.removeChild(renderer.domElement);
      }
      renderer.dispose();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      contentRootRef.current = null;
      debugRootRef.current = null;
      controlsRef.current = null;
    };
  }, [cameraHeight, collisionRadius, lookSensitivity, moveSpeed]);

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
    collisionDataRef.current = buildCollisionData(result.wallMeshes, {
      floorplanData,
      wallThickness,
      ceilingHeight,
    });
    rebuildDebugVisuals();

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
  }, [ceilingHeight, floorplanData, showCollisionDebug, wallThickness]);

  useEffect(() => {
    rebuildDebugVisuals();
    renderScene();
  }, [showCollisionDebug]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    if (isFirstPersonMode) {
      resetFirstPersonPose();
    } else {
      collisionHitRef.current = false;
      setIsCollisionHit(false);
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
    <section className="flex h-full min-h-0 bg-background-dark">
      <aside className="custom-scrollbar w-80 shrink-0 overflow-y-auto border-r border-border-dark bg-surface-dark p-5">
        <div className="mb-5">
          <h3 className="mb-1 text-xl font-bold text-white">View Settings</h3>
          <p className="text-sm text-slate-400">調整 3D 空間與相機參數</p>
        </div>

        <div className="space-y-4">
          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Ceiling Height</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {ceilingHeight.toFixed(1)}m
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={2}
              max={5}
              step={0.1}
              value={ceilingHeight}
              onChange={(event) => onCeilingHeightChange(Number(event.target.value))}
            />
          </label>

          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Wall Thickness</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {wallThickness.toFixed(2)}m
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={0.05}
              max={0.3}
              step={0.01}
              value={wallThickness}
              onChange={(event) => onWallThicknessChange(Number(event.target.value))}
            />
          </label>

          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Camera Eye Level</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {cameraHeight.toFixed(1)}m
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={1}
              max={2.2}
              step={0.1}
              value={cameraHeight}
              onChange={(event) => onCameraHeightChange(Number(event.target.value))}
            />
          </label>

          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Move Speed</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {moveSpeed.toFixed(1)}
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={0.5}
              max={10}
              step={0.1}
              value={moveSpeed}
              onChange={(event) => onMoveSpeedChange(Number(event.target.value))}
            />
          </label>

          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Look Sensitivity</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {lookSensitivity.toFixed(1)}
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={lookSensitivity}
              onChange={(event) => onLookSensitivityChange(Number(event.target.value))}
            />
          </label>

          <label className="block rounded-xl border border-border-dark bg-background-dark/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-200">Collision Radius</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
                {collisionRadius.toFixed(2)}m
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={collisionRadius}
              onChange={(event) => onCollisionRadiusChange(Number(event.target.value))}
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-border-dark px-3 py-2 text-sm text-slate-200">
            顯示碰撞邊界
            <input
              type="checkbox"
              checked={showCollisionDebug}
              onChange={(event) => onShowCollisionDebugChange(event.target.checked)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={onToggleFirstPersonMode}>
              {isFirstPersonMode ? "退出第一人稱" : "進入第一人稱"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border-dark bg-surface-darker px-3 py-2 text-sm text-slate-200"
              onClick={onResetView}
            >
              重置視角
            </button>
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-hidden bg-[#0f1115]">
        <div ref={mountRef} className="geometry-canvas h-full w-full" />

        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-white backdrop-blur-md">
          {isPointerLocked
            ? "滑鼠已鎖定，使用 WASD 進行移動"
            : "點擊進入視窗並鎖定滑鼠，按 ESC 退出"}
        </div>

        <div className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/75 px-4 py-3 text-xs text-white backdrop-blur-md">
          <div className="mb-1 flex items-center justify-center gap-2">
            <span className="rounded border border-white/30 px-2 py-0.5">W</span>
            <span className="rounded border border-white/30 px-2 py-0.5">A</span>
            <span className="rounded border border-white/30 px-2 py-0.5">S</span>
            <span className="rounded border border-white/30 px-2 py-0.5">D</span>
          </div>
          <p className="text-center text-[10px] text-slate-300">Move / Look Around / ESC</p>
        </div>

        <div className="absolute bottom-6 right-6 w-56 rounded-xl border border-border-dark bg-surface-dark/95 p-3 shadow-panel backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white">Floor Plan</span>
            <span
              className={`text-[10px] font-semibold ${
                isCollisionHit ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isCollisionHit ? "hit" : "no-hit"}
            </span>
          </div>
          <div className="aspect-square rounded-lg border border-border-dark bg-[#1e2936] p-2">
            <svg className="h-full w-full opacity-85" viewBox="0 0 200 200">
              <rect x="1" y="1" width="198" height="198" fill="#0f172a" stroke="#334155" />
              {minimapWallPaths.map((wallPath) => (
                <line
                  key={wallPath.id}
                  x1={wallPath.start.x}
                  y1={wallPath.start.y}
                  x2={wallPath.end.x}
                  y2={wallPath.end.y}
                  stroke="#64748b"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
              {isFirstPersonMode && minimapPose && (
                <g transform={`translate(${minimapPose.x}, ${minimapPose.y}) rotate(${minimapPose.angleDeg})`}>
                  <path d="M0 0 L-18 -45 L18 -45 Z" fill="rgba(19,127,236,0.35)" />
                  <circle cx="0" cy="0" r="4" fill="#137fec" stroke="white" strokeWidth="1.5" />
                </g>
              )}
              {minimapWallPaths.length === 0 && (
                <text x="100" y="105" textAnchor="middle" fill="#94a3b8" fontSize="12">
                  No floorplan walls
                </text>
              )}
            </svg>
          </div>
        </div>

        <div className="absolute right-6 top-6 flex flex-col gap-2">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg border border-border-dark bg-surface-dark/80 text-slate-300 transition hover:border-primary hover:bg-primary hover:text-white"
            title="Screenshot"
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg border border-border-dark bg-surface-dark/80 text-slate-300 transition hover:border-primary hover:bg-primary hover:text-white"
            title="Measure"
          >
            <span className="material-symbols-outlined">straighten</span>
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg border border-border-dark bg-surface-dark/80 text-slate-300 transition hover:border-primary hover:bg-primary hover:text-white"
            title="Fullscreen"
          >
            <span className="material-symbols-outlined">fullscreen</span>
          </button>
        </div>

        {isFirstPersonMode && <div className="crosshair" aria-hidden="true" />}

        {errors.length > 0 && (
          <div className="absolute left-4 top-16 max-w-md">
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
          </div>
        )}
      </main>
    </section>
  );
}

