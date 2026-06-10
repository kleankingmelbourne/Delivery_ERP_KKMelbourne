// src/utils/pdfServer.tsx
import { renderToBuffer, Font } from '@react-pdf/renderer';
//import { createClient } from '@/utils/supabase/client';
import { createClient } from '@supabase/supabase-js';

import StatementDocument, { StatementData, StatementTransaction, StatementAgeing } from '@/components/pdf/StatementDocument';
import InvoiceDocument from '@/components/pdf/InvoiceDocument';
import React from 'react';
import path from 'path'; // 🚀 파일 경로를 찾기 위한 Node.js 기본 모듈

// ==================================================================
// 🚀 관리자 권한(Service Role) Supabase 클라이언트 생성 함수
// (서버 전용: RLS를 무시하고 모든 데이터를 강제로 읽어옵니다)
// ==================================================================
const getAdminSupabase = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // 반드시 Service Role Key 사용
  );
};

// ==================================================================
// 🚀 서버 환경 전용 폰트 등록 (Next.js의 public 폴더 경로를 직접 지정)
// ==================================================================
Font.register({
  family: 'NotoSansKR',
  src: path.join(process.cwd(), 'public', 'font', 'NotoSansKR-Medium.ttf'), 
});

// ==================================================================
// 🔥 SERVER-SIDE ONLY: CRON JOB 전용 Statement 생성 함수
// ==================================================================
export const generateStatementBufferForServer = async (
    customerId: string, 
    startDate: string, 
    endDate: string, 
    customerName: string
): Promise<{ buffer: Buffer, filename: string } | null> => {
    try {
        // 🚀 1. RLS 정책 우회를 위해 반드시 Service Role 클라이언트 사용
        const supabase = getAdminSupabase(); 
        
        const [
            { data: customer },
            { data: invoices },
            { data: settingsList },
            { data: creditData }
        ] = await Promise.all([
            supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
            supabase.from("invoices").select("*").eq("customer_id", customerId).lte("invoice_date", endDate),
            supabase.from('company_settings').select('*').limit(1),
            // 🚀 id를 추가로 가져와서 어떤 크레딧인지 식별
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
            
            // 🚀 크레딧은 여기서 무조건 제외 (사용 완료된 크레딧 원천 차단)
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

        // 2. 🚀 잔액이 남아있는 크레딧/초과결제금만 목록에 추가
        creditData?.forEach((credit: any) => {
            const isCrMemo = typeof credit.id === 'string' && credit.id.startsWith('CR-');
            transactions.push({
                id: credit.id,
                date: credit.payment_date || endDate, 
                type: isCrMemo ? 'Credit' : 'Payment',
                reference: credit.id ? credit.id.toUpperCase() : 'CREDIT',
                amount: 0,
                credit: credit.unallocated_amount, 
                status: 'Active'
            });
        });

        const ageing: StatementAgeing = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
        const today = new Date();

        // 3. 미납 인보이스 금액을 더하기 (+)
        openInvoices.forEach((inv: any) => {
            const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0;
            if (isCredit) return;

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
        
        // 4. 남은 크레딧을 발생한 날짜 구간에서 빼기 (-)
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
            customerName, startDate, endDate, openingBalance: 0, ageing: ageing,
            // 날짜 오름차순 정렬
            transactions: transactions.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
            customerId: customer?.id, customerAddress: customerAddress,
            companyName: settings.company_name || "KLEAN KING", 
            companyAddress: formatAddress(settings.address_line1, settings.suburb, settings.state, settings.postcode),
            companyEmail: settings.email, companyPhone: settings.phone, bankName: settings.bank_name, bsb: settings.bsb_number, 
            accountNumber: settings.account_number, bank_payid: settings.bank_payid, statementInfo: settings.statement_info,
            
            // 🚀 2. 로고 URL은 환경 변수를 직접 참조하여 엑스박스(X)를 방지합니다.
            logoUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company_logo/logo.png`
        };

        // 🚀 3. 클라이언트(Blob)가 아닌 서버 백그라운드용 버퍼(Buffer)로 렌더링합니다!
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
export const getServerInvoiceData = async (invoiceId: string): Promise<any | null> => {
  if (!invoiceId) return null;
  
  // 🚀 RLS 우회를 위해 반드시 Service Role 클라이언트 사용 (이전 답변 참고)
  const supabase = getAdminSupabase(); 
  
  // 🚀 downpdf.tsx와 동일하게 한 번의 쿼리로 깔끔하게 조인(Join)해서 가져옵니다.
  const [invoiceRes, settingsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select(`
        *,
        customers ( 
          name, company, email, email_cc, address, suburb, state, postcode, mobile,
          delivery_address, delivery_suburb, delivery_state, delivery_postcode
        ),
        invoice_items ( quantity, unit, unit_price, amount, is_gst_included, products ( * ) )
      `)
      .eq('id', invoiceId)
      .single(),
    supabase.from('company_settings').select('*').limit(1)
  ]);

  if (invoiceRes.error || !invoiceRes.data) {
    console.error("❌ [Server PDF] 인보이스 로드 실패:", invoiceRes.error);
    return null;
  }

  const invoice = invoiceRes.data;
  const settingsList = settingsRes.data;
  const settings = settingsList && settingsList.length > 0 ? settingsList[0] : {};
  const customer = invoice.customers || {}; // 조인된 고객 데이터 변수화

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

    // 🚀 DB에 저장된 값을 최우선으로 사용 (1센트 오차 방지)
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
      customerName: customer.company || customer.name || "Unknown Customer",
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
      
      // 🚀 downpdf.tsx에 있던 크레딧 메모 관련 필드 반영
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
      logoUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/company_logo/logo.png`,
      
      // 🚀 자동 발송(이메일)을 위해 서버 코드에는 이 두 줄이 꼭 필요합니다!
      customerEmail: customer.email || "",
      customerEmailCc: customer.email_cc || ""
    };
  } catch (err) {
    console.error("❌ [Server PDF] Mapping Error:", err);
    return null;
  }
};

// ==================================================================
// 🔥 SERVER-SIDE ONLY: CRON JOB 전용 Invoice 생성 함수
// ==================================================================
export const generateInvoiceBufferForServer = async (
    invoiceId: string,
    passedCustomerName: string,   // 🚀 route.ts에서 던져준 이름
    passedCustomerEmail: string,  // 🚀 route.ts에서 던져준 이메일
    passedCustomerEmailCc: string // 🚀 route.ts에서 던져준 참조 이메일
): Promise<{ buffer: Buffer, filename: string, customerEmail: string, customerEmailCc: string, customerName: string } | null> => {
    try {
        const data = await getServerInvoiceData(invoiceId);
        if (!data) throw new Error("Invoice data not found");

        const buffer = await renderToBuffer(<InvoiceDocument data={data} />);
        console.log(`[Server] PDF 렌더링 완료: ${data.invoiceNo}`);
        
        // 🚀 DB를 다시 뒤질 필요 없이, 넘겨받은 안전한 데이터를 그대로 사용합니다.
        const safeName = passedCustomerName.replace(/[^a-zA-Z0-9가-힣\s]/g, "").trim(); 
        const filename = `${data.invoiceNo}_${data.date}_${safeName}.pdf`;

        return { 
            buffer, 
            filename,
            customerEmail: passedCustomerEmail,
            customerEmailCc: passedCustomerEmailCc,
            customerName: passedCustomerName
        };

    } catch (error) {
        console.error("❌ 상세 에러 내용:", error);
        return null;
    }
};