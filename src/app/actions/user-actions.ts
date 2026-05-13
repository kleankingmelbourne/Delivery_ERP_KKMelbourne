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
    // 1. 전체 시스템의 Auth 유저 목록을 불러옵니다.
    const { data: existingUsersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error("사용자 목록을 불러오는 중 오류가 발생했습니다.");
    
    const existingUsers = existingUsersData.users;

    // 2. 입력한 이메일을 이미 누군가(나 자신 포함) 사용 중인지 확인
    const emailInUseBy = existingUsers.find(u => u.email === email);

    // 3. 이 '고객(Customer)'이 이미 발급받은 Auth 계정이 있는지 확인
    const existingAccountForThisCustomer = existingUsers.find(
      u => u.user_metadata?.customer_id === customerId
    );

    let targetUserId = null;

    if (existingAccountForThisCustomer) {
      targetUserId = existingAccountForThisCustomer.id;
      
      // 고객이 이미 계정이 있는데, 이메일을 바꾸려고 한다 -> 하필 그 이메일이 '다른 사람' 꺼라면 거절
      if (emailInUseBy && emailInUseBy.id !== targetUserId) {
         return { success: false, message: "이 이메일은 이미 다른 사용자가 사용 중입니다. 다른 이메일을 입력해 주세요." };
      }
    } else {
      // 고객이 계정이 아예 없어서 새로 만들어야 하는데, 이메일이 이미 존재하면 당연히 거절
      if (emailInUseBy) {
         return { success: false, message: "이 이메일은 이미 다른 사용자가 사용 중입니다. 다른 이메일을 입력해 주세요." };
      }
    }

    if (targetUserId) {
      // ==============================
      // 🔄 [업데이트 모드] 기존 계정이 무조건 1개만 유지되며, 정보만 덮어씁니다.
      // ==============================
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        email: email,
        password: password,
        user_metadata: { 
          role: "customer", 
          customer_id: customerId,
          display_name: customerName // 🚀 대시보드의 'Display name' 컬럼에 나오도록 추가!
        }
      });
      if (authError) throw new Error(`인증 계정 업데이트 실패: ${authError.message}`);

      // Profiles 테이블 업데이트 
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: targetUserId,
        email: email,
        display_name: customerName,
        user_level: "CUSTOMER", // 🚀 대문자 CUSTOMER 적용!
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
      if (profileError) throw new Error(`프로필 업데이트 실패: ${profileError.message}`);

    } else {
      // ==============================
      // 🆕 [신규 발급 모드] 1고객 1계정 원칙에 따라 최초 1회만 실행
      // ==============================
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { 
          role: "customer", 
          customer_id: customerId,
          display_name: customerName // 🚀 대시보드의 'Display name' 컬럼에 나오도록 추가!
        }
      });
      if (authError) throw new Error(`계정 생성 실패: ${authError.message}`);

      targetUserId = authData.user.id;

      // Profiles 테이블 신규 등록 
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: targetUserId,
        email: email,
        display_name: customerName,
        user_level: "CUSTOMER", // 🚀 대문자 CUSTOMER 적용!
        login_permit: true,
        status: "active",
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });
      
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(targetUserId);
        throw new Error(`프로필 등록 실패: ${profileError.message}`);
      }
    }

    // 4. Customers 테이블에 최종 로그인 이메일 & 패스워드 덮어쓰기
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