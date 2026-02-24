"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, UserPlus, Loader2 } from "lucide-react";
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

  useEffect(() => {
    if (isOpen) {
      fetchAvailableCustomers();
      setSearchTerm("");
    }
  }, [isOpen]);

  const fetchAvailableCustomers = async () => {
    setLoading(true);
    
    // [수정 포인트 1] 
    // 그룹에 속하지 않은(Unassigned) 고객만 불러오려면 .is("group_id", null) 사용
    // 만약 다른 그룹에 있는 사람도 뺏어오고 싶다면 로직이 달라져야 하지만, 기본적으로는 null인 사람을 찾습니다.
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, company, group_id")
      .is("group_id", null) // ✅ 수정됨: group_id가 NULL인(그룹 없는) 사람만 조회
      .order("name")
      .limit(50);
      
    if (error) {
        console.error("Error fetching customers:", error);
    }

    if (data) setCustomers(data);
    setLoading(false);
  };

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) return;

    // [수정 포인트 2] 검색 시에도 그룹이 없는 사람 중에서 검색
    const { data } = await supabase
      .from("customers")
      .select("id, name, email, company, group_id")
      .is("group_id", null) // ✅ 수정됨: 그룹 없는 사람 중에서
      .or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`) // 이름/이메일/회사 검색
      .limit(20);

    if (data) setCustomers(data);
  };

  const addMember = async (customerId: string) => {
    setAddingId(customerId);
    
    const { error } = await supabase
      .from("customers")
      .update({ group_id: groupId })
      .eq("id", customerId);

    if (error) {
      alert("Failed to add member: " + error.message);
    } else {
      // 리스트에서 제거 (즉각 반응)
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      onSuccess(); 
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
            <div className="py-10 text-center text-slate-400 text-sm">
                {searchTerm ? "No customers found matching search." : "No available customers found (everyone is already in a group)."}
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