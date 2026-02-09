// app/(dashboard)/layout.tsx
import Sidebar from "@/components/Sidebar";
import DriverLayout from "@/components/layout/DriverLayout";
import { Toaster } from "@/components/ui/toaster";
import { Bell, LogOut } from "lucide-react"; 
import { signout } from '../(auth)/login/actions' 
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/server"; 
import UserProfile from "@/components/UserProfile"; 
import Breadcrumb from "@/components/Breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // 프로필 정보 가져오기
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

    // 📍 [수정됨] DRIVER든 driver든 모두 'driver'로 인식하도록 처리
    // user_level이 없을 경우를 대비해 optional chaining(?.) 사용
    const isDriver = profile?.user_level?.toLowerCase() === 'driver';

    // ... (이후 코드는 동일) ...
    
    if (isDriver) {
        return (
            <TooltipProvider delayDuration={100}>
                <DriverLayout>
                    {children}
                </DriverLayout>
            </TooltipProvider>
        );
    }

    // --------------------------------------------------------------------------
    // [CASE 2] 관리자/일반 -> 데스크탑 레이아웃
    // --------------------------------------------------------------------------
    return (
        <TooltipProvider delayDuration={100}> 
            <div className="flex h-screen overflow-hidden bg-slate-50">
                <Sidebar /> 
      
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10">
                        <div>
                            <Breadcrumb />
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                suppressHydrationWarning 
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                <Bell className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                {/* UserProfile 컴포넌트 내부의 null 체크 에러도 꼭 수정해주세요! (이전 답변 참고) */}
                                <UserProfile 
                                    profile={profile} 
                                    userEmail={user?.email || ""} 
                                />

                                <form action={signout}>
                                    <Tooltip> 
                                        <TooltipTrigger asChild> 
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-9 px-3 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
                                            >
                                                <LogOut className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom" className="z-[100] bg-slate-900 text-white border-none text-[11px]">
                                            <p>Log Out</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </form>
                            </div>      
                        </div>
                    </header>

                    <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {children}
                    </main>
                </div>
            </div>
        </TooltipProvider>
    );
}