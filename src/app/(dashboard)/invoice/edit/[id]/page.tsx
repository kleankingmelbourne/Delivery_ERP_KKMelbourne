"use client";

import { use } from "react";
import InvoiceForm from "@/components/invoice/InvoiceForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditInvoicePage({ params }: PageProps) {
  // Next.js 13+ (App Router)에서 params는 Promise이므로 use()로 풉니다.
  const resolvedParams = use(params);

  return <InvoiceForm invoiceId={resolvedParams.id} />;
}