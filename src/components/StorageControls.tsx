import { ChangeEvent, useRef } from "react";

interface StorageControlsProps {
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}

export function StorageControls({
  onExport,
  onImport,
  onClear,
}: StorageControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onImport(file);
    event.target.value = "";
  };

  return (
    <section className="panel">
      <h2>1.7 資料儲存</h2>
      <p>支援 LocalStorage 自動儲存與 JSON 匯入/匯出。</p>
      <div className="wall-actions">
        <button type="button" className="btn" onClick={onExport}>
          匯出 JSON
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => fileInputRef.current?.click()}
        >
          匯入 JSON
        </button>
        <button type="button" className="btn btn-link" onClick={onClear}>
          清除本地資料
        </button>
      </div>
      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={onFileChange}
      />
    </section>
  );
}
