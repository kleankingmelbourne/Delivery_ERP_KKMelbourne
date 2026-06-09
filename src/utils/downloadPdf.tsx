"use client";

import { pdf, Font } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { createClient } from '@/utils/supabase/client';
import InvoiceDocument, { InvoiceData } from '@/components/pdf/InvoiceDocument';
import CreditMemoDocument from '@/components/pdf/CreditMemoDocument'; 
import { BulkInvoiceDocument } from '@/components/pdf/BulkInvoiceDocument';
import StatementDocument, { StatementData, StatementTransaction, StatementAgeing } from '@/components/pdf/StatementDocument';
import QuotationDocument, { QuotationData } from '@/components/pdf/QuotationDocument';
import PurchaseOrderDocument, { PurchaseOrderData } from '@/components/pdf/PurchaseOrderDocument';
import PackingListDocument from '@/components/pdf/PackingListDocument'; 

import { PDFDocument } from 'pdf-lib';

Font.register({
  family: 'NotoSansKR',
  src: '/font/NotoSansKR-Medium.ttf', 
});

// ==================================================================
// 1. INVOICE & CREDIT MEMO SECTION
// ==================================================================
export const getInvoiceData = async (invoiceId: string): Promise<any | null> => {
  if (!invoiceId) return null;
  const supabase = createClient();
  
  const [invoiceRes, settingsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        *,
        customers ( 
          name, company, address, suburb, state, postcode, mobile,
          delivery_address, delivery_suburb, delivery_state, delivery_postcode
        ),
        invoice_items ( quantity, unit, unit_price, amount, is_gst_included, products ( * ) )
      `)
      .eq('id', invoiceId)
      .single(),
    supabase.from('company_settings').select('*').limit(1)
  ]);

  if (invoiceRes.error || !invoiceRes.data) return null;
  const invoice = invoiceRes.data;
  const settingsList = settingsRes.data;
  const settings = settingsList && settingsList.length > 0 ? settingsList[0] : {};

  try {
    const mappedItems = invoice.invoice_items?.map((item: any) => {
      const product = item.products || {};
      const name = product.name || product.product_name || product.description || "Item";
      const vId = product.vendor_product_id;
      const formattedId = vId ? `[${vId}]` : "";
      return {
        qty: item.quantity || 0,
        unit: item.unit || product.unit || "EA",
        description: name,
        itemCode: formattedId,
        unitPrice: item.unit_price || 0,
        amount: item.amount || 0,
        isGstIncluded: item.is_gst_included !== false // 🚀 GST 포함 여부 추가
      };
    }) || [];

    if (mappedItems.length === 0) {
      mappedItems.push({ qty: 0, unit: "-", description: "[No Items Found]", itemCode: "-", unitPrice: 0, amount: 0, isGstIncluded: true });
    }

    const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => 
      [addr, sub, st, post].filter(Boolean).join(" ");

    const billingAddr = formatAddress(invoice.customers?.address, invoice.customers?.suburb, invoice.customers?.state, invoice.customers?.postcode);
    const finalDeliveryAddress = formatAddress(invoice.delivery_address, invoice.delivery_suburb, invoice.delivery_state, invoice.delivery_postcode) || billingAddr;

    // 🚀 [핵심 수정] 재계산하지 않고 DB에 저장된 값을 최우선으로 사용합니다! (1센트 오차 & GST 에러 해결)
    const finalSubtotal = invoice.subtotal !== null && invoice.subtotal !== undefined 
        ? Number(invoice.subtotal) 
        : mappedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
        
    const finalGST = invoice.gst_total !== null && invoice.gst_total !== undefined 
        ? Number(invoice.gst_total) 
        : finalSubtotal * 0.10;
        
    const finalTotalAmount = invoice.total_amount !== null && invoice.total_amount !== undefined 
        ? Number(invoice.total_amount) 
        : finalSubtotal + finalGST;

    const isCreditMemo = typeof invoice.id === 'string' && invoice.id.startsWith('CR-');

    return {
      id: invoice.id,
      invoiceNo: invoice.id,
      date: invoice.invoice_date,
      dueDate: invoice.due_date || invoice.invoice_date,
      customerName: invoice.customers?.company || invoice.customers?.name || "Unknown Customer",
      customerMobile: invoice.customers?.mobile || "",
      deliveryName: invoice.customers?.name || "",
      address: billingAddr,
      deliveryAddress: finalDeliveryAddress,
      memo: invoice.memo || invoice.notes || "", 
      items: mappedItems,
      subtotal: finalSubtotal, // 🚀 DB 값 사용
      gst: finalGST,           // 🚀 DB 값 사용
      total: finalTotalAmount, // 🚀 DB 값 사용
      totalAmount: finalTotalAmount,
      paidAmount: Number(invoice.paid_amount) || 0,
      balanceDue: finalTotalAmount - (Number(invoice.paid_amount) || 0),
      allocatedAmount: Number(invoice.allocated_amount) || 0,
      remainingCredit: Number(invoice.remaining_credit) || (finalTotalAmount - (Number(invoice.allocated_amount) || 0)),
      companyName: settings.company_name || "",
      companyAbn: settings.abn || "",
      companyPhone: settings.phone || "",
      companyEmail: settings.email || "",
      companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
      bankName: settings.bank_name || "",
      bsb: settings.bsb_number || "",
      accountNumber: settings.account_number || "",
      bank_payid: settings.bank_payid || "-",
      invoiceInfo: settings.invoice_info || "",
      isCreditMemo: isCreditMemo,
      // 🚀 [여기 추가!] 서버용 로고 URL을 인보이스 데이터에도 얹어서 보냅니다.
      logoUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company_logo/logo.png`
    };
  } catch (err) {
    console.error("❌ [PDF] Mapping Error:", err);
    return null;
  }
};

