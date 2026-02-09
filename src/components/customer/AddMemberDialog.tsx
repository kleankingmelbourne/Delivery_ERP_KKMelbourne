"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, UserPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"; // UI 컴포넌트가 없다면 기본 div로 구현 (아래는 기본 div 방식)

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

  // 다이얼로그가 열릴 때, 그룹이 없는 고객들을 불러옴
  useEffect(() => {
    if (isOpen) {
      fetchAvailableCustomers();
      setSearchTerm("");
    }
  }, [isOpen]);

  const fetchAvailableCustomers = async () => {
    setLoading(true);
    // group_id가 현재 그룹이 아닌 고객들 (NULL이거나 다른 그룹)
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, company, group_id")
      .neq("group_id", groupId) // 이미 이 그룹인 사람은 제외
      .order("name")
      .limit(50); // 성능을 위해 50명만 일단 로드 (검색으로 찾도록 유도)
      
    if (data) setCustomers(data);
    setLoading(false);
  };

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) return; // 2글자 이상일 때만 검색

    const { data } = await supabase
      .from("customers")
      .select("id, name, email, company, group_id")
      .neq("group_id", groupId) // 현재 그룹 제외
      .or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`)
      .limit(20);

    if (data) setCustomers(data);
  };

  const addMember = async (customerId: string) => {
    setAddingId(customerId);
    // 해당 고객의 group_id를 현재 그룹 ID로 업데이트
    const { error } = await supabase
      .from("customers")
      .update({ group_id: groupId })
      .eq("id", customerId);

    if (error) {
      alert("Failed to add member: " + error.message);
    } else {
      // 리스트에서 제거 (즉각 반응)
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      onSuccess(); // 부모 컴포넌트 새로고침 알림
    }
    setAddingId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Members</h2>
            <p className="text-xs text-slate-500">Add customers to <span className="font-bold text-blue-600">{groupName}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-50 bg-slate-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <Input 
              placeholder="Search by name, company or email..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && customers.length === 0 ? (
            <div className="py-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></div>
          ) : customers.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">No available customers found.</div>
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
                    onClick={() => addMember(customer.id)}
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
        <div className="p-4 border-t border-slate-100 flex justify-end">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}