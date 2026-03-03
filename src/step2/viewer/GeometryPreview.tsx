import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { FloorplanData, TourStartPoint } from "../../types/floorplan";
import { buildCollisionData, resolveMovement } from "../collision";
import { buildGeometryFromFloorplan } from "../geometry";
import { buildFurnitureMeshes } from "./furniture/buildFurnitureMeshes";

interface GeometryPreviewProps {
  floorplanData: FloorplanData;
  tourStartPoint?: TourStartPoint;
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
const JOYSTICK_MAX_RADIUS = 36;

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

interface MeasureSegment {
  id: string;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  distance: number;
  mid3d: THREE.Vector3;
  group: THREE.Group;
}

interface MeasureSegmentDisplay {
  id: string;
  distance: number;
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
  tourStartPoint,
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
  const orbitControlsRef = useRef<OrbitControls | null>(null);
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
  const isShiftRef = useRef(false);
  const tourStartPointRef = useRef<TourStartPoint | undefined>(tourStartPoint);
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
  const furnitureBuildTokenRef = useRef(0);
  const measureRootRef = useRef<THREE.Group | null>(null);
  const measureSegmentsRef = useRef<MeasureSegment[]>([]);
  const measureRedoStackRef = useRef<MeasureSegment[]>([]);
  const measureActivePointRef = useRef<THREE.Vector3 | null>(null);
  const measureActiveMeshRef = useRef<THREE.Mesh | null>(null);
  const measureLabelRefs = useRef(new Map<string, HTMLDivElement>());
  const isMeasureModeRef = useRef(false);
  const pointerDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const joystickTouchIdRef = useRef<number | null>(null);
  const joystickOriginRef = useRef<{ x: number; y: number } | null>(null);
  const lookTouchIdRef = useRef<number | null>(null);
  const lookTouchLastRef = useRef<{ x: number; y: number } | null>(null);
  const portalRootRef = useRef<THREE.Group | null>(null);
  const staircaseLinksRef = useRef<FloorplanData["staircaseLinks"]>([]);
  const teleportCooldownRef = useRef<number>(-Infinity);
  const teleportFlashRef = useRef<HTMLDivElement | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isFirstPersonMode, setIsFirstPersonMode] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [isCollisionHit, setIsCollisionHit] = useState(false);
  const [minimapPose, setMinimapPose] = useState<MinimapPose | null>(null);
  const [isMeasureMode, setIsMeasureMode] = useState(false);
  const [measureHasActive, setMeasureHasActive] = useState(false);
  const [measureSegments, setMeasureSegments] = useState<MeasureSegmentDisplay[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [joystickThumb, setJoystickThumb] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  useEffect(() => {
    staircaseLinksRef.current = floorplanData.staircaseLinks ?? [];
  }, [floorplanData.staircaseLinks]);

  useEffect(() => {
    tourStartPointRef.current = tourStartPoint;
  }, [tourStartPoint]);

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
    if (orbitControlsRef.current) {
      orbitControlsRef.current.target.copy(previewLookAtRef.current);
      orbitControlsRef.current.update();
    }
  };

