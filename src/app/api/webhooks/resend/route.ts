import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/client'; // 본인의 Supabase 클라이언트

export async function POST(req: Request) {
    const supabase = createClient();
    const body = await req.json();

    // 1. 바운스 이벤트인지 확인
    if (body.type === 'email.bounced') {
        const messageId = body.data.tags?.find((t: any) => t.name === 'message_id')?.value;

        if (messageId) {
        // 2. DB 업데이트: 해당 메시지의 email_status를 'bounced'로 변경
        await supabase
            .from('messages')
            .update({ email_status: 'bounced' })
            .eq('id', messageId);
        }
    }

    return NextResponse.json({ received: true });
}