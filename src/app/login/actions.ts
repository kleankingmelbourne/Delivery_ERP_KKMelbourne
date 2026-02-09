'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// 로그인 함수
export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }


  // 1. Supabase Auth 로그인 시도 (아이디/비번 확인)
  const { data: authData, error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    console.error('로그인 에러:', error.message)
    // 에러 발생 시 쿼리 파라미터로 에러 메시지 전달
    return redirect('/login?error=auth-failed')
  }
// -----------------------------------------------------------------
  // 🚨 2. [추가] 2차 검문: 접속 권한(login_permit) 확인
  // -----------------------------------------------------------------
  if (authData.user) {
    // profiles 테이블에서 권한 정보 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('login_permit, status') // status도 혹시 모르니 같이 조회
      .eq('id', authData.user.id)
      .single()

    // A. 프로필 데이터가 없거나
    // B. login_permit이 false (퇴사/차단) 상태라면
    if (!profile || profile.login_permit === false) {
      
      // ⛔ 즉시 로그아웃 시킴 (세션 파기)
      await supabase.auth.signOut() 
      
      // ⛔ 에러 메시지와 함께 쫓아냄
      return redirect('/login?error=access-denied') 
    }
  }

  // 3. 모든 검문 통과
  revalidatePath('/', 'layout')
  return redirect('/')
}

// 회원가입 함수 (모든 추가 필드 포함)
export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  // 추가 정보 추출 (입력창의 'name' 속성과 일치해야 함)
  const userData = {
    display_name: formData.get('display_name') as string,
    birth_date: formData.get('birth_date') as string,
    phone_number: formData.get('phone_number') as string,
    address: formData.get('address') as string,
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData, // 이 객체가 Supabase 트리거의 raw_user_meta_data가 됩니다.
    },
  })

  if (error) {
    console.error('회원가입 에러:', error.message)
    return redirect('/login?error=signup-failed')
  }

  revalidatePath('/', 'layout')
  return redirect('/')
}


export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function updateProfile(newName: string) {
  const supabase = await createClient()

  // 1. 현재 유저 정보 가져오기
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('로그인이 필요합니다.')
  }

  // 2. profiles 테이블 업데이트
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: newName }) // 수정할 데이터
    .eq('id', user.id)                // 현재 로그인한 유저의 ID와 일치하는 행

  if (error) {
    console.error('Update Error:', error)
    return { success: false, message: '업데이트 중 오류가 발생했습니다.' }
  }

  // 3. 페이지 데이터 갱신 (화면의 이름을 최신화하기 위함)
  revalidatePath('/', 'layout')
  
  return { success: true, message: '이름이 성공적으로 변경되었습니다.' }
}

export async function updateFullProfile(newName: string, newEmail: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다.')

  // 1. 이메일 변경 시도 (현재 이메일과 다를 경우에만)
  if (newEmail !== user.email) {
    const { error: emailError } = await supabase.auth.updateUser({ email: newEmail })
    if (emailError) return { success: false, message: '이메일 변경 실패: ' + emailError.message }
    // 참고: 이메일을 변경하면 새 메일 주소로 확인 링크가 발송됩니다.
  }

  // 2. 이름(profiles 테이블) 업데이트
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: newName })
    .eq('id', user.id)

  if (profileError) return { success: false, message: '이름 변경 실패: ' + profileError.message }

  revalidatePath('/', 'layout')
  return { 
    success: true, 
    message: newEmail !== user.email 
      ? '이름이 변경되었습니다. 이메일은 새 주소에서 인증 후 최종 변경됩니다.' 
      : '프로필 정보가 성공적으로 변경되었습니다.' 
  }
}