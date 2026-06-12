import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateInvoiceBufferForServer } from "@/utils/pdfServer";

// 🚀 [핵심 수정 1] Vercel Serverless Function 타임아웃 연장 (최대 실행 시간)
// Hobby 플랜은 최대 60초, Pro 플랜은 300초까지 가능합니다. PDF 생성 시간을 벌어줍니다.
export const maxDuration = 120; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
  // 1. Vercel Cron 인증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // 🚀 [핵심 수정 2] 호주 멜버른 시간 기준 "오늘 날짜(YYYY-MM-DD)" 구하기 (더 안전한 방식)
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: 'Australia/Melbourne' };
  const yyyy = new Intl.DateTimeFormat('en-US', { year: 'numeric', ...options }).format(now);
  const mm = new Intl.DateTimeFormat('en-US', { month: '2-digit', ...options }).format(now);
  const dd = new Intl.DateTimeFormat('en-US', { day: '2-digit', ...options }).format(now);
  const todayStr = `${yyyy}-${mm}-${dd}`;

  try {
    // 3. 자동 인보이스 발송이 켜져 있는 고객들 조회
    const { data: settings, error: settingsError } = await supabase.from("auto_invoice_settings").select("customer_id");
    if (settingsError) throw settingsError;
    if (!settings || settings.length === 0) return NextResponse.json({ message: "No active auto-invoice settings." });

    const targetCustomerIds = settings.map(s => s.customer_id);

    // 4. 인보이스와 고객 정보 가져오기
    const { data: todaysInvoices, error: invError } = await supabase
        .from("invoices")
        .select(`
            id, 
            customer_id,
            customers ( name, company, email, email_cc ) 
        `)
        .in("customer_id", targetCustomerIds)
        .eq("invoice_date", todayStr);

    if (invError) throw invError;
    if (!todaysInvoices || todaysInvoices.length === 0) {
        console.log(`[Auto Invoice] 오늘(${todayStr}) 생성된 타겟 인보이스가 없습니다.`);
        return NextResponse.json({ message: "No invoices created today." });
    }

    const results = [];

    // 5. 루프 돌기
    for (const inv of todaysInvoices) {
        
        const customerData = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
        const customerName = customerData?.name || customerData?.company || "Unknown Customer";
        const customerEmail = customerData?.email || ""; 
        const customerEmailCc = customerData?.email_cc || "";

        if (!customerEmail) {
            console.log(`[Auto Invoice] ⚠️ 스킵: 이메일 없음. 대상: ${customerName}`);
            results.push({ id: inv.id, status: "skipped_no_email" });
            continue;
        }

        try {
            console.log(`[Auto Invoice] PDF 생성 시작... (${inv.id})`);
            const pdfData = await generateInvoiceBufferForServer(inv.id, customerName, customerEmail, customerEmailCc);

            if (!pdfData) {
                console.error(`[Auto Invoice] ❌ PDF 생성 실패 (${inv.id})`);
                results.push({ id: inv.id, status: "failed_pdf" });
                continue;
            }

            const ccList = (pdfData.customerEmailCc && pdfData.customerEmailCc.trim() !== "") 
                ? [pdfData.customerEmailCc.trim()] 
                : undefined;

            console.log(`[Auto Invoice] Resend 발송 준비 완료. (대상: ${pdfData.customerEmail}, 참조: ${ccList || '없음'})`);
            
            const safeInvoiceId = String(inv.id).replace(/[^a-zA-Z0-9_-]/g, "");

            const { data: emailData, error: emailError } = await resend.emails.send({
                from: 'Klean King Accounts <admin@kleankingmelbourne.com.au>', 
                to: [pdfData.customerEmail],
                cc: ccList,
                subject: `Tax Invoice - ${inv.id}`,
                html: `
                  <div style="font-family: sans-serif; color: #333;">
                    <h2>Tax Invoice ${inv.id}</h2>
                    <p>Dear ${pdfData.customerName},</p>
                    <p>Please find attached your invoice for today's orders.</p>
                    <p>If you have any questions, please reply to this email.</p>
                    <br/>
                    <p>Best regards,</p>
                    <p><strong>Klean King Melbourne Pty Ltd</strong></p>
                    <img src="${supabaseUrl}/storage/v1/object/public/company_logo/logo.png" alt="Logo" style="width: 150px; margin-top: 15px; display: block;" />
                  </div>
                `,
                attachments: [{ filename: pdfData.filename, content: pdfData.buffer }],
                tags: [
                    { name: 'message_id', value: safeInvoiceId }
                ]
            });

            if (emailError) {
                console.error(`[Auto Invoice] ❌ Resend 발송 에러:`, emailError);
                results.push({ id: inv.id, status: "error", error: emailError.message });
            } else {
                console.log(`[Auto Invoice] ✅ 메일 발송 성공! 메일 ID:`, emailData?.id);
                results.push({ id: inv.id, status: "sent" });
            }

        } catch (sendErr: any) {
            console.error(`[Auto Invoice] 🚨 치명적 예외 발생 (${inv.id}):`, sendErr);
            results.push({ id: inv.id, status: "fatal_error", error: sendErr.message });
        }
    }
    
    console.log(`[Auto Invoice] 전체 루프 종료. 총 처리: ${results.length}건`);
    return NextResponse.json({ success: true, processed: results.length, details: results });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}