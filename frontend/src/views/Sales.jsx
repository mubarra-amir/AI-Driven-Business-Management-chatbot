import { useEffect, useRef, useState } from "react";
import { api, money, int, date, PAYMENT_METHODS, payLabel } from "../api";
import { Head, Panel, Table, Modal, Field, Select } from "../components/ui";
import LineItems from "../components/LineItems";

const PERIODS = ["day", "week", "month", "year"];

export default function Sales({ refs, openModal, refresh, note, setTally, revision }) {
  const [rows, setRows] = useState(null);
  const [top, setTop] = useState([]);
  const linesRef = useRef(null);

  const load = async () => {
    const [r, t] = await Promise.all([
      api("/api/sales"), api("/api/reports/top-products?limit=8"),
    ]);
    setRows(r); setTop(t);
    setTally("sales", r.length ? String(r.length) : "");
  };
  useEffect(() => { load(); }, [revision]);

  const report = () => openModal(
    <Modal title="Download sales report"
      subtitle="A PDF covering the whole day/week/month/year that contains the date below."
      submitLabel="Generate PDF" onClose={() => openModal(null)}
      onSubmit={async (data) => {
        const res = await api("/api/reports/sales-report", { method: "POST", body: {
          period: data.period, date: data.date,
        }});
        window.open(res.url, "_blank");
      }}>
      <Select name="period" label="Period" defaultValue="week"
        options={PERIODS.map((p) => ({ value: p, label: p }))} />
      <Field name="date" label="Any date in that period" type="date"
        defaultValue={new Date().toISOString().slice(0, 10)} />
    </Modal>
  );

  const quickSale = () => openModal(
    <Modal title="Record a sale"
      subtitle="Creates the order, takes the stock and records payment in one go."
      submitLabel="Record sale" onClose={() => openModal(null)}
      onSubmit={async (data) => {
        const items = linesRef.current.getLines();
        if (!items.length) throw new Error("Add at least one line item.");
        const res = await api("/api/sales/quick", { method: "POST", body: {
          customer_id: data.customer_id ? Number(data.customer_id) : null,
          items, payment_method: data.payment_method, note: data.note || null,
        }});
        await refresh();
        note(`Sale #${res.sale_id} recorded, ${money(res.amount)} taken.`);
      }}>
      <Select name="customer_id" label="Customer" blank="Walk-in (no customer)"
        options={refs.customers.map((c) => ({ value: String(c.id), label: c.name }))} />
      <LineItems ref={linesRef} products={refs.products} />
      <Select name="payment_method" label="Payment method" defaultValue="cash"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: payLabel(m) }))} />
      <Field name="note" label="Note" placeholder="Counter sale" />
    </Modal>
  );

  const voidSale = (id) => openModal(
    <Modal title={`Void sale #${id}?`}
      subtitle="The order goes back to pending. Stock is not returned."
      submitLabel="Void sale" onClose={() => openModal(null)}
      onSubmit={async () => {
        await api(`/api/sales/${id}`, { method: "DELETE" });
        await refresh();
      }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        If the goods came back, follow up with a positive inventory adjustment so the movement log explains the change.
      </p>
    </Modal>
  );

  if (!rows) return <p className="hint">Loading…</p>;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <Head title="Sales" sub={`${rows.length} recorded, ${money(total)} taken`}
        actions={<>
          <button className="btn ghost" onClick={report}>Download report</button>
          <button className="btn" onClick={quickSale}>Record a sale</button>
        </>} />
      <div className="panel">
        <Table
          columns={[{ label: "Sale" }, { label: "Order" }, { label: "Customer" }, { label: "When" },
            { label: "Method" }, { label: "Amount", align: "right" }, { label: "", align: "right" }]}
          rows={rows}
          renderRow={(s) => (
            <tr key={s.id}>
              <td className="num">#{s.id}</td>
              <td className="num">{s.order_id ? "#" + s.order_id : "—"}</td>
              <td className="wrap">{s.customer_name || "Walk-in"}</td>
              <td>{date(s.sale_date)}</td>
              <td>{payLabel(s.payment_method)}</td>
              <td className="right num">{money(s.amount)}</td>
              <td className="right">
                <button className="btn quiet danger" onClick={() => voidSale(s.id)}>Void</button>
              </td>
            </tr>
          )}
          emptyTitle="No sales recorded yet"
          emptyBody="Use “Record a sale” for an over-the-counter sale." />
      </div>

      <Panel title="Best sellers">
        <Table
          columns={[{ label: "SKU" }, { label: "Product" }, { label: "Units sold", align: "right" }, { label: "Revenue", align: "right" }]}
          rows={top}
          renderRow={(t) => (
            <tr key={t.id}>
              <td className="num">{t.sku}</td><td className="wrap">{t.name}</td>
              <td className="right num">{int(t.units_sold)}</td>
              <td className="right num">{money(t.revenue)}</td>
            </tr>
          )}
          emptyTitle="Nothing sold yet"
          emptyBody="Best sellers appear once orders exist." />
      </Panel>
    </>
  );
}
