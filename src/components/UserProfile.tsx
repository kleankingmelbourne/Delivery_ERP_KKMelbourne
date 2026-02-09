"use client" // 이 줄이 반드시 맨 위에 있어야 합니다!

import { useState, useEffect } from 'react'  //1
import { updateFullProfile } from '@/app/(auth)/login/actions'
//import { updateProfile } from '@/app/(auth)/login/actions'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { 
  Sparkles, 
  User, 
  Save,
  Loader2,
  Mail
} from "lucide-react"
import { useToast } from "@/hooks/use-toast" // 1. 훅 임포트
//import { useState, useEffect } from 'react' // 📍 useEffect 추가

export default function UserProfile({ profile, userEmail }: { profile: any, userEmail: string }) {
  const { toast } = useToast() // 2. toast 함수 가져오기
  const [name, setName] = useState(profile.display_name)
  const [email, setEmail] = useState(userEmail) // 이메일 상태 추가
  const [loading, setLoading] = useState(false)

  const [isMounted, setIsMounted] = useState(false);  //2

  //console.log("보내는 이름:", profile.display_name);
  // 3. 컴포넌트가 클라이언트에 마운트되면 true로 변경
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 4. 마운트 전에는 아무것도 렌더링하지 않거나 스켈레톤을 보여줌 (ID 불일치 방지)
  if (!isMounted) {
    return null; 
    // 또는 로딩 중임을 보여주고 싶다면:
    // return <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse" />;
  }
  
  const handleUpdate = async () => {
      setLoading(true)
      try {
        const result = await updateFullProfile(name, email)
        
        if (result.success) {
          // 3. 성공 시: 우측 하단에서 스르륵 나타나는 알림
          toast({
            title: "성공적으로 저장되었습니다",
            description: `${name}님으로 프로필 정보가 업데이트되었습니다.`,
          })
        } else {
          // 4. 실패 시: 빨간색 테마의 에러 알림
          toast({
            variant: "destructive",
            title: "업데이트 실패",
            description: result.message,
          })
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "오류 발생",
          description: "서버와 통신하는 중 문제가 발생했습니다.",
        })
      } finally {
        setLoading(false)
      }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors group">
          <Sparkles className="h-4 w-4 text-blue-600 animate-pulse" /> 
          <span className="text-[11px] font-medium text-blue-800 uppercase tracking-wider text-left">Welcome,</span>
          <span className="text-[12px] font-bold text-slate-900 group-hover:underline">
            {name}
          </span>
        </div>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <User className="h-5 w-5 text-blue-600" />
            프로필 수정
          </DialogTitle>
          <DialogDescription className="text-left">
            시스템에서 사용할 이름을 변경할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* 이름 입력 영역 */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-bold text-slate-500 uppercase">이름</Label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="pl-9" />
            </div>
          </div>

          {/* 이메일 입력 영역 */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-bold text-slate-500 uppercase">이메일 주소</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleUpdate} disabled={loading} className="w-full bg-black">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            설정 저장하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}