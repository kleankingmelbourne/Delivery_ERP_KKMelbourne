// app/(dashboard)/layout.tsx
import Sidebar from "@/components/Sidebar";
import DriverLayout from "@/components/layout/DriverLayout";
import { Toaster } from "@/components/ui/toaster";
import { Bell, LogOut } from "lucide-react"; 
import { signout } from '../login/actions' 
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

// ✅ 방금 만든 AuthProvider를 불러옵니다. (경로는 프로젝트에 맞게 수정하세요)
import { AuthProvider } from "@/components/providers/AuthProvider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {

    const supabase = await createClient();
    
    // 💡 여기서 딱 한 번! DB에서 유저 정보/product Unit 정보를 가져옵니다.
    const { data: { user } } = await supabase.auth.getUser();
    
    const [ { data: profile }, { data: units } ] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, display_name, user_level") 
            .eq("id", user?.id)
            .single(),
        supabase
            .from("product_units")
            .select("id, unit_name")
            .limit(100)
    ]);

    const isDriver = profile?.user_level?.toLowerCase() === 'driver';
    
    if (isDriver) {
        return (
            <TooltipProvider delayDuration={100}>
                {/* ✅ AuthProvider로 감싸줍니다 */}
                <AuthProvider user={user} profile={profile} productUnits={units || []}>
                    <DriverLayout>
                        {children}
                    </DriverLayout>
                </AuthProvider>
            </TooltipProvider>
        );
    }

    return (
        <TooltipProvider delayDuration={100}> 
            {/* ✅ AuthProvider로 감싸서 {children}으로 내려보냅니다 */}
            <AuthProvider user={user} profile={profile} productUnits={units || []}>
                <div className="flex h-screen overflow-hidden bg-slate-50">
                    <Sidebar /> 
          
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10">
                            <div>
                                <Breadcrumb />
                            </div>

                            <div className="flex items-center gap-4">
                                <button suppressHydrationWarning className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                    <Bell className="w-5 h-5" />
                                </button>

                                <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                                    <UserProfile profile={profile} userEmail={user?.email || ""} />
                                    <form action={signout}>
                                        <Tooltip> 
                                            <TooltipTrigger asChild> 
                                                <Button variant="ghost" size="sm" className="h-9 px-3 gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold">
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
            </AuthProvider>
        </TooltipProvider>
    );
}