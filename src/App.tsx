import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./components/Canvas";
import { DistanceInputDialog } from "./components/DistanceInputDialog";
import { ImageUpload } from "./components/ImageUpload";
import { ScaleCalibration } from "./components/ScaleCalibration";
import { StorageControls } from "./components/StorageControls";
import { WallDrawing } from "./components/WallDrawing";
import { WindowMarking } from "./components/WindowMarking";
import { useFloorplanStorage } from "./hooks/useFloorplanStorage";
import { useScaleCalibration } from "./hooks/useScaleCalibration";
import { useWallDrawing } from "./hooks/useWallDrawing";
import { useWindowMarking } from "./hooks/useWindowMarking";
import { GeometryPreview } from "./step2/viewer/GeometryPreview";
import type { LoadedImagePayload } from "./hooks/useImageUpload";
import type { FloorplanData } from "./types/floorplan";

const nowIso = () => new Date().toISOString();

function createInitialData(): FloorplanData {
  const createdAt = nowIso();
  return {
    meta: {
      version: "1.0.0",
      createdAt,
      updatedAt: createdAt,
    },
    walls: [],
    polygons: [],
    windows: [],
  };
}

export default function App() {
  const [floorplanData, setFloorplanData] = useState<FloorplanData>(
    createInitialData,
  );
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [ceilingHeight, setCeilingHeight] = useState(2.8);
  const [wallThickness, setWallThickness] = useState(0.12);
  const [cameraHeight, setCameraHeight] = useState(1.7);
  const [moveSpeed, setMoveSpeed] = useState(2.8);
  const [lookSensitivity, setLookSensitivity] = useState(1);
  const [isDistanceDialogOpen, setIsDistanceDialogOpen] = useState(false);
  const calibration = useScaleCalibration();
  const wallDrawing = useWallDrawing();
  const windowMarking = useWindowMarking();

  const applyLoadedData = useCallback(
    (nextData: FloorplanData) => {
      setFloorplanData(nextData);
      calibration.hydrateScale(nextData.scale ?? null);
      wallDrawing.hydrateWalls(nextData.walls);
      windowMarking.hydrateWindows(nextData.windows ?? []);
      setIsDistanceDialogOpen(false);
    },
    [calibration, wallDrawing, windowMarking],
  );

  const storage = useFloorplanStorage(floorplanData, applyLoadedData);

  const onImageLoaded = (payload: LoadedImagePayload) => {
    calibration.stopCalibrationMode();
    wallDrawing.cancelCurrentWall();
    wallDrawing.stopDrawing();
    windowMarking.stopWindowMode();
    windowMarking.cancelDraft();
    setUploadedImage(payload.image);
    setFloorplanData((previous) => ({
      ...previous,
      image: {
        width: payload.width,
        height: payload.height,
        filename: payload.filename,
      },
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  };

  const measurementDistancePx = useMemo(() => {
    if (calibration.measurementPoints.length !== 2) return null;
    return Math.hypot(
      calibration.measurementPoints[1].x - calibration.measurementPoints[0].x,
      calibration.measurementPoints[1].y - calibration.measurementPoints[0].y,
    );
  }, [calibration.measurementPoints]);

  useEffect(() => {
    if (calibration.isCalibrationMode && calibration.measurementPoints.length === 2) {
      setIsDistanceDialogOpen(true);
    }
  }, [calibration.isCalibrationMode, calibration.measurementPoints.length]);

  const onConfirmDistance = (distance: number) => {
    const nextScale = calibration.calculateScale(distance);
    if (!nextScale) return false;

    setFloorplanData((previous) => ({
      ...previous,
      scale: nextScale,
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
    setIsDistanceDialogOpen(false);
    return true;
  };

  const onCancelDistance = () => {
    setIsDistanceDialogOpen(false);
    calibration.clearMeasurement();
  };

  const onResetCalibration = () => {
    setIsDistanceDialogOpen(false);
    calibration.resetCalibration();
    wallDrawing.resetWalls();
    windowMarking.resetWindows();
    setFloorplanData((previous) => ({
      ...previous,
      scale: undefined,
      walls: [],
      polygons: [],
      windows: [],
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  };

  useEffect(() => {
    setFloorplanData((previous) => ({
      ...previous,
      walls: wallDrawing.walls,
      polygons: wallDrawing.polygons,
      windows: windowMarking.windows,
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  }, [wallDrawing.walls, wallDrawing.polygons, windowMarking.windows]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete") {
        if (windowMarking.selectedWindowId) {
          windowMarking.deleteWindow(windowMarking.selectedWindowId);
          return;
        }
        if (wallDrawing.selectedWallId) {
          wallDrawing.deleteWall(wallDrawing.selectedWallId);
        }
      }
      if (event.key === "Escape") {
        wallDrawing.cancelCurrentWall();
        windowMarking.cancelDraft();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    wallDrawing.cancelCurrentWall,
    wallDrawing.deleteWall,
    wallDrawing.selectedWallId,
    windowMarking.cancelDraft,
    windowMarking.deleteWindow,
    windowMarking.selectedWindowId,
  ]);

  const imageInfoText = useMemo(() => {
    if (!floorplanData.image) return "尚未設定 image metadata。";
    return `${floorplanData.image.filename} (${floorplanData.image.width}x${floorplanData.image.height})`;
  }, [floorplanData.image]);

  return (
    <main className="layout">
      <header className="header">
        <h1>Step1 - Floorplan Calibration</h1>
        <p>React + TypeScript + react-konva</p>
      </header>

      <ImageUpload onImageLoaded={onImageLoaded} />
      <StorageControls
        onExport={storage.exportJSON}
        onImport={storage.importJSON}
        onClear={() => {
          const confirmed = window.confirm("確定要清除本地資料嗎？此動作無法復原。");
          if (!confirmed) return;
          storage.clearStorage();
          calibration.resetCalibration();
          wallDrawing.resetWalls();
          windowMarking.resetWindows();
          setUploadedImage(null);
          setIsDistanceDialogOpen(false);
          setFloorplanData(createInitialData());
        }}
      />
      {storage.status && (
        <section className={`panel storage-status ${storage.status.type}`}>
          <p>{storage.status.message}</p>
          <button type="button" className="btn btn-link" onClick={storage.clearStatus}>
            關閉
          </button>
        </section>
      )}
      <ScaleCalibration
        canCalibrate={Boolean(uploadedImage)}
        isCalibrationMode={calibration.isCalibrationMode}
        measurementPointsCount={calibration.measurementPoints.length}
        pixelDistance={measurementDistancePx}
        scale={calibration.scale}
        onStartCalibration={() => {
          wallDrawing.stopDrawing();
          setIsDistanceDialogOpen(false);
          calibration.startCalibration();
        }}
        onResetCalibration={onResetCalibration}
      />
      <div className="editor-layout">
        <WallDrawing
          canDraw={Boolean(uploadedImage && calibration.scale)}
          isDrawingMode={wallDrawing.isDrawingMode}
          isContinuousMode={wallDrawing.isContinuousMode}
          wallsCount={wallDrawing.walls.length}
          polygonsCount={wallDrawing.polygons.length}
          selectedWallId={wallDrawing.selectedWallId}
          canUndo={wallDrawing.canUndo}
          canRedo={wallDrawing.canRedo}
          onToggleDrawingMode={() => {
            setIsDistanceDialogOpen(false);
            calibration.stopCalibrationMode();
            windowMarking.stopWindowMode();
            windowMarking.cancelDraft();
            if (wallDrawing.isDrawingMode) {
              wallDrawing.cancelCurrentWall();
              wallDrawing.stopDrawing();
            } else {
              if (calibration.scale) {
                wallDrawing.startDrawing();
              }
            }
          }}
          onToggleContinuousMode={wallDrawing.setContinuousMode}
          onUndo={wallDrawing.undo}
          onRedo={wallDrawing.redo}
          onDeleteSelected={() => {
            if (!wallDrawing.selectedWallId) return;
            wallDrawing.deleteWall(wallDrawing.selectedWallId);
          }}
          windowControls={
            <WindowMarking
              canMark={Boolean(uploadedImage && calibration.scale && wallDrawing.walls.length > 0)}
              isWindowMode={windowMarking.isWindowMode}
              selectedType={windowMarking.selectedType}
              windowsCount={windowMarking.windows.length}
              selectedWindowId={windowMarking.selectedWindowId}
              onToggleWindowMode={() => {
                setIsDistanceDialogOpen(false);
                calibration.stopCalibrationMode();
                wallDrawing.cancelCurrentWall();
                wallDrawing.stopDrawing();
                if (windowMarking.isWindowMode) {
                  windowMarking.stopWindowMode();
                  windowMarking.cancelDraft();
                } else if (uploadedImage && calibration.scale && wallDrawing.walls.length > 0) {
                  windowMarking.startWindowMode();
                }
              }}
              onSelectType={windowMarking.setWindowType}
              onDeleteSelectedWindow={() => {
                if (!windowMarking.selectedWindowId) return;
                windowMarking.deleteWindow(windowMarking.selectedWindowId);
              }}
            />
          }
        />
        <Canvas
          image={uploadedImage}
          isCalibrationMode={calibration.isCalibrationMode}
          measurementPoints={calibration.measurementPoints}
          scale={calibration.scale}
          onAddMeasurementPoint={calibration.addMeasurementPoint}
          isDrawingMode={wallDrawing.isDrawingMode && Boolean(calibration.scale)}
          walls={wallDrawing.walls}
          polygons={wallDrawing.polygons}
          selectedWallId={wallDrawing.selectedWallId}
          currentWall={wallDrawing.currentWall}
          onBeginWall={wallDrawing.beginWall}
          onUpdateCurrentWall={wallDrawing.updateCurrentWall}
          onCompleteCurrentWall={wallDrawing.completeCurrentWall}
          onSelectWall={wallDrawing.selectWall}
          onMoveWallEndpoint={wallDrawing.moveWallEndpoint}
          isWindowMode={windowMarking.isWindowMode}
          windows={windowMarking.windows}
          selectedWindowId={windowMarking.selectedWindowId}
          selectedWindowType={windowMarking.selectedType}
          onAddWindowByOffsets={windowMarking.addWindowByOffsets}
          onSelectWindow={windowMarking.selectWindow}
        />
      </div>
      <DistanceInputDialog
        isOpen={isDistanceDialogOpen}
        pixelDistance={measurementDistancePx}
        onConfirm={onConfirmDistance}
        onCancel={onCancelDistance}
      />
      <section className="panel">
        <h2>Step2 2.5 Camera & Controls</h2>
        <div className="geometry-settings">
          <label>
            天花板高度 (m)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={ceilingHeight}
              onChange={(event) => setCeilingHeight(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            牆厚 (m)
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={wallThickness}
              onChange={(event) => setWallThickness(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            相機高度 (m)
            <input
              type="number"
              min={1}
              max={2.2}
              step={0.1}
              value={cameraHeight}
              onChange={(event) => setCameraHeight(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            移動速度 (m/s)
            <input
              type="number"
              min={0.5}
              max={10}
              step={0.1}
              value={moveSpeed}
              onChange={(event) => setMoveSpeed(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            滑鼠靈敏度
            <input
              type="number"
              min={0.2}
              max={3}
              step={0.1}
              value={lookSensitivity}
              onChange={(event) => setLookSensitivity(Number(event.target.value) || 0)}
            />
          </label>
        </div>
        <GeometryPreview
          floorplanData={floorplanData}
          ceilingHeight={ceilingHeight}
          wallThickness={wallThickness}
          cameraHeight={cameraHeight}
          moveSpeed={moveSpeed}
          lookSensitivity={lookSensitivity}
        />
      </section>

      <section className="panel">
        <h2>資料狀態</h2>
        <p>{imageInfoText}</p>
        {!uploadedImage && floorplanData.image && (
          <p className="calibration-status">
            已恢復資料，但圖片檔案需重新上傳（JSON/LocalStorage 不含圖片內容）。
          </p>
        )}
        <pre className="json-view">
          {JSON.stringify(
            {
              meta: floorplanData.meta,
              image: floorplanData.image ?? null,
              scale: floorplanData.scale ?? null,
              walls: floorplanData.walls,
              polygons: floorplanData.polygons,
              windows: floorplanData.windows,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

