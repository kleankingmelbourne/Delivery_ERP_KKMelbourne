// src/utils/pdfServer.tsx
import { renderToBuffer, Font } from '@react-pdf/renderer';
import { createClient } from '@/utils/supabase/client';
import StatementDocument, { StatementData, StatementTransaction, StatementAgeing } from '@/components/pdf/StatementDocument';
import InvoiceDocument from '@/components/pdf/InvoiceDocument';
import React from 'react';
import path from 'path'; // 🚀 파일 경로를 찾기 위한 Node.js 기본 모듈

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// ==================================================================
// 🚀 서버 환경 전용 폰트 등록 (Next.js의 public 폴더 경로를 직접 지정)
// ==================================================================
Font.register({
  family: 'NotoSansKR',
  src: path.join(process.cwd(), 'public', 'font', 'NotoSansKR-Medium.ttf'), 
});

export const generateStatementBufferForServer = async (
    customerId: string, 
    startDate: string, 
    endDate: string, 
    customerName: string
): Promise<{ buffer: Buffer, filename: string } | null> => {
    try {
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
            supabase.from('payments').select('id, unallocated_amount, payment_date').eq('customer_id', customerId).gt('unallocated_amount', 0)
        ]);

        const transactions: StatementTransaction[] = [];
        
        const openInvoices = invoices?.filter(inv => {
             const s = (inv.status || '').toLowerCase();
             if (s === 'paid' || s === 'completed' || s.includes('cancel')) return false;
             if (inv.total_amount > 0 && Math.abs(inv.total_amount - (inv.paid_amount || 0)) < 0.01) return false;
             return true;
        }) || [];

        openInvoices.forEach(inv => {
            const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0 || (inv.status || '').toLowerCase() === 'credit';
            if (isCredit) return; 
            transactions.push({ 
                id: inv.id, date: inv.invoice_date, type: 'Invoice', reference: inv.id.toUpperCase(), 
                amount: inv.total_amount, credit: inv.paid_amount || 0, dueDate: inv.due_date, status: inv.status
            });
        });

        creditData?.forEach((credit: any) => {
            const isCrMemo = typeof credit.id === 'string' && credit.id.startsWith('CR-');
            transactions.push({
                id: credit.id, date: credit.payment_date || endDate, type: isCrMemo ? 'Credit' : 'Payment',
                reference: credit.id ? credit.id.toUpperCase() : 'CREDIT', amount: 0, credit: credit.unallocated_amount, status: 'Active'
            });
        });

        const ageing: StatementAgeing = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
        const today = new Date();

        openInvoices.forEach((inv: any) => {
            const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0;
            if (isCredit) return;
            const outstanding = inv.total_amount - (inv.paid_amount || 0);
            if (outstanding !== 0) {
                const invDate = new Date(inv.invoice_date);
                const diffTime = Math.abs(today.getTime() - invDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 30) ageing.current += outstanding; else if (diffDays <= 60) ageing.days30 += outstanding;
                else if (diffDays <= 90) ageing.days60 += outstanding; else if (diffDays <= 120) ageing.days90 += outstanding; else ageing.over90 += outstanding;
            }
        });
        
        creditData?.forEach((credit: any) => {
            const unallocated = credit.unallocated_amount || 0;
            if (unallocated > 0 && credit.payment_date) {
                const payDate = new Date(credit.payment_date);
                const diffTime = Math.abs(today.getTime() - payDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 30) ageing.current -= unallocated; else if (diffDays <= 60) ageing.days30 -= unallocated;
                else if (diffDays <= 90) ageing.days60 -= unallocated; else if (diffDays <= 120) ageing.days90 -= unallocated; else ageing.over90 -= unallocated;
            }
        });

        ageing.total = ageing.current + ageing.days30 + ageing.days60 + ageing.days90 + ageing.over90;

        const settings = settingsList?.[0] || {};
        const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => [addr, sub, st, post].filter(Boolean).join(", ");
        let customerAddress = formatAddress(customer?.address, customer?.suburb, customer?.state, customer?.postcode);
        if (customer?.mobile) customerAddress += `\nMobile: ${customer.mobile}`;

        const statementData: StatementData = {
            customerName, startDate, endDate, openingBalance: 0, ageing: ageing,
            transactions: transactions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
            customerId: customer?.id, customerAddress: customerAddress,
            companyName: settings.company_name || "KLEAN KING", 
            companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
            companyEmail: settings.email, companyPhone: settings.phone, bankName: settings.bank_name, bsb: settings.bsb_number, 
            accountNumber: settings.account_number, bank_payid: settings.bank_payid, statementInfo: settings.statement_info,
            // 🚀 [여기에 꼭 넣어주세요!] Supabase 스토리지의 실제 로고 이미지 주소를 전달합니다.
            logoUrl: `${supabaseUrl}/storage/v1/object/public/company_logo/logo.png`
        };

        // 클라이언트 렌더링용이 아닌, 백그라운드용 버퍼 생성
        const buffer = await renderToBuffer(<StatementDocument data={statementData} />);
        
        return { buffer, filename: `Statement_${customerName}_${endDate}.pdf` };

    } catch (error) {
        console.error("❌ Server PDF Generation Error:", error);
        return null;
    }
};

