"use client";

import InvoiceTable from "@/components/invoice/InvoiceTable";

export default function InvoicePage() {
  return (
    <InvoiceTable 
      filterStatus="ALL" 
      title="Invoice List" 
    />
  );
}