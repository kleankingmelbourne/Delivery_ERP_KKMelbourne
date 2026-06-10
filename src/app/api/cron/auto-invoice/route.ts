import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateInvoiceBufferForServer } from "@/utils/pdfServer";

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
  
  // 2. 호주 멜버른 시간 기준 "오늘 날짜(YYYY-MM-DD)" 구하기
  const localDateString = new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' });
  const todayDateObj = new Date(localDateString);
  const yyyy = todayDateObj.getFullYear();
  const mm = String(todayDateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(todayDateObj.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  try {
    // 3. 자동 인보이스 발송이 켜져 있는 고객들 조회
    const { data: settings, error: settingsError } = await supabase.from("auto_invoice_settings").select("customer_id");
    if (settingsError) throw settingsError;
    if (!settings || settings.length === 0) return NextResponse.json({ message: "No active auto-invoice settings." });

    const targetCustomerIds = settings.map(s => s.customer_id);

    // 4. 인보이스를 찾을 때 고객 정보(customers)도 한 방에 같이 가져옵니다!
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
    if (!todaysInvoices || todaysInvoices.length === 0) return NextResponse.json({ message: "No invoices created today." });

    const results = [];

    // 5. 루프 돌기
    for (const inv of todaysInvoices) {
        
        // 🚀 [해결] 타입스크립트 에러 방지: customers가 배열로 들어올 경우 첫 번째 데이터를 꺼냅니다.
        const customerData = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;

        // 🚀 이제 꺼내온 customerData에서 안전하게 값을 가져옵니다.
        const customerName = customerData?.name || customerData?.company || "Unknown Customer";
        const customerEmail = customerData?.email || ""; 
        const customerEmailCc = customerData?.email_cc || "";

        // 이메일이 없으면 PDF를 만들기도 전에 여기서 바로 컷!
        if (!customerEmail) {
            console.log(`[Auto Invoice] ⚠️ 스킵: 이메일 없음. 대상: ${customerName}`);
            results.push({ id: inv.id, status: "skipped_no_email" });
            continue;
        }

        try {
            // PDF 함수로 이름과 이메일을 아예 손에 쥐여주고 보냅니다.
            const pdfData = await generateInvoiceBufferForServer(inv.id, customerName, customerEmail, customerEmailCc);

            if (!pdfData) {
                results.push({ id: inv.id, status: "failed_pdf" });
                continue;
            }

            // 🚨 [핵심 디버깅 포인트] CC 배열 안전 처리 (빈 문자열이면 무조건 undefined 처리)
            const ccList = (pdfData.customerEmailCc && pdfData.customerEmailCc.trim() !== "") 
                ? [pdfData.customerEmailCc.trim()] 
                : undefined;

            console.log(`[Auto Invoice] 3. Resend 발송 준비 완료. (대상: ${pdfData.customerEmail}, 참조: ${ccList || '없음'})`);

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            
            // 🚀 [추가된 부분] 태그용 안전한 인보이스 ID 만들기 (특수문자 싹 제거!)
            const safeInvoiceId = String(inv.id).replace(/[^a-zA-Z0-9_-]/g, "");

            console.log(`[Auto Invoice] 4. Resend API 호출 직전! (이 로그 뒤에 멈추면 Timeout 또는 API 키 에러입니다)`);
            const { data: emailData, error: emailError } = await resend.emails.send({
                from: 'Klean King Accounts <admin@kleankingmelbourne.com.au>', // 🚨 Resend에 등록된 도메인인지 재확인!
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

            console.log(`[Auto Invoice] 5. Resend API 응답 받음!`);

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