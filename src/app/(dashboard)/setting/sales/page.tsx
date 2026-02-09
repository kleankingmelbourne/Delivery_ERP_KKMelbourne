"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, 
  UserCircle, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ArrowRightLeft,
  ChevronDown // [추가] 화살표 아이콘 import
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// --- Types ---
interface Customer {
  id: string;
  name: string;
  in_charge_sale: string | null; 
}

interface SalesRep {
  id: string;
  display_name: string;
}

export default function SalesInchargePage() {
  const supabase = createClient();

  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRepId, setFilterRepId] = useState<string>("all");

  // Bulk Action State
  const [bulkTargetRepId, setBulkTargetRepId] = useState<string>("");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  
  // Inline Update State
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateSuccessId, setUpdateSuccessId] = useState<string | null>(null);

  // 1. 초기 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1) Sales Reps
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("status", "active")
          .order("display_name");

        if (profileData) setSalesReps(profileData);

        // 2) Customers
        const { data: customerData } = await supabase
          .from("customers")
          .select("id, name, in_charge_sale")
          .order("name");

        if (customerData) setCustomers(customerData);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 2. 필터링 로직
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesRep = true;
    if (filterRepId === "all") matchesRep = true;
    else if (filterRepId === "unassigned") matchesRep = c.in_charge_sale === null;
    else matchesRep = c.in_charge_sale === filterRepId;

    return matchesSearch && matchesRep;
  });

  const unassignedCount = customers.filter(c => c.in_charge_sale === null).length;

  // 3. 개별 변경 (Inline Edit)
  const handleSalesChange = async (customerId: string, newSalesId: string) => {
    setUpdatingId(customerId);
    setUpdateSuccessId(null);
    const valueToSave = newSalesId === "" ? null : newSalesId;

    try {
      const { error } = await supabase
        .from("customers")
        .update({ in_charge_sale: valueToSave })
        .eq("id", customerId);

      if (error) throw error;

      setCustomers((prev) => 
        prev.map((c) => c.id === customerId ? { ...c, in_charge_sale: valueToSave } : c)
      );

      setUpdateSuccessId(customerId);
      setTimeout(() => setUpdateSuccessId(null), 2000);
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  // 4. 일괄 변경 (Bulk Update)
  const handleBulkUpdate = async () => {
    if (!bulkTargetRepId) return alert("Please select a target Sales Rep.");
    if (filteredCustomers.length === 0) return alert("No customers to update.");

    const targetName = salesReps.find(r => r.id === bulkTargetRepId)?.display_name || "Unassigned";
    const confirmMsg = `Are you sure you want to assign ${filteredCustomers.length} customers to "${targetName}"?`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsBulkUpdating(true);
    const valueToSave = bulkTargetRepId === "unassigned" ? null : bulkTargetRepId;
    const targetIds = filteredCustomers.map(c => c.id);

    try {
      const { error } = await supabase
        .from("customers")
        .update({ in_charge_sale: valueToSave })
        .in("id", targetIds);

      if (error) throw error;

      setCustomers(prev => 
        prev.map(c => targetIds.includes(c.id) ? { ...c, in_charge_sale: valueToSave } : c)
      );

      alert("Bulk update successful!");
      setBulkTargetRepId("");

    } catch (err: any) {
      alert("Bulk update failed: " + err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 pb-20">
      
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserCircle className="w-7 h-7 text-blue-600" />
            Set Sales Incharge
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage and re-assign sales representatives.
          </p>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
            <span className="text-xl font-black text-slate-800">{customers.length}</span>
          </div>
          <div className="bg-red-50 px-4 py-2 rounded-lg border border-red-100 shadow-sm flex flex-col items-center min-w-[100px]">
            <span className="text-[10px] uppercase font-bold text-red-400">Unassigned</span>
            <span className="text-xl font-black text-red-600">{unassignedCount}</span>
          </div>
        </div>
      </div>

      {/* Bulk Action Tool Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <ArrowRightLeft className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700 uppercase">Bulk Assignment Tool</h3>
        </div>
        
        <div className="flex flex-col xl:flex-row gap-4 items-end xl:items-center justify-between">
          
          {/* Left: Filter (Source) */}
          <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
            <div className="space-y-1.5 w-full sm:w-64">
              <label className="text-xs font-bold text-slate-500 ml-1">1. Filter Customers By:</label>
              <div className="relative">
                <select
                  className="w-full h-10 pl-3 pr-10 rounded-md border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-slate-900 outline-none appearance-none font-medium transition-shadow"
                  value={filterRepId}
                  onChange={(e) => setFilterRepId(e.target.value)}
                >
                  <option value="all">Show All Customers</option>
                  <option value="unassigned">⚠️ Unassigned Only</option>
                  <optgroup label="Sales Reps">
                    {salesReps.map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.display_name}</option>
                    ))}
                  </optgroup>
                </select>
                {/* [수정] 상단 필터용 화살표 아이콘 */}
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5 w-full sm:w-64">
              <label className="text-xs font-bold text-slate-500 ml-1">Search Name:</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search customer..." 
                  className="pl-9 h-10 bg-white border-slate-300"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Right: Action (Target) */}
          <div className="flex items-end gap-3 w-full xl:w-auto bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="space-y-1.5 flex-1 w-full sm:w-64">
              <label className="text-xs font-bold text-blue-600 ml-1">2. Assign filtered ({filteredCustomers.length}) to:</label>
              <div className="relative">
                <select
                  className="w-full h-10 pl-3 pr-10 rounded-md border border-blue-200 bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-shadow"
                  value={bulkTargetRepId}
                  onChange={(e) => setBulkTargetRepId(e.target.value)}
                >
                  <option value="">Select New Sales Rep...</option>
                  <option value="unassigned">-- Unassign (Clear) --</option>
                  {salesReps.map(rep => (
                    <option key={rep.id} value={rep.id}>{rep.display_name}</option>
                  ))}
                </select>
                {/* [수정] 상단 타겟용 화살표 아이콘 */}
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
              </div>
            </div>
            
            <Button 
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating || filteredCustomers.length === 0 || !bulkTargetRepId}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 w-32 shrink-0 shadow-sm"
            >
              {isBulkUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Move All"}
            </Button>
          </div>

        </div>
      </div>

      {/* Main List Table */}
      <Card className="border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-xs">
              <tr>
                <th className="px-6 py-3 w-[40%]">Customer Name</th>
                <th className="px-6 py-3 w-[40%]">Assigned Sales Rep</th>
                <th className="px-6 py-3 w-[20%] text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading customers...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-slate-400 italic">
                    No customers found matching current filters.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const isUpdating = updatingId === customer.id;
                  const isSuccess = updateSuccessId === customer.id;
                  const isUnassigned = !customer.in_charge_sale;

                  return (
                    <tr key={customer.id} className={cn("hover:bg-slate-50 transition-colors", isUnassigned && "bg-red-50/30")}>
                      
                      {/* Customer Name */}
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-900">{customer.name}</div>
                        {isUnassigned && (
                          <span className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" /> No Sales Rep
                          </span>
                        )}
                      </td>

                      {/* Dropdown (Inline Edit) */}
                      <td className="px-6 py-3">
                        <div className="relative">
                          <select
                            className={cn(
                              "w-full max-w-xs h-10 pl-3 pr-10 rounded-md border text-sm appearance-none outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer font-medium",
                              isUnassigned 
                                ? "border-red-300 bg-white text-slate-500 hover:border-red-400" 
                                : "border-slate-200 bg-slate-50 text-slate-900 hover:border-blue-300 hover:bg-white"
                            )}
                            value={customer.in_charge_sale || ""}
                            onChange={(e) => handleSalesChange(customer.id, e.target.value)}
                            disabled={isUpdating}
                          >
                            <option value="">-- Select Sales Rep --</option>
                            {salesReps.map((rep) => (
                              <option key={rep.id} value={rep.id}>
                                {rep.display_name}
                              </option>
                            ))}
                          </select>
                          {/* [수정] 테이블 내 드롭다운 화살표 아이콘 교체 및 위치 조정 */}
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Status Indicator */}
                      <td className="px-6 py-3 text-center">
                        {isUpdating && (
                          <div className="flex items-center justify-center text-blue-600 text-xs font-medium animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving...
                          </div>
                        )}
                        {isSuccess && (
                          <div className="flex items-center justify-center text-emerald-600 text-xs font-bold animate-in zoom-in duration-300">
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Saved
                          </div>
                        )}
                        {!isUpdating && !isSuccess && (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
