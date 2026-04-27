"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Calendar, FileText, User, Clock, Loader2, MessageSquareText, ChevronDown, ChevronUp
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

const formatTime = (timestamp: string) => {
  if (!timestamp) return "-";
  try {
    return new Date(timestamp).toLocaleTimeString('en-AU', {
      timeZone: 'Australia/Melbourne',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return "-";
  }
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async (date: string) => {
    if (!date) return;
    setLoading(true);
    setExpandedId(null);
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

      if (error) {
        throw error;
      }
      
      const formattedData = (data || []).map((item: any) => ({
        ...item,
        profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      }));

      setLogs(formattedData);
    } catch (error: any) {
      console.error("Fetch logs error:", error);
      alert("로그를 불러오는데 실패했습니다: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // 🚀 [수정] searchDate 값이 바뀔 때마다 자동으로 fetchLogs 함수를 실행합니다!
  useEffect(() => {
    fetchLogs(searchDate);
  }, [searchDate]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="p-6 w-full max-w-[900px] mx-auto space-y-6 bg-slate-50/50 min-h-screen">
      {/* 헤더 */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <div className="bg-slate-900 p-2 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          Driver Daily Log
        </h1>
        <p className="text-sm text-slate-500 ml-11 font-medium">
          기사 한 명당 하루 한 개의 리포트를 확인합니다.
        </p>
      </div>

      {/* 검색 바 (버튼 삭제 및 자동 검색 UI로 변경) */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              type="date" 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="pl-11 h-12 rounded-xl border-slate-200 focus:ring-blue-500 font-black text-slate-800"
              required
            />
          </div>
          {/* 달력이 바뀔 때 바로 로딩되는 것을 알려주는 작은 인디케이터 추가 */}
          {loading && <div className="text-xs font-bold text-blue-600 flex items-center gap-2 animate-pulse"><Loader2 className="w-3 h-3 animate-spin"/> 로딩 중...</div>}
        </div>
      </div>

      {/* 로그 리스트 */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="font-bold tracking-tighter">데이터 로딩 중...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 py-24 flex flex-col items-center justify-center text-center">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
              <MessageSquareText className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">작성된 로그가 없습니다</h3>
            <p className="text-slate-400 text-sm mt-1">{searchDate}에 제출된 리포트가 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => {
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id} className={cn(
                  "bg-white rounded-xl border transition-all duration-200 overflow-hidden",
                  isExpanded ? "border-slate-800 shadow-lg" : "border-slate-200 shadow-sm hover:border-slate-400"
                )}>
                  
                  {/* [기사 이름 바] */}
                  <button 
                    onClick={() => toggleExpand(log.id)}
                    className={cn(
                      "w-full px-6 py-5 flex items-center justify-between text-left transition-colors",
                      isExpanded ? "bg-slate-900 text-white" : "bg-white text-slate-800"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-2 rounded-full",
                        isExpanded ? "bg-slate-800 text-emerald-400" : "bg-slate-100 text-slate-500"
                      )}>
                        <User className="w-5 h-5" />
                      </div>
                      <span className="text-xl font-black tracking-tight">
                        {log.profiles?.display_name || "Unknown Driver"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-tighter",
                        isExpanded ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
                      )}>
                        <Clock className="w-3.5 h-3.5" />
                        제출 시간: {formatTime(log.created_at)}
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {/* [본문 내용] */}
                  {isExpanded && (
                    <div className="px-6 py-6 animate-in slide-in-from-top-2 duration-300 bg-white">
                      <div className="border-l-4 border-slate-900 pl-6 py-2">
                        <p className="text-[17px] text-slate-800 whitespace-pre-wrap leading-relaxed font-bold">
                          {log.content}
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}