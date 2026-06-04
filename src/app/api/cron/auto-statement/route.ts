import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { fetchAndGenerateStatementBlob } from "@/utils/downloadPdf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resend = new Resend(process.env.RESEND_API_KEY);

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export async function GET(request: Request) {
  // 🚀 [보안] Vercel Cron Job이 보낸 요청인지 확인 (외부 해킹 방지)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // 🚀 [타임존 고정] Vercel 서버의 UTC 시간을 현지 시간(호주 멜버른)으로 강제 변환
  const localDateString = new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' });
  const today = new Date(localDateString);
  
  const dayOfWeek = today.getDay(); // 0:Sun ... 5:Fri
  const date = today.getDate();
  const isLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() === date;
  
  const currentWeekNumber = getWeekNumber(today);
  const isEvenWeek = currentWeekNumber % 2 === 0;

  const schedulesToRun = [];

  if (dayOfWeek === 1) schedulesToRun.push('weekly_mon'); 
  if (dayOfWeek === 5) schedulesToRun.push('weekly_fri'); 
  if (date === 1) schedulesToRun.push('monthly_start');   
  if (isLastDay) schedulesToRun.push('monthly_end');      

  if (dayOfWeek === 5 && isEvenWeek) {
      schedulesToRun.push('biweekly_fri');
  }

  if (schedulesToRun.length === 0) {
    return NextResponse.json({ message: "No schedules match today." });
  }

  try {
    const { data: settings, error } = await supabase
      .from("auto_statement_settings")
      .select(`
        customer_id,
        schedule_type,
        customers (id, name, email, email_cc)
      `)
      .in("schedule_type", schedulesToRun);

    if (error) throw error;

    if (!settings || settings.length === 0) {
      return NextResponse.json({ message: `No active settings for: ${schedulesToRun.join(", ")}` });
    }

    const results = [];
    
    for (const item of settings) {
      const customerData = item.customers;
      const customer = Array.isArray(customerData) ? customerData[0] : customerData;

      if (!customer || !customer.email) {
        results.push({ id: item.customer_id, status: "skipped_no_email" });
        continue;
      }

      console.log(`[Auto Statement] Schedule: ${item.schedule_type} | Sending to ${customer.name}...`);

      try {
        // 🚀 1. 종료일은 무조건 오늘(endDateStr)
        const endDateStr = today.toISOString().split('T')[0];
        
        // 🚀 2. 시작일(startDateStr) 계산: 미납 인보이스 vs 미사용 크레딧 중 더 옛날 날짜 찾기
        const [ { data: oldestInv }, { data: oldestCredit } ] = await Promise.all([
            // 2-a. 가장 오래된 미납 인보이스 조회
            supabase
                .from('invoices')
                .select('invoice_date')
                .eq('customer_id', customer.id)
                .neq('status', 'Paid')
                .order('invoice_date', { ascending: true })
                .limit(1)
                .maybeSingle(),
            // 2-b. 가장 오래된 미사용 크레딧(초과 결제금) 조회
            supabase
                .from('payments')
                .select('payment_date')
                .eq('customer_id', customer.id)
                .gt('unallocated_amount', 0)
                .order('payment_date', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);

        let startDateStr;
        
        const invDateTime = oldestInv?.invoice_date ? new Date(oldestInv.invoice_date).getTime() : Infinity;
        const creditDateTime = oldestCredit?.payment_date ? new Date(oldestCredit.payment_date).getTime() : Infinity;

        if (invDateTime !== Infinity || creditDateTime !== Infinity) {
            // 미납금이나 크레딧 중 하나라도 있다면, 더 과거의 날짜를 시작일로 채택!
            startDateStr = invDateTime < creditDateTime ? oldestInv!.invoice_date : oldestCredit!.payment_date;
        } else {
            // 🚀 [보너스 최적화] 빚도 없고 남은 크레딧도 없는 완벽한 0원 상태라면?
            // 빈 내역서를 굳이 보낼 필요가 없으므로 발송을 스킵(건너뛰기) 합니다.
            //console.log(`[Skip] ${customer.name} has no outstanding balance or credit.`);
            //results.push({ id: customer.id, status: "skipped_zero_balance" });
            //continue; 
            
            // (만약 0원이어도 무조건 빈 내역서를 보내고 싶으시다면 위 4줄을 지우고 아래 주석을 푸세요)
            const startObj = new Date(today.getFullYear(), today.getMonth(), 1);
            if (item.schedule_type === 'monthly_start') {
                startObj.setMonth(startObj.getMonth() - 1);
            }
            startDateStr = startObj.toISOString().split('T')[0];
            
        }

        // 🚀 3. 백그라운드에서 PDF Blob 생성 (찾아낸 시작일 적용)
        const pdfData = await fetchAndGenerateStatementBlob(customer.id, startDateStr, endDateStr, customer.name);
        if (!pdfData || !pdfData.blob) {
            throw new Error("Failed to generate PDF.");
        }

        // 🚀 4. Blob을 Resend가 읽을 수 있는 Buffer 형태로 변환
        const arrayBuffer = await pdfData.blob.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);

        // 🚀 5. 이메일 발송 (PDF 첨부 + CC 포함)
        const { data: emailData, error: emailError } = await resend.emails.send({
          from: 'Klean King Accounts <admin@kleankingmelbourne.com.au>', // 실 서비스시 실제 도메인으로 변경 필수
          to: [customer.email],
          cc: customer.email_cc ? [customer.email_cc] : undefined,
          subject: `Statement of Account - ${customer.name}`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <h2>Statement of Account</h2>
              <p>Dear ${customer.name},</p>
              <p>Please find attached your statement of account for the period ending <strong>${endDateStr}</strong>.</p>
              <p>If you have any questions or concerns regarding this statement, please feel free to reply to this email.</p>
              <br/>
              <p>Best regards,</p>
              <p><strong>Klean King Melbourne Pty Ltd</strong></p>
            </div>
          `,
          attachments: [
            {
              filename: pdfData.filename,
              content: pdfBuffer,
            }
          ]
        });

        if (emailError) {
          console.error(`Failed to send to ${customer.name}:`, emailError);
          results.push({ id: customer.id, name: customer.name, status: "failed", error: emailError.message });
        } else {
          results.push({ id: customer.id, name: customer.name, schedule: item.schedule_type, status: "sent", email_id: emailData?.id });
        }
      } catch (sendErr: any) {
        console.error(`Exception sending to ${customer.name}:`, sendErr);
        results.push({ id: customer.id, name: customer.name, status: "error", error: sendErr.message });
      }
    }

    return NextResponse.json({ 
      success: true, 
      schedules_run: schedulesToRun,
      processed_count: results.length,
      details: results 
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}