export const fetchAndGenerateBlob = async (ids: string[], type: 'single' | 'bulk'): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getInvoiceData(ids[0]);
    if (!data) throw new Error("Failed to load invoice data.");
    const Doc = data.isCreditMemo ? <CreditMemoDocument data={data} /> : <InvoiceDocument data={data} />;
    const blob = await pdf(Doc).toBlob();
    const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
    let formattedDate = data.date;
    if (data.date && data.date.includes('-')) {
        const [year, month, day] = data.date.split('-');
        formattedDate = `${day}-${month}-${year}`;
    }
    const prefix = data.isCreditMemo ? "CreditMemo" : data.invoiceNo;
    const filename = `${prefix}_${formattedDate}_${safeName}.pdf`;
    return { blob, filename };
  } catch (e: any) {
    console.error("❌ [PDF] Error:", e.message);
    return null;
  }
};

export const downloadInvoicePdf = async (id: string) => {
  const result = await fetchAndGenerateBlob([id], 'single');
  if (result) saveAs(result.blob, result.filename);
};


// export const printInvoicePdf = async (id: string) => {
//   const result = await fetchAndGenerateBlob([id], 'single');
  
//   if (result) {
//     const url = URL.createObjectURL(result.blob);
    
//     // 1. 화면에 보이지 않는 숨겨진 iframe 생성
//     const iframe = document.createElement('iframe');
//     iframe.style.display = 'none';
//     iframe.src = url;

//     // 2. iframe에 PDF 로드가 완료되면 즉시 인쇄창 호출
//     iframe.onload = () => {
//       // 미리보기 없이 시스템 인쇄창 띄우기
//       iframe.contentWindow?.print();

//       // 3. 인쇄창 호출 후 메모리 누수 방지를 위해 찌꺼기 청소
//       // (인쇄창이 안정적으로 뜰 시간을 벌기 위해 2초 뒤 삭제)
//       setTimeout(() => {
//         document.body.removeChild(iframe);
//         URL.revokeObjectURL(url);
//       }, 2000);
//     };

//     // 4. HTML 문서에 iframe을 삽입하여 로드 시작
//     document.body.appendChild(iframe);
//   }
// };

export const printInvoicePdf = async (id: string) => {
  const result = await fetchAndGenerateBlob([id], 'single');
  
  if (result) {
    const url = URL.createObjectURL(result.blob);
    
    // 1. 화면에 보이지 않는 숨겨진 iframe 생성
    const iframe = document.createElement('iframe');
    // 수정: display: 'none' 대신 화면 밖으로 완전히 밀어내기 (브라우저 호환성)
    iframe.style.position = 'absolute';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.visibility = 'hidden';
    iframe.src = url;

    // 2. iframe에 PDF 로드가 완료되면 즉시 인쇄창 호출
    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) return;

        // 인쇄 전 포커스를 주면 더 안정적으로 동작하는 브라우저들이 있습니다.
        win.focus();
        win.print();

        // 3. 메모리 누수 방지 로직 수정 (2초 하드코딩 제거)
        const cleanUp = () => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }
        };

        // 사용자가 인쇄창에서 '인쇄' 또는 '취소'를 눌러 창이 닫혔을 때 이벤트 감지
        win.onafterprint = cleanUp;

        // 혹시라도 onafterprint를 지원하지 않는 PDF 플러그인 환경을 위한 백업 타임아웃
        // 사용자가 인쇄창을 10분 넘게 켜두지 않는다는 가정하에 넉넉하게 10분(600000ms) 설정
        setTimeout(cleanUp, 10 * 60 * 1000); 

      } catch (error) {
        console.error("인쇄 중 오류 발생:", error);
      }
    };

    // 4. HTML 문서에 iframe을 삽입하여 로드 시작
    document.body.appendChild(iframe);
  }
};

