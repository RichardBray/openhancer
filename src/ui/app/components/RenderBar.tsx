import { useState, useCallback } from "react";

interface Props {
  file: File;
  params: Record<string, string | number | boolean>;
  canvas: HTMLCanvasElement | null;
  isVideo: boolean;
}

type ExportState = "idle" | "uploading" | "rendering" | "done" | "error";

export function RenderBar({ file, params, canvas, isVideo }: Props) {
  const [state, setState] = useState<ExportState>("idle");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadImage = useCallback(() => {
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.[^.]+$/, "_openhanced.png");
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [canvas, file.name]);

  const startExport = useCallback(async () => {
    setState("uploading");
    setProgress(0);
    setDownloadUrl(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("params", JSON.stringify(params));

    try {
      const res = await fetch("/api/export", { method: "POST", body: formData });
      if (!res.ok || !res.body) {
        setState("error");
        setError("Export request failed");
        return;
      }

      setState("rendering");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/);
          if (!match) continue;
          const data = JSON.parse(match[1]);
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.done) {
            setState("done");
            setDownloadUrl(data.downloadUrl);
          }
          if (data.error) {
            setState("error");
            setError(data.error);
          }
        }
      }
    } catch (err) {
      setState("error");
      setError((err as Error).message);
    }
  }, [file, params]);

  return (
    <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 12, marginTop: 12 }}>
      {state === "idle" && (
        <button
          onClick={isVideo ? startExport : downloadImage}
          style={{
            width: "100%", padding: "8px 16px", background: "#2563eb", color: "#fff",
            border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {isVideo ? "Export" : "Download"}
        </button>
      )}

      {(state === "uploading" || state === "rendering") && (
        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            {state === "uploading" ? "Uploading..." : `Rendering... ${Math.round(progress * 100)}%`}
          </div>
          <div role="progressbar" style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: "#2563eb", borderRadius: 3, transition: "width 0.2s" }} />
          </div>
        </div>
      )}

      {state === "done" && downloadUrl && (
        <a
          href={downloadUrl}
          download
          style={{
            display: "block", textAlign: "center", padding: "8px 16px",
            background: "#16a34a", color: "#fff", borderRadius: 6, fontSize: 13,
            fontWeight: 600, textDecoration: "none",
          }}
        >
          Download
        </a>
      )}

      {state === "error" && (
        <div>
          <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 4 }}>{error}</div>
          <button
            onClick={() => setState("idle")}
            style={{ background: "#333", color: "#e0e0e0", border: "none", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
