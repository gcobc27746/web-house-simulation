import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { LoadedImagePayload, useImageUpload } from "../hooks/useImageUpload";

interface ImageUploadProps {
  onImageLoaded: (payload: LoadedImagePayload) => void;
}

export function ImageUpload({ onImageLoaded }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { error, setError, loadFile } = useImageUpload();

  const handleFile = async (file: File) => {
    const payload = await loadFile(file);
    if (payload) {
      onImageLoaded(payload);
    }
  };

  const onInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleFile(file);
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  return (
    <section className="panel">
      <h2>1.4 圖片上傳</h2>
      <p>支援 JPG / PNG，可拖放或點擊選擇檔案。</p>

      <div
        className={`dropzone${isDragging ? " dropzone-dragging" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            inputRef.current?.click();
          }
        }}
      >
        <p>{isDragging ? "放開以上傳圖片" : "拖放圖片到這裡，或點擊選擇檔案"}</p>
        <button type="button" className="btn">
          選擇圖片
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden-input"
        onChange={onInputChange}
      />

      {error && (
        <div className="error-box">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-link"
            onClick={() => setError(null)}
          >
            關閉
          </button>
        </div>
      )}
    </section>
  );
}