export const downloadBulkPdf = async (ids: string[]) => {
  if (ids.length === 0) return;
  const results = await Promise.all(ids.map(id => getInvoiceData(id)));
  const validDataSet = results.filter((item): item is any => item !== null);
  if (validDataSet.length === 0) return;

  const mergedPdf = await PDFDocument.create();

  for (const data of validDataSet) {
    const Doc = data.isCreditMemo ? <CreditMemoDocument data={data} /> : <InvoiceDocument data={data} />;
    
    const blob = await pdf(Doc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    
    const invoicePdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  const mergedBlob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
  const dateStr = new Date().toISOString().split('T')[0];
  saveAs(mergedBlob, `Bulk_Invoices_${dateStr}.pdf`);
};

export const printBulkPdf = async (ids: string[]) => {
  if (ids.length === 0) return;
  const results = await Promise.all(ids.map(id => getInvoiceData(id)));
  const validDataSet = results.filter((item): item is any => item !== null);
  if (validDataSet.length === 0) return;

  const mergedPdf = await PDFDocument.create();

  for (const data of validDataSet) {
    const Doc = data.isCreditMemo ? <CreditMemoDocument data={data} /> : <InvoiceDocument data={data} />;
    
    const blob = await pdf(Doc).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    
    const invoicePdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(invoicePdf, invoicePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  const mergedBlob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
  window.open(URL.createObjectURL(mergedBlob), '_blank');
};

// ==================================================================
// 2. PICKING SUMMARY SECTION
// ==================================================================
export const downloadPickingSummary = async (ids: string[]) => {
  const supabase = createClient();
  const { data: items, error } = await supabase
    .from('invoice_items')
    .select(`quantity, description, unit, products ( * ) `)
    .in('invoice_id', ids);

  if (error || !items) return;

  const summaryMap = new Map<string, any>();
  items.forEach((item: any) => {
    const product = item.products || {};
    const key = product.item_code || item.description;
    const qty = item.quantity || 0;
    if (summaryMap.has(key)) {
      summaryMap.get(key).qty += qty;
    } else {
      summaryMap.set(key, { 
        name: product.name || product.product_name || item.description, 
        location: product.location || "", 
        qty, 
        unit: item.unit || product.unit || "EA",
        vendorProductId: product.vendor_product_id || "" 
      });
    }
  });

  const summaryList = Array.from(summaryMap.values()).sort((a, b) => (a.location || "").localeCompare(b.location || ""));
  
  let content = `Picking Summary\n====================================================================================\n`;
  content += `[Location] | Qty & Unit | Vendor ID       | Product Name\n`;
  content += `------------------------------------------------------------------------------------\n`;
  
  summaryList.forEach(i => {
    const loc = (i.location || "-").padEnd(8);
    const qtyUnit = `${i.qty} ${i.unit}`.padEnd(10);
    const vId = (i.vendorProductId || "-").padEnd(15);
    
    content += `[${loc}] | ${qtyUnit} | ${vId} | ${i.name}\n`;
  });

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `Picking_Summary_${new Date().toISOString().split('T')[0]}.txt`);
};

export const downloadSummaryTxt = downloadPickingSummary;

// ==================================================================
// 3. STATEMENT SECTION (🔥 발생 일자 기준 Ageing + 미사용 크레딧만 표시)
// ==================================================================

export const fetchAndGenerateStatementBlob = async (customerId: string, startDate: string, endDate: string, customerName: string) => {
  const supabase = createClient();
  
  const [
    { data: customer },
    { data: invoices },
    { data: settingsList },
    { data: creditData }
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
    supabase.from("invoices").select("*").eq("customer_id", customerId).lte("invoice_date", endDate),
    supabase.from('company_settings').select('*').limit(1),
    // 🚀 [수정됨] id를 추가로 가져와서 어떤 크레딧인지 식별합니다.
    supabase.from('payments').select('id, unallocated_amount, payment_date').eq('customer_id', customerId).gt('unallocated_amount', 0)
  ]);

  const transactions: StatementTransaction[] = [];
  
  const openInvoices = invoices?.filter(inv => {
     const s = (inv.status || '').toLowerCase();
     if (s === 'paid' || s === 'completed' || s.includes('cancel')) return false;
     
     if (inv.total_amount > 0 && Math.abs(inv.total_amount - (inv.paid_amount || 0)) < 0.01) return false;
     return true;
  }) || [];

  // 1. 미납 인보이스만 목록에 추가
  openInvoices.forEach(inv => {
    const isCredit = 
        (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || 
        inv.total_amount < 0 || 
        (inv.status || '').toLowerCase() === 'credit';
    
    // 🚀 크레딧은 여기서 무조건 제외합니다. (사용 완료된 크레딧을 원천 차단)
    if (isCredit) return; 
    
    transactions.push({ 
        id: inv.id, 
        date: inv.invoice_date, 
        type: 'Invoice', 
        reference: inv.id.toUpperCase(), 
        amount: inv.total_amount, 
        credit: inv.paid_amount || 0, 
        dueDate: inv.due_date,
        status: inv.status
    });
  });

  // 2. 🚀 [핵심 추가됨] 잔액이 남아있는(unallocated > 0) 크레딧/초과결제금만 목록에 추가
  creditData?.forEach((credit: any) => {
    const isCrMemo = typeof credit.id === 'string' && credit.id.startsWith('CR-');
    
    transactions.push({
        id: credit.id,
        date: credit.payment_date || endDate, 
        type: isCrMemo ? 'Credit' : 'Payment',
        reference: credit.id ? credit.id.toUpperCase() : 'CREDIT',
        amount: 0,
        credit: credit.unallocated_amount, // 🚀 남은 크레딧 금액만 표시하여 잔액 계산을 맞춤
        status: 'Active'
    });
  });

  const openingBal = 0;

  const ageing: StatementAgeing = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
  const today = new Date();

  // 3. 미납 인보이스 금액을 날짜 구간에 맞게 더하기 (플러스 금액)
  openInvoices.forEach((inv: any) => {
    const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0;
    if (isCredit) return; // Ageing 더할 때도 크레딧은 건너뜀

    const outstanding = inv.total_amount - (inv.paid_amount || 0);
    if (outstanding !== 0) {
        const invDate = new Date(inv.invoice_date);
        const diffTime = Math.abs(today.getTime() - invDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) ageing.current += outstanding;
        else if (diffDays <= 60) ageing.days30 += outstanding;
        else if (diffDays <= 90) ageing.days60 += outstanding;
        else if (diffDays <= 120) ageing.days90 += outstanding; 
        else ageing.over90 += outstanding;
    }
  });
  
  // 4. 남은 크레딧을 "발생한 날짜" 구간에서 빼기 (마이너스 금액)
  creditData?.forEach((credit: any) => {
      const unallocated = credit.unallocated_amount || 0;
      if (unallocated > 0 && credit.payment_date) {
          const payDate = new Date(credit.payment_date);
          const diffTime = Math.abs(today.getTime() - payDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 30) ageing.current -= unallocated;
          else if (diffDays <= 60) ageing.days30 -= unallocated;
          else if (diffDays <= 90) ageing.days60 -= unallocated;
          else if (diffDays <= 120) ageing.days90 -= unallocated; 
          else ageing.over90 -= unallocated;
      }
  });

  ageing.total = ageing.current + ageing.days30 + ageing.days60 + ageing.days90 + ageing.over90;

  const settings = settingsList?.[0] || {};
  const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => [addr, sub, st, post].filter(Boolean).join(", ");
  
  let customerAddress = formatAddress(customer?.address, customer?.suburb, customer?.state, customer?.postcode);
  if (customer?.mobile) customerAddress += `\nMobile: ${customer.mobile}`;

  const statementData: StatementData = {
    customerName, startDate, endDate, 
    openingBalance: openingBal, 
    ageing: ageing,
    // 날짜 오름차순 정렬
    transactions: transactions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    customerId: customer?.id,
    customerAddress: customerAddress,
    companyName: settings.company_name || "KLEAN KING", 
    companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
    companyEmail: settings.email, 
    companyPhone: settings.phone,
    bankName: settings.bank_name, 
    bsb: settings.bsb_number, 
    accountNumber: settings.account_number,
    bank_payid: settings.bank_payid,
    statementInfo: settings.statement_info
  };

  const blob = await pdf(<StatementDocument data={statementData} />).toBlob();
  return { blob, filename: `Statement_${customerName}_${endDate}.pdf` };
};

export const downloadStatementPdf = async (customerId: string, startDate: string, endDate: string, name: string) => {
  const result = await fetchAndGenerateStatementBlob(customerId, startDate, endDate, name);
  if (result) saveAs(result.blob, result.filename);
};

export const printStatementPdf = async (customerId: string, startDate: string, endDate: string, name: string) => {
  const result = await fetchAndGenerateStatementBlob(customerId, startDate, endDate, name);
  if (result) window.open(URL.createObjectURL(result.blob), '_blank');
};

// ==================================================================
// 4. QUOTATION & 5. PURCHASE ORDER SECTION
// ==================================================================

export const getQuotationData = async (quotationId: string): Promise<QuotationData | null> => {
  if (!quotationId) return null;
  const supabase = createClient();

  const [quoteRes, settingsRes] = await Promise.all([
    supabase.from('quotations').select(`*, customers (*), quotation_items (quantity, unit, unit_price, amount, products (*))`).eq('id', quotationId).single(),
    supabase.from('company_settings').select('*').limit(1)
  ]);

  if (quoteRes.error || !quoteRes.data) return null;
  const quotation = quoteRes.data;
  
  const settingsList = settingsRes.data;
  const settings = settingsList?.[0] || {};

  try {
    const mappedItems = quotation.quotation_items?.map((item: any) => {
      const product = item.products || {};
      const name = product.name || product.product_name || product.description || "Item";
      const vId = product.vendor_product_id;
      const formattedId = vId ? `[${vId}]` : "";

      return {
        qty: item.quantity || 0,
        unit: item.unit || product.unit || "EA",
        description: name,
        itemCode: formattedId,
        unitPrice: item.unit_price || 0,
        amount: item.amount || 0
      };
    }) || [];

    const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => [addr, sub, st, post].filter(Boolean).join(" ");
    let billingAddr = formatAddress(quotation.customers?.address, quotation.customers?.suburb, quotation.customers?.state, quotation.customers?.postcode);
    if (quotation.customers?.mobile) billingAddr += `\nMobile: ${quotation.customers.mobile}`;

    const calculatedSubtotal = mappedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    const calculatedGST = calculatedSubtotal * 0.10;

    return {
      invoiceNo: quotation.quotation_number || quotation.id, 
      date: quotation.issue_date || quotation.quotation_date, 
      dueDate: quotation.valid_until || quotation.quotation_date, 
      customerName: quotation.customers?.company || quotation.customers?.name || quotation.quotation_to || quotation.invoice_to || quotation.customer_name || "Unknown",
      deliveryName: quotation.customers?.name || quotation.quotation_to || quotation.invoice_to || quotation.customer_name || "",
      address: billingAddr, 
      deliveryAddress: billingAddr,
      memo: quotation.memo || "", 
      items: mappedItems,
      subtotal: calculatedSubtotal, 
      gst: calculatedGST,
      total: calculatedSubtotal + calculatedGST,
      totalAmount: calculatedSubtotal + calculatedGST,
      companyName: settings.company_name || "",
      companyAbn: settings.abn || "",
      companyPhone: settings.phone || "",
      companyEmail: settings.email || "",
      companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
      bankName: settings.bank_name || "",
      bsb: settings.bsb_number || "",
      accountNumber: settings.account_number || "",
      bank_payid: settings.bank_payid || "",
      invoiceInfo: settings.quotation_info || "" 
    };
  } catch (err) {
    console.error("❌ Quotation Mapping Error:", err);
    return null;
  }
};

export const fetchAndGenerateQuotationBlob = async (id: string): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getQuotationData(id);
    if (!data) throw new Error("Failed to load quotation data.");
    const blob = await pdf(<QuotationDocument data={data} />).toBlob();
    const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
    const filename = `Quote_${data.invoiceNo}_${safeName}.pdf`;
    return { blob, filename };
  } catch (e: any) {
    console.error("❌ Generation Error:", e.message);
    return null;
  }
};

export const downloadQuotationPdf = async (id: string) => {
  const result = await fetchAndGenerateQuotationBlob(id);
  if (result) saveAs(result.blob, result.filename);
};

export const printQuotationPdf = async (id: string) => {
  const result = await fetchAndGenerateQuotationBlob(id);
  if (result) window.open(URL.createObjectURL(result.blob), '_blank');
};

export const getPurchaseOrderData = async (poId: string): Promise<PurchaseOrderData | null> => {
  const supabase = createClient();
  
  const [poRes, itemsRes, settingsRes] = await Promise.all([
    supabase.from('purchase_orders').select(`*, product_vendors (*)`).eq('id', poId).single(),
    supabase.from('purchase_order_items').select(`*, products (vendor_product_id, product_name)`).eq('po_id', poId),
    supabase.from('company_settings').select('*').limit(1)
  ]);

  if (poRes.error || !poRes.data) return null;
  
  const po = poRes.data;
  const items = itemsRes.data;
  const settingsList = settingsRes.data;
  const settings = settingsList?.[0] || {};

  const mappedItems = (items || []).map((item: any) => ({
      description: item.description || item.products?.product_name || "Item",
      vendorProductId: item.products?.vendor_product_id || "", 
      quantity: Number(item.quantity) || 0,
      unit: item.unit || item.products?.unit || "EA",
      unitPrice: Number(item.unit_price) || 0,
      amount: Number(item.amount) || 0,
      gst: item.products?.gst ?? true
  }));

  const subTotal = mappedItems.reduce((sum: number, i: any) => sum + i.amount, 0);
  const gstTotal = mappedItems.reduce((sum: number, i: any) => i.gst ? sum + (i.amount * 0.1) : sum, 0);
  const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => [addr, sub, st, post].filter(Boolean).join(", ");

  return {
    poNumber: po.po_number,
    date: po.po_date,
    companyName: settings.company_name || "KLEAN KING",
    companyAddress1: settings.address_line1,
    companyAddress2: settings.address_line2,
    companySuburb: settings.suburb,
    companyState: settings.state,
    companyPostcode: settings.postcode,
    companyPhone: settings.phone,
    companyEmail: settings.email,
    companyAbn: settings.abn,
    vendorName: po.product_vendors?.vendor_name || "",
    vendorAddress: po.product_vendors?.address || "",
    vendorSuburb: po.product_vendors?.suburb || "",   
    vendorState: po.product_vendors?.state || "",    
    vendorPostcode: po.product_vendors?.postcode || "", 
    vendorPhone: po.product_vendors?.tel || "",
    vendorEmail: po.product_vendors?.email || "",
    shipToName: settings.company_name || "Warehouse",
    shipToAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
    items: mappedItems,
    subtotal: subTotal,
    gstTotal: gstTotal,
    grandTotal: subTotal + gstTotal,
    memo: po.memo
  };
};

export const fetchAndGeneratePurchaseOrderBlob = async (id: string): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getPurchaseOrderData(id);
    if (!data) throw new Error("Failed to load PO data.");
    const blob = await pdf(<PurchaseOrderDocument data={data} />).toBlob();
    return { blob, filename: `PO_${data.poNumber}.pdf` };
  } catch (e: any) {
    console.error("❌ PO Gen Error:", e.message);
    return null;
  }
};

