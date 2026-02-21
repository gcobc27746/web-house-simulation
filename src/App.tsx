import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./components/Canvas";
import { DistanceInputDialog } from "./components/DistanceInputDialog";
import { ImageUpload } from "./components/ImageUpload";
import { ScaleCalibration } from "./components/ScaleCalibration";
import { StorageControls } from "./components/StorageControls";
import { WallDrawing } from "./components/WallDrawing";
import { useFloorplanStorage } from "./hooks/useFloorplanStorage";
import { useScaleCalibration } from "./hooks/useScaleCalibration";
import { useWallDrawing } from "./hooks/useWallDrawing";
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
  const [isDistanceDialogOpen, setIsDistanceDialogOpen] = useState(false);
  const calibration = useScaleCalibration();
  const wallDrawing = useWallDrawing();

  const applyLoadedData = useCallback(
    (nextData: FloorplanData) => {
      setFloorplanData(nextData);
      calibration.hydrateScale(nextData.scale ?? null);
      wallDrawing.hydrateWalls(nextData.walls);
      setIsDistanceDialogOpen(false);
    },
    [calibration, wallDrawing],
  );

  const storage = useFloorplanStorage(floorplanData, applyLoadedData);

  const onImageLoaded = (payload: LoadedImagePayload) => {
    calibration.stopCalibrationMode();
    wallDrawing.cancelCurrentWall();
    wallDrawing.stopDrawing();
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
    setFloorplanData((previous) => ({
      ...previous,
      scale: undefined,
      walls: [],
      polygons: [],
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
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  }, [wallDrawing.walls, wallDrawing.polygons]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" && wallDrawing.selectedWallId) {
        wallDrawing.deleteWall(wallDrawing.selectedWallId);
      }
      if (event.key === "Escape") {
        wallDrawing.cancelCurrentWall();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wallDrawing.cancelCurrentWall, wallDrawing.deleteWall, wallDrawing.selectedWallId]);

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
      />
      <DistanceInputDialog
        isOpen={isDistanceDialogOpen}
        pixelDistance={measurementDistancePx}
        onConfirm={onConfirmDistance}
        onCancel={onCancelDistance}
      />
      <section className="panel">
        <h2>Step2 2.4 Geometry Generation</h2>
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
        </div>
        <GeometryPreview
          floorplanData={floorplanData}
          ceilingHeight={ceilingHeight}
          wallThickness={wallThickness}
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
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

