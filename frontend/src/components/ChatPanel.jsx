// Assistant chat panel. Talks to the Flask chatbot at BOT (VITE_CHATBOT_URL
// or http://localhost:5001): POST /chat {message, session_id}, POST /reset.
// Replies render bold/links and show tool-call chips + download attachments,
// mirroring the original console's chat behavior.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BOT } from "../api";

const GREETING = {
  id: "greeting",
  kind: "hint",
  items: [
    "What's running low?",
    "Restock 50 USB-C cables, delivery from Northwind",
    "Sell 2 monitors to TechPoint Retail, paid by card",
    "How much did we take this month?",
    "Generate a weekly sales report",
  ],
};

function renderInline(text) {
  const nodes = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|(https?:\/\/[^\s<]+)/g;
  let last = 0, key = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={`t${key++}`}>{text.slice(last, m.index)}</span>);
    if (m[1] && m[2]) {
      nodes.push(<a key={`l${key++}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="chat-link">{m[1]}</a>);
    } else if (m[3]) {
      nodes.push(<strong key={`b${key++}`}>{m[3]}</strong>);
    } else {
      nodes.push(<a key={`u${key++}`} href={m[4]} target="_blank" rel="noopener noreferrer" className="chat-link">{m[4]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
  return nodes;
}

let nextId = 1;

const ChatPanel = forwardRef(function ChatPanel({ onChanged, onClose, chatSub }, ref) {
  const [messages, setMessages] = useState([GREETING]);
  const [sessionId, setSessionId] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const logRef = useRef(null);
  const taRef = useRef(null);

  useImperativeHandle(ref, () => ({
    addNote: (text) => setMessages((ms) => [...ms, { id: nextId++, cls: "bot", text }]),
  }));

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, thinking]);

  const send = async (text) => {
    setMessages((ms) => [...ms, { id: nextId++, cls: "user", text }]);
    setThinking(true);
    try {
      const res = await fetch(`${BOT}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const data = await res.json();
      setThinking(false);
      if (!res.ok) {
        setMessages((ms) => [...ms, { id: nextId++, cls: "err", text: data.error || `The assistant returned ${res.status}.` }]);
      } else {
        setSessionId(data.session_id);
        setMessages((ms) => [...ms, { id: nextId++, cls: "bot", text: data.reply,
          trace: data.tool_calls, attachments: data.attachments }]);
        if ((data.tool_calls || []).length && onChanged) await onChanged();
      }
    } catch {
      setThinking(false);
      setMessages((ms) => [...ms, { id: nextId++, cls: "err",
        text: `Couldn't reach the assistant at ${BOT}. Is the chatbot service running?` }]);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    send(text);
  };

  const clear = async () => {
    if (sessionId) {
      try {
        await fetch(`${BOT}/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch { /* offline — nothing to clear server-side */ }
    }
    setSessionId(null);
    setMessages([GREETING]);
  };

  const autoGrow = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  return (
    <section className="chat" id="chat">
      <div className="chat-head">
        <div>
          <h3>Assistant</h3>
          <p>{chatSub}</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn quiet" onClick={clear} title="Clear this conversation">Clear</button>
          <button className="btn quiet mobile-toggle" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="log" ref={logRef}>
        {messages.map((m) => m.kind === "hint" ? (
          <div className="hint" key={m.id}>
            Ask in plain language. It reads and writes the same database this console does,
            so anything it changes shows up when you refresh a tab.
            <ul>{m.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
          </div>
        ) : (
          <div className={`msg ${m.cls}`} key={m.id}>
            {m.cls === "bot" ? renderInline(m.text) : m.text}
            {m.trace && m.trace.length ? (
              <div className="trace">
                {m.trace.map((t, i) => (
                  <span key={i} className={t.ok ? "" : "bad"}>{t.tool}</span>
                ))}
              </div>
            ) : null}
            {m.attachments && m.attachments.length ? (
              <div className="attachments">
                {m.attachments.map((a, i) => (
                  <a key={i} href={a.url} download={a.filename || "report.pdf"}
                    target="_blank" rel="noopener noreferrer" className="attachment-chip">
                    ⬇ {a.filename || "Download"}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {thinking ? (
          <div className="thinking"><i></i><i></i><i></i><span style={{ marginLeft: 4 }}>Working</span></div>
        ) : null}
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <textarea ref={taRef} rows={1} value={input}
          placeholder="Restock 50 USB-C cables from Northwind" autoComplete="off"
          disabled={thinking}
          onChange={(e) => { setInput(e.target.value); autoGrow(e); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form.requestSubmit();
            }
          }} />
        <button className="btn" type="submit" disabled={thinking}>Send</button>
      </form>
    </section>
  );
});

export default ChatPanel;
