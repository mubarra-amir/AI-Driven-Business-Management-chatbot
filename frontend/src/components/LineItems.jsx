// Line-item builder for order / sale modals.
// Parent calls linesRef.current.getLines() -> [{ product_id, quantity }]
// filtering out rows without a product or with qty <= 0.
import { forwardRef, useImperativeHandle, useState } from "react";

let nextKey = 1;

const LineItems = forwardRef(function LineItems({ products }, ref) {
  const [rows, setRows] = useState([{ key: 0, productId: products[0]?.id ?? "", qty: 1 }]);

  useImperativeHandle(ref, () => ({
    getLines: () =>
      rows
        .map((r) => ({ product_id: Number(r.productId), quantity: Number(r.qty) }))
        .filter((i) => i.product_id && i.quantity > 0),
  }));

  const addLine = () =>
    setRows((rs) => [...rs, { key: nextKey++, productId: products[0]?.id ?? "", qty: 1 }]);
  const removeLine = (key) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  const setRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="field">
      <label>Line items</label>
      <div>
        {rows.map((r) => (
          <div className="line-row" key={r.key}>
            <select value={r.productId} onChange={(e) => setRow(r.key, { productId: e.target.value })}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {p.quantity} in stock
                </option>
              ))}
            </select>
            <input type="number" min="1" value={r.qty}
              onChange={(e) => setRow(r.key, { qty: e.target.value })} />
            <button className="btn quiet" type="button" title="Remove line"
              onClick={() => removeLine(r.key)}>&times;</button>
          </div>
        ))}
      </div>
      <button className="btn ghost" type="button" onClick={addLine} style={{ marginTop: 4 }}>
        Add another line
      </button>
    </div>
  );
});

export default LineItems;