// ==================================================================
// 🔥 SERVER-SIDE ONLY: CRON JOB 전용 Invoice 데이터 추출 함수
// ==================================================================
// ==================================================================
// 🔥 SERVER-SIDE ONLY: CRON JOB 전용 Invoice 데이터 추출 함수
// ==================================================================
export const getServerInvoiceData = async (invoiceId: string): Promise<any | null> => {
    if (!invoiceId) return null;
    const supabase = createClient();
    
    // 🚀 1. 인보이스와 아이템만 먼저 안전하게 가져옵니다. (JOIN 에러 원천 차단)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        invoice_items ( quantity, unit, unit_price, amount, is_gst_included, products ( * ) )
      `)
      .eq('id', invoiceId)
      .single();
  
    if (invoiceError || !invoice) return null;

    // 🚀 2. 알아낸 customer_id로 고객 정보를 '따로' 확실하게 검색합니다.
    const [customerRes, settingsRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', invoice.customer_id).single(),
      supabase.from('company_settings').select('*').limit(1)
    ]);

    // 찾은 고객 데이터를 변수에 담습니다.
    const customer = customerRes.data || {};
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
          isGstIncluded: item.is_gst_included !== false
        };
      }) || [];
  
      if (mappedItems.length === 0) {
        mappedItems.push({ qty: 0, unit: "-", description: "[No Items Found]", itemCode: "-", unitPrice: 0, amount: 0, isGstIncluded: true });
      }
  
      const formatAddress = (addr?: string, sub?: string, st?: string, post?: string) => 
        [addr, sub, st, post].filter(Boolean).join(" ");
  
      const billingAddr = formatAddress(customer.address, customer.suburb, customer.state, customer.postcode);
      const finalDeliveryAddress = formatAddress(invoice.delivery_address, invoice.delivery_suburb, invoice.delivery_state, invoice.delivery_postcode) || billingAddr;
  
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
        
        // 🚀 조인이 아닌, 따로 검색한 고객 데이터에서 직접 꺼내옵니다.
        customerName: customer.name || customer.company || "Unknown Customer",
        customerMobile: customer.mobile || "",
        deliveryName: customer.name || "",
        address: billingAddr,
        deliveryAddress: finalDeliveryAddress,
        memo: invoice.memo || invoice.notes || "", 
        items: mappedItems,
        subtotal: finalSubtotal,
        gst: finalGST,
        total: finalTotalAmount,
        totalAmount: finalTotalAmount,
        paidAmount: Number(invoice.paid_amount) || 0,
        balanceDue: finalTotalAmount - (Number(invoice.paid_amount) || 0),
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
        logoUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company_logo/logo.png`,
        
        // 🚀 직접 꺼내온 이메일 (email 컬럼 매칭 완료!)
        customerEmail: customer.email || "",
        customerEmailCc: customer.email_cc || ""
      };
    } catch (err) {
      console.error("❌ [PDF Server] Mapping Error:", err);
      return null;
    }
};


// ==================================================================
// 🔥 SERVER-SIDE ONLY: CRON JOB 전용 Invoice 생성 함수
// ==================================================================
export const generateInvoiceBufferForServer = async (
    invoiceId: string
): Promise<{ buffer: Buffer, filename: string, customerEmail: string, customerEmailCc: string, customerName: string } | null> => {
    try {
        const data = await getServerInvoiceData(invoiceId);
        if (!data) throw new Error("Invoice data not found");

        const buffer = await renderToBuffer(<InvoiceDocument data={data} />);
        console.log(`[Server] PDF 렌더링 완료: ${data.invoiceNo}`);
        
        const safeName = (data.customerName || "Customer").replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
        const filename = `${data.invoiceNo}_${data.date}_${safeName}.pdf`;

        return { 
            buffer, 
            filename,
            customerEmail: data.customerEmail,
            customerEmailCc: data.customerEmailCc,
            customerName: data.customerName
        };

    } catch (error) {
        console.error("❌ 상세 에러 내용:", error);
        return null;
    }
};