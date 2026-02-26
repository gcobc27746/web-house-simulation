import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

type ModelFormat = "obj" | "dae" | "gltf" | "glb";
type StatusType = "success" | "error" | "info";

interface ModelSourceDescriptor {
  format: ModelFormat;
  mainFileName: string;
  mtlFileName?: string;
}

interface RotationDeg {
  x: number;
  y: number;
  z: number;
}

interface DimensionSize {
  width: number;
  depth: number;
  height: number;
}

interface EncodedModelFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface CalibrationPackage {
  kind: "spatialplanner-calibrated-model";
  version: 1;
  savedAt: string;
  source: ModelSourceDescriptor;
  files: EncodedModelFile[];
  transform: {
    rotationDeg: RotationDeg;
    uniformScale: number;
    metersPerUnit: number;
  };
  dimensionsMeters: DimensionSize;
}

const MODEL_ACCEPT =
  ".obj,.mtl,.dae,.gltf,.glb,.png,.jpg,.jpeg,.webp,.bmp,.tga,.ktx2,.bin";
const DEFAULT_ROTATION: RotationDeg = { x: 0, y: 0, z: 0 };
const DEFAULT_METERS_PER_UNIT = 0.01;
const DEFAULT_UNIFORM_SCALE = 1;
const RENDER_BG_COLOR = 0x0f1117;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeAssetPath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\.\//, "").trim().toLowerCase();

const getBaseName = (value: string) => {
  const normalized = normalizeAssetPath(value);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

const getFileExtension = (fileName: string) => {
  const normalized = getBaseName(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return normalized.slice(dotIndex + 1);
};

const decodeBase64ToUint8Array = (base64: string) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const sanitizeFileName = (name: string) => {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-");
  return sanitized.length > 0 ? sanitized : "calibrated-model";
};

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((item) => item.clone());
  }
  return material.clone();
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }
  material.dispose();
}

function disposeObject3D(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh) {
    mesh.geometry?.dispose();
    if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  }
}

function clearGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse(disposeObject3D);
  }
}

function withObjectUrlMap(files: File[]) {
  const objectUrlMap = new Map<string, string>();
  const createdUrls: string[] = [];

  for (const file of files) {
    const objectUrl = URL.createObjectURL(file);
    createdUrls.push(objectUrl);
    const normalizedName = normalizeAssetPath(file.name);
    const baseName = getBaseName(file.name);
    objectUrlMap.set(normalizedName, objectUrl);
    if (!objectUrlMap.has(baseName)) {
      objectUrlMap.set(baseName, objectUrl);
    }
  }

  const resolveByName = (name: string) => {
    const normalized = normalizeAssetPath(name);
    return objectUrlMap.get(normalized) ?? objectUrlMap.get(getBaseName(normalized));
  };

  const resolveFromUrl = (rawUrl: string) => {
    if (/^(blob:|data:|https?:|file:)/i.test(rawUrl)) return undefined;
    const stripped = rawUrl.split("#")[0]?.split("?")[0] ?? rawUrl;
    const decoded = decodeURIComponent(stripped);
    return resolveByName(decoded);
  };

  const revokeAll = () => {
    for (const url of createdUrls) {
      URL.revokeObjectURL(url);
    }
  };

  return { resolveByName, resolveFromUrl, revokeAll };
}

function inferModelSource(files: File[]): ModelSourceDescriptor | null {
  const byExtension = new Map<string, File[]>();
  for (const file of files) {
    const extension = getFileExtension(file.name);
    const bucket = byExtension.get(extension) ?? [];
    bucket.push(file);
    byExtension.set(extension, bucket);
  }

  const pickFirst = (extension: string) => byExtension.get(extension)?.[0];

  const obj = pickFirst("obj");
  if (obj) {
    const mtl = pickFirst("mtl");
    return {
      format: "obj",
      mainFileName: obj.name,
      mtlFileName: mtl?.name,
    };
  }

  const dae = pickFirst("dae");
  if (dae) {
    return {
      format: "dae",
      mainFileName: dae.name,
    };
  }

  const glb = pickFirst("glb");
  if (glb) {
    return {
      format: "glb",
      mainFileName: glb.name,
    };
  }

  const gltf = pickFirst("gltf");
  if (gltf) {
    return {
      format: "gltf",
      mainFileName: gltf.name,
    };
  }

  return null;
}

