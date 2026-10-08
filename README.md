# ERP system with an MCP-driven assistant

A small ERP you can run on a laptop. Everything is editable two ways: by hand
in the web console, or by telling the assistant what you want. Both paths hit
the same database through the same API, so they can't disagree.

## What's in it

| Piece | Stack | Port | Job |
|---|---|---|---|
| `backend/` | Node 20 / Express / MySQL | 4000 | REST API + serves the console |
| `backend/public/` | One HTML file, no build step | — | The console itself |
| `mcp-server/` | Python, MCP SDK, stdio | — | Exposes 29 ERP operations as MCP tools |
| `chatbot/` | Python / Flask | 5001 | MCP host: model ↔ tools ↔ backend |
| MySQL | 8.0 | 3307 | Schema and seed data |

```
browser ──── console (manual CRUD) ─────────────┐
   │                                            ▼
   └──── chat panel ──► Flask chatbot ──► Ollama model
                              │                 │
                              │   tool calls    │
                              ▼                 │
                        MCP server ◄────────────┘
                              │
                              ▼
                      Express API ──► MySQL
```

The chatbot never talks to MySQL. It calls MCP tools, which call the REST API,
where the transactions and stock rules live. That's deliberate: the assistant
cannot oversell stock or skip a validation, because it goes through the same
door the console does.

## Setup

Needs Docker Desktop (Windows/macOS) or Docker Engine with Compose (Linux).

**1. Add your Ollama key.** Create a `.env` file next to `docker-compose.yml`:

```
OLLAMA_API_KEY=your_key_here
```

Get one from ollama.com under Settings → API keys. The ERP itself works
without a key — only the assistant needs it. To use a local Ollama instead,
see "Local Ollama" below.

**2. Start everything:**

```bash
docker compose up --build
```

First run takes a few minutes. MySQL loads the schema and seed data on first
boot; the backend waits for it to be healthy before starting.

**3. Open the console:** http://localhost:4000

You should see six seeded products, three customers and three vendors, with
two items already flagged as low stock. The status lights in the bottom-left
corner tell you whether the API and the assistant are both up.

### Running it without Docker

Start just the database with `docker compose up -d mysql`, then:

```bash
# terminal 1
cd backend
cp .env.example .env
npm install
npm run dev

# terminal 2
cd chatbot
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt -r ../mcp-server/requirements.txt
cp .env.example .env               # set OLLAMA_API_KEY
python app.py
```

The chatbot launches the MCP server itself as a subprocess — you don't start
it separately.

## Using it

**By hand.** Each tab has its own add/edit actions. Products opens an
inventory record when you create one. Orders reserves stock when you place
one, and "Take payment" turns an order into a sale. "Record a sale" on the
Sales tab is the over-the-counter path: order, stock movement and payment in
one transaction.

**By asking.** The chat panel on the right. Things that work:

- What's running low?
- Restock 50 USB-C cables, delivery from Northwind
- Add a product: Desk Lamp, SKU DL-400, sells for 45, costs 18, 30 in stock
- Sell 2 monitors to TechPoint Retail, paid by card
- Place an order for Riverbend Cafe: 3 keyboards and 2 mice
- Mark order 4 as shipped
- How much did we take this month, and what's selling best?

Tool names appear as small chips under each reply so you can see what it
actually did. The console refreshes itself after any reply that changed data.

The assistant is told to look names up before acting, to ask when a name is
ambiguous, and to confirm before anything destructive. It can't invent stock
levels — the system prompt forbids answering from memory, and every number it
quotes comes from a tool call.

## Using the MCP server from other hosts

The MCP server is a normal stdio MCP server, so Claude Desktop or any other
host can use it. Add to your host's MCP config:

```json
{
  "mcpServers": {
    "erp": {
      "command": "python",
      "args": ["/absolute/path/to/mcp-server/server.py"],
      "env": { "BACKEND_URL": "http://localhost:4000" }
    }
  }
}
```

Adding a tool there makes it available to the Flask chatbot with no change to
the chatbot code — it reads the tool list off the protocol at startup.

## API

```
GET    /health
GET    /api/products?search=          POST /api/products
GET    /api/products/:id              PUT/DELETE /api/products/:id
GET    /api/inventory                 GET /api/inventory/low-stock
GET    /api/inventory/movements       POST /api/inventory/adjust
GET    /api/orders?status=            POST /api/orders
GET    /api/orders/:id                PATCH /api/orders/:id/status
GET    /api/sales?from=&to=           POST /api/sales
POST   /api/sales/quick               DELETE /api/sales/:id
GET    /api/customers?search=         POST/PUT/DELETE /api/customers[/:id]
GET    /api/vendors                   POST/PUT/DELETE /api/vendors[/:id]
GET    /api/reports/dashboard         GET /api/reports/sales-over-time?days=
GET    /api/reports/top-products      GET /api/reports/stock-valuation
```

Check the assistant's view of things without spending a model call:

```bash
curl http://localhost:5001/tools     # what MCP is advertising
curl http://localhost:5001/health    # is the session connected
```

## Local Ollama

Pull a model that supports **tool calling** — the assistant is useless
without it:

```bash
ollama pull qwen3:8b
```

Then in `chatbot/.env`, or the root `.env` for Compose:

```
OLLAMA_HOST=http://localhost:11434
OLLAMA_API_KEY=
OLLAMA_MODEL=qwen3:8b
```

If the chatbot runs in Docker and Ollama runs on your laptop, use
`http://host.docker.internal:11434`. On Linux also add to the `chatbot`
service:

```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

`gpt-oss:120b` is a ~65GB download — don't pull that one locally unless you
have the hardware for it.

## Troubleshooting

**Tables don't exist.** `schema.sql` only runs the first time the MySQL volume
is created. After a schema change: `docker compose down -v && docker compose up --build`.

**Console loads but every tab says "Can't reach the API".** The backend can't
see MySQL. `docker compose logs backend` will say why.

**Chat panel says the assistant is offline.** The chatbot container isn't up,
or the MCP subprocess failed to start. `docker compose logs chatbot` — look
for the "MCP connected, N tools" line at startup.

**Assistant replies but never touches data.** The model isn't calling tools.
Almost always a model without tool-calling support. Check `/tools` returns 29
entries, then switch models.

**Port already in use.** Change the left number in the compose `ports:`
mapping — `"4001:4000"` moves the console to port 4001.

## Before this goes anywhere real

Two things are deliberately absent because they'd get in the way on a laptop:

**There's no authentication.** No login, no API keys, and CORS accepts every
origin. Anyone who can reach port 4000 can delete your products. Fine on
localhost, not fine on a network.

**Conversations live in memory.** Sessions are capped and trimmed so the
process can't grow without limit, but they vanish on restart. Persist them in
MySQL if you want history to survive a redeploy.
