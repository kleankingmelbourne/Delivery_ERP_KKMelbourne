import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { createClient } from '@/utils/supabase/client';
import InvoiceDocument, { InvoiceData } from '@/components/pdf/InvoiceDocument';
import { BulkInvoiceDocument } from '@/components/pdf/BulkInvoiceDocument';
import StatementDocument, { StatementData, StatementTransaction } from '@/components/pdf/StatementDocument';
import QuotationDocument, { QuotationData } from '@/components/pdf/QuotationDocument';
import PurchaseOrderDocument, { PurchaseOrderData } from '@/components/pdf/PurchaseOrderDocument';

// ------------------------------------------------------------------
// 1. Invoice 데이터 조회 및 변환 (Credit Memo 포함)
// ------------------------------------------------------------------
const getInvoiceData = async (invoiceId: string): Promise<InvoiceData | null> => {
  if (!invoiceId) return null;

  const supabase = createClient();

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customers ( 
        name, company, address, suburb, state, postcode, mobile,
        delivery_address, delivery_suburb, delivery_state, delivery_postcode
      ),
      invoice_items ( quantity, unit, unit_price, amount, products ( * ) )
    `)
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) {
    console.error("❌ [PDF] Invoice Query Error:", error);
    return null;
  }

  const { data: settingsList } = await supabase.from('company_settings').select('*').limit(1);
  const settings = settingsList && settingsList.length > 0 ? settingsList[0] : {};

  try {
    const mappedItems = invoice.invoice_items?.map((item: any) => {
      const product = item.products || {};
      const name = product.name || product.product_name || product.description || "Item";
      return {
        qty: item.quantity || 0,
        unit: item.unit || product.unit || "EA",
        description: name,
        itemCode: product.item_code || "",
        unitPrice: item.unit_price || 0,
        amount: item.amount || 0
      };
    }) || [];

    if (mappedItems.length === 0) {
      mappedItems.push({ qty: 0, unit: "-", description: "[No Items Found]", itemCode: "-", unitPrice: 0, amount: 0 });
    }

    const formatAddress = (addr: string, sub: string, st: string, post: string) => 
      [addr, sub, st, post].filter(Boolean).join(" ");

    const invoiceDeliveryAddr = formatAddress(
      invoice.delivery_address, invoice.delivery_suburb, invoice.delivery_state, invoice.delivery_postcode
    );
    const customerDeliveryAddr = formatAddress(
      invoice.customers?.delivery_address, invoice.customers?.delivery_suburb, invoice.customers?.delivery_state, invoice.customers?.delivery_postcode
    );
    const billingAddr = formatAddress(
      invoice.customers?.address, invoice.customers?.suburb, invoice.customers?.state, invoice.customers?.postcode
    );
    const finalDeliveryAddress = invoiceDeliveryAddr || customerDeliveryAddr || billingAddr;

    const calculatedSubtotal = mappedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    const calculatedGST = calculatedSubtotal * 0.10;
    const calculatedTotalAmount = calculatedSubtotal + calculatedGST;
    const paidAmount = Number(invoice.paid_amount) || 0;
    const balanceDue = calculatedTotalAmount - paidAmount;

    return {
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
      subtotal: calculatedSubtotal, 
      gst: calculatedGST,
      total: calculatedTotalAmount,
      totalAmount: calculatedTotalAmount,
      paidAmount: paidAmount,
      balanceDue: balanceDue,
      companyName: settings.company_name || "",
      companyAbn: settings.abn || "",
      companyPhone: settings.phone || "",
      companyEmail: settings.email || "",
      companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
      bankName: settings.bank_name || "",
      bsb: settings.bsb_number || "",
      accountNumber: settings.account_number || "",
      bank_payid: settings.bank_payid || "-",
      invoiceInfo: settings.invoice_info || ""
    };
  } catch (err) {
    console.error("❌ [PDF] Data Mapping Error:", err);
    return null;
  }
};

// ------------------------------------------------------------------
// 2. Blob 생성 (Invoice)
// ------------------------------------------------------------------
export const fetchAndGenerateBlob = async (ids: string[], type: 'single' | 'bulk'): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getInvoiceData(ids[0]);
    if (!data) throw new Error("Failed to load invoice data.");
    const blob = await pdf(<InvoiceDocument data={data} />).toBlob();
    const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
    let formattedDate = data.date;
    if (data.date && data.date.includes('-')) {
        const [year, month, day] = data.date.split('-');
        formattedDate = `${day}-${month}-${year}`;
    }
    const filename = `${data.invoiceNo}_${formattedDate}_${safeName}.pdf`;
    return { blob, filename };
  } catch (e: any) {
    console.error("❌ [PDF] Generation Error:", e.message);
    alert("Error: " + e.message);
    return null;
  }
};

// ------------------------------------------------------------------
// 3. Invoice Export Functions
// ------------------------------------------------------------------
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
  const promises = ids.map(id => getInvoiceData(id));
  const results = await Promise.all(promises);
  const validDataSet = results.filter((item): item is InvoiceData => item !== null);

  if (validDataSet.length === 0) {
    alert("No valid invoices found to download.");
    return;
  }
  const blob = await pdf(<BulkInvoiceDocument dataSet={validDataSet} />).toBlob();
  const now = new Date();
  const dateStr = `${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()}`;
  saveAs(blob, `Bulk_Invoices_${dateStr}_(${validDataSet.length}).pdf`);
};

export const printBulkPdf = async (ids: string[]) => {
  if (ids.length === 0) return;
  const promises = ids.map(id => getInvoiceData(id));
  const results = await Promise.all(promises);
  const validDataSet = results.filter((item): item is InvoiceData => item !== null);
  if (validDataSet.length === 0) return;
  const blob = await pdf(<BulkInvoiceDocument dataSet={validDataSet} />).toBlob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
};

// ------------------------------------------------------------------
// 4. Picking Summary
// ------------------------------------------------------------------
export const downloadPickingSummary = async (ids: string[]) => {
  const supabase = createClient();
  const { data: items, error } = await supabase
    .from('invoice_items')
    .select(`quantity, description, unit, products ( * ) `)
    .in('invoice_id', ids);

  if (error || !items) {
    console.error("❌ Error fetching items for summary:", JSON.stringify(error, null, 2));
    alert("Picking Summary 생성 실패. 콘솔을 확인해주세요.");
    return;
  }

  const summaryMap = new Map<string, { name: string, location: string, qty: number, unit: string, vendorProductId: string }>();

  items.forEach((item: any) => {
    const product = item.products || {};
    const key = product.item_code || item.description; 
    const location = product.location || ""; 
    let unit = item.unit || product.unit;
    if (!unit) {
        const match = item.description.match(/\((CTN|PACK|BOX|KG|G)\)$/i);
        unit = match ? match[1].toUpperCase() : "EA";
    }
    const name = product.name || product.product_name || item.description.replace(/\((CTN|PACK|BOX|KG|G)\)$/i, '').trim();
    const qty = item.quantity || 0;
    const vendorProductId = product.vendor_product_id || "";

    if (summaryMap.has(key)) {
      const existing = summaryMap.get(key)!;
      existing.qty += qty;
    } else {
      summaryMap.set(key, { name, location, qty, unit, vendorProductId });
    }
  });

  const summaryList = Array.from(summaryMap.values()).sort((a, b) => {
    const locA = (a.location || "").toString();
    const locB = (b.location || "").toString();
    if (locA < locB) return -1;
    if (locA > locB) return 1;
    return a.name.localeCompare(b.name);
  });

  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}, ${now.getHours()}:${now.getMinutes()}`;

  let content = `Product Picking Summary\nGenerated: ${dateStr}\nSelected Invoices Count: ${ids.length}\n==========================================================================================\nLOCATION      | UNIT   | QTY   | VENDOR ID      | PRODUCT NAME\n------------------------------------------------------------------------------------------\n`;
  
  summaryList.forEach(item => {
    const locStr = `[ ${item.location} ]`.padEnd(13, ' ');
    const unitStr = `${item.unit}`.padEnd(6, ' '); 
    const qtyStr = `${item.qty}`.padEnd(5, ' ');
    const vidStr = `${item.vendorProductId}`.padEnd(14, ' '); 
    content += `${locStr} | ${unitStr} | ${qtyStr} | ${vidStr} | ${item.name}\n`;
  });
  
  content += `==========================================================================================\n`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `Picking_Summary_${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}.txt`);
};
export const downloadSummaryTxt = downloadPickingSummary;


