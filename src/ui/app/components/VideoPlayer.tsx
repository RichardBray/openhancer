import { useRef, useEffect } from "react";
import { createRenderer, type Renderer, type PreviewParams } from "../gpu/renderer";
import { fitPreviewSize } from "../mediaSizing";

interface Props {
  src: string;
  isVideo: boolean;
  params: PreviewParams;
  onRendererReady: (renderer: Renderer) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export function VideoPlayer({ src, isVideo, params, onRendererReady, onCanvasReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;

    async function init() {
      const canvas = canvasRef.current!;

      if (isVideo) {
        const video = videoRef.current!;
        await new Promise<void>(resolve => {
          video.onloadeddata = () => resolve();
          if (video.readyState >= 2) resolve();
        });
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const previewSize = fitPreviewSize(sourceWidth, sourceHeight);
        if (cancelled) return;

        const renderer = await createRenderer(canvas, {
          sourceWidth,
          sourceHeight,
          previewWidth: previewSize.width,
          previewHeight: previewSize.height,
        });
        renderer.setSource(video);
        renderer.setParams(params);
        rendererRef.current = renderer;
        onRendererReady(renderer);

        function loop() {
          if (cancelled) return;
          renderer.renderFrame();
          rafRef.current = requestAnimationFrame(loop);
        }

        video.play();
        loop();
      } else {
        const img = imgRef.current!;
        await new Promise<void>(resolve => {
          img.onload = () => resolve();
          if (img.complete) resolve();
        });
        const sourceWidth = img.naturalWidth;
        const sourceHeight = img.naturalHeight;
        const previewSize = fitPreviewSize(sourceWidth, sourceHeight);
        if (cancelled) return;

        const renderer = await createRenderer(canvas, {
          sourceWidth,
          sourceHeight,
          previewWidth: previewSize.width,
          previewHeight: previewSize.height,
        });
        renderer.setSource(img);
        renderer.setParams(params);
        renderer.renderFrame();
        rendererRef.current = renderer;
        onRendererReady(renderer);
      }
    }

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [src, isVideo]);

  useEffect(() => {
    if (canvasRef.current && onCanvasReady) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setParams(params);
      if (!isVideo) rendererRef.current.renderFrame();
    }
  }, [params, isVideo]);

  return (
    <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      {isVideo && (
        <video
          ref={videoRef}
          src={src}
          style={{ display: "none" }}
          muted
          playsInline
          crossOrigin="anonymous"
        />
      )}
      {!isVideo && (
        <img
          ref={imgRef}
          src={src}
          style={{ display: "none" }}
          crossOrigin="anonymous"
        />
      )}
      <canvas
        ref={canvasRef}
        style={{ maxWidth: "100%", maxHeight: "calc(100vh - 100px)", borderRadius: 8 }}
      />
      {isVideo && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          defaultValue={0}
          style={{ width: "calc(100% - 32px)", marginTop: 8 }}
          onChange={e => {
            if (videoRef.current) {
              videoRef.current.currentTime = parseFloat(e.target.value) * videoRef.current.duration;
            }
          }}
        />
      )}
    </div>
  );
}
