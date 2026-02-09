"use client";

import InvoiceTable from "@/components/invoice/InvoiceTable";

export default function UnpaidInvoicePage() {
  return (
    <InvoiceTable 
      filterStatus="UNPAID" 
      title="Unpaid / Partial Invoices" 
    />
  );
}