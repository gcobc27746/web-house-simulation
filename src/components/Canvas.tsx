import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Layer, Stage, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

interface CanvasProps {
  image: HTMLImageElement | null;
}

interface TransformState {
  x: number;
  y: number;
  scale: number;
}

const VIEWPORT = {
  width: 1000,
  height: 640,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function Canvas({ image }: CanvasProps) {
  const [transform, setTransform] = useState<TransformState>({
    x: 0,
    y: 0,
    scale: 1,
  });

  const hasImage = Boolean(image);

  useEffect(() => {
    if (!image) return;

    const fitScale = Math.min(
      (VIEWPORT.width - 40) / image.width,
      (VIEWPORT.height - 40) / image.height,
      1,
    );

    setTransform({
      scale: fitScale,
      x: (VIEWPORT.width - image.width * fitScale) / 2,
      y: (VIEWPORT.height - image.height * fitScale) / 2,
    });
  }, [image]);

  const imageSizeText = useMemo(() => {
    if (!image) return "尚未載入圖片";
    return `圖片尺寸：${image.width} x ${image.height}px`;
  }, [image]);

  const onWheel = (event: KonvaEventObject<WheelEvent>) => {
    if (!image) return;
    event.evt.preventDefault();

    const stage = event.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = transform.scale;
    const zoomDelta = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    const newScale = clamp(oldScale * zoomDelta, 0.1, 8);

    const mousePointTo = {
      x: (pointer.x - transform.x) / oldScale,
      y: (pointer.y - transform.y) / oldScale,
    };

    setTransform({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  return (
    <section className="panel canvas-panel">
      <h2>2D 畫布</h2>
      <p>{imageSizeText}</p>
      <Stage
        width={VIEWPORT.width}
        height={VIEWPORT.height}
        className="stage"
        onWheel={onWheel}
      >
        <Layer>
          {image && (
            <Group
              x={transform.x}
              y={transform.y}
              scaleX={transform.scale}
              scaleY={transform.scale}
              draggable
              onDragEnd={(evt) => {
                setTransform((previous) => ({
                  ...previous,
                  x: evt.target.x(),
                  y: evt.target.y(),
                }));
              }}
            >
              <KonvaImage image={image} />
            </Group>
          )}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {hasImage ? "滑鼠滾輪可縮放，拖曳圖片可移動位置。" : "請先上傳圖片。"}
      </div>
    </section>
  );
}

