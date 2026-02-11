import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend"; // [NEW] Resend Import

// .env에 Service Key 및 Resend Key 필수
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resend = new Resend(process.env.RESEND_API_KEY); // [NEW] Resend 초기화

// 주차(Week Number) 계산 헬퍼 함수
function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export async function GET(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const today = new Date();
  
  const dayOfWeek = today.getDay(); // 0:Sun ... 5:Fri
  const date = today.getDate();
  const isLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() === date;
  
  // 주차 계산 (Bi-weekly 용) - 짝수 주에만 보낼지, 홀수 주에만 보낼지 결정
  const currentWeekNumber = getWeekNumber(today);
  const isEvenWeek = currentWeekNumber % 2 === 0;

  // 1. 실행할 스케줄 수집
  const schedulesToRun = [];

  if (dayOfWeek === 1) schedulesToRun.push('weekly_mon'); 
  if (dayOfWeek === 5) schedulesToRun.push('weekly_fri'); 
  if (date === 1) schedulesToRun.push('monthly_start');   
  if (isLastDay) schedulesToRun.push('monthly_end');      

  // Bi-Weekly Fri: 금요일이면서 짝수 주차일 때 실행
  if (dayOfWeek === 5 && isEvenWeek) {
      schedulesToRun.push('biweekly_fri');
  }

  if (schedulesToRun.length === 0) {
    return NextResponse.json({ message: "No schedules match today." });
  }

  try {
    // 2. 설정된 고객 조회
    // [수정] 이전에 테이블 스키마를 최적화하면서 is_active를 뺐으므로 쿼리에서도 제거했습니다.
    const { data: settings, error } = await supabase
      .from("auto_statement_settings")
      .select(`
        customer_id,
        schedule_type,
        customers (id, name, email)
      `)
      .in("schedule_type", schedulesToRun);

    if (error) throw error;

    if (!settings || settings.length === 0) {
      return NextResponse.json({ message: `No active settings for: ${schedulesToRun.join(", ")}` });
    }

    // 3. 발송 처리 (Resend)
    const results = [];
    
    for (const item of settings) {
      
      // [수정] item.customers가 배열인지 확인하고 첫 번째 요소를 가져옵니다.
      // Supabase Join 결과는 설정에 따라 배열로 나올 수 있습니다.
      const customerData = item.customers;
      const customer = Array.isArray(customerData) ? customerData[0] : customerData;

      if (!customer || !customer.email) {
        results.push({ id: item.customer_id, status: "skipped_no_email" });
        continue;
      }

      console.log(`[Auto Statement] Schedule: ${item.schedule_type} | Sending to ${customer.name}...`);

      // [NEW] Resend 이메일 발송 로직
      try {
        const { data: emailData, error: emailError } = await resend.emails.send({
          // 중요: Resend에 등록된 도메인 이메일로 변경해야 합니다. (예: accounts@kleanking.com)
          from: 'Klean King Accounts <onboarding@resend.dev>', 
          to: [customer.email],
          subject: `Statement of Account - ${customer.name}`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <h2>Statement of Account</h2>
              <p>Dear ${customer.name},</p>
              <p>This is an automated statement based on your schedule (<strong>${item.schedule_type}</strong>).</p>
              <p>Please check your outstanding balance.</p>
              <br/>
              <p>Best regards,</p>
              <p><strong>Klean King Melbourne Pty Ltd</strong></p>
            </div>
          `,
          // react: StatementEmailTemplate({ customerName: customer.name }), // React Email 사용 시 교체
        });

        if (emailError) {
          console.error(`Failed to send to ${customer.name}:`, emailError);
          results.push({ 
            id: customer.id, 
            name: customer.name, 
            status: "failed", 
            error: emailError.message 
          });
        } else {
          results.push({ 
            id: customer.id, 
            name: customer.name, 
            schedule: item.schedule_type,
            status: "sent",
            email_id: emailData?.id
          });
        }
      } catch (sendErr: any) {
        console.error(`Exception sending to ${customer.name}:`, sendErr);
        results.push({ id: customer.id, name: customer.name, status: "error", error: sendErr.message });
      }
    }

    return NextResponse.json({ 
      success: true, 
      schedules_run: schedulesToRun,
      week_number: currentWeekNumber,
      processed_count: results.length,
      details: results 
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}