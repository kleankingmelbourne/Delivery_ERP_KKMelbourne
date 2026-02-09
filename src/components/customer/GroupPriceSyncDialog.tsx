"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, Save, Loader2, RefreshCw, User, AlertCircle, ChevronsUp } from "lucide-react"; // [NEW] ChevronsUp 아이콘 추가
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GroupPriceSyncDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
  groupName: string;
}

interface CustomerUsage {
  customer_id: string;
  customer_name: string;
  rate_ctn: number | "";
  rate_pack: number | "";
  orig_ctn: number;
  orig_pack: number;
  is_modified: boolean;
}

interface GroupProductSummary {
  product_id: string;
  product_name: string;
  product_code: string;
  users: CustomerUsage[];
  has_changes: boolean;
}

export default function GroupPriceSyncDialog({ isOpen, onClose, groupId, groupName }: GroupPriceSyncDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false); 
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [items, setItems] = useState<GroupProductSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen && groupId) {
      setSearchTerm("");
      analyzeGroupPrices();
    }
  }, [isOpen, groupId]);

  const analyzeGroupPrices = async () => {
    setLoading(true);
    
    const { data: customers } = await supabase.from("customers").select("id, name").eq("group_id", groupId);
    if (!customers || customers.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const customerIds = customers.map(c => c.id);

    const { data: cpData } = await supabase
      .from("customer_products")
      .select("customer_id, product_id, custom_price_ctn, custom_price_pack, products(product_name, product_barcode)")
      .in("customer_id", customerIds);

    if (!cpData) {
      setLoading(false);
      return;
    }

    const productMap = new Map<string, GroupProductSummary>();

    cpData.forEach((row: any) => {
      const pid = row.product_id;
      const prodInfo = row.products;

      if (!productMap.has(pid)) {
        productMap.set(pid, {
          product_id: pid,
          product_name: prodInfo?.product_name || "Unknown",
          product_code: prodInfo?.product_barcode || "-",
          users: [],
          has_changes: false
        });
      }

      const item = productMap.get(pid)!;
      const cName = customerMap.get(row.customer_id) || "Unknown";
      
      const rCtn = row.custom_price_ctn || 0;
      const rPack = row.custom_price_pack || 0;

      item.users.push({
        customer_id: row.customer_id,
        customer_name: cName,
        rate_ctn: rCtn,
        rate_pack: rPack,
        orig_ctn: rCtn,
        orig_pack: rPack,
        is_modified: false
      });
    });

    const result = Array.from(productMap.values());
    result.sort((a, b) => a.product_name.localeCompare(b.product_name));

    setItems(result);
    setLoading(false);
  };

  const handleUserRateChange = (pid: string, cid: string, type: 'ctn' | 'pack', val: string) => {
    const numVal = parseFloat(val);
    const newValue = val === "" ? "" : (isNaN(numVal) ? 0 : numVal);

    setItems(prev => prev.map(item => {
      if (item.product_id !== pid) return item;

      const updatedUsers = item.users.map(u => {
        if (u.customer_id !== cid) return u;

        const updatedUser = {
            ...u,
            [type === 'ctn' ? 'rate_ctn' : 'rate_pack']: newValue
        };

        const ctnChanged = (updatedUser.rate_ctn === "" ? 0 : updatedUser.rate_ctn) !== u.orig_ctn;
        const packChanged = (updatedUser.rate_pack === "" ? 0 : updatedUser.rate_pack) !== u.orig_pack;
        
        updatedUser.is_modified = ctnChanged || packChanged;
        return updatedUser;
      });

      return {
        ...item,
        users: updatedUsers,
        has_changes: updatedUsers.some(u => u.is_modified)
      };
    }));
  };

  // [NEW] 최대 할인율로 통일하는 함수 (Action Button)
  const handleSyncToMax = (pid: string) => {
    setItems(prev => prev.map(item => {
      if (item.product_id !== pid) return item;

      // 1. 현재 그룹 내 최대 할인율 찾기
      let maxCtn = 0;
      let maxPack = 0;

      item.users.forEach(u => {
        const ctn = typeof u.rate_ctn === 'number' ? u.rate_ctn : 0;
        const pack = typeof u.rate_pack === 'number' ? u.rate_pack : 0;
        if (ctn > maxCtn) maxCtn = ctn;
        if (pack > maxPack) maxPack = pack;
      });

      // 2. 모든 유저에게 최대값 적용 (UI 상태만 변경)
      const updatedUsers = item.users.map(u => {
        const newCtn = maxCtn;
        const newPack = maxPack;
        
        // 변경 여부 체크
        const isModified = newCtn !== u.orig_ctn || newPack !== u.orig_pack;

        return {
          ...u,
          rate_ctn: newCtn,
          rate_pack: newPack,
          is_modified: isModified
        };
      });

      return {
        ...item,
        users: updatedUsers,
        has_changes: updatedUsers.some(u => u.is_modified) // 하나라도 변경되었으면 true
      };
    }));
  };

  const handleSaveRow = async (item: GroupProductSummary) => {
    const changedUsers = item.users.filter(u => u.is_modified);
    if (changedUsers.length === 0) return;
    
    setSavingRowId(item.product_id);

    const upsertData = changedUsers.map(u => ({
        customer_id: u.customer_id,
        product_id: item.product_id,
        custom_price_ctn: u.rate_ctn === "" ? 0 : u.rate_ctn,
        custom_price_pack: u.rate_pack === "" ? 0 : u.rate_pack,
        updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
        .from("customer_products")
        .upsert(upsertData, { onConflict: "customer_id, product_id" });

    if (error) {
        alert("Error updating: " + error.message);
    } else {
        setItems(prev => prev.map(curr => {
            if (curr.product_id !== item.product_id) return curr;
            
            const syncedUsers = curr.users.map(u => ({
                ...u,
                orig_ctn: u.rate_ctn === "" ? 0 : u.rate_ctn,
                orig_pack: u.rate_pack === "" ? 0 : u.rate_pack,
                is_modified: false
            }));

            return { ...curr, users: syncedUsers, has_changes: false };
        }));
    }
    setSavingRowId(null);
  };

  const handleSaveAll = async () => {
    const modifiedItems = items.filter(i => i.has_changes);
    if (modifiedItems.length === 0) return;

    if (!confirm(`Save changes for ${modifiedItems.length} products?`)) return;

    setSavingAll(true);

    const allUpsertData = [];
    
    for (const item of modifiedItems) {
        const changedUsers = item.users.filter(u => u.is_modified);
        for (const u of changedUsers) {
            allUpsertData.push({
                customer_id: u.customer_id,
                product_id: item.product_id,
                custom_price_ctn: u.rate_ctn === "" ? 0 : u.rate_ctn,
                custom_price_pack: u.rate_pack === "" ? 0 : u.rate_pack,
                updated_at: new Date().toISOString()
            });
        }
    }

    if (allUpsertData.length > 0) {
        const { error } = await supabase
            .from("customer_products")
            .upsert(allUpsertData, { onConflict: "customer_id, product_id" });

        if (error) {
            alert("Error saving all: " + error.message);
        } else {
            alert("All changes saved successfully!");
            analyzeGroupPrices();
        }
    }
    setSavingAll(false);
  };

  const filteredItems = items.filter(i => 
    i.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.product_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-indigo-600" /> Group Price Management
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Adjust individual rates for <span className="font-bold text-indigo-600">{groupName}</span> group members.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
        </div>

        <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <Input 
              placeholder="Filter products..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-xs text-slate-400 font-medium">
             Modified items are highlighted. Click <strong className="text-indigo-600"><ChevronsUp className="w-3 h-3 inline"/></strong> to sync everyone to the highest rate.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-white text-slate-500 font-bold sticky top-0 z-10 shadow-sm text-xs uppercase">
              <tr>
                <th className="px-6 py-4 w-[25%] border-b">Product Info</th>
                <th className="px-4 py-4 w-[5%] border-b text-center">Count</th>
                
                <th className="px-4 py-4 w-[60%] border-b border-l border-slate-100 bg-slate-50/50">
                    <div className="flex justify-between items-center px-2">
                        <span>Customer Rates</span>
                        <div className="flex gap-8 text-[10px] text-slate-400 font-normal normal-case mr-4">
                            <span>CTN Discount %</span>
                            <span>PACK Discount %</span>
                        </div>
                    </div>
                </th>
                
                <th className="px-4 py-4 w-[10%] border-b text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
               {loading ? (
                   <tr><td colSpan={4} className="p-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-300"/></td></tr>
               ) : filteredItems.length === 0 ? (
                   <tr><td colSpan={4} className="p-20 text-center text-slate-400">No items found for this group.</td></tr>
               ) : filteredItems.map(item => (
                   <tr key={item.product_id} className={`hover:bg-slate-50 transition-colors ${item.has_changes ? "bg-indigo-50/20" : ""}`}>
                       <td className="px-6 py-4 align-top">
                           <div className="font-bold text-slate-700">{item.product_name}</div>
                           <div className="text-xs text-slate-400 font-mono mt-1">{item.product_code}</div>
                       </td>

                       <td className="px-4 py-4 text-center align-top pt-5">
                           <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200">
                               {item.users.length}
                           </span>
                       </td>

                       <td className="px-4 py-3 align-top border-l border-slate-100">
                           <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                               {item.users.map(u => (
                                   <div key={u.customer_id} className={`flex items-center justify-between p-2 rounded-lg border transition-all ${u.is_modified ? "bg-white border-indigo-300 shadow-sm" : "bg-slate-50/50 border-transparent hover:border-slate-200"}`}>
                                       
                                       <div className="flex items-center gap-2 w-[40%]">
                                            <div className={`p-1 rounded-full ${u.is_modified ? "bg-indigo-100 text-indigo-600" : "bg-slate-200 text-slate-500"}`}>
                                                <User className="w-3 h-3" />
                                            </div>
                                            <span className={`text-xs font-bold truncate ${u.is_modified ? "text-indigo-700" : "text-slate-600"}`} title={u.customer_name}>
                                                {u.customer_name}
                                            </span>
                                            {u.is_modified && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse ml-1"></div>}
                                       </div>

                                       <div className="flex items-center gap-3 w-[55%] justify-end">
                                            <div className="relative w-20">
                                                <Input 
                                                    className={`h-7 text-center text-xs pr-4 font-bold ${u.is_modified ? "border-indigo-300 text-indigo-700 bg-indigo-50" : "border-slate-200 text-slate-600"}`}
                                                    value={u.rate_ctn}
                                                    onChange={(e) => handleUserRateChange(item.product_id, u.customer_id, 'ctn', e.target.value)}
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-1.5 top-1.5 text-[9px] text-slate-400">C</span>
                                            </div>

                                            <div className="relative w-20">
                                                <Input 
                                                    className={`h-7 text-center text-xs pr-4 font-bold ${u.is_modified ? "border-indigo-300 text-indigo-700 bg-indigo-50" : "border-slate-200 text-slate-600"}`}
                                                    value={u.rate_pack}
                                                    onChange={(e) => handleUserRateChange(item.product_id, u.customer_id, 'pack', e.target.value)}
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-1.5 top-1.5 text-[9px] text-slate-400">P</span>
                                            </div>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       </td>

                       {/* Action Column */}
                       <td className="px-4 py-4 text-center align-middle">
                           <div className="flex flex-col items-center gap-2">
                               {/* [NEW] Max Sync Button */}
                               <Button 
                                    size="sm"
                                    onClick={() => handleSyncToMax(item.product_id)}
                                    className="h-8 w-8 p-0 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 shadow-sm"
                                    title="Sync all to HIGHEST discount rate"
                               >
                                   <ChevronsUp className="w-4 h-4"/>
                               </Button>

                               {/* Row Save Button */}
                               <Button 
                                    size="sm"
                                    onClick={() => handleSaveRow(item)}
                                    disabled={!item.has_changes || savingRowId === item.product_id}
                                    className={`h-8 w-8 p-0 rounded-full transition-all ${
                                        item.has_changes 
                                        ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 scale-100" 
                                        : "bg-slate-100 text-slate-300 scale-90 opacity-50 cursor-not-allowed"
                                    }`}
                                    title={item.has_changes ? "Save changes" : "No changes"}
                               >
                                   {savingRowId === item.product_id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                               </Button>
                           </div>
                       </td>
                   </tr>
               ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center z-30">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <AlertCircle className="w-3 h-3"/>
            <span>Use the 'Max' icon to unify rates, then 'Save' to apply.</span>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            
            <Button 
                onClick={handleSaveAll} 
                disabled={savingAll || !items.some(i => i.has_changes)} 
                className="bg-slate-900 hover:bg-slate-800 text-white min-w-[150px] shadow-lg shadow-slate-200"
            >
                {savingAll ? <><Loader2 className="w-4 h-4 animate-spin mr-2"/> Saving All...</> : <><Save className="w-4 h-4 mr-2"/> Save All Changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}