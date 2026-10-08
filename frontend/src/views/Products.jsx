import { useEffect, useRef, useState } from "react";
import { api, money, int } from "../api";
import { Head, Panel, Table, Modal, Field, Select } from "../components/ui";

export default function Products({ refs, openModal, refresh, setTally, revision }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef(null);
  const keepFocus = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    api("/api/products" + (search ? `?search=${encodeURIComponent(search)}` : ""))
      .then((r) => { if (live) { setRows(r); setLoaded(true); setTally("products", String(r.length)); } });
    return () => { live = false; };
  }, [search, setTally, revision]);

  useEffect(() => {
    if (loaded && keepFocus.current && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
    }
  }, [loaded]);

  const onSearch = (e) => {
    keepFocus.current = true;
    clearTimeout(timer.current);
    const v = e.target.value;
    timer.current = setTimeout(() => setSearch(v), 250);
  };

  const del = (p) => openModal(
    <Modal title={`Delete ${p.name}?`}
      subtitle="This removes the product and its inventory record. It can't be undone."
      submitLabel="Delete product"
      onClose={() => openModal(null)}
      onSubmit={async () => { await api(`/api/products/${p.id}`, { method: "DELETE" }); await refresh(); }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        If the product appears on past orders, the database will refuse the delete to keep that history intact.
      </p>
    </Modal>
  );

  const edit = (p) => openModal(
    <Modal title={`Edit ${p.name}`}
      subtitle="Changing details here doesn't move stock."
      submitLabel="Save changes"
      onClose={() => openModal(null)}
      onSubmit={async (data) => {
        await api(`/api/products/${p.id}`, { method: "PUT", body: {
          name: data.name, price: Number(data.price), cost: Number(data.cost || 0),
          category: data.category || null, description: data.description || null,
          vendor_id: data.vendor_id ? Number(data.vendor_id) : null,
          reorder_level: Number(data.reorder_level || 10),
        }});
        await refresh();
      }}>
      <Field name="name" label="Product name" required defaultValue={p.name} />
      <div className="grid2">
        <Field name="price" label="Sale price" type="number" step="0.01" min="0" required defaultValue={p.price} />
        <Field name="cost" label="Unit cost" type="number" step="0.01" min="0" defaultValue={p.cost ?? 0} />
      </div>
      <Field name="category" label="Category" defaultValue={p.category ?? ""} />
      <Select name="vendor_id" label="Vendor" blank="No vendor"
        defaultValue={p.vendor_id ?? ""}
        options={refs.vendors.map((v) => ({ value: String(v.id), label: v.name }))} />
      <div className="grid2">
        <Field name="reorder_level" label="Reorder level" type="number" min="0"
          defaultValue={p.reorder_level ?? 10} note="Flags as low at or below this" />
      </div>
      <Field name="description" label="Description" defaultValue={p.description ?? ""} />
    </Modal>
  );

  const create = () => openModal(
    <Modal title="Add product"
      subtitle="Opens an inventory record at the same time."
      submitLabel="Add product"
      onClose={() => openModal(null)}
      onSubmit={async (data) => {
        await api("/api/products", { method: "POST", body: {
          sku: data.sku, name: data.name, price: Number(data.price), cost: Number(data.cost || 0),
          category: data.category || null, description: data.description || null,
          vendor_id: data.vendor_id ? Number(data.vendor_id) : null,
          reorder_level: Number(data.reorder_level || 10),
          initial_quantity: Number(data.initial_quantity || 0),
        }});
        await refresh();
      }}>
      <Field name="sku" label="SKU" required placeholder="WH-1000" />
      <Field name="name" label="Product name" required />
      <div className="grid2">
        <Field name="price" label="Sale price" type="number" step="0.01" min="0" required />
        <Field name="cost" label="Unit cost" type="number" step="0.01" min="0" defaultValue="0" />
      </div>
      <Field name="category" label="Category" />
      <Select name="vendor_id" label="Vendor" blank="No vendor"
        options={refs.vendors.map((v) => ({ value: String(v.id), label: v.name }))} />
      <div className="grid2">
        <Field name="reorder_level" label="Reorder level" type="number" min="0" defaultValue="10"
          note="Flags as low at or below this" />
        <Field name="initial_quantity" label="Opening stock" type="number" min="0" defaultValue="0" />
      </div>
      <Field name="description" label="Description" />
    </Modal>
  );

  return (
    <>
      <Head title="Products" sub={`${rows.length} product${rows.length === 1 ? "" : "s"} in the catalogue`}
        actions={<>
          <input className="search" placeholder="Search name or SKU" ref={inputRef}
            defaultValue={search} onInput={onSearch} onBlur={() => { keepFocus.current = false; }} />
          <button className="btn" onClick={create}>Add product</button>
        </>} />
      <div className="panel">
        <Table
          columns={[{ label: "SKU" }, { label: "Product" }, { label: "Category" }, { label: "Vendor" },
            { label: "Price", align: "right" }, { label: "Cost", align: "right" },
            { label: "Stock", align: "right" }, { label: "", align: "right" }]}
          rows={rows}
          renderRow={(p) => (
            <tr key={p.id}>
              <td className="num">{p.sku}</td>
              <td className="wrap">{p.name}</td>
              <td>{p.category || "—"}</td>
              <td>{p.vendor_name || "—"}</td>
              <td className="right num">{money(p.price)}</td>
              <td className="right num">{money(p.cost)}</td>
              <td className="right num">
                {Number(p.quantity) <= Number(p.reorder_level)
                  ? <span className="tag low">{int(p.quantity)}</span> : int(p.quantity)}
              </td>
              <td className="right">
                <button className="btn quiet" onClick={() => edit(p)}>Edit</button>
                <button className="btn quiet danger" onClick={() => del(p)}>Delete</button>
              </td>
            </tr>
          )}
          emptyTitle="No products match"
          emptyBody="Try a different search, or add a product." />
      </div>
    </>
  );
}