  const resetFirstPersonPose = () => {
    const camera = cameraRef.current;
    if (!camera) return;

    const tsp = tourStartPointRef.current;
    if (tsp) {
      camera.position.set(tsp.position.x, cameraHeight, tsp.position.y);
      camera.rotation.set(0, -(tsp.angleDeg * Math.PI) / 180, 0, "YXZ");
    } else {
      camera.position.set(
        lastSceneCenterRef.current.x,
        cameraHeight,
        lastSceneCenterRef.current.z + 1.2,
      );
      camera.lookAt(lastSceneCenterRef.current.x, cameraHeight, lastSceneCenterRef.current.z);
    }
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
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
    const measureRoot = new THREE.Group();
    scene.add(measureRoot);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.pointerSpeed = lookSensitivity;

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
    orbitControls.target.copy(previewLookAtRef.current);

    const onControlLock = () => {
      isPointerLockedRef.current = true;
      setIsPointerLocked(true);
    };
    const onControlUnlock = () => {
      const wasLocked = isPointerLockedRef.current;
      isPointerLockedRef.current = false;
      setIsPointerLocked(false);
      // Only auto-exit first-person if pointer lock was actually acquired.
      // On mobile, lock() always fails silently so wasLocked stays false.
      if (wasLocked && isFirstPersonModeRef.current) {
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
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") isShiftRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyW") keyStateRef.current.forward = false;
      if (event.code === "KeyS") keyStateRef.current.backward = false;
      if (event.code === "KeyA") keyStateRef.current.left = false;
      if (event.code === "KeyD") keyStateRef.current.right = false;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") isShiftRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onMeasurePointerDown = (event: PointerEvent) => {
      pointerDownClientRef.current = { x: event.clientX, y: event.clientY };
    };
    const onMeasurePointerUp = (event: PointerEvent) => {
      const downPos = pointerDownClientRef.current;
      pointerDownClientRef.current = null;
      if (!isMeasureModeRef.current || !downPos) return;
      // In orbit mode, ignore if the pointer moved too far (drag → not a click)
      if (
        !isFirstPersonModeRef.current &&
        Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) > 6
      )
        return;

      const currentCamera = cameraRef.current;
      const currentContent = contentRootRef.current;
      if (!currentCamera || !currentContent) return;

      // In first-person mode the crosshair is always at the screen centre (NDC 0,0)
      let nx: number;
      let ny: number;
      if (isFirstPersonModeRef.current) {
        nx = 0;
        ny = 0;
      } else {
        const rect = renderer.domElement.getBoundingClientRect();
        nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), currentCamera);
      const hits = raycaster.intersectObjects(currentContent.children, true);
      if (hits.length === 0) return;

      const hitPoint = hits[0].point.clone();

