import { useEffect, useRef, useState } from "react";

export default function BoxOverlay({ src, detections = [] }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.naturalWidth; // draw in image pixels; CSS scales it
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setFailed(true);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const lw = Math.max(2, img.naturalWidth / 400);
      ctx.lineWidth = lw;
      ctx.font = `${Math.round(lw * 6)}px ui-monospace, monospace`;
      ctx.textBaseline = "middle";

      detections.forEach(({ bbox: [x1, y1, x2, y2], confidence }) => {
        ctx.strokeStyle = "#6ee7a8";
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        const label = `${(confidence * 100).toFixed(0)}%`;
        const padding = lw * 3;
        const w = ctx.measureText(label).width + padding * 2;
        const h = lw * 9;

        ctx.fillStyle = "#6ee7a8";
        ctx.fillRect(x1, Math.max(0, y1 - h), w, h);
        ctx.fillStyle = "#050505";
        ctx.fillText(label, x1 + padding, Math.max(h / 2, y1 - h / 2));
      });
    };
    img.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, detections]);

  if (failed) {
    return <p className="error">Could not render the detection overlay.</p>;
  }

  return <canvas ref={canvasRef} aria-label="Detected people overlay" />;
}
