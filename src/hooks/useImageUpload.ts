import { useCallback, useState } from "react";

export interface LoadedImagePayload {
  image: HTMLImageElement;
  filename: string;
  width: number;
  height: number;
}

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png"]);

export function useImageUpload(maxFileSizeBytes = 10 * 1024 * 1024) {
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.has(file.type)) {
        return "只支援 JPG / PNG 格式。";
      }

      if (file.size > maxFileSizeBytes) {
        return `檔案過大，請小於 ${(maxFileSizeBytes / (1024 * 1024)).toFixed(0)}MB。`;
      }

      return null;
    },
    [maxFileSizeBytes],
  );

  const readImage = useCallback((file: File): Promise<LoadedImagePayload> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        resolve({
          image,
          filename: file.name,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("圖片載入失敗。"));
      };

      image.src = objectUrl;
    });
  }, []);

  const loadFile = useCallback(
    async (file: File): Promise<LoadedImagePayload | null> => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return null;
      }

      try {
        const payload = await readImage(file);
        setError(null);
        return payload;
      } catch (err) {
        setError(err instanceof Error ? err.message : "圖片載入失敗。");
        return null;
      }
    },
    [readImage, validateFile],
  );

  return {
    error,
    setError,
    loadFile,
  };
}