      if (measureActivePointRef.current === null) {
        // First click: place pending point marker
        const sphereGeo = new THREE.SphereGeometry(0.06, 10, 10);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(hitPoint);
        measureRoot.add(sphere);
        measureActivePointRef.current = hitPoint;
        measureActiveMeshRef.current = sphere;
        setMeasureHasActive(true);
      } else {
        // Second click: complete a segment
        const p1 = measureActivePointRef.current;
        const p2 = hitPoint;

        // Move pending sphere into a dedicated group for this segment
        const segGroup = new THREE.Group();
        const activeSphere = measureActiveMeshRef.current!;
        measureRoot.remove(activeSphere);
        segGroup.add(activeSphere);

        const sphere2Geo = new THREE.SphereGeometry(0.06, 10, 10);
        const sphere2Mat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        const sphere2 = new THREE.Mesh(sphere2Geo, sphere2Mat);
        sphere2.position.copy(p2);
        segGroup.add(sphere2);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffdd00 });
        segGroup.add(new THREE.Line(lineGeo, lineMat));

        measureRoot.add(segGroup);

        const seg: MeasureSegment = {
          id: `seg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          p1: p1.clone(),
          p2: p2.clone(),
          distance: p1.distanceTo(p2),
          mid3d: new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5),
          group: segGroup,
        };

        // Enforce max 10 segments (remove oldest if over limit)
        const currentSegs = measureSegmentsRef.current;
        if (currentSegs.length >= 10) {
          const oldest = currentSegs.shift()!;
          measureRoot.remove(oldest.group);
          oldest.group.traverse(disposeObject3D);
        }
        currentSegs.push(seg);

        // Clear redo stack when a new segment is committed
        for (const redoSeg of measureRedoStackRef.current) {
          redoSeg.group.traverse(disposeObject3D);
        }
        measureRedoStackRef.current = [];

        // Reset active state
        measureActivePointRef.current = null;
        measureActiveMeshRef.current = null;
        setMeasureHasActive(false);
        setMeasureSegments(currentSegs.map((s) => ({ id: s.id, distance: s.distance })));
        renderer.render(scene, currentCamera);
      }
    };

    // Touch look control for first-person mode on mobile (no pointer lock available)
    const onTouchLookStart = (event: TouchEvent) => {
      if (!isFirstPersonModeRef.current) return;
      for (let i = 0; i < event.changedTouches.length; i++) {
        const t = event.changedTouches[i];
        if (lookTouchIdRef.current === null) {
          lookTouchIdRef.current = t.identifier;
          lookTouchLastRef.current = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onTouchLookMove = (event: TouchEvent) => {
      if (!isFirstPersonModeRef.current || lookTouchIdRef.current === null) return;
      for (let i = 0; i < event.changedTouches.length; i++) {
        const t = event.changedTouches[i];
        if (t.identifier !== lookTouchIdRef.current) continue;
        const last = lookTouchLastRef.current;
        if (!last) break;
        const dx = t.clientX - last.x;
        const dy = t.clientY - last.y;
        lookTouchLastRef.current = { x: t.clientX, y: t.clientY };
        const sensitivity = lookSensitivity * 0.004;
        camera.rotation.y -= dx * sensitivity;
        camera.rotation.x -= dy * sensitivity;
        camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.rotation.x));
        break;
      }
    };
    const onTouchLookEnd = (event: TouchEvent) => {
      for (let i = 0; i < event.changedTouches.length; i++) {
        if (event.changedTouches[i].identifier === lookTouchIdRef.current) {
          lookTouchIdRef.current = null;
          lookTouchLastRef.current = null;
        }
      }
    };
    renderer.domElement.addEventListener("touchstart", onTouchLookStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchLookMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchLookEnd, { passive: true });

    renderer.domElement.addEventListener("pointerdown", onMeasurePointerDown);
    renderer.domElement.addEventListener("pointerup", onMeasurePointerUp);

    mountElement.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    contentRootRef.current = contentRoot;
    debugRootRef.current = debugRoot;
    measureRootRef.current = measureRoot;
    controlsRef.current = controls;
    orbitControlsRef.current = orbitControls;
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

      if (delta > 0 && isFirstPersonModeRef.current) {
        // On desktop, use PointerLockControls direction; on mobile use camera direction
        if (isPointerLockedRef.current && controlsRef.current) {
          controlsRef.current.getDirection(worldForward);
        } else {
          camera.getWorldDirection(worldForward);
        }
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
          const effectiveSpeed = moveSpeed * (isShiftRef.current ? 1.5 : 1);
          const predictedPosition = camera.position
            .clone()
            .addScaledVector(moveDirection, effectiveSpeed * delta);
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
      } else if (delta > 0 && !isFirstPersonModeRef.current && orbitControlsRef.current) {
        camera.getWorldDirection(worldForward);
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
          const displacement = moveDirection.multiplyScalar(moveSpeed * delta);
          camera.position.add(displacement);
          orbitControlsRef.current.target.add(displacement);
        }

        orbitControlsRef.current.update();
      }

      // Teleport portal check (first-person mode only, 2-second cooldown)
      if (isFirstPersonModeRef.current) {
        const links = staircaseLinksRef.current;
        if (links && links.length > 0 && timestamp - teleportCooldownRef.current > 2000) {
          for (const link of links) {
            const distA = Math.hypot(
              camera.position.x - link.positionA.x,
              camera.position.z - link.positionA.y,
            );
            if (distA < 0.6) {
              // A → B: land at B, face arrivalAngleAtB, push forward
              const arrivalY = -(link.arrivalAngleAtB ?? 0) * (Math.PI / 180);
              camera.rotation.y = arrivalY;
              camera.rotation.x = 0;
              camera.position.x = link.positionB.x + (-Math.sin(arrivalY)) * 0.85;
              camera.position.z = link.positionB.y + (-Math.cos(arrivalY)) * 0.85;
              teleportCooldownRef.current = timestamp;
              const flashEl = teleportFlashRef.current;
              if (flashEl) {
                flashEl.style.opacity = "0.9";
                setTimeout(() => { if (flashEl) flashEl.style.opacity = "0"; }, 200);
              }
              break;
            }
            const distB = Math.hypot(
              camera.position.x - link.positionB.x,
              camera.position.z - link.positionB.y,
            );
            if (distB < 0.6) {
              // B → A: land at A, face arrivalAngleAtA, push forward
              const arrivalY = -(link.arrivalAngleAtA ?? 180) * (Math.PI / 180);
              camera.rotation.y = arrivalY;
              camera.rotation.x = 0;
              camera.position.x = link.positionA.x + (-Math.sin(arrivalY)) * 0.85;
              camera.position.z = link.positionA.y + (-Math.cos(arrivalY)) * 0.85;
              teleportCooldownRef.current = timestamp;
              const flashEl = teleportFlashRef.current;
              if (flashEl) {
                flashEl.style.opacity = "0.9";
                setTimeout(() => { if (flashEl) flashEl.style.opacity = "0"; }, 200);
              }
              break;
            }
          }
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

      // Update all segment label positions every frame via direct DOM writes
      for (const seg of measureSegmentsRef.current) {
        const labelEl = measureLabelRefs.current.get(seg.id);
        if (!labelEl) continue;
        const proj = seg.mid3d.clone().project(camera);
        if (proj.z < 1) {
          const lx = ((proj.x + 1) / 2) * renderer.domElement.clientWidth;
          const ly = ((-proj.y + 1) / 2) * renderer.domElement.clientHeight;
          labelEl.style.left = `${lx}px`;
          labelEl.style.top = `${ly}px`;
          labelEl.style.display = "";
        } else {
          labelEl.style.display = "none";
        }
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
      renderer.domElement.removeEventListener("touchstart", onTouchLookStart);
      renderer.domElement.removeEventListener("touchmove", onTouchLookMove);
      renderer.domElement.removeEventListener("touchend", onTouchLookEnd);
      renderer.domElement.removeEventListener("pointerdown", onMeasurePointerDown);
      renderer.domElement.removeEventListener("pointerup", onMeasurePointerUp);
      controls.removeEventListener("lock", onControlLock);
      controls.removeEventListener("unlock", onControlUnlock);
      try { controls.unlock(); } catch { /* Pointer Lock API not supported on iOS Safari */ }
      orbitControls.dispose();
      resizeObserver.disconnect();
      contentRoot.traverse(disposeObject3D);
      debugRoot.traverse(disposeObject3D);
      measureRoot.traverse(disposeObject3D);
      scene.remove(contentRoot);
      scene.remove(debugRoot);
      scene.remove(measureRoot);
      if (renderer.domElement.parentElement === mountElement) {
        mountElement.removeChild(renderer.domElement);
      }
      renderer.dispose();
      // Explicitly release the WebGL context after disposing so mobile browsers
      // (iOS Safari has a hard cap of ~8 contexts) can reuse it immediately.
      const loseCtx = renderer.getContext().getExtension("WEBGL_lose_context");
      if (loseCtx) loseCtx.loseContext();

      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      contentRootRef.current = null;
      debugRootRef.current = null;
      measureRootRef.current = null;
      controlsRef.current = null;
      orbitControlsRef.current = null;
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

    const buildToken = furnitureBuildTokenRef.current + 1;
    furnitureBuildTokenRef.current = buildToken;

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
        if (orbitControlsRef.current) {
          orbitControlsRef.current.target.copy(center);
          orbitControlsRef.current.update();
        }
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

    if ((floorplanData.furniture?.length ?? 0) > 0) {
      void (async () => {
        try {
          const furnitureMeshes = await buildFurnitureMeshes(floorplanData.furniture ?? []);
          const latestContentRoot = contentRootRef.current;
          if (!latestContentRoot || furnitureBuildTokenRef.current !== buildToken) {
            for (const mesh of furnitureMeshes) {
              mesh.traverse(disposeObject3D);
            }
            return;
          }
          for (const mesh of furnitureMeshes) {
            latestContentRoot.add(mesh);
          }
          renderScene();
        } catch (error) {
          const message = error instanceof Error ? error.message : "載入家具模型失敗。";
          if (furnitureBuildTokenRef.current === buildToken) {
            setErrors((previous) => [...previous, message]);
          }
        }
      })();
    }
  }, [ceilingHeight, floorplanData, showCollisionDebug, wallThickness]);

  useEffect(() => {
    rebuildDebugVisuals();
    renderScene();
  }, [showCollisionDebug]);

  // Build / rebuild portal disc meshes whenever staircase links change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (portalRootRef.current) {
      scene.remove(portalRootRef.current);
      portalRootRef.current.traverse(disposeObject3D);
      portalRootRef.current = null;
    }

    const links = floorplanData.staircaseLinks ?? [];
    if (links.length > 0) {
      const portalRoot = new THREE.Group();
      for (const link of links) {
        const geoA = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24);
        const matA = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.82 });
        const discA = new THREE.Mesh(geoA, matA);
        discA.position.set(link.positionA.x, 0.02, link.positionA.y);
        portalRoot.add(discA);

        const geoB = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24);
        const matB = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.82 });
        const discB = new THREE.Mesh(geoB, matB);
        discB.position.set(link.positionB.x, 0.02, link.positionB.y);
        portalRoot.add(discB);
      }
      scene.add(portalRoot);
      portalRootRef.current = portalRoot;
    }
    renderScene();

    return () => {
      if (portalRootRef.current) {
        sceneRef.current?.remove(portalRootRef.current);
        portalRootRef.current.traverse(disposeObject3D);
        portalRootRef.current = null;
      }
    };
  }, [floorplanData.staircaseLinks]);

  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    if (isFirstPersonMode) {
      resetFirstPersonPose();
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = false;
      }
    } else {
      collisionHitRef.current = false;
      setIsCollisionHit(false);
      resetToPreviewCamera();
      if (controlsRef.current?.isLocked) {
        try { controlsRef.current.unlock(); } catch { /* Pointer Lock API not supported on iOS Safari */ }
      }
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = true;
      }
      // Reset joystick + look touch state
      joystickTouchIdRef.current = null;
      joystickOriginRef.current = null;
      lookTouchIdRef.current = null;
      lookTouchLastRef.current = null;
      setJoystickThumb({ x: 0, y: 0 });
      keyStateRef.current = { forward: false, backward: false, left: false, right: false };
    }
    renderScene();
  }, [cameraHeight, isFirstPersonMode]);

  // Sync isMeasureMode to ref; clear measurements when mode turns off
  useEffect(() => {
    isMeasureModeRef.current = isMeasureMode;
    if (!isMeasureMode) {
      const measureRoot = measureRootRef.current;
      if (measureRoot) {
        while (measureRoot.children.length > 0) {
          const child = measureRoot.children[0];
          measureRoot.remove(child);
          child.traverse(disposeObject3D);
        }
      }
      for (const seg of measureRedoStackRef.current) {
        seg.group.traverse(disposeObject3D);
      }
      measureSegmentsRef.current = [];
      measureRedoStackRef.current = [];
      measureActivePointRef.current = null;
      measureActiveMeshRef.current = null;
      setMeasureHasActive(false);
      setMeasureSegments([]);
      renderScene();
    }
  }, [isMeasureMode]);

  // Undo/redo/clear keyboard shortcuts (active only when in measure mode)
  useEffect(() => {
    if (!isMeasureMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z: undo
      if (e.ctrlKey && !e.shiftKey && e.code === "KeyZ") {
        e.preventDefault();
        const measureRoot = measureRootRef.current;
        if (!measureRoot) return;

        // Cancel pending first point first
        if (measureActivePointRef.current !== null) {
          const activeMesh = measureActiveMeshRef.current;
          if (activeMesh) {
            measureRoot.remove(activeMesh);
            activeMesh.traverse(disposeObject3D);
          }
          measureActivePointRef.current = null;
          measureActiveMeshRef.current = null;
          setMeasureHasActive(false);
          renderScene();
          return;
        }

        // Remove last committed segment
        const segs = measureSegmentsRef.current;
        if (segs.length === 0) return;
        const last = segs.pop()!;
        measureRoot.remove(last.group);
        measureRedoStackRef.current.push(last);
        setMeasureSegments(segs.map((s) => ({ id: s.id, distance: s.distance })));
        renderScene();
        return;
      }

      // Ctrl+Y: redo
      if (e.ctrlKey && e.code === "KeyY") {
        e.preventDefault();
        const measureRoot = measureRootRef.current;
        if (!measureRoot) return;
        const redoStack = measureRedoStackRef.current;
        if (redoStack.length === 0) return;
        const seg = redoStack.pop()!;
        measureRoot.add(seg.group);
        measureSegmentsRef.current.push(seg);
        setMeasureSegments(
          measureSegmentsRef.current.map((s) => ({ id: s.id, distance: s.distance })),
        );
        renderScene();
        return;
      }

      // Q: clear all
      if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyQ") {
        const measureRoot = measureRootRef.current;
        if (!measureRoot) return;

        // Remove active pending point
        if (measureActiveMeshRef.current) {
          measureRoot.remove(measureActiveMeshRef.current);
          measureActiveMeshRef.current.traverse(disposeObject3D);
          measureActiveMeshRef.current = null;
        }
        measureActivePointRef.current = null;

        // Remove all segments
        for (const seg of measureSegmentsRef.current) {
          measureRoot.remove(seg.group);
          seg.group.traverse(disposeObject3D);
        }
        measureSegmentsRef.current = [];

        // Dispose redo stack
        for (const seg of measureRedoStackRef.current) {
          seg.group.traverse(disposeObject3D);
        }
        measureRedoStackRef.current = [];

        setMeasureHasActive(false);
        setMeasureSegments([]);
        renderScene();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMeasureMode]);


  const handleScreenshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    renderer.render(scene, camera);
    const glCanvas = renderer.domElement;

    // Composite canvas at full device-pixel resolution
    const composite = document.createElement("canvas");
    composite.width = glCanvas.width;
    composite.height = glCanvas.height;
    const ctx = composite.getContext("2d");
    if (!ctx) return;

    // 1. Draw the 3D scene
    ctx.drawImage(glCanvas, 0, 0);

    // 2. Draw all measure segment labels (project 3D midpoints → device pixels)
    const dpr = glCanvas.width / Math.max(glCanvas.clientWidth, 1);
    const fontSize = Math.round(14 * dpr);
    const padH = 12 * dpr;
    const padV = 6 * dpr;
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;

    for (const seg of measureSegmentsRef.current) {
      const proj = seg.mid3d.clone().project(camera);
      if (proj.z >= 1) continue;
      const lx = ((proj.x + 1) / 2) * glCanvas.width;
      const ly = ((-proj.y + 1) / 2) * glCanvas.height;

      const text = `${seg.distance.toFixed(2)} m`;
      const textW = ctx.measureText(text).width;
      const boxW = textW + padH * 2;
      const boxH = fontSize + padV * 2;

      ctx.beginPath();
      ctx.roundRect(lx - boxW / 2, ly - boxH / 2, boxW, boxH, 8 * dpr);
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fill();
      ctx.strokeStyle = "rgba(250,204,21,0.5)";
      ctx.lineWidth = dpr;
      ctx.stroke();

      ctx.fillStyle = "#fde047";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx, ly);
    }

    const dataUrl = composite.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `spatial-planner-${Date.now()}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const onToggleFirstPersonMode = () => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isFirstPersonModeRef.current) {
      isFirstPersonModeRef.current = false;
      setIsFirstPersonMode(false);
      try { controls.unlock(); } catch { /* Pointer Lock API not supported on iOS Safari */ }
      return;
    }

    isFirstPersonModeRef.current = true;
    setIsFirstPersonMode(true);
    resetFirstPersonPose();
    try { controls.lock(); } catch { /* Pointer Lock API not supported on iOS Safari */ }
  };

  const onResetView = () => {
    if (isFirstPersonModeRef.current) {
      resetFirstPersonPose();
    } else {
      resetToPreviewCamera();
    }
    renderScene();
  };

  const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    joystickTouchIdRef.current = touch.identifier;
    joystickOriginRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (joystickTouchIdRef.current === null || !joystickOriginRef.current) return;
    e.stopPropagation();
    const touch = Array.from(e.changedTouches).find(
      (t) => t.identifier === joystickTouchIdRef.current,
    );
    if (!touch) return;
    const origin = joystickOriginRef.current;
    let dx = touch.clientX - origin.x;
    let dy = touch.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_MAX_RADIUS) {
      dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
      dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }
    setJoystickThumb({ x: dx, y: dy });
    const threshold = JOYSTICK_MAX_RADIUS * 0.2;
    keyStateRef.current.forward = dy < -threshold;
    keyStateRef.current.backward = dy > threshold;
    keyStateRef.current.left = dx < -threshold;
    keyStateRef.current.right = dx > threshold;
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        joystickOriginRef.current = null;
        setJoystickThumb({ x: 0, y: 0 });
        keyStateRef.current.forward = false;
        keyStateRef.current.backward = false;
        keyStateRef.current.left = false;
        keyStateRef.current.right = false;
        break;
      }
    }
  };

  return (
    <section className="relative flex min-h-0 flex-1 bg-background-dark">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`custom-scrollbar absolute inset-y-0 left-0 z-30 w-80 shrink-0 overflow-y-auto border-r border-border-dark bg-surface-dark p-5 transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="mb-1 text-xl font-bold text-white">View Settings</h3>
            <p className="text-sm text-slate-400">調整 3D 空間與相機參數</p>
          </div>
          <button
            type="button"
            aria-label="關閉設定"
            onClick={() => setIsSidebarOpen(false)}
            className="ml-2 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
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

        {/* Teleport flash overlay */}
        <div
          ref={teleportFlashRef}
          className="pointer-events-none absolute inset-0 z-50 bg-white opacity-0"
          style={{ transition: "opacity 0.35s ease" }}
        />

        {/* Mobile settings toggle */}
        <button
          type="button"
          className="absolute left-4 top-4 z-10 flex size-10 items-center justify-center rounded-lg border border-border-dark bg-surface-dark/80 text-slate-300 transition hover:border-primary hover:bg-primary hover:text-white md:hidden"
          title="View Settings"
          onClick={() => setIsSidebarOpen(true)}
        >
          <span className="material-symbols-outlined">settings</span>
        </button>

        <div className="pointer-events-none absolute left-1/2 top-6 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs text-white backdrop-blur-md md:flex md:items-center">
          {isFirstPersonMode
            ? isPointerLocked
              ? "滑鼠已鎖定，使用 WASD 進行移動"
              : "點擊進入視窗並鎖定滑鼠，按 ESC 退出"
            : "滑鼠拖曳旋轉/縮放視角，使用 WASD 水平移動"}
        </div>

        {/* Desktop WASD hint */}
        <div className="pointer-events-none absolute bottom-7 left-1/2 hidden -translate-x-1/2 rounded-2xl border border-white/10 bg-black/75 px-4 py-3 text-xs text-white backdrop-blur-md md:block">
          <div className="mb-1 flex items-center justify-center gap-2">
            <span className="rounded border border-white/30 px-2 py-0.5">W</span>
            <span className="rounded border border-white/30 px-2 py-0.5">A</span>
            <span className="rounded border border-white/30 px-2 py-0.5">S</span>
            <span className="rounded border border-white/30 px-2 py-0.5">D</span>
          </div>
          <p className="text-center text-[10px] text-slate-300">Move / Look Around / ESC</p>
        </div>

        {/* Mobile bottom-left: virtual joystick (first-person) or touch hints (orbit) */}
        <div className="absolute bottom-5 left-4 z-20 md:hidden">
          {isFirstPersonMode ? (
            <div
              className="touch-none select-none"
              onTouchStart={handleJoystickTouchStart}
              onTouchMove={handleJoystickTouchMove}
              onTouchEnd={handleJoystickTouchEnd}
            >
              <div className="relative flex h-[90px] w-[90px] items-center justify-center rounded-full border-2 border-white/25 bg-black/50 backdrop-blur-sm">
                <div
                  className="absolute h-[42px] w-[42px] rounded-full bg-white/40 shadow-lg"
                  style={{ transform: `translate(${joystickThumb.x}px, ${joystickThumb.y}px)` }}
                />
              </div>
              <p className="mt-1 text-center text-[10px] text-white/50">拖曳移動</p>
            </div>
          ) : (
            <div className="pointer-events-none rounded-2xl border border-white/10 bg-black/75 px-3 py-2 text-white backdrop-blur-md">
              <div className="flex items-start gap-3 text-[10px] leading-tight">
                <span className="flex flex-col items-center gap-0.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-300">touch_app</span>
                  <span className="text-center">單指<br />旋轉</span>
                </span>
                <span className="mt-1 text-white/30">│</span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-300">pan_tool</span>
                  <span className="text-center">雙指<br />平移</span>
                </span>
                <span className="mt-1 text-white/30">│</span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="material-symbols-outlined text-[16px] text-slate-300">pinch</span>
                  <span className="text-center">雙指<br />縮放</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-6 right-6 w-28 rounded-xl border border-border-dark bg-surface-dark/95 p-2 shadow-panel backdrop-blur-xl md:w-56 md:p-3">
          <div className="mb-1 flex items-center justify-between md:mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white md:text-xs">Floor Plan</span>
            <span
              className={`text-[9px] font-semibold md:text-[10px] ${
                isCollisionHit ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isCollisionHit ? "hit" : "ok"}
            </span>
          </div>
          <div className="aspect-square rounded-lg border border-border-dark bg-[#1e2936] p-1 md:p-2">
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
              {(floorplanData.staircaseLinks ?? []).flatMap((link) => {
                const posA = normalizeToMinimap(link.positionA.x, link.positionA.y, minimapBounds);
                const posB = normalizeToMinimap(link.positionB.x, link.positionB.y, minimapBounds);
                return [
                  <circle key={`${link.id}-a`} cx={posA.x} cy={posA.y} r="5" fill="#4ade80" stroke="#fff" strokeWidth="1" opacity="0.9" />,
                  <circle key={`${link.id}-b`} cx={posB.x} cy={posB.y} r="5" fill="#f97316" stroke="#fff" strokeWidth="1" opacity="0.9" />,
                ];
              })}
              {tourStartPoint && (() => {
                const tPos = normalizeToMinimap(tourStartPoint.position.x, tourStartPoint.position.y, minimapBounds);
                const tRad = (tourStartPoint.angleDeg * Math.PI) / 180;
                const arrowTipX = tPos.x + Math.sin(tRad) * 10;
                const arrowTipY = tPos.y - Math.cos(tRad) * 10;
                return (
                  <g key="tour-start-minimap">
                    <line x1={tPos.x} y1={tPos.y} x2={arrowTipX} y2={arrowTipY} stroke="#137fec" strokeWidth="1.5" opacity="0.9" />
                    <circle cx={tPos.x} cy={tPos.y} r="4" fill="#137fec" stroke="white" strokeWidth="1.5" opacity="0.9" />
                    <circle cx={tPos.x} cy={tPos.y} r="1.5" fill="white" opacity="0.9" />
                  </g>
                );
              })()}
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
            className="viewer-icon-btn"
            title="截圖"
            onClick={handleScreenshot}
          >
            <span className="material-symbols-outlined">photo_camera</span>
          </button>
          <button
            type="button"
            className={`viewer-icon-btn ${isMeasureMode ? "viewer-icon-btn-active" : ""}`}
            title={isMeasureMode ? "關閉量測（點兩點量距離）" : "量測距離"}
            onClick={() => setIsMeasureMode((prev) => !prev)}
          >
            <span className="material-symbols-outlined">straighten</span>
          </button>
          <button
            type="button"
            className={`viewer-icon-btn ${isFirstPersonMode ? "viewer-icon-btn-active" : ""}`}
            title={isFirstPersonMode ? "退出第一人稱（俯視模式）" : "進入第一人稱（步行模式）"}
            onClick={onToggleFirstPersonMode}
          >
            <span className="material-symbols-outlined">
              {isFirstPersonMode ? "3d_rotation" : "directions_walk"}
            </span>
          </button>
        </div>

        {/* Measure distance labels (one per committed segment) */}
        {isMeasureMode &&
          measureSegments.map((seg) => (
            <div
              key={seg.id}
              ref={(el) => {
                if (el) measureLabelRefs.current.set(seg.id, el);
                else measureLabelRefs.current.delete(seg.id);
              }}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-yellow-400/50 bg-black/80 px-3 py-1.5 text-sm font-semibold text-yellow-300 backdrop-blur-sm"
              style={{ left: 0, top: 0 }}
            >
              {seg.distance.toFixed(2)} m
            </div>
          ))}

        {/* Measure mode hint */}
        {isMeasureMode && (
          <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-yellow-400/30 bg-black/70 px-4 py-1.5 text-xs font-medium text-yellow-300 backdrop-blur-md">
            {measureHasActive
              ? "點擊第二個位置以完成量測 · Ctrl+Z 取消"
              : measureSegments.length === 0
                ? "點擊場景中的物件表面設置第一個量測點"
                : `已有 ${measureSegments.length} 條線段 · 點擊繼續 · Ctrl+Z 復原 · Ctrl+Y 重做 · Q 清除`}
          </div>
        )}

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

