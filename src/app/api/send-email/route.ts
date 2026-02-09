import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, html, attachments } = body;

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // [수정] 복사한 Supabase Public URL을 여기에 붙여넣으세요!
    const logoUrl = "https://udmtyxkyedtevhrqthto.supabase.co/storage/v1/object/public/company_logo/logo.png"; 

    // HTML 본문 생성 (로고 포함)
    const htmlWithLogo = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        ${html}
        <br/><br/>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <div style="margin-top: 20px;">
          <img src="${logoUrl}" alt="Klean King Logo" width="150" style="display: block;" />
          <p style="font-size: 12px; color: #888; margin-top: 10px;">
            Klean King Melbourne Australia<br/>
            <a href="https://kleanking.com.au" style="color: #888; text-decoration: none;">www.kleanking 도메인 넣자 정제야.com.au</a>
          </p>
        </div>
      </div>
    `;

    const data = await resend.emails.send({
      from: 'Klean King <onboarding@resend.dev>', // 도메인 인증 전
      to: [to],
      subject: subject,
      html: htmlWithLogo, // 수정된 HTML 사용
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