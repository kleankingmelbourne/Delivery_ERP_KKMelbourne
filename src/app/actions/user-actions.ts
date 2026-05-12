"use server";

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function issueCustomerLoginAccount(
  customerId: string,
  customerName: string,
  email: string,
  password: string
) {
  try {
    // 1. 현재 고객 정보 조회 (기존에 발급된 로그인 이메일이 있는지 확인)
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("login_email")
      .eq("id", customerId)
      .single();

    let targetUserId = null;

    // 2. 기존 이메일이 있다면 profiles 테이블을 조회해서 고유 Auth ID(uuid) 찾기
    if (customer && customer.login_email) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", customer.login_email)
        .single();

      if (profile) {
        targetUserId = profile.id; // 기존 사용자 ID 확보
      }
    }

    if (targetUserId) {
      // ==============================
      // 🔄 [업데이트 모드] 기존 계정이 있으면 수정만 합니다. (프로필 중복 생성 방지!)
      // ==============================
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: email,
        password: password,
        user_metadata: { role: "customer", customer_id: customerId }
      });
      if (authError) throw new Error(`인증 계정 업데이트 실패: ${authError.message}`);

      // Profiles 테이블도 함께 업데이트
      const { error: profileError } = await supabaseAdmin.from("profiles").update({
        email: email,
        display_name: customerName,
        updated_at: new Date().toISOString()
      }).eq("id", targetUserId);
      if (profileError) throw new Error(`프로필 업데이트 실패: ${profileError.message}`);

    } else {
      // ==============================
      // 🆕 [신규 발급 모드] 계정이 아예 없을 때만 새로 생성합니다.
      // ==============================
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { role: "customer", customer_id: customerId }
      });
      if (authError) throw new Error(`계정 생성 실패: ${authError.message}`);

      targetUserId = authData.user.id;

      // Profiles 테이블에 신규 등록
      const { error: profileError } = await supabaseAdmin.from("profiles").insert({
        id: targetUserId,
        email: email,
        display_name: customerName,
        user_level: "customer",
        login_permit: true,
        status: "active",
        updated_at: new Date().toISOString()
      });
      if (profileError) throw new Error(`프로필 등록 실패: ${profileError.message}`);
    }

    // 3. Customers 테이블에 최종 로그인 이메일 & 패스워드 덮어쓰기
    const { error: customerError } = await supabaseAdmin.from("customers").update({
      login_email: email,
      password: password
    }).eq("id", customerId);

    if (customerError) throw new Error(`Customer 정보 업데이트 실패: ${customerError.message}`);

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}