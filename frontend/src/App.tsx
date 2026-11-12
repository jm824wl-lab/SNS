import { Link, Route, Routes } from "react-router-dom";
import "./App.css";
import PropertyList from "./pages/PropertyList";
import PropertyDetail from "./pages/PropertyDetail";
import Ingest from "./pages/Ingest";
import Match from "./pages/Match";
import BuyerList from "./pages/BuyerList";
import BuyerDetail from "./pages/BuyerDetail";
import BuyerForm from "./pages/BuyerForm";

function App() {
  return (
    <div className="app-shell">
      <nav className="nav-bar">
        <Link to="/" className="brand">
          物件情報リスト化ツール
        </Link>
        <div className="nav-links">
          <Link to="/">物件一覧</Link>
          <Link to="/match">紹介先を探す</Link>
          <Link to="/buyers">会社クライテリア</Link>
          <Link to="/ingest">取込デモ</Link>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<PropertyList />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/match" element={<Match />} />
          <Route path="/buyers" element={<BuyerList />} />
          <Route path="/buyers/new" element={<BuyerForm />} />
          <Route path="/buyers/:id" element={<BuyerDetail />} />
          <Route path="/buyers/:id/edit" element={<BuyerForm />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