export const downloadPurchaseOrderPdf = async (id: string) => {
  const result = await fetchAndGeneratePurchaseOrderBlob(id);
  if (result) saveAs(result.blob, result.filename);
};

export const printPurchaseOrderPdf = async (id: string) => {
  const result = await fetchAndGeneratePurchaseOrderBlob(id);
  if (result) window.open(URL.createObjectURL(result.blob), '_blank');
};

// ==================================================================
// PACKING LIST SECTION
// ==================================================================

export const fetchAndGeneratePackingListBlob = async (id: string): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getInvoiceData(id);
    if (!data) throw new Error("Failed to load invoice data for packing list.");
    
    const blob = await pdf(<PackingListDocument data={data} />).toBlob();
    
    const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
    let formattedDate = data.date;
    if (data.date && data.date.includes('-')) {
        const [year, month, day] = data.date.split('-');
        formattedDate = `${day}-${month}-${year}`;
    }
    const filename = `PackingList_${data.invoiceNo}_${formattedDate}_${safeName}.pdf`;
    
    return { blob, filename };
  } catch (e: any) {
    console.error("❌ [Packing List] Error:", e.message);
    return null;
  }
};

export const downloadPackingListPdf = async (id: string) => {
  const result = await fetchAndGeneratePackingListBlob(id);
  if (result) saveAs(result.blob, result.filename);
};
