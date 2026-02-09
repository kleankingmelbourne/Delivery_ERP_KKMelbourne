import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // 우리가 메일 보낼 때 뒤에 붙였던 ?next=/update-password 값을 가져옵니다.
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    
    // 이메일에서 받은 1회용 코드를 진짜 로그인 세션으로 교환합니다.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 교환 성공! 이제 비밀번호 변경 페이지(next)로 보냅니다.
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 실패하면 다시 로그인 페이지로 보내면서 에러를 표시합니다.
  return NextResponse.redirect(`${origin}/login?error=auth_code_error`);
}