// ------------------------------------------------------------------
// 5. Statement PDF 생성 및 다운로드 (Mobile 추가)
// ------------------------------------------------------------------
export const fetchAndGenerateStatementBlob = async (
  customerId: string, 
  startDate: string, 
  endDate: string,
  customerName: string
): Promise<{ blob: Blob, filename: string } | null> => {
  const supabase = createClient();

  try {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, address, suburb, state, postcode, mobile") 
      .eq("id", customerId)
      .maybeSingle(); 

    if (customerError) console.error("❌ Customer Fetch Error:", customerError);

    const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => 
      [addr, sub, st, post].filter(val => val && val.trim().length > 0).join(", ");

    let customerAddress = customer 
      ? formatAddress(customer.address, customer.suburb, customer.state, customer.postcode)
      : "";
    
    // ✅ [Statement] 주소 뒤에 Mobile 번호 추가
    if (customer?.mobile) {
        customerAddress += `\nMobile: ${customer.mobile}`;
    }

    const { data: prevInvoices } = await supabase
      .from("invoices")
      .select("total_amount")
      .eq("customer_id", customerId)
      .lt("invoice_date", startDate);
    
    const prevInvTotal = prevInvoices?.reduce((sum, i: any) => sum + i.total_amount, 0) || 0;

    const { data: prevPayments } = await supabase
      .from("payments")
      .select("amount")
      .eq("customer_id", customerId)
      .lt("payment_date", startDate);

    const prevPayTotal = prevPayments?.reduce((sum, p: any) => sum + p.amount, 0) || 0;
    const openingBalance = prevInvTotal - prevPayTotal;

    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .eq("customer_id", customerId)
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .order("invoice_date", { ascending: true });

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_id", customerId)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .order("payment_date", { ascending: true });

    const todayStr = new Date().toISOString().split('T')[0];
    const { data: overdueInvoices } = await supabase
        .from("invoices")
        .select("total_amount, paid_amount")
        .eq("customer_id", customerId)
        .neq("status", "Paid")
        .lt("due_date", todayStr);
    
    const amountOverdue = overdueInvoices?.reduce((sum, inv: any) => sum + (inv.total_amount - inv.paid_amount), 0) || 0;

    const transactions: StatementTransaction[] = [];

    invoices?.forEach((inv: any) => {
        let status = inv.status; 
        if (status !== 'Paid' && inv.due_date < todayStr) {
            status = 'Overdue';
        } else if (status !== 'Paid') {
            status = 'Open';
        }

        transactions.push({
            id: inv.id,
            date: inv.invoice_date,
            type: 'Invoice',
            reference: inv.id.toUpperCase(), 
            amount: inv.total_amount,
            credit: 0,
            dueDate: inv.due_date,
            status: status 
        });
    });

    payments?.forEach((pay: any) => {
        const ref = pay.id.slice(0, 8).toUpperCase(); 
        transactions.push({
            id: pay.id,
            date: pay.payment_date,
            type: 'Payment',
            reference: ref, 
            amount: 0,
            credit: pay.amount,
            status: '' 
        });
    });

    transactions.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA === dateB) return a.type === 'Invoice' ? -1 : 1;
        return dateA - dateB;
    });

    const { data: settingsList } = await supabase.from('company_settings').select('*').limit(1);
    const settings = settingsList?.[0] || {};

    const fullCompanyAddress = formatAddress(
      settings.address_line1, 
      settings.suburb, 
      settings.state, 
      settings.postcode
    );

    const statementData: StatementData = {
      customerName,
      startDate,
      endDate,
      openingBalance,
      transactions,
      
      customerId: customer?.id?.slice(0, 8).toUpperCase(),
      customerAddress: customerAddress, 
      amountOverdue, 

      companyName: settings.company_name,
      companyAddress: fullCompanyAddress,
      companyEmail: settings.email,
      companyPhone: settings.phone,
      companyWebsite: settings.website,
      statementInfo: settings.statement_info,

      bankName: settings.bank_name,
      bsb: settings.bsb_number,
      accountNumber: settings.account_number,
      bank_payid: settings.bank_payid
    };

    const blob = await pdf(<StatementDocument data={statementData} />).toBlob();
    const filename = `Statement_${customerName.replace(/\s+/g, '_')}_${endDate}.pdf`;
    return { blob, filename };

  } catch (e: any) {
    console.error("Statement Gen Error:", e);
    alert("PDF 생성 중 오류가 발생했습니다: " + e.message);
    return null;
  }
};