function isModelSourceDescriptor(value: unknown): value is ModelSourceDescriptor {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  if (
    typed.format !== "obj" &&
    typed.format !== "dae" &&
    typed.format !== "gltf" &&
    typed.format !== "glb"
  ) {
    return false;
  }
  if (typeof typed.mainFileName !== "string" || typed.mainFileName.length === 0) {
    return false;
  }
  if (typed.mtlFileName !== undefined && typeof typed.mtlFileName !== "string") {
    return false;
  }
  return true;
}

function isRotationDeg(value: unknown): value is RotationDeg {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  return isFiniteNumber(typed.x) && isFiniteNumber(typed.y) && isFiniteNumber(typed.z);
}

function isDimensionSize(value: unknown): value is DimensionSize {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  return (
    isFiniteNumber(typed.width) &&
    isFiniteNumber(typed.depth) &&
    isFiniteNumber(typed.height) &&
    typed.width >= 0 &&
    typed.depth >= 0 &&
    typed.height >= 0
  );
}

function isEncodedModelFile(value: unknown): value is EncodedModelFile {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  return (
    typeof typed.name === "string" &&
    typeof typed.type === "string" &&
    isFiniteNumber(typed.size) &&
    typeof typed.base64 === "string"
  );
}

function isCalibrationPackage(value: unknown): value is CalibrationPackage {
  if (!value || typeof value !== "object") return false;
  const typed = value as Record<string, unknown>;
  if (typed.kind !== "spatialplanner-calibrated-model") return false;
  if (typed.version !== 1) return false;
  if (typeof typed.savedAt !== "string") return false;
  if (!isModelSourceDescriptor(typed.source)) return false;
  if (!Array.isArray(typed.files) || !typed.files.every((file) => isEncodedModelFile(file))) return false;
  if (!typed.transform || typeof typed.transform !== "object") return false;
  const transform = typed.transform as Record<string, unknown>;
  if (!isRotationDeg(transform.rotationDeg)) return false;
  if (!isFiniteNumber(transform.uniformScale) || transform.uniformScale <= 0) return false;
  if (!isFiniteNumber(transform.metersPerUnit) || transform.metersPerUnit <= 0) return false;
  if (!isDimensionSize(typed.dimensionsMeters)) return false;
  return true;
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.onerror = () => reject(new Error(`讀取檔案失敗：${file.name}`));
    reader.readAsDataURL(file);
  });
}

function encodedFileToFile(encoded: EncodedModelFile): File {
  const bytes = decodeBase64ToUint8Array(encoded.base64);
  return new File([bytes], encoded.name, {
    type: encoded.type || "application/octet-stream",
    lastModified: Date.now(),
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function createDimensionLine(start: THREE.Vector3, end: THREE.Vector3, color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color });
  return new THREE.Line(geometry, material);
}

function createScaleRuler() {
  const group = new THREE.Group();
  const rulerColor = 0xfacc15;
  const mainLine = createDimensionLine(
    new THREE.Vector3(-2, 0.01, -2),
    new THREE.Vector3(-1, 0.01, -2),
    rulerColor,
  );
  group.add(mainLine);
  for (let tick = 0; tick <= 10; tick += 1) {
    const x = -2 + tick * 0.1;
    const tickHeight = tick % 5 === 0 ? 0.14 : 0.08;
    const tickLine = createDimensionLine(
      new THREE.Vector3(x, 0.01, -2),
      new THREE.Vector3(x, 0.01, -2 + tickHeight),
      rulerColor,
    );
    group.add(tickLine);
  }
  return group;
}

function bakeTransformedModel(model: THREE.Object3D) {
  const bakedRoot = new THREE.Group();
  model.updateWorldMatrix(true, true);

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.material) return;
    const clonedGeometry = mesh.geometry.clone();
    clonedGeometry.applyMatrix4(mesh.matrixWorld);
    clonedGeometry.computeBoundingBox();
    clonedGeometry.computeBoundingSphere();
    const bakedMesh = new THREE.Mesh(clonedGeometry, cloneMaterial(mesh.material));
    bakedMesh.name = mesh.name;
    bakedRoot.add(bakedMesh);
  });

  if (bakedRoot.children.length === 0) {
    throw new Error("模型內沒有可匯出的 Mesh。");
  }

  const bounds = new THREE.Box3().setFromObject(bakedRoot);
  if (Number.isFinite(bounds.min.y)) {
    bakedRoot.position.y -= bounds.min.y;
  }
  const recentered = new THREE.Box3().setFromObject(bakedRoot);
  const center = recentered.getCenter(new THREE.Vector3());
  bakedRoot.position.x -= center.x;
  bakedRoot.position.z -= center.z;
  bakedRoot.updateMatrixWorld(true);
  return bakedRoot;
}

