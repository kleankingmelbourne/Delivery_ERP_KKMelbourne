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
      isCreditMemo: isCreditMemo
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

export const printInvoicePdf = async (id: string) => {
  const result = await fetchAndGenerateBlob([id], 'single');
  if (result) {
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
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
// 3. STATEMENT SECTION (🔥 병렬화 핵심 최적화)
// ==================================================================

export const fetchAndGenerateStatementBlob = async (customerId: string, startDate: string, endDate: string, customerName: string) => {
  const supabase = createClient();
  
  const [
    { data: customer },
    { data: invoices },
    { data: payments },
    { data: allOpenInvoices },
    { data: prevInv },
    { data: prevPay },
    { data: settingsList },
    { data: creditData }
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
    supabase.from("invoices").select("*").eq("customer_id", customerId).gte("invoice_date", startDate).lte("invoice_date", endDate),
    supabase.from("payments").select("*").eq("customer_id", customerId).gte("payment_date", startDate).lte("payment_date", endDate),
    supabase.from("invoices").select("invoice_date, total_amount, paid_amount, id").eq("customer_id", customerId).neq("status", "Paid"),
    supabase.from("invoices").select("total_amount").eq("customer_id", customerId).lt("invoice_date", startDate),
    supabase.from("payments").select("amount").eq("customer_id", customerId).lt("payment_date", startDate),
    supabase.from('company_settings').select('*').limit(1),
    supabase.from('payments').select('unallocated_amount').eq('customer_id', customerId).gt('unallocated_amount', 0)
  ]);

  const transactions: StatementTransaction[] = [];
  
  invoices?.forEach(inv => {
    const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0;
    
    transactions.push({ 
        id: inv.id, 
        date: inv.invoice_date, 
        type: isCredit ? 'Credit' : 'Invoice', 
        reference: inv.id.toUpperCase(), 
        amount: isCredit ? 0 : inv.total_amount, 
        credit: isCredit ? Math.abs(inv.total_amount) : 0, 
        dueDate: inv.due_date
    });
  });

  payments?.forEach(pay => {
    if (typeof pay.id === 'string' && pay.id.startsWith('CR-')) return; 

    transactions.push({ 
        id: pay.id, 
        date: pay.payment_date, 
        type: 'Payment', 
        reference: pay.id.slice(0,8).toUpperCase(), 
        amount: 0, 
        credit: pay.amount 
    });
  });

  const openingBal = (prevInv?.reduce((sum, i) => sum + i.total_amount, 0) || 0) - (prevPay?.reduce((sum, p) => sum + p.amount, 0) || 0);

  const ageing: StatementAgeing = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
  const today = new Date();

  // 1. 먼저 순수하게 연체된 미납액만 각 버킷에 할당
  allOpenInvoices?.forEach((inv: any) => {
    const outstanding = inv.total_amount - inv.paid_amount;
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
  
  // 2. 고객의 총 크레딧 잔액 구하기
  let remainingCredit = creditData ? creditData.reduce((sum, p) => sum + (p.unallocated_amount || 0), 0) : 0;

  // 3. 🚀 [수정 포인트] 크레딧을 오래된 연체 구간부터 차감 (가장 오래된 빚부터 청산)
  if (remainingCredit > 0) {
      const applyCredit = (amount: number) => {
          const deduction = Math.min(amount, remainingCredit);
          remainingCredit -= deduction;
          return amount - deduction;
      };

      ageing.over90 = applyCredit(ageing.over90);
      ageing.days90 = applyCredit(ageing.days90);
      ageing.days60 = applyCredit(ageing.days60);
      ageing.days30 = applyCredit(ageing.days30);
      
      // 그래도 크레딧이 남았다면, Current 칸에서 차감 (마이너스로 표시됨)
      ageing.current -= remainingCredit; 
  }

  // 4. 표에 표시될 최종 합계 업데이트
  ageing.total = ageing.current + ageing.days30 + ageing.days60 + ageing.days90 + ageing.over90;

  const settings = settingsList?.[0] || {};
  const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => [addr, sub, st, post].filter(Boolean).join(", ");
  
  let customerAddress = formatAddress(customer?.address, customer?.suburb, customer?.state, customer?.postcode);
  if (customer?.mobile) customerAddress += `\nMobile: ${customer.mobile}`;

  const statementData: StatementData = {
    customerName, startDate, endDate, 
    openingBalance: openingBal, 
    ageing: ageing,
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