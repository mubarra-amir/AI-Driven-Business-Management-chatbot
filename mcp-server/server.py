"""
ERP MCP server.

Exposes the ERP backend as MCP tools over stdio. Any MCP host can drive it —
the Flask chatbot in this project, Claude Desktop, or anything else that
speaks the protocol. The tools are thin wrappers over the Node/Express REST
API, which is where all the business rules (stock checks, transactions,
validation) actually live. Keeping the rules in the API rather than here
means the UI and the chatbot can never disagree about what's allowed.

Run directly for a quick smoke test:
    BACKEND_URL=http://localhost:4000 python server.py
(it will sit waiting for JSON-RPC on stdin, which is correct)
"""
import os
from typing import Any, Optional

import requests
from mcp.server.fastmcp import FastMCP

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000").rstrip("/")
TIMEOUT = float(os.environ.get("BACKEND_TIMEOUT", "20"))

mcp = FastMCP("erp")


# ---------------------------------------------------------------------------
# HTTP helpers. Every error comes back as {"error": ...} rather than raising,
# so the model sees the failure and can explain or retry instead of the whole
# tool call blowing up.
# ---------------------------------------------------------------------------

def _request(method: str, path: str, **kwargs) -> Any:
    try:
        r = requests.request(method, f"{BACKEND_URL}{path}", timeout=TIMEOUT, **kwargs)
    except requests.RequestException as e:
        return {"error": f"Could not reach the ERP backend at {BACKEND_URL}: {e}"}
    if not r.ok:
        try:
            return {"error": r.json().get("error", r.text)}
        except ValueError:
            return {"error": f"HTTP {r.status_code}: {r.text[:300]}"}
    try:
        return r.json()
    except ValueError:
        return {"error": "Backend returned a non-JSON response"}


def _get(path: str, params: dict | None = None) -> Any:
    return _request("GET", path, params=params)


def _post(path: str, body: dict | None = None) -> Any:
    return _request("POST", path, json=body or {})


def _put(path: str, body: dict | None = None) -> Any:
    return _request("PUT", path, json=body or {})


def _patch(path: str, body: dict | None = None) -> Any:
    return _request("PATCH", path, json=body or {})


def _delete(path: str) -> Any:
    return _request("DELETE", path)


def _clean(d: dict) -> dict:
    """Drop None values so the backend's COALESCE-based updates leave
    unmentioned fields alone."""
    return {k: v for k, v in d.items() if v is not None}


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------

@mcp.tool()
def list_products(search: Optional[str] = None) -> Any:
    """List products with their price, vendor and current stock level.
    Pass `search` to filter by product name or SKU."""
    return _get("/api/products", {"search": search} if search else None)


@mcp.tool()
def get_product(product_id: int) -> Any:
    """Get one product by its numeric id, including current stock."""
    return _get(f"/api/products/{product_id}")


@mcp.tool()
def create_product(
    sku: str,
    name: str,
    price: float,
    cost: float = 0,
    category: Optional[str] = None,
    description: Optional[str] = None,
    vendor_id: Optional[int] = None,
    reorder_level: int = 10,
    initial_quantity: int = 0,
) -> Any:
    """Add a new product to the catalogue and open an inventory record for it.
    SKU must be unique. `reorder_level` is the stock level at which the product
    starts showing up in low-stock reports."""
    return _post("/api/products", _clean({
        "sku": sku, "name": name, "price": price, "cost": cost,
        "category": category, "description": description,
        "vendor_id": vendor_id, "reorder_level": reorder_level,
        "initial_quantity": initial_quantity,
    }))


@mcp.tool()
def update_product(
    product_id: int,
    name: Optional[str] = None,
    price: Optional[float] = None,
    cost: Optional[float] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    vendor_id: Optional[int] = None,
    reorder_level: Optional[int] = None,
) -> Any:
    """Change fields on an existing product. Only the fields you pass are
    touched; everything else keeps its current value. This does not change
    stock — use adjust_inventory for that."""
    return _put(f"/api/products/{product_id}", _clean({
        "name": name, "price": price, "cost": cost, "category": category,
        "description": description, "vendor_id": vendor_id,
        "reorder_level": reorder_level,
    }))


@mcp.tool()
def delete_product(product_id: int) -> Any:
    """Permanently delete a product and its inventory record. Order history
    referencing it will block the delete. Confirm with the user first."""
    return _delete(f"/api/products/{product_id}")


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

@mcp.tool()
def list_inventory() -> Any:
    """Current stock on hand for every product, lowest stock first."""
    return _get("/api/inventory")


@mcp.tool()
def list_low_stock() -> Any:
    """Products at or below their reorder level — i.e. what needs restocking."""
    return _get("/api/inventory/low-stock")


@mcp.tool()
def adjust_inventory(product_id: int, delta: int, reason: Optional[str] = None) -> Any:
    """Move stock up or down. `delta` is the change, not the new total:
    +50 receives 50 units, -3 writes off 3. The resulting quantity cannot go
    below zero. Always give a `reason` — it's recorded in the movement log."""
    return _post("/api/inventory/adjust", _clean({
        "product_id": product_id, "delta": delta, "reason": reason,
    }))


@mcp.tool()
def inventory_movements(product_id: Optional[int] = None, limit: int = 50) -> Any:
    """Stock movement history — every receipt, sale and write-off, newest
    first. Filter to one product with `product_id`."""
    return _get("/api/inventory/movements", _clean({"product_id": product_id, "limit": limit}))


# ---------------------------------------------------------------------------
# Vendors
# ---------------------------------------------------------------------------

@mcp.tool()
def list_vendors() -> Any:
    """List all suppliers."""
    return _get("/api/vendors")


