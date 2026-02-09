"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Users, Plus, Trash2, Edit, User, Percent,
  ChevronDown, Layers, UserPlus, LogOut, UserMinus, RefreshCw // [NEW] 아이콘 추가
} from "lucide-react";
import { Button } from "@/components/ui/button";
import GroupDialog from "@/components/customer/GroupDialog";
import AddMemberDialog from "@/components/customer/AddMemberDialog";
import GroupPriceSyncDialog from "@/components/customer/GroupPriceSyncDialog"; // [NEW] 컴포넌트 추가

interface CustomerGroup {
  id: number;
  name: string;
  color: string;
  description: string;
  discount_rate: number;
  count?: number;
}

interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  mobile: string;
  group_id: number | null;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  green: "bg-green-100 text-green-700 border-green-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function CustomerGroupPage() {
  const supabase = createClient();
  
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<number | string>(""); 
  
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  
  // [NEW] 가격 동기화 다이얼로그 상태
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);

  const [editingGroup, setEditingGroup] = useState<CustomerGroup | undefined>(undefined);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: groupData } = await supabase
      .from("customer_groups")
      .select("*")
      .order("name");

    const { data: customerData } = await supabase
      .from("customers")
      .select("id, name, company, email, mobile, group_id");

    if (groupData && customerData) {
      const groupsWithCount = groupData.map(g => ({
        ...g,
        count: customerData.filter(c => c.group_id === g.id).length
      }));
      
      setGroups(groupsWithCount);
      setCustomers(customerData as Customer[]);
      
      if (!selectedGroupId && groupsWithCount.length > 0) {
        setSelectedGroupId(groupsWithCount[0].id);
      }
    }
    setLoading(false);
  };

  const selectedGroup = groups.find(g => g.id === Number(selectedGroupId));
  const selectedGroupCustomers = customers.filter(c => c.group_id === Number(selectedGroupId));

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    if (!confirm(`Delete group '${selectedGroup.name}'? \nAll ${selectedGroupCustomers.length} members will be ungrouped.`)) return;
    
    const { error } = await supabase.from("customer_groups").delete().eq("id", selectedGroup.id);
    if (error) alert(error.message);
    else {
        setSelectedGroupId(""); 
        fetchData();
    }
  };

  const handleRemoveMember = async (customerId: string) => {
    if (!confirm("Remove this customer from the group?")) return;
    const { error } = await supabase.from("customers").update({ group_id: null }).eq("id", customerId);
    if (error) alert("Failed: " + error.message);
    else fetchData();
  };

  const handleEditGroup = () => {
    if (selectedGroup) {
      setEditingGroup(selectedGroup);
      setIsGroupDialogOpen(true);
    }
  };

  const handleCreateGroup = () => {
    setEditingGroup(undefined);
    setIsGroupDialogOpen(true);
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8 pb-24 h-screen flex flex-col">
      
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7" /> Customer Groups
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage pricing tiers and segments efficiently.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-full"><Layers className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Total Groups</p>
              <p className="text-lg font-black text-slate-700 leading-none">{groups.length}</p>
            </div>
          </div>
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-full"><User className="w-4 h-4" /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Ungrouped Users</p>
              <p className="text-lg font-black text-slate-700 leading-none">
                {customers.filter(c => !c.group_id).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Control Panel */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Top Bar */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="w-full md:w-1/2 lg:w-1/3">
            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block ml-1">Select Group to Manage</label>
            <div className="relative">
              <select 
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full h-11 pl-4 pr-10 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none appearance-none shadow-sm transition-all"
              >
                <option value="" disabled>Select a group...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
            </div>
          </div>

          <div>
            <Button onClick={handleCreateGroup} className="bg-slate-900 hover:bg-slate-800 shadow-md">
              <Plus className="w-4 h-4 mr-2" /> Create New Group
            </Button>
          </div>
        </div>

        {/* Selected Group Info */}
        {selectedGroup ? (
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-slate-800">{selectedGroup.name}</h2>
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${COLOR_MAP[selectedGroup.color]}`}>
                    {selectedGroup.name} Badge
                  </span>
                </div>
                <p className="text-slate-500 text-sm max-w-2xl">{selectedGroup.description || "No description provided for this group."}</p>
                
                <div className="mt-3 flex items-center gap-4">
                  {selectedGroup.discount_rate > 0 ? (
                    <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                      <Percent className="w-3.5 h-3.5 mr-1.5" /> Pricing Rule: {selectedGroup.discount_rate}% Discount
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">No discount applied (Standard Price)</span>
                  )}
                </div>
              </div>

              {/* Group Actions Buttons */}
              <div className="flex items-center gap-2">
                {/* [NEW] Sync Prices Button */}
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsSyncDialogOpen(true)}
                    className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Sync Prices
                </Button>

                <Button variant="outline" size="sm" onClick={handleEditGroup}>
                  <Edit className="w-4 h-4 mr-2" /> Edit Group
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteGroup}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Group
                </Button>
              </div>
            </div>

            {/* 3. Member List Table */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  Group Members <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs">{selectedGroupCustomers.length}</span>
                </h3>
                <Button size="sm" variant="outline" onClick={() => setIsAddMemberOpen(true)} className="border-dashed border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50">
                  <UserPlus className="w-4 h-4 mr-2" /> Add Member
                </Button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 w-[30%]">Name</th>
                      <th className="px-6 py-3 w-[30%]">Company</th>
                      <th className="px-6 py-3 w-[25%]">Email</th>
                      <th className="px-6 py-3 w-[15%] text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedGroupCustomers.length > 0 ? (
                      selectedGroupCustomers.map((cust) => (
                        <tr key={cust.id} className="hover:bg-slate-50 group">
                          <td className="px-6 py-3 font-medium text-slate-900">{cust.name}</td>
                          <td className="px-6 py-3 text-slate-600">{cust.company || "-"}</td>
                          <td className="px-6 py-3 text-slate-500">{cust.email || "-"}</td>
                          <td className="px-6 py-3 text-center">
                            <button 
                              onClick={() => handleRemoveMember(cust.id)}
                              className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all"
                              title="Remove from group"
                            >
                              <LogOut className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-16 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center">
                            <UserMinus className="w-10 h-10 mb-3 opacity-20" />
                            <p>No members in this group yet.</p>
                            <Button variant="link" onClick={() => setIsAddMemberOpen(true)} className="mt-2 text-blue-600">Add customers</Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center bg-slate-50/30">
            <Users className="w-16 h-16 mb-4 opacity-10" />
            <h3 className="text-lg font-medium text-slate-600 mb-1">Select a Group</h3>
            <p className="text-sm">Choose a group from the dropdown above to manage details and members.</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <GroupDialog 
        isOpen={isGroupDialogOpen} 
        onClose={() => setIsGroupDialogOpen(false)} 
        onSuccess={fetchData} 
        groupData={editingGroup}
      />

      {selectedGroup && (
        <>
          <AddMemberDialog 
              isOpen={isAddMemberOpen}
              onClose={() => setIsAddMemberOpen(false)}
              onSuccess={fetchData}
              groupId={selectedGroup.id}
              groupName={selectedGroup.name}
          />
          
          {/* [NEW] Price Sync Dialog 연결 */}
          <GroupPriceSyncDialog
              isOpen={isSyncDialogOpen}
              onClose={() => setIsSyncDialogOpen(false)}
              groupId={selectedGroup.id}
              groupName={selectedGroup.name}
          />
        </>
      )}
    </div>
  );
}