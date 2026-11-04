import { useEffect, useRef, useState } from "react";
import { detect, validateFile } from "../api";
import BoxOverlay from "../components/BoxOverlay";

const SAMPLES = Array.from({ length: 10 }, (_, i) => ({
  file: `frame${i + 1}.jpg`,
  label: `Frame ${String(i + 1).padStart(2, "0")}`,
}));

function averageConfidence(detections) {
  if (!detections.length) return 0;
  return detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
}

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  async function run(blob, name) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(blob);
    setPreview(previewRef.current);
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      setResult(await detect(blob, name, controller.signal));
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  function resetVideo() {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoUrl(null);
  }

  function onFile(event) {
    const file = event.target.files[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    if (file.type.startsWith("video/")) {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setPreview(null);
      setResult(null);
      resetVideo();
      videoUrlRef.current = URL.createObjectURL(file);
      setVideoUrl(videoUrlRef.current);
    } else {
      resetVideo();
      run(file, file.name);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Video is not ready yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) =>
        blob
          ? run(blob, `frame-${video.currentTime.toFixed(1)}s.jpg`)
          : setError("Could not capture this frame."),
      "image/jpeg",
      0.92,
    );
  }

  async function runSample(sample) {
    setError(null);
    try {
      const response = await fetch(`/samples/${sample.file}`);
      if (!response.ok) throw new Error("Could not load this sample image.");
      run(await response.blob(), sample.file);
    } catch (err) {
      setError(err.message);
    }
  }

  function clear() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    resetVideo();
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }

  const avgConfidence = result
    ? result.avg_confidence ?? averageConfidence(result.detections)
    : 0;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Live analysis</p>
          <h1>Detection</h1>
          <p className="lede">
            Upload an image, capture a frame from a video, or pick a sample. Every
            analysed frame is logged to the history.
          </p>
        </div>
        {(result || preview || videoUrl || error) && (
          <button className="button ghost" onClick={clear}>
            Clear
          </button>
        )}
      </header>

      <div className="detection-layout">
        <div className="panel">
          <label className={`dropzone${loading ? " is-loading" : ""}`}>
            <input
              type="file"
              accept="image/jpeg,image/png,video/mp4"
              onChange={onFile}
              disabled={loading}
            />
            <span className="dropzone-icon" aria-hidden="true">
              ↑
            </span>
            <strong>{loading ? "Analysing frame…" : "Choose an image or video"}</strong>
            <span className="muted">JPG, PNG or MP4 · max 50 MB</span>
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {videoUrl && (
            <div className="video-block">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                onError={() => setError("This video can't be played in your browser.")}
              />
              <div className="row" style={{ marginTop: 12 }}>
                <span className="pill">
                  <span className="dot" />
                  Video ready
                </span>
                <button className="button primary" onClick={captureFrame} disabled={loading}>
                  Detect this frame
                </button>
              </div>
            </div>
          )}

          {loading && !result && (
            <div className="loading-line" aria-label="Processing">
              <span />
            </div>
          )}

          {preview && result && (
            <div className="canvas-wrap">
              <BoxOverlay src={preview} detections={result.detections} />
            </div>
          )}
        </div>

        <aside className="panel result-panel">
          <div className="section-head">
            <p className="eyebrow" style={{ margin: 0 }}>
              Result
            </p>
            {result && <span className="pill">Image</span>}
          </div>

          {!result && !loading && <p className="muted">No frame analysed yet.</p>}

          {loading && <p className="muted">Running YOLOv8 inference…</p>}

          {result && (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-label">People</div>
                  <div className="stat-value">{result.count}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Avg conf.</div>
                  <div className="stat-value">
                    {(avgConfidence * 100).toFixed(0)}
                    <small>%</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total</div>
                  <div className="stat-value">
                    {result.processing_time_ms.toFixed(0)}
                    <small>ms</small>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Inference</div>
                  <div className="stat-value">
                    {(result.inference_time_ms ?? 0).toFixed(0)}
                    <small>ms</small>
                  </div>
                </div>
              </div>

              <p className="eyebrow">Detections</p>
              {result.detections.length === 0 ? (
                <p className="muted">No people found in this frame.</p>
              ) : (
                <ul className="detection-list">
                  {result.detections.map((detection, index) => (
                    <li className="detection-row" key={`${index}-${detection.bbox.join("-")}`}>
                      <div className="detection-top">
                        <strong>Person {String(index + 1).padStart(2, "0")}</strong>
                        <span>{(detection.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="confidence-bar">
                        <span style={{ width: `${detection.confidence * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </aside>
      </div>

      <section className="samples-section">
        <div className="section-head">
          <h2>Sample frames</h2>
          <span className="muted">10 demo images</span>
        </div>
        <div className="sample-grid">
          {SAMPLES.map((sample) => (
            <button
              key={sample.file}
              className="sample"
              onClick={() => runSample(sample)}
              disabled={loading}
              title={`Detect people in ${sample.label}`}
            >
              <img src={`/samples/${sample.file}`} alt={sample.label} loading="lazy" />
              <span className="sample-tag">{sample.label}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
