import { useEffect, useState } from "react";
import { api, int, date } from "../api";
import { Head, Panel, Table, Modal, Field, Select } from "../components/ui";

export default function Inventory({ refs, openModal, refresh, revision }) {
  const [rows, setRows] = useState(null);
  const [movements, setMovements] = useState([]);

  const load = async () => {
    const [r, m] = await Promise.all([
      api("/api/inventory"), api("/api/inventory/movements?limit=25"),
    ]);
    setRows(r); setMovements(m);
  };
  useEffect(() => { load(); }, [revision]);

  const adjust = (productId) => openModal(
    <Modal title="Adjust stock"
      subtitle="Enter the change, not the new total. Negative numbers remove stock."
      submitLabel="Apply adjustment"
      onClose={() => openModal(null)}
      onSubmit={async (data) => {
        await api("/api/inventory/adjust", { method: "POST", body: {
          product_id: Number(data.product_id), delta: Number(data.delta), reason: data.reason || null,
        }});
        await refresh();
      }}>
      <Select name="product_id" label="Product" defaultValue={productId ? String(productId) : undefined}
        options={refs.products.map((p) => ({ value: String(p.id), label: `${p.name} (${p.sku}) — ${p.quantity} in stock` }))} />
      <Field name="delta" label="Change" type="number" required placeholder="50"
        note="+50 receives 50 units, -3 writes off 3" />
      <Field name="reason" label="Reason" placeholder="Delivery from Northwind"
        note="Shows in the movement log" />
    </Modal>
  );

  if (!rows) return <p className="hint">Loading…</p>;

  return (
    <>
      <Head title="Inventory" sub="Stock on hand, lowest first"
        actions={<button className="btn" onClick={() => adjust()}>Adjust stock</button>} />
      <div className="panel">
        <Table
          columns={[{ label: "SKU" }, { label: "Product" }, { label: "Warehouse" },
            { label: "On hand", align: "right" }, { label: "Reorder at", align: "right" },
            { label: "Updated" }, { label: "", align: "right" }]}
          rows={rows}
          renderRow={(r) => (
            <tr key={r.product_id}>
              <td className="num">{r.sku}</td><td className="wrap">{r.name}</td>
              <td>{r.warehouse || "main"}</td>
              <td className="right num">
                {Number(r.quantity) <= Number(r.reorder_level)
                  ? <span className="tag low">{int(r.quantity)}</span> : int(r.quantity)}
              </td>
              <td className="right num">{int(r.reorder_level)}</td>
              <td>{date(r.updated_at)}</td>
              <td className="right">
                <button className="btn quiet" onClick={() => adjust(r.product_id)}>Adjust</button>
              </td>
            </tr>
          )}
          emptyTitle="No inventory records"
          emptyBody="Add a product and stock will appear here." />
      </div>

      <Panel title="Recent movements">
        <Table
          columns={[{ label: "When" }, { label: "Product" }, { label: "Change", align: "right" }, { label: "Reason" }]}
          rows={movements}
          renderRow={(m) => (
            <tr key={m.id}>
              <td>{date(m.created_at)}</td><td className="wrap">{m.product_name}</td>
              <td className="right num" style={{ color: m.change_qty < 0 ? "var(--danger)" : "var(--good)" }}>
                {m.change_qty > 0 ? "+" : ""}{int(m.change_qty)}
              </td>
              <td className="wrap">{m.reason || "—"}</td>
            </tr>
          )}
          emptyTitle="No movements recorded"
          emptyBody="Stock changes will be logged here." />
      </Panel>
    </>
  );
}
