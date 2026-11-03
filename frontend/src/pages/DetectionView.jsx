import { useState, useRef } from "react";
import { detect, validateFile } from "../api";
import BoxOverlay from "../components/BoxOverlay";

export default function DetectionView() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const videoRef = useRef(null);
  const previewRef = useRef(null);
  const videoUrlRef = useRef(null);

  async function run(blob, name) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(blob);
    setPreview(previewRef.current);
    setError(null); setResult(null); setLoading(true);

    try {
      setResult(await detect(blob, name, ctrl.signal));
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }

  function onFile(e) {
    const file = e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    const problem = validateFile(file);
    if (problem) { setError(problem); return; }
    setError(null);

    if (file.type.startsWith("video/")) {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = URL.createObjectURL(file);
      setVideoUrl(videoUrlRef.current);
      setResult(null); setPreview(null);
    } else {
      setVideoUrl(null);
      run(file, file.name);
    }
  }

  function captureFrame() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError("Video is not ready yet."); return; }
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(
      b => b ? run(b, `frame-${v.currentTime.toFixed(1)}s.jpg`) : setError("Could not capture frame."),
      "image/jpeg", 0.92
    );
  }

  return (
    <section>
      <h1>Detection</h1>
      <input type="file" accept="image/jpeg,image/png,video/mp4" onChange={onFile} />
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}

      {videoUrl && (
        <div>
          <video ref={videoRef} src={videoUrl} controls style={{ maxWidth: "100%" }}
                 onError={() => setError("This video can't be played in your browser.")} />
          <p><button onClick={captureFrame} disabled={loading}>Detect people in this frame</button></p>
        </div>
      )}

      {loading && <p>Processing…</p>}
      {preview && result && <BoxOverlay src={preview} detections={result.detections} />}

      {result && (
        <>
          <p>
            <strong>People:</strong> {result.count} ·{" "}
            <strong>Processing time:</strong> {result.processing_time_ms.toFixed(0)} ms
          </p>
          <ul>
            {result.detections.map((d, i) => (
              <li key={i}>Person {i + 1}: {(d.confidence * 100).toFixed(1)}%</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}