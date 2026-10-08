import { useCallback, useEffect, useRef, useState } from "react";
import { api, BOT } from "./api";
import Overview from "./views/Overview";
import Products from "./views/Products";
import Inventory from "./views/Inventory";
import Orders from "./views/Orders";
import Sales from "./views/Sales";
import { Customers, Vendors } from "./views/Party";
import ChatPanel from "./components/ChatPanel";

const VIEWS = {
  overview: { label: "Overview", Component: Overview },
  products: { label: "Products", Component: Products },
  inventory: { label: "Inventory", Component: Inventory },
  orders: { label: "Orders", Component: Orders },
  sales: { label: "Sales", Component: Sales },
  customers: { label: "Customers", Component: Customers },
  vendors: { label: "Vendors", Component: Vendors },
};

export default function App() {
  const [view, setView] = useState("overview");
  const [refs, setRefs] = useState({ products: [], customers: [], vendors: [] });
  const [tallies, setTallies] = useState({});
  const [modal, setModal] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [revision, setRevision] = useState(0);
  const [bootError, setBootError] = useState(null);
  const [apiDot, setApiDot] = useState("dot");
  const [apiStatus, setApiStatus] = useState("Checking API");
  const [botDot, setBotDot] = useState("dot");
  const [botStatus, setBotStatus] = useState("Checking assistant");
  const [chatSub, setChatSub] = useState("Ask it to look things up or make changes");
  const chatRef = useRef(null);

  const setTally = useCallback(
    (key, value) => setTallies((t) => (t[key] === value ? t : { ...t, [key]: value })),
    []
  );

  const loadRefs = useCallback(async () => {
    const [products, customers, vendors] = await Promise.all([
      api("/api/products"), api("/api/customers"), api("/api/vendors"),
    ]);
    setRefs({ products, customers, vendors });
  }, []);

  const refresh = useCallback(async () => {
    await loadRefs();
    setRevision((r) => r + 1);
  }, [loadRefs]);

  const note = useCallback((text) => {
    chatRef.current?.addNote(text);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const h = await api("/health");
      setApiDot("dot " + (h.database === "connected" ? "up" : "down"));
      setApiStatus(h.database === "connected" ? "API and database up" : `Database: ${h.database}`);
    } catch {
      setApiDot("dot down");
      setApiStatus("API unreachable");
    }
    try {
      const res = await fetch(`${BOT}/health`);
      const h = await res.json();
      setBotDot("dot " + (h.mcp_connected ? "up" : "down"));
      setBotStatus(h.mcp_connected ? `${h.tools.length} tools over MCP` : "Assistant has no tools");
      setChatSub(h.mcp_connected ? `${h.tools.length} ERP tools · ${h.model}` : "Tool server not connected");
    } catch {
      setBotDot("dot down");
      setBotStatus("Assistant offline");
      setChatSub("Chatbot service is not running");
    }
  }, []);

  useEffect(() => {
    let live = true;
    checkHealth();
    const id = setInterval(checkHealth, 20000);
    (async () => {
      try {
        await loadRefs();
      } catch (err) {
        if (live) setBootError(err.message);
      }
    })();
    return () => { live = false; clearInterval(id); };
  }, [checkHealth, loadRefs]);

  const go = (v) => setView(v);

  const { Component } = VIEWS[view];
  const viewProps = {
    revision, refs, openModal: setModal, refresh, note, go, setTally,
  };

  return (
    <div className={`shell${chatOpen ? "" : " chat-hidden"}`}>
      <aside className="rail">
        <div className="brand">
          <h1>ERP Console</h1>
          <p>Inventory, orders and sales</p>
        </div>
        <nav className="nav">
          {Object.entries(VIEWS).map(([key, v]) => (
            <button key={key} data-view={key}
              aria-current={key === view ? "page" : undefined}
              onClick={() => go(key)}>
              <span>{v.label}</span>
              <span className="tally">{tallies[key] || ""}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div><span className={apiDot} /><span>{apiStatus}</span></div>
          <div style={{ marginTop: 6 }}><span className={botDot} /><span>{botStatus}</span></div>
        </div>
      </aside>

      <main className="main">
        {bootError ? (
          <div className="panel"><div className="empty">
            <strong>Can't reach the API</strong>{bootError}
          </div></div>
        ) : (
          <Component {...viewProps} />
        )}
      </main>

      <ChatPanel ref={chatRef} chatSub={chatSub}
        onClose={() => setChatOpen(false)}
        onChanged={refresh} />

      {!chatOpen && (
        <button className="btn mobile-toggle chat-reopen" onClick={() => setChatOpen(true)}>
          Assistant
        </button>
      )}

      {modal}
    </div>
  );
}
