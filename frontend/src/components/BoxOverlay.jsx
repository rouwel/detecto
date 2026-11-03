import { useEffect, useRef } from "react";

export default function BoxOverlay({ src, detections }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      c.width = img.naturalWidth;   // draw in image pixels; CSS scales it
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const lw = Math.max(2, img.naturalWidth / 400);
      ctx.lineWidth = lw;
      ctx.font = `${lw * 6}px sans-serif`;
      detections.forEach(({ bbox: [x1, y1, x2, y2], confidence }) => {
        ctx.strokeStyle = "#22c55e";
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const label = `${(confidence * 100).toFixed(0)}%`;
        const w = ctx.measureText(label).width + lw * 4;
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(x1, y1 - lw * 8, w, lw * 8);
        ctx.fillStyle = "#000";
        ctx.fillText(label, x1 + lw * 2, y1 - lw * 2);
      });
    };
    img.src = src;
  }, [src, detections]);

  return <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />;
}