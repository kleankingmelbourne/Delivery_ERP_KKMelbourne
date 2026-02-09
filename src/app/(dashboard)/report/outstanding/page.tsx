"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, Filter, RefreshCw, 
  Banknote, Download, AlertCircle,
  ChevronDown, Check, FileText, Calendar, Users, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// --- [Utility] Searchable Select ---
interface Option { id: string; label: string; }
interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
function SearchableSelect({ options, value, onChange, placeholder = "Select..." }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm border border-slate-200 rounded-md cursor-pointer bg-white hover:border-slate-400"
      >
        <span className={selected ? "text-slate-900 font-medium" : "text-slate-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto p-1">
          <div className="sticky top-0 bg-white pb-1 border-b border-slate-100 mb-1">
            <input
              autoFocus
              className="w-full px-2 py-1 text-sm outline-none placeholder:text-slate-300"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div 
            onClick={() => { onChange(""); setIsOpen(false); setSearchTerm(""); }}
            className="px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer rounded"
          >
            All Customers
          </div>
          {filtered.map(opt => (
            <div 
              key={opt.id}
              onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }}
              className={`px-2 py-1.5 text-sm cursor-pointer rounded flex justify-between items-center ${opt.id === value ? "bg-slate-100 font-bold" : "hover:bg-slate-50"}`}
            >
              {opt.label}
              {opt.id === value && <Check className="w-3.5 h-3.5" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Types ---
interface MonthlyData {
  amount: number;
  count: number;
}

// [MODE 1] By Customer Data Type
interface OutstandingByCustomer {
  customerId: string;
  customerName: string;
  salesRepName: string; 
  totalOutstanding: number;
  invoiceCount: number;
  monthlyBreakdown: Record<string, MonthlyData>;
}

// [MODE 2] By Date Data Type
interface CustomerInMonth {
  customerName: string;
  salesRepName: string;
  amount: number;
  count: number;
}
interface OutstandingByDate {
  monthKey: string;
  totalAmount: number;
  totalCount: number;
  customers: CustomerInMonth[];
}

export default function OutstandingReportPage() {
  const supabase = createClient();
  
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  
  // View Mode
  const [viewMode, setViewMode] = useState<"customer" | "date">("customer");

  // Data
  const [customers, setCustomers] = useState<Option[]>([]);
  // [NEW] Maps for fast lookup
  const [salesProfileMap, setSalesProfileMap] = useState<Record<string, string>>({});
  
  // Results
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [dataByCustomer, setDataByCustomer] = useState<OutstandingByCustomer[]>([]);
  const [dataByDate, setDataByDate] = useState<OutstandingByDate[]>([]);
  const [monthColumns, setMonthColumns] = useState<string[]>([]);
  
  const [totalSum, setTotalSum] = useState(0); 
  const [totalCount, setTotalCount] = useState(0);

  // 1. Init Data (Customers)
  useEffect(() => {
    const loadData = async () => {
      // Customers List (필터용)
      const { data: cData } = await supabase.from("customers").select("id, name").order("name");
      if (cData) {
        setCustomers(cData.map(c => ({ id: c.id, label: c.name })));
      }
    };
    loadData();
  }, []);

  // 2. Generate Report Logic
  const handleGenerateReport = async () => {
    setLoading(true);
    setHasSearched(true);
    
    // Reset
    setDataByCustomer([]);
    setDataByDate([]);
    setMonthColumns([]);
    setTotalSum(0);
    setTotalCount(0);

    try {
      // Step A: Load Profiles (Sales Reps) FRESHLY
      // [FIXED] 오직 존재하는 컬럼(id, display_name)만 조회하여 에러 방지
      const { data: profileData, error: pError } = await supabase
        .from("profiles")
        .select("id, display_name");
      
      if (pError) console.error("Profile Fetch Error:", pError);
      
      const pMap: Record<string, string> = {};
      if (profileData) {
        profileData.forEach((p: any) => {
          // display_name이 없으면 'No Name'으로 표시
          pMap[p.id] = p.display_name || "No Name";
        });
      }

      // Step B: Fetch Invoices WITH Customer Info
      // customers 테이블을 조인해서 in_charge_sale ID를 가져옵니다.
      let query = supabase
        .from("invoices")
        .select(`
          id, invoice_date, total_amount, paid_amount, customer_id,
          customers ( name, in_charge_sale )
        `)
        .neq("status", "Paid")
        .order("invoice_date", { ascending: true });

      if (startDate) query = query.gte("invoice_date", startDate);
      if (endDate) query = query.lte("invoice_date", endDate);
      if (selectedCustomerId) query = query.eq("customer_id", selectedCustomerId);

      const { data, error } = await query;
      if (error) throw error;

      // Step C: Process Data
      let grandTotal = 0;
      let grandCount = 0;
      const monthsSet = new Set<string>();

      const customerMap = new Map<string, OutstandingByCustomer>();
      const dateMap = new Map<string, { totalAmount: number, totalCount: number, custMap: Map<string, CustomerInMonth> }>();

      if (data) {
        data.forEach((inv: any) => {
          const balance = inv.total_amount - (inv.paid_amount || 0);
          if (balance <= 0.01) return; // Skip completed

          const dateObj = new Date(inv.invoice_date);
          const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          monthsSet.add(monthKey);
          
          const cid = inv.customer_id;
          const cName = inv.customers?.name || "Unknown";
          
          // [LOGIC] Sales Rep Mapping
          const salesId = inv.customers?.in_charge_sale;
          // ID가 있으면 맵에서 찾고, 맵에 없으면(삭제된 직원 등) Unknown 처리
          const sName = salesId ? (pMap[salesId] || "Unknown Staff") : "-";

          // --- Process By Customer ---
          if (!customerMap.has(cid)) {
            customerMap.set(cid, {
              customerId: cid,
              customerName: cName,
              salesRepName: sName,
              totalOutstanding: 0,
              invoiceCount: 0,
              monthlyBreakdown: {}
            });
          }
          const cGroup = customerMap.get(cid)!;
          cGroup.totalOutstanding += balance;
          cGroup.invoiceCount += 1;
          
          if (!cGroup.monthlyBreakdown[monthKey]) cGroup.monthlyBreakdown[monthKey] = { amount: 0, count: 0 };
          cGroup.monthlyBreakdown[monthKey].amount += balance;
          cGroup.monthlyBreakdown[monthKey].count += 1;

          // --- Process By Date ---
          if (!dateMap.has(monthKey)) {
            dateMap.set(monthKey, { totalAmount: 0, totalCount: 0, custMap: new Map() });
          }
          const dGroup = dateMap.get(monthKey)!;
          dGroup.totalAmount += balance;
          dGroup.totalCount += 1;

          if (!dGroup.custMap.has(cid)) {
            dGroup.custMap.set(cid, { 
              customerName: cName, 
              salesRepName: sName,
              amount: 0, 
              count: 0 
            });
          }
          const dCust = dGroup.custMap.get(cid)!;
          dCust.amount += balance;
          dCust.count += 1;

          grandTotal += balance;
          grandCount += 1;
        });
      }

      const sortedByCustomer = Array.from(customerMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
      
      const sortedMonths = Array.from(monthsSet).sort();
      const sortedByDate: OutstandingByDate[] = sortedMonths.map(mKey => {
        const dGroup = dateMap.get(mKey)!;
        const sortedCustomers = Array.from(dGroup.custMap.values()).sort((a, b) => b.amount - a.amount);
        return {
          monthKey: mKey,
          totalAmount: dGroup.totalAmount,
          totalCount: dGroup.totalCount,
          customers: sortedCustomers
        };
      });

      setDataByCustomer(sortedByCustomer);
      setDataByDate(sortedByDate);
      setMonthColumns(sortedMonths);
      setTotalSum(grandTotal);
      setTotalCount(grandCount);

    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Excel Download ---
  const handleDownloadExcel = () => {
    if (totalCount === 0) return alert("No data to export.");

    const workbook = XLSX.utils.book_new();

    if (viewMode === "customer") {
      const rows = dataByCustomer.map(row => {
        const excelRow: any = {
          "Customer Name": row.customerName,
          "Sales Rep": row.salesRepName,
          "Total Due ($)": row.totalOutstanding,
          "Total Count": row.invoiceCount
        };
        monthColumns.forEach(month => {
          const mData = row.monthlyBreakdown[month];
          excelRow[`${month} Amt`] = mData ? mData.amount : 0;
          excelRow[`${month} Qty`] = mData ? mData.count : 0;
        });
        return excelRow;
      });
      
      const totalRow: any = { 
        "Customer Name": "GRAND TOTAL", 
        "Sales Rep": "",
        "Total Due ($)": totalSum, 
        "Total Count": totalCount 
      };
      monthColumns.forEach(month => {
        const sum = dataByCustomer.reduce((acc, r) => acc + (r.monthlyBreakdown[month]?.amount || 0), 0);
        const cnt = dataByCustomer.reduce((acc, r) => acc + (r.monthlyBreakdown[month]?.count || 0), 0);
        totalRow[`${month} Amt`] = sum;
        totalRow[`${month} Qty`] = cnt;
      });
      rows.push(totalRow);
      
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, "By Customer");

    } else {
      const rows: any[] = [];
      dataByDate.forEach(group => {
        rows.push({ 
          "Month": group.monthKey, 
          "Customer": "Monthly Total", 
          "Sales Rep": "",
          "Count": group.totalCount, 
          "Amount": group.totalAmount 
        });
        group.customers.forEach(c => {
          rows.push({
            "Month": group.monthKey,
            "Customer": c.customerName,
            "Sales Rep": c.salesRepName,
            "Count": c.count,
            "Amount": c.amount
          });
        });
        rows.push({}); 
      });
      
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, ws, "By Date");
    }

    XLSX.writeFile(workbook, `OutstandingReport_${viewMode}_${startDate || 'All'}.xlsx`);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Banknote className="w-6 h-6 text-red-600" />
            Outstanding Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Breakdown of unpaid invoices.
          </p>
        </div>
        {hasSearched && totalCount > 0 && (
          <Button onClick={handleDownloadExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <Download className="w-4 h-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      {/* Configuration */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Filter className="w-4 h-4" /> Configuration
          </h2>
          
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setViewMode("customer")}
              className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all", viewMode === "customer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <Users className="w-3.5 h-3.5" /> By Customer
            </button>
            <button 
              onClick={() => setViewMode("date")}
              className={cn("flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all", viewMode === "date" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <Calendar className="w-3.5 h-3.5" /> By Date
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Start Date (Optional)</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-slate-600"/>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">End Date (Optional)</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-slate-600"/>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Customer (Optional)</label>
            <SearchableSelect options={customers} value={selectedCustomerId} onChange={setSelectedCustomerId} placeholder="All Customers" />
          </div>
          <div className="pt-1">
            <Button onClick={handleGenerateReport} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Generate Report
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      {!hasSearched ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Click Generate to see the outstanding balances.</p>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-red-500 shadow-sm bg-red-50/30">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-red-700 uppercase flex justify-between">Total Outstanding Balance <Banknote className="w-4 h-4 text-red-600" /></CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-black text-red-700">${totalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
            </Card>
            <Card className="border-l-4 border-l-slate-500 shadow-sm bg-white">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Total Outstanding Invoices <FileText className="w-4 h-4 text-slate-500" /></CardTitle></CardHeader>
              <CardContent><div className="text-3xl font-black text-slate-800">{totalCount.toLocaleString()} <span className="text-lg font-medium text-slate-400">Invoices</span></div></CardContent>
            </Card>
          </div>

          {/* [VIEW 1] By Customer */}
          {viewMode === "customer" && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 bg-slate-50 sticky left-0 z-20 border-r border-slate-200 min-w-[200px]">Customer</th>
                      <th className="px-4 py-3 bg-slate-50 text-center min-w-[120px] border-r border-slate-200">Sales Rep</th>
                      <th className="px-4 py-3 bg-slate-50 text-right min-w-[120px] text-red-600 border-r border-slate-200">Total Due</th>
                      <th className="px-4 py-3 bg-slate-50 text-center min-w-[80px] border-r border-slate-200">Inv. Qty</th>
                      {monthColumns.map(month => (
                        <th key={month} className="px-4 py-3 text-right min-w-[100px] whitespace-nowrap bg-slate-50 border-r border-slate-100">{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dataByCustomer.map((row) => (
                      <tr key={row.customerId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-800 sticky left-0 bg-white border-r border-slate-100">{row.customerName}</td>
                        <td className="px-4 py-3 text-center text-slate-600 border-r border-slate-100 text-xs">
                          {row.salesRepName !== "-" ? (
                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium">{row.salesRepName}</span>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-red-600 border-r border-slate-100 bg-red-50/10">${row.totalOutstanding.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-600 border-r border-slate-100">{row.invoiceCount}</td>
                        {monthColumns.map(month => {
                          const mData = row.monthlyBreakdown[month];
                          return (
                            <td key={month} className="px-4 py-2 text-right text-slate-600 border-r border-slate-50 align-top">
                              {mData ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="font-bold text-slate-900 text-xs">${mData.amount.toLocaleString()}</span>
                                  <span className="text-[10px] text-white bg-slate-400 px-1.5 py-0.5 rounded-full inline-block font-bold">{mData.count}</span>
                                </div>
                              ) : <span className="text-slate-300 text-xs">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Grand Total Row */}
                    {dataByCustomer.length > 0 && (
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                        <td className="px-4 py-3 sticky left-0 bg-slate-100 border-r border-slate-300 text-slate-900">GRAND TOTAL</td>
                        <td className="px-4 py-3 border-r border-slate-300"></td>
                        <td className="px-4 py-3 text-right text-red-700 border-r border-slate-300">${totalSum.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center text-slate-800 border-r border-slate-300">{totalCount.toLocaleString()}</td>
                        {monthColumns.map(month => {
                          const sum = dataByCustomer.reduce((acc, r) => acc + (r.monthlyBreakdown[month]?.amount || 0), 0);
                          const cnt = dataByCustomer.reduce((acc, r) => acc + (r.monthlyBreakdown[month]?.count || 0), 0);
                          return (
                            <td key={month} className="px-4 py-3 text-right border-r border-slate-300 align-top">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-slate-900 text-xs">${sum.toLocaleString()}</span>
                                <span className="text-[10px] text-white bg-slate-500 px-1.5 py-0.5 rounded-full font-bold">{cnt}</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* [VIEW 2] By Date */}
          {viewMode === "date" && (
            <div className="space-y-6">
              {dataByDate.map((group) => (
                <div key={group.monthKey} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-slate-800 text-lg">{group.monthKey}</h3>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="font-medium text-slate-500">Invoices: <span className="text-slate-800 font-bold">{group.totalCount}</span></span>
                      <span className="font-medium text-slate-500">Total: <span className="text-red-600 font-bold">${group.totalAmount.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className="bg-white border-b border-slate-100 text-slate-500 text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-2">Customer</th>
                        <th className="px-6 py-2">Sales Rep</th>
                        <th className="px-6 py-2 text-right">Qty</th>
                        <th className="px-6 py-2 text-right">Outstanding Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {group.customers.map((cust, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-700">{cust.customerName}</td>
                          <td className="px-6 py-3 text-slate-500 text-xs">
                            {cust.salesRepName !== "-" ? <span className="flex items-center gap-1"><User className="w-3 h-3"/> {cust.salesRepName}</span> : "-"}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-full">{cust.count} EA</span>
                          </td>
                          <td className="px-6 py-3 text-right font-bold text-red-600">${cust.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {dataByDate.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                  No outstanding invoices found.
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}