import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js'; // Supabase 클라이언트 추가

const resend = new Resend(process.env.RESEND_API_KEY);

// Supabase 클라이언트 초기화 (서버 사이드용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, html, attachments } = body;

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. [추가] company_settings 테이블에서 이메일 정보 가져오기
    // (만약 회사 이름 컬럼도 있다면 같이 가져와서 from에 넣을 수 있습니다. 예: company_name)
    const { data: settings, error: dbError } = await supabase
      .from('company_settings')
      .select('email') // 필요한 경우 'email, company_name' 등으로 수정
      .single();

    if (dbError) {
      console.error("DB Fetch Error:", dbError);
      // DB 에러가 나더라도 메일은 보내야 하므로, 아래에서 기본값으로 처리합니다.
    }

    // 2. [수정] 가져온 이메일 설정 (없으면 기본값 사용)
    // 주의: DB에 저장된 이메일의 도메인(@kleankingmelbourne.com.au)이 Resend에 인증되어 있어야 합니다.
    const senderEmail = settings?.email || 'admin@kleankingmelbourne.com.au';
    const senderName = 'Klean King Melbourne'; // DB에 회사명 컬럼이 있다면 settings.company_name 으로 교체 가능
    
    // 최종 From 주소 형식: "이름 <이메일>"
    const fromAddress = `${senderName} <${senderEmail}>`;

    
    // 로고 URL
    const logoUrl = "https://udmtyxkyedtevhrqthto.supabase.co/storage/v1/object/public/company_logo/logo.png"; 

    // HTML 본문 생성
    const htmlWithLogo = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        ${html}
        <br/><br/>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <div style="margin-top: 20px;">
          <img src="${logoUrl}" alt="Klean King Logo" width="150" style="display: block;" />
          <p style="font-size: 12px; color: #888; margin-top: 10px;">
            ${senderName} Pty Ltd<br/>
            <a href="https://kleankingmelbourne.com.au" style="color: #888; text-decoration: none;">www.kleankingmelbourne.com.au</a>
          </p>
        </div>
      </div>
    `;

    // 3. [수정] 메일 발송 시 동적 fromAddress 사용
    const data = await resend.emails.send({
      from: fromAddress, 
      to: [to],
      subject: subject,
      html: htmlWithLogo,
      attachments: attachments,
    });

    if (data.error) {
        return NextResponse.json({ error: data.error }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Email Send Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}