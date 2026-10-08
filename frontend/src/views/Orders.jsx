import { useEffect, useRef, useState } from "react";
import { api, money, int, date, statusClass, PAYMENT_METHODS, ORDER_STATUSES, payLabel } from "../api";
import { Head, Panel, Table, Modal, Field, Select } from "../components/ui";
import LineItems from "../components/LineItems";

export default function Orders({ refs, openModal, refresh, note, setTally, revision }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const linesRef = useRef(null);

  const load = async (f = filter) => {
    const r = await api("/api/orders" + (f ? `?status=${f}` : ""));
    setRows(r);
    setTally("orders", r.filter((o) => !["completed", "cancelled"].includes(o.status)).length || "");
  };
  useEffect(() => { load(); }, [revision]);

  const applyFilter = (f) => { setFilter(f); load(f); };

  const newOrder = () => openModal(
    <Modal title="New order" subtitle="Stock is reserved as soon as the order is placed."
      submitLabel="Place order" onClose={() => openModal(null)}
      onSubmit={async (data) => {
        const items = linesRef.current.getLines();
        if (!items.length) throw new Error("Add at least one line item.");
        const res = await api("/api/orders", { method: "POST", body: {
          customer_id: data.customer_id ? Number(data.customer_id) : null, items,
        }});
        await refresh();
        note(`Order #${res.id} placed, total ${money(res.total)}.`);
      }}>
      <Select name="customer_id" label="Customer" blank="Walk-in (no customer)"
        options={refs.customers.map((c) => ({ value: String(c.id), label: c.name }))} />
      <LineItems ref={linesRef} products={refs.products} />
    </Modal>
  );

  const viewOrder = async (id) => {
    const o = await api(`/api/orders/${id}`);
    openModal(
      <Modal title={`Order #${o.id}`}
        subtitle={`${o.customer_name || "Walk-in"} · ${date(o.order_date)} · ${o.status}`}
        submitLabel="Close" onClose={() => openModal(null)} onSubmit={async () => {}}>
        <div className="scroller"><table><thead><tr>
          <th>SKU</th><th>Product</th><th className="right">Qty</th>
          <th className="right">Unit</th><th className="right">Line</th>
        </tr></thead><tbody>
          {o.items.map((i, k) => (
            <tr key={k}>
              <td className="num">{i.sku}</td><td className="wrap">{i.product_name}</td>
              <td className="right num">{int(i.quantity)}</td>
              <td className="right num">{money(i.unit_price)}</td>
              <td className="right num">{money(i.quantity * i.unit_price)}</td>
            </tr>
          ))}
        </tbody><tfoot><tr>
          <td colSpan="4" className="right" style={{ paddingTop: 12 }}>Total</td>
          <td className="right num" style={{ paddingTop: 12 }}>{money(o.total)}</td>
        </tr></tfoot></table></div>
      </Modal>
    );
  };

  const changeStatus = (order) => openModal(
    <Modal title={`Order #${order.id} status`}
      subtitle="Cancelling does not return stock automatically — adjust inventory separately."
      submitLabel="Update status" onClose={() => openModal(null)}
      onSubmit={async (data) => {
        await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: { status: data.status } });
        await refresh();
      }}>
      <Select name="status" label="Status" defaultValue={order.status}
        options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))} />
    </Modal>
  );

  const takePayment = (order) => openModal(
    <Modal title={`Take payment for order #${order.id}`}
      subtitle="Records a sale and marks the order completed."
      submitLabel="Record payment" onClose={() => openModal(null)}
      onSubmit={async (data) => {
        await api("/api/sales", { method: "POST", body: {
          order_id: order.id, amount: Number(data.amount),
          payment_method: data.payment_method, note: data.note || null,
        }});
        await refresh();
        note(`Payment recorded for order #${order.id}.`);
      }}>
      <Field name="amount" label="Amount" type="number" step="0.01" min="0"
        defaultValue={Number(order.total).toFixed(2)} />
      <Select name="payment_method" label="Method" defaultValue="cash"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: payLabel(m) }))} />
      <Field name="note" label="Note" placeholder="Paid in full" />
    </Modal>
  );

  if (!rows) return <p className="hint">Loading…</p>;

  return (
    <>
      <Head title="Orders" sub="Customer orders and their fulfilment status"
        actions={<>
          <select className="search" value={filter} onChange={(e) => applyFilter(e.target.value)}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn" onClick={newOrder}>New order</button>
        </>} />
      <div className="panel">
        <Table
          columns={[{ label: "Order" }, { label: "Customer" }, { label: "Placed" }, { label: "Status" },
            { label: "Total", align: "right" }, { label: "", align: "right" }]}
          rows={rows}
          renderRow={(o) => (
            <tr key={o.id}>
              <td className="num">#{o.id}</td>
              <td className="wrap">{o.customer_name || "Walk-in"}</td>
              <td>{date(o.order_date)}</td>
              <td><span className={`tag ${statusClass(o.status)}`}>{o.status}</span></td>
              <td className="right num">{money(o.total)}</td>
              <td className="right">
                <button className="btn quiet" onClick={() => viewOrder(o.id)}>View</button>
                <button className="btn quiet" onClick={() => changeStatus(o)}>Status</button>
                {o.status !== "completed" && o.status !== "cancelled"
                  ? <button className="btn quiet" onClick={() => takePayment(o)}>Take payment</button> : null}
              </td>
            </tr>
          )}
          emptyTitle="No orders here"
          emptyBody="Create one, or ask the assistant to place it." />
      </div>
    </>
  );
}
