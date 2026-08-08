import { Link, Route, Routes } from "react-router-dom";
import "./App.css";
import PropertyList from "./pages/PropertyList";
import PropertyDetail from "./pages/PropertyDetail";
import Ingest from "./pages/Ingest";

function App() {
  return (
    <div className="app-shell">
      <nav className="nav-bar">
        <Link to="/" className="brand">
          物件情報リスト化ツール
        </Link>
        <Link to="/ingest">取込デモ</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<PropertyList />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/ingest" element={<Ingest />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
