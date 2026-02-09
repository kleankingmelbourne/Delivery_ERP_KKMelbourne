"use client";

import InvoiceTable from "@/components/invoice/InvoiceTable";

export default function PaidInvoicePage() {
  return (
    <InvoiceTable 
      filterStatus="PAID" 
      title="Paid Invoices" 
    />
  );
}