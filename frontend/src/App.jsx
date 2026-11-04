import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import DetectionView from "./pages/DetectionView";
import HistoryView from "./pages/HistoryView";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="brand" end>
            detecto<span>.</span>
          </NavLink>
          <nav className="nav" aria-label="Primary">
            <NavLink to="/" end>
              Detection
            </NavLink>
            <NavLink to="/history">History</NavLink>
          </nav>
        </header>

        <main className="page">
          <Routes>
            <Route path="/" element={<DetectionView />} />
            <Route path="/history" element={<HistoryView />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <span>YOLOv8 · FastAPI · React</span>
          <span>Person detection &amp; counting</span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
