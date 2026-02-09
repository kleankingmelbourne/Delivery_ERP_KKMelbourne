"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

// Admin 권한 (Service Role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function saveStaffAction(data: any, isEdit: boolean, targetId?: string) {
  const supabase = await createServerClient();
  
  // 1. 요청자 확인
  const { data: { user: requester } } = await supabase.auth.getUser();
  if (!requester) return { success: false, error: "Unauthorized" };

  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("user_level")
    .eq("id", requester.id)
    .single();

  const isAdmin = requesterProfile?.user_level === "ADMIN";
  const isSelf = targetId === requester.id;

  // --- 신규 생성 (Create) ---
  if (!isEdit) {
    if (!isAdmin) return { success: false, error: "Only ADMIN can create new staff." };

    try {
      const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { display_name: data.display_name }
      });

      if (authError) throw authError;

      // [UPDATE] 신규 생성 시에도 로그인 허용 여부에 따라 상태 결정
      const initialStatus = data.login_permit ? 'active' : 'inactive';

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          display_name: data.display_name,
          email: data.email,
          phone_number: data.phone_number,
          address: data.address,
          birth_date: data.birth_date,
          user_level: data.user_level,
          login_permit: data.login_permit,
          status: initialStatus // 상태 자동 설정
        })
        .eq("id", newUser.user.id);

      if (profileError) throw profileError;

      return { success: true, message: "Staff created successfully." };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // --- 수정 (Update) ---
  if (isEdit && targetId) {
    // 본인 수정인 경우에도 ADMIN이 아니면 권한 없음 (단, 본인 정보 수정은 허용)
    // 여기서는 로직상 ADMIN이거나 본인이면 통과, 하지만 아래에서 ADMIN만 수정 가능한 필드를 구분함
    if (!isAdmin && !isSelf) {
      return { success: false, error: "You can only edit your own profile." };
    }

    try {
      const updates: any = {
        display_name: data.display_name,
        phone_number: data.phone_number,
        address: data.address,
        birth_date: data.birth_date,
        updated_at: new Date().toISOString(),
      };

      // ADMIN 전용 수정 항목
      if (isAdmin) {
        updates.user_level = data.user_level;
        updates.login_permit = data.login_permit;
        
        // [NEW] login_permit 변경 시 status 자동 동기화
        // true -> 'active', false -> 'inactive'
        updates.status = data.login_permit ? 'active' : 'inactive';

        if (data.email) {
            const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(
                targetId, 
                { email: data.email }
            );
            if (authEmailError) throw authEmailError;
            updates.email = data.email;
        }
      }

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", targetId);

      if (profileError) throw profileError;

      if (data.password && data.password.trim() !== "") {
        const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(
          targetId,
          { password: data.password }
        );
        if (pwdError) throw pwdError;
      }

      return { success: true, message: "Profile updated successfully." };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  return { success: false, error: "Invalid Request" };
}

// ... (deleteStaffAction은 기존과 동일) ...
export async function deleteStaffAction(ids: string[]) {
    // 기존에 수정한 FK 해제 로직이 포함된 코드를 그대로 사용하세요.
    // (이전 답변의 deleteStaffAction 코드 유지)
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Login required" };
    
    const { data: profile } = await supabase.from("profiles").select("user_level").eq("id", user.id).single();
    if (profile?.user_level !== "ADMIN") return { success: false, error: "Only ADMIN can delete." };
  
    try {
      // 1. Unlink Customers (Delivery)
      await supabaseAdmin.from('customers').update({ in_charge_delivery: null }).in('in_charge_delivery', ids);
      // 2. Unlink Customers (Sale)
      await supabaseAdmin.from('customers').update({ in_charge_sale: null }).in('in_charge_sale', ids);
      // 3. Unlink Invoices (Driver)
      await supabaseAdmin.from('invoices').update({ driver_id: null }).in('driver_id', ids);

      // 4. Delete Profiles
      const { error: profileError } = await supabaseAdmin.from('profiles').delete().in('id', ids);
      if (profileError) throw new Error(`Profile delete failed: ${profileError.message}`);

      // 5. Delete Auth Users
      await Promise.all(ids.map(id => supabaseAdmin.auth.admin.deleteUser(id)));

      return { success: true, count: ids.length };
    } catch (e: any) {
      console.error("Final Delete Error:", e);
      return { success: false, error: e.message };
    }
}

// [NEW] 비밀번호 재설정 메일 발송 액션
export async function sendPasswordResetEmailAction(email: string) {
  const supabase = await createServerClient();
  
  // 1. 요청자 확인 (로그인 여부)
  const { data: { user: requester } } = await supabase.auth.getUser();
  if (!requester) return { success: false, error: "Unauthorized" };

  // 2. 요청자 권한 확인 (ADMIN만 발송 가능)
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("user_level")
    .eq("id", requester.id)
    .single();

  if (requesterProfile?.user_level !== "ADMIN") {
    return { success: false, error: "Only ADMIN can send reset emails." };
  }

  try {
    // 3. 재설정 메일 발송
    // redirectTo: 사용자가 메일의 링크를 클릭했을 때 이동할 주소입니다.
    // (이 주소에서 새 비밀번호를 입력받는 로직이 있어야 합니다. 보통 /update-password 같은 경로)
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}/auth/callback?next=/update-password`,
    });

    if (error) throw error;

    return { success: true, message: `Reset email sent to ${email}` };
  } catch (e: any) {
    console.error("Reset Email Error:", e);
    return { success: false, error: e.message };
  }
}