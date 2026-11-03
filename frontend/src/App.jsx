import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import DetectionView from "./pages/DetectionView";
import HistoryView from "./pages/HistoryView";

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ display: "flex", gap: 16 }}>
        <NavLink to="/">Detection</NavLink>
        <NavLink to="/history">History</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<DetectionView />} />
        <Route path="/history" element={<HistoryView />} />
      </Routes>
    </BrowserRouter>
  );
}
