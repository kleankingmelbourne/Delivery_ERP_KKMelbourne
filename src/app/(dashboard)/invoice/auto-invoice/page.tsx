"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Trash2, Plus, Users, MailCheck } from "lucide-react";

export default function AutoInvoiceSettings() {
  const supabase = createClient();
  const [settings, setSettings] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // 1. 초기 데이터 불러오기
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [custRes, setRes] = await Promise.all([
        supabase.from("customers").select("id, name, company, email").order("name"),
        supabase.from("auto_invoice_settings").select("customer_id, created_at")
      ]);
      if (custRes.data) setAllCustomers(custRes.data);
      if (setRes.data) setSettings(setRes.data);
      setLoading(false);
    };
    fetchData();
  }, [supabase]);

  // 설정된 고객 리스트
  const activeSettings = useMemo(() => {
    return settings.map(s => {
      const c = allCustomers.find(cust => cust.id === s.customer_id);
      return { ...s, customer: c };
    }).filter(s => s.customer); // 매칭된 고객만
  }, [settings, allCustomers]);

  // 검색된 고객 리스트 (아직 추가 안 된 고객만)
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const lowerTerm = searchTerm.toLowerCase();
    const activeIds = new Set(settings.map(s => s.customer_id));
    return allCustomers.filter(c => 
      !activeIds.has(c.id) && 
      (c.name?.toLowerCase().includes(lowerTerm) || c.company?.toLowerCase().includes(lowerTerm))
    ).slice(0, 10);
  }, [searchTerm, allCustomers, settings]);

  // 🚀 고객 추가 로직 수정 (에러 감지 추가 및 상태 업데이트 안정화)
  const handleAdd = async (customerId: string) => {
    const { error } = await supabase.from("auto_invoice_settings").insert({ customer_id: customerId });
    
    if (error) {
      console.error("❌ Auto Invoice 테이블 추가 실패:", error);
      alert(`고객을 추가하지 못했습니다: ${error.message}\n(Supabase RLS 정책이나 테이블 권한을 확인해보세요.)`);
      return;
    }

    // 함수형 업데이트로 상태를 안전하게 갱신하여 리스트에 즉시 반영되도록 함
    setSettings(prev => [...prev, { customer_id: customerId, created_at: new Date().toISOString() }]);
    setSearchTerm("");
  };

  // 고객 삭제
  const handleRemove = async (customerId: string) => {
    if (!confirm("Remove this customer from Daily Auto Invoice?")) return;
    const { error } = await supabase.from("auto_invoice_settings").delete().eq("customer_id", customerId);
    
    if (error) {
      alert(`삭제 실패: ${error.message}`);
      return;
    }
    
    setSettings(prev => prev.filter(s => s.customer_id !== customerId));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MailCheck className="w-6 h-6 text-blue-600"/> Daily Auto Invoice Settings
        </h1>
        <p className="text-slate-500 mt-1">
          Automatically send today's invoices to selected customers at 11 PM every night.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <label className="text-xs font-bold text-slate-500 uppercase">Add Customer to List</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search customer to add..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        
        {/* 🚀 검색 결과 영역: COMPANY 대신 NAME을 메인으로 표시 */}
        {searchResults.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-inner">
            {searchResults.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <div>
                  {/* 1. 보여지는 이름을 NAME으로 고정 */}
                  <p className="font-bold text-slate-900">{c.name || "Unknown Name"}</p>
                  {/* 회사명과 이메일은 서브 정보로 아래에 노출 */}
                  <p className="text-xs text-slate-500">
                    {c.company ? `${c.company} • ` : ""}{c.email || "No Email"}
                  </p>
                </div>
                <button 
                  onClick={() => handleAdd(c.id)} 
                  disabled={!c.email} 
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3"/> Add
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 설정된 고객 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4"/> Active Customers ({activeSettings.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
             <div className="p-10 text-center text-slate-400">Loading...</div>
          ) : activeSettings.length === 0 ? (
             <div className="p-10 text-center text-slate-400">No customers selected for auto invoice.</div>
          ) : (
            activeSettings.map(s => (
              <div key={s.customer_id} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  {/* 🚀 2. 활성 고객 목록에서도 이름을 메인으로 표시 */}
                  <p className="font-bold text-slate-900">{s.customer.name || "Unknown Name"}</p>
                  <p className="text-xs text-slate-500">
                    {s.customer.company ? `${s.customer.company} • ` : ""}{s.customer.email}
                  </p>
                </div>
                <button 
                  onClick={() => handleRemove(s.customer_id)} 
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}