export const downloadStatementPdf = async (customerId: string, startDate: string, endDate: string, name: string) => {
  const result = await fetchAndGenerateStatementBlob(customerId, startDate, endDate, name);
  if (result) saveAs(result.blob, result.filename);
};

export const printStatementPdf = async (customerId: string, startDate: string, endDate: string, name: string) => {
  const result = await fetchAndGenerateStatementBlob(customerId, startDate, endDate, name);
  if (result) {
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
  }
};


// ------------------------------------------------------------------
// 6. Quotation PDF 생성 및 다운로드 (Mobile 추가)
// ------------------------------------------------------------------
const getQuotationData = async (quotationId: string): Promise<QuotationData | null> => {
  if (!quotationId) return null;

  const supabase = createClient();

  const { data: quotation, error } = await supabase
    .from('quotations')
    .select(`
      *,
      customers ( 
        name, company, address, suburb, state, postcode, mobile,
        delivery_address, delivery_suburb, delivery_state, delivery_postcode
      ),
      quotation_items ( quantity, unit, unit_price, amount, products ( * ) )
    `)
    .eq('id', quotationId)
    .single();

  if (error || !quotation) {
    console.error("❌ [PDF] Quotation Query Error:", error);
    return null;
  }

  const { data: settingsList } = await supabase.from('company_settings').select('*').limit(1);
  const settings = settingsList && settingsList.length > 0 ? settingsList[0] : {};

  try {
    const mappedItems = quotation.quotation_items?.map((item: any) => {
      const product = item.products || {};
      const name = product.name || product.product_name || product.description || "Item";
      return {
        qty: item.quantity || 0,
        unit: item.unit || product.unit || "EA", 
        description: name,
        itemCode: product.item_code || "",
        unitPrice: item.unit_price || 0,
        amount: item.amount || 0
      };
    }) || [];

    if (mappedItems.length === 0) {
      mappedItems.push({ qty: 0, unit: "-", description: "[No Items]", itemCode: "-", unitPrice: 0, amount: 0 });
    }

    const formatAddress = (addr: string, sub: string, st: string, post: string) => 
      [addr, sub, st, post].filter(Boolean).join(" ");

    let billingAddr = formatAddress(
      quotation.customers?.address, quotation.customers?.suburb, quotation.customers?.state, quotation.customers?.postcode
    );

    // ✅ [Quotation] 주소 뒤에 Mobile 번호 추가
    if (quotation.customers?.mobile) {
        billingAddr += `\nMobile: ${quotation.customers.mobile}`;
    }

    const finalDeliveryAddress = billingAddr; 

    const calculatedSubtotal = mappedItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    const calculatedGST = calculatedSubtotal * 0.10;
    const calculatedTotalAmount = calculatedSubtotal + calculatedGST;

    const customerName = quotation.customers?.company || quotation.customers?.name || quotation.quotation_to || "Unknown Customer";
    const deliveryName = quotation.customers?.name || quotation.quotation_to || "";

    return {
      invoiceNo: quotation.quotation_number || quotation.id, 
      date: quotation.issue_date || quotation.quotation_date, 
      dueDate: quotation.valid_until || quotation.quotation_date, 
      
      customerName: customerName,
      deliveryName: deliveryName,
      address: billingAddr, 
      deliveryAddress: finalDeliveryAddress,
      memo: quotation.memo || "", 
      
      items: mappedItems,
      subtotal: calculatedSubtotal, 
      gst: calculatedGST,
      total: calculatedTotalAmount,
      totalAmount: calculatedTotalAmount,
      
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
    console.error("❌ [PDF] Quotation Mapping Error:", err);
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
    console.error("❌ [PDF] Generation Error:", e.message);
    alert("Error: " + e.message);
    return null;
  }
};

export const downloadQuotationPdf = async (id: string) => {
  const result = await fetchAndGenerateQuotationBlob(id);
  if (result) saveAs(result.blob, result.filename);
};

export const printQuotationPdf = async (id: string) => {
  const result = await fetchAndGenerateQuotationBlob(id);
  if (result) {
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
  }
};

// ------------------------------------------------------------------
// 7. Purchase Order PDF 생성 및 다운로드 (Unit 추가)
// ------------------------------------------------------------------
const getPurchaseOrderData = async (poId: string): Promise<PurchaseOrderData | null> => {
  const supabase = createClient();
  
  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      product_vendors ( * )
    `)
    .eq('id', poId)
    .single();

  if (error || !po) {
    console.error("❌ [PDF] PO Query Error:", error);
    return null;
  }

  const { data: items } = await supabase
    .from('purchase_order_items')
    .select(`
      *,
      products ( vendor_product_id, product_name, gst, unit )
    `)
    .eq('po_id', poId);

  const { data: settingsList } = await supabase.from('company_settings').select('*').limit(1);
  const settings = settingsList?.[0] || {};

  const mappedItems = (items || []).map((item: any) => {
    const productGst = item.products?.gst ?? true; 
    const amount = Number(item.amount) || 0;
    
    return {
        description: item.description || item.products?.product_name || "Item",
        vendorProductId: item.products?.vendor_product_id || "", 
        quantity: Number(item.quantity) || 0,
        unit: item.unit || item.products?.unit || "EA",
        unitPrice: Number(item.unit_price) || 0,
        amount: amount,
        gst: productGst
    };
  });

  const subTotal = mappedItems.reduce((sum, i) => sum + i.amount, 0);
  const gstTotal = mappedItems.reduce((sum, i) => i.gst ? sum + (i.amount * 0.1) : sum, 0);
  const grandTotal = subTotal + gstTotal;

  const formatAddress = (addr: string, sub: string, st: string, post: string) =>
      [addr, sub, st, post].filter(Boolean).join(", ");

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
    grandTotal: grandTotal,
    memo: po.memo
  };
};

export const fetchAndGeneratePurchaseOrderBlob = async (id: string): Promise<{ blob: Blob, filename: string } | null> => {
  try {
    const data = await getPurchaseOrderData(id);
    if (!data) throw new Error("Failed to load PO data.");
    
    const blob = await pdf(<PurchaseOrderDocument data={data} />).toBlob();
    const filename = `PO_${data.poNumber}.pdf`;
    
    return { blob, filename };
  } catch (e: any) {
    console.error("❌ [PDF] Generation Error:", e.message);
    alert("Error: " + e.message);
    return null;
  }
};

export const downloadPurchaseOrderPdf = async (id: string) => {
  const result = await fetchAndGeneratePurchaseOrderBlob(id);
  if (result) saveAs(result.blob, result.filename);
};

export const printPurchaseOrderPdf = async (id: string) => {
  const result = await fetchAndGeneratePurchaseOrderBlob(id);
  if (result) {
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank');
  }
};