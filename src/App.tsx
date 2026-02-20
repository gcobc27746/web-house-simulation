import { useMemo, useState } from "react";
import { Canvas } from "./components/Canvas";
import { ImageUpload } from "./components/ImageUpload";
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

  const onImageLoaded = (payload: LoadedImagePayload) => {
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

  const imageInfoText = useMemo(() => {
    if (!floorplanData.image) return "尚未設定 image metadata。";
    return `${floorplanData.image.filename} (${floorplanData.image.width}x${floorplanData.image.height})`;
  }, [floorplanData.image]);

  return (
    <main className="layout">
      <header className="header">
        <h1>Step1 - Floorplan Image Upload</h1>
        <p>React + TypeScript + react-konva</p>
      </header>

      <ImageUpload onImageLoaded={onImageLoaded} />
      <Canvas image={uploadedImage} />

      <section className="panel">
        <h2>image 欄位狀態</h2>
        <p>{imageInfoText}</p>
        <pre className="json-view">
          {JSON.stringify(
            {
              meta: floorplanData.meta,
              image: floorplanData.image ?? null,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

