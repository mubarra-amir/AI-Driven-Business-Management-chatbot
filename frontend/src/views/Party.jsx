import { useEffect, useState } from "react";
import { api, money, int } from "../api";
import { Head, Table, Modal, Field } from "../components/ui";

function Party({ kind, openModal, refresh, setTally, revision }) {
  const path = kind === "vendor" ? "/api/vendors" : "/api/customers";
  const title = kind === "vendor" ? "Vendors" : "Customers";
  const [rows, setRows] = useState(null);

  const load = async () => {
    const r = await api(path);
    setRows(r);
    setTally(kind + "s", r.length ? String(r.length) : "");
  };
  useEffect(() => { load(); }, [revision]);

  const addOrEdit = (existing) => openModal(
    <Modal title={existing ? `Edit ${existing.name}` : `Add ${kind}`}
      submitLabel={existing ? "Save changes" : `Add ${kind}`}
      onClose={() => openModal(null)}
      onSubmit={async (data) => {
        const body = { name: data.name, email: data.email || null,
          phone: data.phone || null, address: data.address || null };
        if (existing) await api(`${path}/${existing.id}`, { method: "PUT", body });
        else await api(path, { method: "POST", body });
        await refresh();
      }}>
      <Field name="name" label="Name" required defaultValue={existing?.name} />
      <Field name="email" label="Email" type="email" defaultValue={existing?.email ?? ""} />
      <Field name="phone" label="Phone" defaultValue={existing?.phone ?? ""} />
      <Field name="address" label="Address" defaultValue={existing?.address ?? ""} />
    </Modal>
  );

  const confirmDelete = (existing) => openModal(
    <Modal title={`Delete ${existing.name}?`} subtitle="This can't be undone."
      submitLabel={`Delete ${kind}`} onClose={() => openModal(null)}
      onSubmit={async () => {
        await api(`${path}/${existing.id}`, { method: "DELETE" });
        await refresh();
      }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        {kind === "vendor"
          ? "Products from this vendor stay, but lose their vendor link."
          : "Orders and sales for this customer stay, but lose their customer link."}
      </p>
    </Modal>
  );

  if (!rows) return <p className="hint">Loading…</p>;

  const sub = kind === "vendor"
    ? `${rows.length} supplier${rows.length === 1 ? "" : "s"}`
    : `${rows.length} on file`;

  return (
    <>
      <Head title={title} sub={sub}
        actions={<button className="btn" onClick={() => addOrEdit()}>Add {kind}</button>} />
      <div className="panel">
        <Table
          columns={kind === "vendor"
            ? [{ label: "Name" }, { label: "Email" }, { label: "Phone" }, { label: "Address" }, { label: "", align: "right" }]
            : [{ label: "Name" }, { label: "Email" }, { label: "Phone" }, { label: "Address" },
               { label: "Orders", align: "right" }, { label: "Lifetime value", align: "right" }, { label: "", align: "right" }]}
          rows={rows}
          renderRow={(c) => (
            <tr key={c.id}>
              <td className="wrap">{c.name}</td>
              <td>{c.email || "—"}</td>
              <td className="num">{c.phone || "—"}</td>
              <td className="wrap">{c.address || "—"}</td>
              {kind === "customer" ? (
                <>
                  <td className="right num">{int(c.order_count)}</td>
                  <td className="right num">{money(c.lifetime_value)}</td>
                </>
              ) : null}
              <td className="right">
                <button className="btn quiet" onClick={() => addOrEdit(c)}>Edit</button>
                <button className="btn quiet danger" onClick={() => confirmDelete(c)}>Delete</button>
              </td>
            </tr>
          )}
          emptyTitle={kind === "vendor" ? "No vendors yet" : "No customers yet"}
          emptyBody={kind === "vendor"
            ? "Add a supplier to link products to."
            : "Add one, or place a walk-in order without a customer."} />
      </div>
    </>
  );
}

export const Customers = (props) => <Party kind="customer" {...props} />;
export const Vendors = (props) => <Party kind="vendor" {...props} />;
