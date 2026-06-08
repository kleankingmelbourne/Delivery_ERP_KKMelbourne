// src/utils/pdfServer.tsx
import { renderToBuffer, Font } from '@react-pdf/renderer';
import { createClient } from '@/utils/supabase/client';
import StatementDocument, { StatementData, StatementTransaction, StatementAgeing } from '@/components/pdf/StatementDocument';
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