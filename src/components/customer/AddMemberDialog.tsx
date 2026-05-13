"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, UserPlus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupId: number;
  groupName: string;
}

export default function AddMemberDialog({ isOpen, onClose, onSuccess, groupId, groupName }: AddMemberDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSuccessMsg(null);
    }
  }, [isOpen]);

  // 성공 메시지 3초 후 자동 삭제
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // 🚀 최적화: 타이핑 시 DB 요청을 0.3초 모아서 한 번만 보내는 디바운스 로직 통합
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      const term = searchTerm.trim();
      setLoading(true);

      if (term.length < 2) {
        // 검색어가 없거나 1글자면 기본 50명 목록 불러오기 (백스페이스 대응)
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, email, company, group_id")
          .is("group_id", null) 
          .order("name")
          .limit(50);
          
        if (error) console.error("Error fetching customers:", error);
        if (data) setCustomers(data);
      } else {
        // 2글자 이상이면 검색 진행
        const { data, error } = await supabase
          .from("customers")
          .select("id, name, email, company, group_id")
          .is("group_id", null) 
          .or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`) 
          .limit(20);

        if (error) console.error("Search Error:", error);
        if (data) setCustomers(data);
      }
      
      setLoading(false);
    }, 300); // 0.3초 대기

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, supabase]);

  const addMember = async (customer: any) => { 
    setAddingId(customer.id);
    
    const { error } = await supabase
      .from("customers")
      .update({ group_id: groupId })
      .eq("id", customer.id);

    if (error) {
      alert("Failed to add member: " + error.message);
    } else {
      setSuccessMsg(`${customer.name} has been added to the group.`);
      
      // 리스트에서 제거 (즉각 반응)
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      onSuccess(); 
    }
    setAddingId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh] relative overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Members</h2>
            <p className="text-xs text-slate-500">Add customers to <span className="font-bold text-blue-600">{groupName}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <Input 
              placeholder="Search by name, company or email..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* 성공 메시지 알림 */}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-2 flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
            <div className="bg-emerald-100 p-1 rounded-full">
              <Check className="w-3 h-3 text-emerald-600" />
            </div>
            <span className="text-xs font-bold text-emerald-700">{successMsg}</span>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && customers.length === 0 ? (
            <div className="py-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>
          ) : customers.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
                {searchTerm ? "No customers found matching search." : "No available customers found."}
            </div>
          ) : (
            <div className="space-y-1">
              {customers.map(customer => (
                <div key={customer.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors group">
                  <div className="overflow-hidden">
                    <p className="font-bold text-slate-800 text-sm truncate">{customer.name}</p>
                    <p className="text-xs text-slate-500 truncate">{customer.company || customer.email}</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    disabled={addingId === customer.id}
                    onClick={() => addMember(customer)}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-3"
                  >
                    {addingId === customer.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <span className="flex items-center text-xs font-bold"><UserPlus className="w-3.5 h-3.5 mr-1"/> Add</span>}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end bg-white z-10">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}