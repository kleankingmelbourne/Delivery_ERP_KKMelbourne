"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, Calendar, Trash2, Plus, Users, 
  CheckCircle2, AlertCircle, Loader2, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// 5개의 스케줄 메뉴 정의
const SCHEDULE_TABS = [
  { id: "weekly_mon", label: "Weekly (Mon)", desc: "Every Monday", color: "bg-blue-100 text-blue-700" },
  { id: "weekly_fri", label: "Weekly (Fri)", desc: "Every Friday", color: "bg-indigo-100 text-indigo-700" },
  { id: "biweekly_fri", label: "Bi-Weekly (Fri)", desc: "Every 2 Weeks (Fri)", color: "bg-purple-100 text-purple-700" },
  { id: "monthly_start", label: "Monthly (1st)", desc: "1st Day of Month", color: "bg-emerald-100 text-emerald-700" },
  { id: "monthly_end", label: "Monthly (End)", desc: "Last Day of Month", color: "bg-orange-100 text-orange-700" },
];

export default function AutoStatementPage() {
  const supabase = createClient();
  
  // 상태 관리
  const [activeTab, setActiveTab] = useState("weekly_fri"); // 기본 탭
  const [assignedCustomers, setAssignedCustomers] = useState<any[]>([]); // 현재 탭에 배정된 고객들
  const [loadingList, setLoadingList] = useState(false);

  // 검색 관련 상태
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- 1. 현재 탭의 배정된 고객 목록 불러오기 ---
  const fetchAssignedCustomers = useCallback(async () => {
    setLoadingList(true);
    // [수정됨] 불필요한 필드 제거 및 정렬 기준 created_at으로 변경
    const { data, error } = await supabase
      .from("auto_statement_settings")
      .select(`
        id,
        customer_id,
        schedule_type,
        customers (id, name, email, company)
      `)
      .eq("schedule_type", activeTab)
      .order("created_at", { ascending: false }); // 최근 추가된 순

    if (!error && data) {
      setAssignedCustomers(data.map((item: any) => ({
        setting_id: item.id,
        ...item.customers
      })));
    }
    setLoadingList(false);
  }, [activeTab, supabase]);

  useEffect(() => {
    fetchAssignedCustomers();
    setSearchTerm(""); // 탭 변경 시 검색어 초기화
    setSearchResults([]);
  }, [fetchAssignedCustomers]);

  // --- 2. 고객 검색 (이미 설정된 고객 제외하지 않음 - 덮어쓰기 기능 제공) ---
  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const { data } = await supabase
      .from("customers")
      .select("id, name, company, email")
      .ilike("name", `%${term}%`)
      .limit(5);

    if (data) {
      // 이미 현재 리스트에 있는 사람은 제외하고 보여주기 (UX 최적화)
      const currentIds = new Set(assignedCustomers.map(c => c.id));
      const filtered = data.filter(c => !currentIds.has(c.id));
      setSearchResults(filtered);
    }
    setIsSearching(false);
  };

  // --- 3. 스케줄 추가 (Add & Save) ---
  const handleAddCustomer = async (customer: any) => {
    // 이미 다른 스케줄에 있을 수도 있으므로 upsert 사용
    // customer_id는 unique 제약조건이 있어야 함
    
    try {
      // [수정됨] 불필요한 필드(is_active, updated_at) 제거
      const { error } = await supabase
        .from("auto_statement_settings")
        .upsert({
          customer_id: customer.id,
          schedule_type: activeTab
        }, { onConflict: 'customer_id' });

      if (error) throw error;

      // 성공 시 리스트 갱신 및 검색창 초기화
      await fetchAssignedCustomers();
      setSearchTerm("");
      setSearchResults([]);
      
    } catch (e: any) {
      alert("Error adding customer: " + e.message);
    }
  };

  // --- 4. 스케줄 제거 (Remove) ---
  const handleRemoveCustomer = async (settingId: string) => {
    if (!confirm("Remove this customer from the auto-statement list?")) return;

    const { error } = await supabase
      .from("auto_statement_settings")
      .delete()
      .eq("id", settingId);

    if (!error) {
      // 로컬 상태에서 즉시 제거 (빠른 반응)
      setAssignedCustomers(prev => prev.filter(c => c.setting_id !== settingId));
    } else {
      alert("Failed to remove.");
    }
  };

  const currentTabInfo = SCHEDULE_TABS.find(t => t.id === activeTab);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 pb-20 min-h-screen bg-slate-50/30">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-slate-700" /> Auto Statement Manager
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage automated sending schedules by category.</p>
      </div>

      {/* Tabs (Menu) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {SCHEDULE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200",
              activeTab === tab.id 
                ? "bg-white border-slate-900 shadow-md ring-1 ring-slate-900/10" 
                : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-400"
            )}
          >
            <span className={cn("text-sm font-bold mb-1", activeTab === tab.id ? "text-slate-900" : "text-slate-500")}>
              {tab.label}
            </span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", tab.color)}>
              {tab.desc}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Add Customer Section */}
        <Card className="lg:col-span-1 border-slate-200 shadow-sm h-fit">
          <CardContent className="p-5 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-1">
                <Plus className="w-4 h-4 text-blue-600" /> Add to {currentTabInfo?.label}
              </h3>
              <p className="text-xs text-slate-500">Search and select a customer to add.</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search by name..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2 min-h-[200px]">
              {isSearching && <div className="text-center py-4 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin mx-auto mb-1"/>Searching...</div>}
              
              {!isSearching && searchTerm && searchResults.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-lg">
                  <p className="text-xs text-slate-400">No matching customers found <br/>(or already added).</p>
                </div>
              )}

              {searchResults.map(customer => (
                <div key={customer.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all group">
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-800 truncate">{customer.name}</p>
                    <p className="text-xs text-slate-400 truncate">{customer.company || "No Company"}</p>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => handleAddCustomer(customer)}
                    className="h-8 w-8 rounded-full bg-slate-900 hover:bg-blue-600 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right: Current List Section */}
        <Card className="lg:col-span-2 border-slate-200 shadow-sm bg-white">
          <CardContent className="p-0">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" /> 
                Assigned Customers 
                <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full ml-1">
                  {assignedCustomers.length}
                </span>
              </h3>
              <div className={cn("text-xs font-medium px-2 py-1 rounded", currentTabInfo?.color)}>
                {currentTabInfo?.desc}
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {loadingList ? (
                <div className="p-10 text-center text-slate-400 flex flex-col items-center">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  Loading List...
                </div>
              ) : assignedCustomers.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center text-slate-400">
                  <AlertCircle className="w-10 h-10 mb-3 opacity-20" />
                  <p>No customers assigned to this schedule yet.</p>
                  <p className="text-xs mt-1">Use the search on the left to add one.</p>
                </div>
              ) : (
                assignedCustomers.map((customer) => (
                  <div key={customer.setting_id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                        {customer.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{customer.name}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="truncate">{customer.email || "No Email"}</span>
                          {customer.company && <span className="text-slate-300">|</span>}
                          {customer.company && <span className="truncate">{customer.company}</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveCustomer(customer.setting_id)}
                        className="text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove from schedule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}