@mcp.tool()
def create_vendor(
    name: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
) -> Any:
    """Add a supplier."""
    return _post("/api/vendors", _clean({
        "name": name, "email": email, "phone": phone, "address": address,
    }))


@mcp.tool()
def update_vendor(
    vendor_id: int,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
) -> Any:
    """Update a supplier's details. Only the fields you pass change."""
    return _put(f"/api/vendors/{vendor_id}", _clean({
        "name": name, "email": email, "phone": phone, "address": address,
    }))


@mcp.tool()
def delete_vendor(vendor_id: int) -> Any:
    """Delete a supplier. Products from that supplier stay, but lose their
    vendor link. Confirm with the user first."""
    return _delete(f"/api/vendors/{vendor_id}")


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

@mcp.tool()
def list_customers(search: Optional[str] = None) -> Any:
    """List customers with their order count and lifetime spend.
    Pass `search` to filter by name or email."""
    return _get("/api/customers", {"search": search} if search else None)


@mcp.tool()
def get_customer(customer_id: int) -> Any:
    """Get one customer plus their recent orders."""
    return _get(f"/api/customers/{customer_id}")


@mcp.tool()
def create_customer(
    name: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
) -> Any:
    """Add a customer."""
    return _post("/api/customers", _clean({
        "name": name, "email": email, "phone": phone, "address": address,
    }))


@mcp.tool()
def update_customer(
    customer_id: int,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    address: Optional[str] = None,
) -> Any:
    """Update a customer's details. Only the fields you pass change."""
    return _put(f"/api/customers/{customer_id}", _clean({
        "name": name, "email": email, "phone": phone, "address": address,
    }))


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@mcp.tool()
def list_orders(status: Optional[str] = None) -> Any:
    """List orders, newest first. Filter by status: pending, processing,
    shipped, completed or cancelled."""
    return _get("/api/orders", {"status": status} if status else None)


@mcp.tool()
def get_order(order_id: int) -> Any:
    """Get one order with its line items."""
    return _get(f"/api/orders/{order_id}")


@mcp.tool()
def create_order(items: list, customer_id: Optional[int] = None) -> Any:
    """Place an order and reserve the stock for it. `items` is a list like
    [{"product_id": 1, "quantity": 2}]. Prices come from the catalogue, so
    don't pass them. Fails if any line exceeds available stock. The order
    starts as pending and is not yet paid — use record_sale to take payment."""
    return _post("/api/orders", _clean({"items": items, "customer_id": customer_id}))


@mcp.tool()
def update_order_status(order_id: int, status: str) -> Any:
    """Move an order along: pending, processing, shipped, completed or
    cancelled."""
    return _patch(f"/api/orders/{order_id}/status", {"status": status})


# ---------------------------------------------------------------------------
# Sales
# ---------------------------------------------------------------------------

@mcp.tool()
def list_sales(date_from: Optional[str] = None, date_to: Optional[str] = None) -> Any:
    """List recorded sales, newest first. Dates are YYYY-MM-DD and inclusive."""
    return _get("/api/sales", _clean({"from": date_from, "to": date_to}))


@mcp.tool()
def record_sale(
    order_id: int,
    payment_method: str = "cash",
    amount: Optional[float] = None,
    note: Optional[str] = None,
) -> Any:
    """Take payment for an existing order and mark it completed. `amount`
    defaults to the order total — only pass it for a partial or adjusted
    payment. payment_method: cash, card, bank_transfer or credit."""
    return _post("/api/sales", _clean({
        "order_id": order_id, "payment_method": payment_method,
        "amount": amount, "note": note,
    }))


@mcp.tool()
def quick_sale(
    items: list,
    customer_id: Optional[int] = None,
    payment_method: str = "cash",
    note: Optional[str] = None,
) -> Any:
    """Over-the-counter sale: creates the order, takes the stock and records
    payment in one step. Use this when the user says something was just sold,
    rather than ordered. `items` is [{"product_id": 1, "quantity": 2}]."""
    return _post("/api/sales/quick", _clean({
        "items": items, "customer_id": customer_id,
        "payment_method": payment_method, "note": note,
    }))


@mcp.tool()
def void_sale(sale_id: int) -> Any:
    """Reverse a sale and put its order back to pending. Stock is not returned
    automatically — follow up with adjust_inventory if the goods came back.
    Confirm with the user first."""
    return _delete(f"/api/sales/{sale_id}")


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@mcp.tool()
def dashboard_summary() -> Any:
    """Headline numbers: record counts, revenue today / this month / all time,
    stock value, low-stock items and recent orders. Good first call when
    someone asks how the business is doing."""
    return _get("/api/reports/dashboard")


@mcp.tool()
def sales_over_time(days: int = 30) -> Any:
    """Daily revenue and sale count for the last N days."""
    return _get("/api/reports/sales-over-time", {"days": days})


@mcp.tool()
def top_products(limit: int = 10) -> Any:
    """Best sellers by revenue, with units sold."""
    return _get("/api/reports/top-products", {"limit": limit})

@mcp.tool()
def generate_sales_report(period: str = "week", date: Optional[str] = None) -> Any:
    """Generate a PDF sales report and return a download link. `period` is one
    of day, week, month or year — it covers the whole calendar bucket that
    contains `date` (e.g. period="week" covers Monday-Sunday of that date's
    week). `date` is YYYY-MM-DD and defaults to today. Includes revenue,
    a breakdown over the period, top products and the payment method mix.
    Always give the user the returned link — don't just describe the numbers."""
    return _post("/api/reports/sales-report", _clean({"period": period, "date": date}))


@mcp.tool()
def stock_valuation() -> Any:
    """What the stock on hand is worth, per product and in total, at both cost
    and retail price."""
    return _get("/api/reports/stock-valuation")

if __name__ == "__main__":
    mcp.run()
