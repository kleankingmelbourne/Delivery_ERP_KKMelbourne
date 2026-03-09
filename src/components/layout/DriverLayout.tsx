"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Truck, LogOut, Bell, NotebookPen, Loader2, X } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface DriverLayoutProps {
  children: ReactNode;
}

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

export default function DriverLayout({ children }: DriverLayoutProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [hasNewDelivery, setHasNewDelivery] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [isMemoOpen, setIsMemoOpen] = useState(false);
  const [memoDate, setMemoDate] = useState(getMelbourneDate());
  const [memoContent, setMemoContent] = useState("");
  const [isMemoLoading, setIsMemoLoading] = useState(false);
  const [isMemoSaving, setIsMemoSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 🚀 [중요 수정] 실시간 통신 폭주 방지(Debouncing) 적용
  useEffect(() => {
    let isMounted = true;
    let channel: any = null;
    let timeoutId: NodeJS.Timeout;

    const checkNewDeliveries = async (userId: string) => {
      const today = getMelbourneDate();
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true }) 
        .eq('driver_id', userId)
        .eq('invoice_date', today)
        .eq('delivery_order', 0); 
      
      if (isMounted && count !== null) {
        setHasNewDelivery(count > 0); 
      }
    };

    const handleRealtimeUpdate = (userId: string) => {
      // 이벤트 연속 발생 시 타이머 초기화 후 0.3초 뒤 1번만 실행
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        checkNewDeliveries(userId);
      }, 300);
    };

    const setupNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id); 
      
      await checkNewDeliveries(user.id);

      channel = supabase.channel('realtime-driver-notifications')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
          handleRealtimeUpdate(user.id);
        })
        .subscribe();
    };

    setupNotifications();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId); // 메모리 누수 방지
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    if (!isMemoOpen || !currentUserId) return;

    const fetchMemo = async () => {
      setIsMemoLoading(true);
      try {
        const { data } = await supabase
          .from('delivery_memos')
          .select('content')
          .eq('driver_id', currentUserId)
          .eq('memo_date', memoDate)
          .maybeSingle();
          
        setMemoContent(data?.content || "");
      } catch (error) {
        console.error("Failed to fetch memo", error);
      } finally {
        setIsMemoLoading(false);
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
      }
    };

    fetchMemo();
  }, [isMemoOpen, memoDate, currentUserId, supabase]);

  const handleSaveMemo = async () => {
    if (!currentUserId) return;
    setIsMemoSaving(true);
    try {
        const { data: existing } = await supabase
            .from('delivery_memos')
            .select('id')
            .eq('driver_id', currentUserId)
            .eq('memo_date', memoDate)
            .maybeSingle();
            
        if (existing) {
            await supabase.from('delivery_memos').update({ content: memoContent }).eq('id', existing.id);
        } else {
            await supabase.from('delivery_memos').insert({ driver_id: currentUserId, memo_date: memoDate, content: memoContent });
        }
        setIsMemoOpen(false); 
    } catch (error) {
        alert("Failed to save memo");
    } finally {
        setIsMemoSaving(false);
    }
  };

  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      await supabase.auth.signOut();
      router.push("/login");
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative overflow-hidden">
      
      <header className="bg-slate-900 text-white px-4 h-14 flex items-center justify-between sticky top-0 z-50 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-emerald-400" />
          <h1 className="font-bold text-lg tracking-tight">Driver App</h1>
        </div>
        
        <div className="flex items-center gap-4">
          
          <button 
            onClick={() => setIsMemoOpen(true)} 
            className="p-1 flex items-center justify-center text-slate-300 hover:text-blue-400 transition-colors"
            title="Daily Memo"
          >
            <NotebookPen className="w-5 h-5" />
          </button>

          <button className="relative p-1">
            <Bell className="w-5 h-5 text-slate-300 hover:text-white transition-colors" />
            {hasNewDelivery && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border border-slate-900 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
            )}
          </button>
          
          <button 
            onClick={handleLogout} 
            className="p-1 flex items-center justify-center text-slate-300 hover:text-rose-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden bg-slate-200">
        {children}
      </main>

      <Dialog open={isMemoOpen} onOpenChange={setIsMemoOpen}>
        <DialogContent 
          className="!max-w-[100vw] !w-screen !h-[100dvh] !max-h-[100dvh] !m-0 !p-0 !rounded-none !border-none bg-slate-50 flex flex-col sm:!max-w-[100vw] sm:!rounded-none sm:!p-0 [&>button]:hidden z-[100]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          
          <DialogHeader className="p-4 bg-white border-b border-slate-200 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-black text-slate-800 m-0">Daily Log</DialogTitle>
            <DialogDescription className="hidden">Global daily notes</DialogDescription>
            <button onClick={() => setIsMemoOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative">
            <Input 
              type="date" 
              value={memoDate} 
              onChange={(e) => setMemoDate(e.target.value)} 
              className="w-full h-12 font-bold text-slate-700 bg-white border-slate-200 shadow-sm"
            />
            
            <div className="flex-1 relative flex flex-col min-h-0">
              {isMemoLoading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-xl">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              )}
              <Textarea 
                ref={textareaRef}
                value={memoContent} 
                onChange={(e) => setMemoContent(e.target.value)}
                autoFocus
                onFocus={(e) => {
                    const val = e.currentTarget.value;
                    e.currentTarget.value = "";
                    e.currentTarget.value = val;
                    e.currentTarget.scrollTop = e.currentTarget.scrollHeight;
                }}
                className="flex-1 w-full h-full p-4 resize-none text-[15px] leading-relaxed border-slate-200 shadow-sm rounded-xl bg-white focus-visible:ring-2 focus-visible:ring-blue-500" 
                placeholder="Enter notes for this day..."
              />
            </div>
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0 pb-safe">
            <Button 
              className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg" 
              onClick={handleSaveMemo} 
              disabled={isMemoSaving || isMemoLoading}
            >
              {isMemoSaving ? <Loader2 className="animate-spin w-6 h-6" /> : "Save Notes"}
            </Button>
          </div>
          
        </DialogContent>
      </Dialog>
      
    </div>
  );
}