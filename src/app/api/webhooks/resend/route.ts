import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 🔍 [로그 1] Resend가 보낸 데이터 전체 확인
    console.log("\n[Webhook] 📥 Resend 웹훅 수신됨. Type:", body.type);

    if (body.type === 'email.bounced') {
      const tags = body.data?.tags || [];
      const messageId = tags.find((t: any) => t.name === 'message_id')?.value;

      // 🔍 [로그 2] 태그에서 ID를 무사히 꺼냈는지 확인
      console.log("[Webhook] 🏷️ 추출된 messageId:", messageId || "없음 (태그 누락됨!)");

      if (messageId) {
        // 🚨 [매우 중요] 업데이트할 테이블 이름이 맞는지 확인하세요! ('messages' 또는 'invoices')
        const targetTable = 'messages'; 

        const { data, error } = await supabase
          .from(targetTable)
          .update({ email_status: 'bounced' })
          .eq('id', messageId)
          .select(); // 업데이트된 행을 반환받아 봅니다.

        if (error) {
          // 🔍 [로그 3] DB 쿼리 자체에서 에러가 난 경우
          console.error("[Webhook] ❌ DB 업데이트 에러:", error);
        } else if (data && data.length === 0) {
          // 🔍 [로그 4] 에러는 안 났지만 매칭되는 ID가 테이블에 없는 경우
          console.warn(`[Webhook] ⚠️ DB 업데이트 실패: '${targetTable}' 테이블에 id가 ${messageId}인 데이터가 없습니다.`);
        } else {
          // 🔍 [로그 5] 완벽하게 성공한 경우
          console.log("[Webhook] ✅ DB 업데이트 성공!", data);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Webhook] 🚨 치명적 에러 발생:", error);
    return NextResponse.json({ error: 'Webhook 처리 실패' }, { status: 500 });
  }
}