"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Calendar, Search, FileText, User, Clock, Loader2, MessageSquareText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

interface DeliveryMemo {
  id: string;
  memo_date: string;
  content: string;
  created_at: string;
  profiles: {
    display_name?: string;
  };
}

export default function DeliveryLogPage() {
  const supabase = createClient();
  const [searchDate, setSearchDate] = useState<string>(getMelbourneDate());
  const [logs, setLogs] = useState<DeliveryMemo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delivery_memos')
        .select(`
          id, 
          memo_date, 
          content, 
          created_at,
          profiles:driver_id ( display_name )
        `)
        .eq('memo_date', date)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedData = (data || []).map((item: any) => ({
        ...item,
        profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      }));

      setLogs(formattedData);
    } catch (error: any) {
      console.error("Fetch logs error:", error);
      alert("로그를 불러오는데 실패했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(searchDate);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(searchDate);
  };

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto space-y-6 bg-slate-50/50 min-h-screen">
      {/* 헤더 */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          Delivery Log
        </h1>
        <p className="text-sm text-slate-500 ml-11">
          기사님들의 현장 보고 사항을 날짜별로 통합 관리합니다.
        </p>
      </div>

      {/* 검색 바 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              type="date" 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="pl-11 h-12 rounded-xl border-slate-200 focus:ring-blue-500 font-medium"
              required
            />
          </div>
          <Button 
            type="submit" 
            disabled={loading}
            className="h-12 px-8 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all active:scale-95"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            조회
          </Button>
        </form>
      </div>

      {/* 로그 리스트 (이름 상단 배치형) */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="font-bold">데이터 분석 중...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-32 flex flex-col items-center justify-center text-center">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
              <MessageSquareText className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">리포트가 비어있습니다</h3>
            <p className="text-slate-400 text-sm mt-1">{searchDate}에는 작성된 메모가 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {logs.map((log) => (
              <div key={log.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-blue-200 hover:shadow-md">
                
                {/* [상단] 기사 이름 및 시간 바 */}
                <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-full border border-slate-200">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="text-base font-extrabold text-slate-800">
                      {log.profiles?.display_name || "Unknown Driver"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-100 text-[11px] font-bold text-slate-400">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    {formatTime(log.created_at)}
                  </div>
                </div>

                {/* [하단] 메모 본문 (가로로 길게) */}
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 hidden sm:block">
                      <MessageSquareText className="w-5 h-5 text-slate-200" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[16px] text-slate-700 whitespace-pre-wrap leading-relaxed font-medium">
                        {log.content}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}