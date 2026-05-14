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
        user_metadata: { 
          display_name: data.display_name,
          role: data.user_level?.toLowerCase() || 'staff' 
        }
      });

      if (authError) throw authError;

      const initialStatus = data.login_permit ? 'active' : 'inactive';

      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: newUser.user.id, 
          display_name: data.display_name,
          email: data.email,
          phone_number: data.phone_number,
          address: data.address,
          // 🚀 [에러 해결] 빈 문자열("")이면 null을 넣어 DB 날짜 타입 충돌 방지!
          birth_date: data.birth_date ? data.birth_date : null, 
          user_level: data.user_level,
          login_permit: data.login_permit,
          status: initialStatus, 
          lat: data.lat, 
          lng: data.lng  
        }, { onConflict: "id" });

      // 프로필 저장 실패 시 롤백
      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        throw profileError;
      }

      return { success: true, message: "Staff created successfully." };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // --- 수정 (Update) ---
  if (isEdit && targetId) {
    if (!isAdmin && !isSelf) {
      return { success: false, error: "You can only edit your own profile." };
    }

    try {
      const updates: any = {
        display_name: data.display_name,
        phone_number: data.phone_number,
        address: data.address,
        // 🚀 [에러 해결] 수정할 때도 빈 문자열("")이면 null 처리
        birth_date: data.birth_date ? data.birth_date : null, 
        updated_at: new Date().toISOString(),
        lat: data.lat, 
        lng: data.lng  
      };

      // ADMIN 전용 수정 항목
      if (isAdmin) {
        updates.user_level = data.user_level;
        updates.login_permit = data.login_permit;
        updates.status = data.login_permit ? 'active' : 'inactive';

        const authUpdates: any = {
          user_metadata: { 
            role: data.user_level?.toLowerCase() || 'staff' 
          }
        };

        if (data.email) {
          authUpdates.email = data.email;
          updates.email = data.email;
        }

        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
          targetId, 
          authUpdates
        );
        
        if (authUpdateError) throw authUpdateError;
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

export async function deleteStaffAction(ids: string[]) {
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

// 비밀번호 재설정 메일 발송 액션
export async function sendPasswordResetEmailAction(email: string) {
  const supabase = await createServerClient();
  
  const { data: { user: requester } } = await supabase.auth.getUser();
  if (!requester) return { success: false, error: "Unauthorized" };

  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("user_level")
    .eq("id", requester.id)
    .single();

  if (requesterProfile?.user_level !== "ADMIN") {
    return { success: false, error: "Only ADMIN can send reset emails." };
  }

  try {
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