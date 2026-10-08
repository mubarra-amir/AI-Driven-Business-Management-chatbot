import { useEffect, useState } from "react";
import { api, money, int, date, statusClass } from "../api";
import { Head, Panel, Table } from "../components/ui";

export default function Overview({ go, setTally, revision }) {
  const [d, setD] = useState(null);

  useEffect(() => {
    let live = true;
    api("/api/reports/dashboard").then((res) => {
      if (!live) return;
      setD(res);
      setTally("inventory", res.counts.low_stock_items > 0 ? String(res.counts.low_stock_items) : "");
      setTally("orders", res.counts.open_orders ? String(res.counts.open_orders) : "");
    });
    return () => { live = false; };
  }, [setTally, revision]);

  if (!d) return <p className="hint">Loading…</p>;

  return (
    <>
      <Head title="Overview" sub="Where the business stands right now" />
      <div className="tiles">
        <div className="tile">
          <div className="k">Revenue today</div>
          <div className="v">{money(d.revenue.today)}</div>
          <div className="s">{int(d.revenue.sale_count)} sales all time</div>
        </div>
        <div className="tile">
          <div className="k">Revenue this month</div>
          <div className="v">{money(d.revenue.this_month)}</div>
          <div className="s">{money(d.revenue.all_time)} all time</div>
        </div>
        <div className="tile">
          <div className="k">Stock value at cost</div>
          <div className="v">{money(d.stock.stock_value)}</div>
          <div className="s">{int(d.stock.units_on_hand)} units on hand</div>
        </div>
        <div className="tile">
          <div className="k">Open orders</div>
          <div className="v">{int(d.counts.open_orders)}</div>
          <div className="s">not yet completed</div>
        </div>
        <div className={`tile ${d.counts.low_stock_items > 0 ? "flag" : ""}`}>
          <div className="k">Needs restocking</div>
          <div className="v">{int(d.counts.low_stock_items)}</div>
          <div className="s">at or below reorder level</div>
        </div>
      </div>

      <Panel title="Running low"
        actions={<button className="btn ghost" onClick={() => go("inventory")}>Open inventory</button>}>
        <Table
          columns={[{ label: "SKU" }, { label: "Product" }, { label: "On hand", align: "right" }, { label: "Reorder at", align: "right" }]}
          rows={d.low_stock}
          renderRow={(r) => (
            <tr key={r.id}>
              <td className="num">{r.sku}</td><td className="wrap">{r.name}</td>
              <td className="right num"><span className="tag low">{int(r.quantity)}</span></td>
              <td className="right num">{int(r.reorder_level)}</td>
            </tr>
          )}
          emptyTitle="Everything is above its reorder level"
          emptyBody="Nothing needs restocking today." />
      </Panel>

      <Panel title="Recent orders"
        actions={<button className="btn ghost" onClick={() => go("orders")}>Open orders</button>}>
        <Table
          columns={[{ label: "Order" }, { label: "Customer" }, { label: "Status" }, { label: "Placed" }, { label: "Total", align: "right" }]}
          rows={d.recent_orders}
          renderRow={(r) => (
            <tr key={r.id}>
              <td className="num">#{r.id}</td><td className="wrap">{r.customer_name || "Walk-in"}</td>
              <td><span className={`tag ${statusClass(r.status)}`}>{r.status}</span></td>
              <td>{date(r.order_date)}</td><td className="right num">{money(r.total)}</td>
            </tr>
          )}
          emptyTitle="No orders yet"
          emptyBody="Place one from the Orders tab, or ask the assistant." />
      </Panel>
    </>
  );
}