async function loadObjGroup(
  objectUrl: string,
  materialUrl: string | undefined,
  manager: THREE.LoadingManager,
): Promise<THREE.Group> {
  const objLoader = new OBJLoader(manager);
  if (materialUrl) {
    const materials = await new Promise<MTLLoader.MaterialCreator>((resolve, reject) => {
      const mtlLoader = new MTLLoader(manager);
      mtlLoader.load(
        materialUrl,
        (loadedMaterials) => {
          loadedMaterials.preload();
          resolve(loadedMaterials);
        },
        undefined,
        (error) => reject(error),
      );
    });
    objLoader.setMaterials(materials);
  }
  return await new Promise<THREE.Group>((resolve, reject) => {
    objLoader.load(
      objectUrl,
      (group) => resolve(group),
      undefined,
      (error) => reject(error),
    );
  });
}

async function loadDaeGroup(url: string, manager: THREE.LoadingManager): Promise<THREE.Group> {
  const loader = new ColladaLoader(manager);
  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      url,
      (collada) => {
        const group = new THREE.Group();
        if (collada && collada.scene) {
          group.add(collada.scene);
        }
        resolve(group);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

async function loadGltfGroup(url: string, manager: THREE.LoadingManager): Promise<THREE.Group> {
  const loader = new GLTFLoader(manager);
  return await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const group = new THREE.Group();
        if (gltf.scene) {
          group.add(gltf.scene);
        }
        resolve(group);
      },
      undefined,
      (error) => reject(error),
    );
  });
}

async function loadModelFromFiles(files: File[], source: ModelSourceDescriptor): Promise<THREE.Group> {
  const fileMap = withObjectUrlMap(files);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((rawUrl) => fileMap.resolveFromUrl(rawUrl) ?? rawUrl);

  try {
    const mainUrl = fileMap.resolveByName(source.mainFileName);
    if (!mainUrl) {
      throw new Error(`找不到主模型檔：${source.mainFileName}`);
    }

    if (source.format === "obj") {
      const mtlUrl = source.mtlFileName ? fileMap.resolveByName(source.mtlFileName) : undefined;
      return await loadObjGroup(mainUrl, mtlUrl, manager);
    }
    if (source.format === "dae") {
      return await loadDaeGroup(mainUrl, manager);
    }
    return await loadGltfGroup(mainUrl, manager);
  } finally {
    fileMap.revokeAll();
  }
}

const toRadians = (value: number) => (value * Math.PI) / 180;
const formatMeters = (value: number) => `${value.toFixed(3)} m`;

