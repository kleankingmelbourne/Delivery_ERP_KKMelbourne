"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic"; 
import { createClient } from "@/utils/supabase/client";
import { Loader2, ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

// InvoiceDocument 불러오기
import InvoiceDocument, { InvoiceData } from "@/components/pdf/InvoiceDocument";

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  { ssr: false, loading: () => <p className="text-sm text-slate-500">Loading Viewer...</p> }
);

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  { ssr: false }
);

export default function InvoicePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const supabase = createClient();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState<string>("");

  useEffect(() => {
    Promise.resolve(params).then((resolvedParams) => setId(resolvedParams.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      // 1. 인보이스 + 고객 정보 + 아이템 정보 가져오기
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select(`
          *,
          customers ( name, address, suburb, state, postcode, customer_id_text ),
          invoice_items ( 
            quantity, unit_price, amount, unit, description,
            products ( name, item_code ) 
          )
        `)
        .eq('id', id)
        .single();

      // 2. 회사 설정 정보 가져오기
      const { data: settings } = await supabase.from('company_settings').select('*').single();
      
      console.log("전체 설정 데이터:", settings);
      console.log("PayID 값:", settings?.bank_payid);
      
      if (error || !invoice) {
        console.error("Error fetching invoice:", error);
        setLoading(false);
        return;
      }

      // 3. 데이터 매핑
      const pdfData: InvoiceData = {
        invoiceNo: invoice.id,
        date: invoice.invoice_date,
        dueDate: invoice.due_date || invoice.invoice_date,
        customerName: invoice.customers?.name || "Unknown",
        customerId: invoice.customers?.customer_id_text || "",
        
        address: `${invoice.customers?.address || ''}, ${invoice.customers?.suburb || ''} ${invoice.customers?.state || ''} ${invoice.customers?.postcode || ''}`,
        
        items: invoice.invoice_items.map((item: any) => ({
          qty: item.quantity,
          unit: item.unit || "EA",
          description: item.description || item.products?.name || "Item", 
          itemCode: item.products?.item_code || "",
          unitPrice: item.unit_price,
          amount: item.amount
        })),

        subtotal: invoice.subtotal || (invoice.total_amount - (invoice.gst_total || 0)),
        gst: invoice.gst_total || 0,
        total: invoice.total_amount,
        totalAmount: invoice.total_amount,
        paidAmount: invoice.paid_amount || 0,
        balanceDue: invoice.total_amount - (invoice.paid_amount || 0),
        
        // 은행 정보
        bankName: settings?.bank_name,
        bsb: settings?.bsb_number, 
        accountNumber: settings?.account_number,
        
        // ✅ [수정] PayID 연결 (변수명을 bank_payid로 통일)
        bank_payid: settings?.bank_payid || "",
        
        // 회사 정보
        companyName: settings?.company_name,
        companyAbn: settings?.abn,
        companyPhone: settings?.phone,
        companyEmail: settings?.email,
        companyAddress: `${settings?.address_line1 || ''} ${settings?.suburb || ''}`,
        invoiceInfo: settings?.invoice_info
      };

      setData(pdfData);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (!data) return <div className="flex h-screen items-center justify-center">Invoice not found.</div>;

  return (
    <div className="p-6 h-[calc(100vh-20px)] flex flex-col bg-slate-50">
      <div className="flex justify-between mb-4 items-center">
        <Button variant="outline" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        
        <PDFDownloadLink
          document={<InvoiceDocument data={data} />}
          fileName={`INV_${data.invoiceNo}.pdf`}
        >
          {/* @ts-ignore */}
          {({ loading }) => (
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download PDF
            </Button>
          )}
        </PDFDownloadLink>
      </div>

      <div className="flex-1 border rounded-xl overflow-hidden bg-white shadow-sm">
        <PDFViewer width="100%" height="100%" className="border-none">
          <InvoiceDocument data={data} />
        </PDFViewer>
      </div>
    </div>
  );
}