export function ModelCalibrationWorkspace() {
  const modelInputRef = useRef<HTMLInputElement>(null);
  const packageInputRef = useRef<HTMLInputElement>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const helperRootRef = useRef<THREE.Group | null>(null);
  const displayedModelRef = useRef<THREE.Group | null>(null);

  const [rotationDeg, setRotationDeg] = useState<RotationDeg>(DEFAULT_ROTATION);
  const [uniformScale, setUniformScale] = useState(DEFAULT_UNIFORM_SCALE);
  const [metersPerUnit, setMetersPerUnit] = useState(DEFAULT_METERS_PER_UNIT);
  const [source, setSource] = useState<ModelSourceDescriptor | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [sourceDimensions, setSourceDimensions] = useState<DimensionSize | null>(null);
  const [actualDimensions, setActualDimensions] = useState<DimensionSize | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<{ type: StatusType; message: string } | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const updateDimensionHelpers = useCallback((bounds: THREE.Box3) => {
    const helperRoot = helperRootRef.current;
    if (!helperRoot) return;
    clearGroup(helperRoot);

    const boxHelper = new THREE.Box3Helper(bounds, 0x60a5fa);
    helperRoot.add(boxHelper);

    const size = bounds.getSize(new THREE.Vector3());
    const min = bounds.min.clone();
    const max = bounds.max.clone();
    const offset = Math.max(Math.max(size.x, size.y, size.z) * 0.12, 0.2);

    const widthLine = createDimensionLine(
      new THREE.Vector3(min.x, min.y + 0.02, max.z + offset),
      new THREE.Vector3(max.x, min.y + 0.02, max.z + offset),
      0xf97316,
    );
    const depthLine = createDimensionLine(
      new THREE.Vector3(max.x + offset, min.y + 0.02, min.z),
      new THREE.Vector3(max.x + offset, min.y + 0.02, max.z),
      0x22c55e,
    );
    const heightLine = createDimensionLine(
      new THREE.Vector3(min.x - offset, min.y, min.z - offset),
      new THREE.Vector3(min.x - offset, max.y, min.z - offset),
      0xa855f7,
    );
    helperRoot.add(widthLine, depthLine, heightLine);
  }, []);

  const fitCameraToCurrentModel = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = displayedModelRef.current;
    if (!camera || !controls || !model) return;

    const bounds = new THREE.Box3().setFromObject(model);
    if (!Number.isFinite(bounds.min.x)) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const distance = maxDimension * 2.1;

    camera.position.set(center.x + distance, center.y + distance * 0.85, center.z + distance);
    camera.near = Math.max(distance / 600, 0.01);
    camera.far = Math.max(distance * 60, 500);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }, []);

  const applyTransformToModel = useCallback(() => {
    const model = displayedModelRef.current;
    if (!model) {
      setActualDimensions(null);
      const helperRoot = helperRootRef.current;
      if (helperRoot) clearGroup(helperRoot);
      return;
    }

    const effectiveScale = Math.max(uniformScale, 1e-4) * Math.max(metersPerUnit, 1e-6);
    model.rotation.set(toRadians(rotationDeg.x), toRadians(rotationDeg.y), toRadians(rotationDeg.z));
    model.scale.setScalar(effectiveScale);
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);

    let bounds = new THREE.Box3().setFromObject(model);
    if (Number.isFinite(bounds.min.y)) {
      model.position.y -= bounds.min.y;
      model.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(model);
    }

    const size = bounds.getSize(new THREE.Vector3());
    setActualDimensions({
      width: size.x,
      depth: size.z,
      height: size.y,
    });
    updateDimensionHelpers(bounds);
  }, [metersPerUnit, rotationDeg.x, rotationDeg.y, rotationDeg.z, uniformScale, updateDimensionHelpers]);

  const loadModelSession = useCallback(
    async (
      files: File[],
      descriptorOverride?: ModelSourceDescriptor,
      options?: { resetTransform?: boolean },
    ) => {
      const descriptor = descriptorOverride ?? inferModelSource(files);
      if (!descriptor) {
        setStatus({
          type: "error",
          message: "找不到支援的主模型檔。請至少選擇 OBJ / DAE / GLTF / GLB 其中一種。",
        });
        return;
      }

      setIsBusy(true);
      try {
        const loadedModel = await loadModelFromFiles(files, descriptor);
        loadedModel.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        const sourceBounds = new THREE.Box3().setFromObject(loadedModel);
        if (!Number.isFinite(sourceBounds.min.x)) {
          throw new Error("模型內容為空，找不到可顯示的幾何。");
        }
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        const center = sourceBounds.getCenter(new THREE.Vector3());
        loadedModel.position.set(-center.x, -sourceBounds.min.y, -center.z);

        const wrapper = new THREE.Group();
        wrapper.add(loadedModel);

        const modelRoot = modelRootRef.current;
        if (!modelRoot) {
          throw new Error("3D 預覽尚未初始化。");
        }
        clearGroup(modelRoot);
        modelRoot.add(wrapper);
        displayedModelRef.current = wrapper;
        setSource(descriptor);
        setSourceFiles(files);
        setSourceDimensions({
          width: sourceSize.x,
          depth: sourceSize.z,
          height: sourceSize.y,
        });
        if (options?.resetTransform ?? true) {
          setRotationDeg(DEFAULT_ROTATION);
          setUniformScale(DEFAULT_UNIFORM_SCALE);
          setMetersPerUnit(DEFAULT_METERS_PER_UNIT);
        }
        setStatus({
          type: "success",
          message: `模型載入成功：${descriptor.mainFileName}`,
        });
        fitCameraToCurrentModel();
      } catch (error) {
        const message = error instanceof Error ? error.message : "載入模型失敗";
        setStatus({
          type: "error",
          message: `載入模型失敗：${message}`,
        });
      } finally {
        setIsBusy(false);
      }
    },
    [fitCameraToCurrentModel],
  );

  useEffect(() => {
    const mountElement = mountRef.current;
    if (!mountElement) return;

    const width = Math.max(mountElement.clientWidth, 360);
    const height = Math.max(mountElement.clientHeight, 360);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(RENDER_BG_COLOR);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 2000);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.2;
    controls.maxDistance = 100;
    controls.target.set(0, 0.8, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(6, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(2048, 2048);
    scene.add(directionalLight);

    const grid = new THREE.GridHelper(20, 20, 0x64748b, 0x334155);
    grid.position.y = 0;
    scene.add(grid);
    const axis = new THREE.AxesHelper(2);
    axis.position.set(0, 0.01, 0);
    scene.add(axis);
    scene.add(createScaleRuler());

    const modelRoot = new THREE.Group();
    const helperRoot = new THREE.Group();
    scene.add(modelRoot);
    scene.add(helperRoot);

    mountElement.appendChild(renderer.domElement);
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    modelRootRef.current = modelRoot;
    helperRootRef.current = helperRoot;

    let frameId: number | null = null;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = Math.max(entries[0]?.contentRect.width ?? width, 360);
      const nextHeight = Math.max(entries[0]?.contentRect.height ?? height, 360);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(mountElement);

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      controls.dispose();
      clearGroup(modelRoot);
      clearGroup(helperRoot);
      scene.clear();
      renderer.dispose();
      if (renderer.domElement.parentElement === mountElement) {
        mountElement.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      modelRootRef.current = null;
      helperRootRef.current = null;
      displayedModelRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyTransformToModel();
  }, [applyTransformToModel]);

  useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => {
      setStatus(null);
    }, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  const onModelInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await loadModelSession(Array.from(files));
    event.target.value = "";
  };

  const onPackageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBusy(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as unknown;
      if (!isCalibrationPackage(parsed)) {
        throw new Error("校正包格式不符合規範");
      }
      const restoredFiles = parsed.files.map((entry) => encodedFileToFile(entry));
      setRotationDeg(parsed.transform.rotationDeg);
      setUniformScale(parsed.transform.uniformScale);
      setMetersPerUnit(parsed.transform.metersPerUnit);
      await loadModelSession(restoredFiles, parsed.source, { resetTransform: false });
      setStatus({
        type: "success",
        message: "校正包匯入成功，已還原旋轉與縮放設定。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯入校正包失敗";
      setStatus({
        type: "error",
        message: `匯入校正包失敗：${message}`,
      });
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const onExportPackage = async () => {
    if (!source || sourceFiles.length === 0) {
      setStatus({
        type: "error",
        message: "尚未載入模型，無法匯出校正包。",
      });
      return;
    }

    setIsBusy(true);
    try {
      const encodedFiles: EncodedModelFile[] = await Promise.all(
        sourceFiles.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          base64: await fileToBase64(file),
        })),
      );

      const payload: CalibrationPackage = {
        kind: "spatialplanner-calibrated-model",
        version: 1,
        savedAt: new Date().toISOString(),
        source,
        files: encodedFiles,
        transform: {
          rotationDeg,
          uniformScale,
          metersPerUnit,
        },
        dimensionsMeters: actualDimensions ?? {
          width: 0,
          depth: 0,
          height: 0,
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const fileName = `${sanitizeFileName(source.mainFileName)}-calibrated-package.json`;
      downloadBlob(blob, fileName);
      setStatus({
        type: "success",
        message: "已匯出校正包 JSON（可再次匯入還原方向與尺寸）。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯出校正包失敗";
      setStatus({
        type: "error",
        message: `匯出校正包失敗：${message}`,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const onExportGlb = async () => {
    const model = displayedModelRef.current;
    if (!model || !source) {
      setStatus({
        type: "error",
        message: "尚未載入模型，無法匯出 GLB。",
      });
      return;
    }

    setIsBusy(true);
    let bakedRoot: THREE.Group | null = null;
    try {
      bakedRoot = bakeTransformedModel(model);
      const exporter = new GLTFExporter();

      const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          bakedRoot as THREE.Object3D,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(result);
              return;
            }
            reject(new Error("GLB 匯出失敗：輸出不是二進位資料。"));
          },
          (error) => {
            const message = error instanceof Error ? error.message : "未知匯出錯誤";
            reject(new Error(message));
          },
          { binary: true, onlyVisible: true },
        );
      });

      const blob = new Blob([glbBuffer], { type: "model/gltf-binary" });
      const fileName = `${sanitizeFileName(source.mainFileName)}-calibrated.glb`;
      downloadBlob(blob, fileName);
      setStatus({
        type: "success",
        message: "已匯出校正後 GLB，可直接再次匯入檢查。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "匯出 GLB 失敗";
      setStatus({
        type: "error",
        message: `匯出 GLB 失敗：${message}`,
      });
    } finally {
      if (bakedRoot) {
        bakedRoot.traverse(disposeObject3D);
      }
      setIsBusy(false);
    }
  };

  const onResetView = () => {
    fitCameraToCurrentModel();
  };

  const onRotationChange = (axis: keyof RotationDeg, value: number) => {
    if (!Number.isFinite(value)) return;
    setRotationDeg((previous) => ({ ...previous, [axis]: value }));
  };

  const fileSummaryText = useMemo(() => {
    if (!source) return "尚未載入模型檔";
    return `${source.mainFileName}（格式：${source.format.toUpperCase()}，檔案數：${sourceFiles.length}）`;
  }, [source, sourceFiles.length]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#0f1117]">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-dark bg-surface-darker px-3 py-2 text-xs text-slate-300">
        <button
          type="button"
          className="btn h-8 px-3 py-0 text-xs"
          onClick={() => modelInputRef.current?.click()}
          disabled={isBusy}
        >
          匯入 3D 模型
        </button>
        <button
          type="button"
          className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
          onClick={() => packageInputRef.current?.click()}
          disabled={isBusy}
        >
          匯入校正包
        </button>
        <button
          type="button"
          className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
          onClick={onExportGlb}
          disabled={isBusy || !source}
        >
          匯出校正後 GLB
        </button>
        <button
          type="button"
          className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
          onClick={onExportPackage}
          disabled={isBusy || !source}
        >
          匯出校正包 JSON
        </button>
        <button
          type="button"
          className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
          onClick={onResetView}
          disabled={!source}
        >
          重置視角
        </button>
        <button
          type="button"
          className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white"
          onClick={() => setIsInspectorOpen((previous) => !previous)}
        >
          {isInspectorOpen ? "隱藏設定面板" : "顯示設定面板"}
        </button>
        <span className="ml-auto text-xs text-slate-400">
          支援：OBJ + MTL + 貼圖 / DAE / GLTF / GLB
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div ref={mountRef} className="h-full w-full" />
        {!source && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border border-border-dark bg-surface-dark/90 px-5 py-4 text-center text-sm text-slate-300 shadow-panel">
              請先匯入 3D 模型檔，開始方向與尺寸校正。
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-white/15 bg-black/55 px-3 py-2 text-[11px] text-slate-200">
          滑鼠左鍵旋轉 / 右鍵平移 / 滾輪縮放
        </div>

        {!isInspectorOpen && (
          <button
            type="button"
            className="absolute left-4 top-4 z-30 rounded-lg border border-border-dark bg-surface-darker/90 px-3 py-2 text-xs text-slate-100 shadow-panel transition hover:border-primary hover:text-white"
            onClick={() => setIsInspectorOpen(true)}
          >
            顯示設定面板
          </button>
        )}

        {isInspectorOpen && (
          <aside className="custom-scrollbar absolute bottom-4 left-4 top-4 z-20 w-[340px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-border-dark bg-surface-dark/95 p-4 shadow-panel backdrop-blur">
            <h2 className="text-base font-semibold text-white">家具模型校正工具</h2>
            <p className="mt-1 text-xs text-slate-400">
              在這裡調整模型方向與尺寸，確認實際公尺數後匯出成可再匯入格式。
            </p>

            <div className="mt-3 rounded-lg border border-border-dark bg-background-dark/50 px-3 py-2 text-xs text-slate-300">
              {fileSummaryText}
            </div>

            {status && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  status.type === "success"
                    ? "border-emerald-600/30 bg-emerald-900/20 text-emerald-200"
                    : status.type === "error"
                      ? "border-rose-600/30 bg-rose-900/20 text-rose-200"
                      : "border-blue-600/30 bg-blue-900/20 text-blue-200"
                }`}
              >
                {status.message}
              </div>
            )}

            <div className="mt-4 space-y-3 rounded-xl border border-border-dark bg-background-dark/60 p-3">
              <h3 className="text-sm font-medium text-slate-100">方向旋轉（度）</h3>
              <label className="block text-xs text-slate-300">
                X 軸
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-border-dark bg-background-dark px-2 py-1.5 text-sm text-slate-100"
                  value={rotationDeg.x}
                  step={1}
                  onChange={(event) => onRotationChange("x", Number(event.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-300">
                Y 軸
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-border-dark bg-background-dark px-2 py-1.5 text-sm text-slate-100"
                  value={rotationDeg.y}
                  step={1}
                  onChange={(event) => onRotationChange("y", Number(event.target.value))}
                />
              </label>
              <label className="block text-xs text-slate-300">
                Z 軸
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-border-dark bg-background-dark px-2 py-1.5 text-sm text-slate-100"
                  value={rotationDeg.z}
                  step={1}
                  onChange={(event) => onRotationChange("z", Number(event.target.value))}
                />
              </label>
            </div>

            <div className="mt-3 space-y-3 rounded-xl border border-border-dark bg-background-dark/60 p-3">
              <h3 className="text-sm font-medium text-slate-100">尺寸縮放</h3>
              <label className="block text-xs text-slate-300">
                1 模型單位 = 幾公尺
                <input
                  type="number"
                  min={0.000001}
                  step={0.001}
                  className="mt-1 w-full rounded-md border border-border-dark bg-background-dark px-2 py-1.5 text-sm text-slate-100"
                  value={metersPerUnit}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      setMetersPerUnit(next);
                    }
                  }}
                />
              </label>
              <label className="block text-xs text-slate-300">
                額外縮放倍率
                <input
                  type="number"
                  min={0.0001}
                  step={0.01}
                  className="mt-1 w-full rounded-md border border-border-dark bg-background-dark px-2 py-1.5 text-sm text-slate-100"
                  value={uniformScale}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0) {
                      setUniformScale(next);
                    }
                  }}
                />
              </label>
            </div>

            <div className="mt-3 rounded-xl border border-border-dark bg-background-dark/60 p-3 text-xs text-slate-300">
              <h3 className="text-sm font-medium text-slate-100">模型尺寸（實際公尺）</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border-dark bg-surface-darker/60 p-2">
                  <p className="text-[11px] text-slate-400">寬 (X)</p>
                  <p className="font-mono text-slate-100">
                    {actualDimensions ? formatMeters(actualDimensions.width) : "--"}
                  </p>
                </div>
                <div className="rounded-md border border-border-dark bg-surface-darker/60 p-2">
                  <p className="text-[11px] text-slate-400">深 (Z)</p>
                  <p className="font-mono text-slate-100">
                    {actualDimensions ? formatMeters(actualDimensions.depth) : "--"}
                  </p>
                </div>
                <div className="rounded-md border border-border-dark bg-surface-darker/60 p-2">
                  <p className="text-[11px] text-slate-400">高 (Y)</p>
                  <p className="font-mono text-slate-100">
                    {actualDimensions ? formatMeters(actualDimensions.height) : "--"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                原始包圍盒：{" "}
                {sourceDimensions
                  ? `${sourceDimensions.width.toFixed(3)} x ${sourceDimensions.depth.toFixed(3)} x ${sourceDimensions.height.toFixed(3)} (模型單位)`
                  : "--"}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              比例尺：地板網格每格 = 1m；左下黃色尺規長度 = 1m。藍框是模型外框，橘/綠/紫線分別代表寬/深/高量測線。
            </div>
          </aside>
        )}
      </div>

      <input
        ref={modelInputRef}
        type="file"
        className="hidden-input"
        accept={MODEL_ACCEPT}
        multiple
        onChange={onModelInputChange}
      />
      <input
        ref={packageInputRef}
        type="file"
        className="hidden-input"
        accept="application/json,.json"
        onChange={onPackageInputChange}
      />
    </section>
  );
}
