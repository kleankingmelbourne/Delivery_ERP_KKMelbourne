"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Calendar, Search, Filter, RefreshCw, 
  DollarSign, CreditCard, Clock, AlertCircle,
  ChevronDown, Check, ChevronUp, Download, Receipt
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

// --- [Utility] Date Diff Calculator ---
const getDaysDiff = (date1: string, date2: string) => {
  if (!date1 || !date2) return 0;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// --- Types ---
interface Allocation {
  amount: number;
  invoice_id: string;
  invoices: {
    id: string;
    invoice_date: string;
    total_amount: number;
  } | null;
}

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  unallocated_amount: number;
  category: string;
  reason: string;
  customer_id: string;
  customers: { name: string } | null;
  payment_allocations: Allocation[];
}

interface UnpaidInvoice {
  id: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  customer_id: string;
  customers: { name: string } | null;
}

// [NEW] Grouped Type for Customer Aggregation
interface GroupedPaymentData {
  customer_id: string;
  customer_name: string;
  total_received: number;
  total_credit: number;
  last_payment_date: string;
  payments: Payment[]; // Individual payments for detail view
  
  // Outstanding info for this customer
  outstanding_invoices: UnpaidInvoice[];
  total_outstanding: number;
}

interface ReportSummary {
  totalReceived: number;
  totalOutstanding: number;
  avgPayDays: number;
}

export default function PaymentReportPage() {
  const supabase = createClient();
  
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Data
  const [customers, setCustomers] = useState<Option[]>([]);
  
  // Results
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // [CHANGED] Store Grouped Data instead of raw list
  const [groupedList, setGroupedList] = useState<GroupedPaymentData[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({ totalReceived: 0, totalOutstanding: 0, avgPayDays: 0 });
  
  // UI State
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // 1. Init Data
  useEffect(() => {
    const loadData = async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      if (data) setCustomers(data.map(c => ({ id: c.id, label: c.name })));
    };
    loadData();
  }, []);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 2. Generate Report Logic
  const handleGenerateReport = async () => {
    if (!startDate || !endDate) return alert("Please select a date range.");

    setLoading(true);
    setHasSearched(true);
    setExpandedRows({});

    try {
      // --- A. Fetch Payments & Allocations ---
      let paymentQuery = supabase
        .from("payments")
        .select(`
          id, payment_date, amount, unallocated_amount, category, reason, customer_id,
          customers ( name ),
          payment_allocations!payment_allocations_payment_id_fkey (
            amount,
            invoices ( id, invoice_date, total_amount )
          )
        `)
        .gte("payment_date", startDate)
        .lte("payment_date", endDate)
        .order("payment_date", { ascending: false });

      if (selectedCustomerId) {
        paymentQuery = paymentQuery.eq("customer_id", selectedCustomerId);
      }

      const { data: payData, error: payError } = await paymentQuery;
      if (payError) throw payError;

      // --- B. Fetch Outstanding Invoices ---
      let unpaidQuery = supabase
        .from("invoices")
        .select(`
          id, invoice_date, due_date, total_amount, paid_amount, status, customer_id,
          customers ( name )
        `)
        .neq("status", "Paid")
        .order("invoice_date", { ascending: true });

      if (selectedCustomerId) {
        unpaidQuery = unpaidQuery.eq("customer_id", selectedCustomerId);
      }

      const { data: unpaidData, error: unpaidError } = await unpaidQuery;
      if (unpaidError) throw unpaidError;

      const rawPayments = payData as unknown as Payment[];
      const rawUnpaid = unpaidData as unknown as UnpaidInvoice[];

      // --- C. Grouping Logic ---
      const groupMap = new Map<string, GroupedPaymentData>();

      // 1. Group Payments
      rawPayments.forEach(pay => {
        if (!groupMap.has(pay.customer_id)) {
          groupMap.set(pay.customer_id, {
            customer_id: pay.customer_id,
            customer_name: pay.customers?.name || "Unknown Customer",
            total_received: 0,
            total_credit: 0,
            last_payment_date: pay.payment_date,
            payments: [],
            outstanding_invoices: [], // 채울 예정
            total_outstanding: 0      // 채울 예정
          });
        }
        
        const group = groupMap.get(pay.customer_id)!;
        group.total_received += pay.amount;
        group.total_credit += (pay.unallocated_amount || 0);
        group.payments.push(pay);
        
        // Update last date
        if (pay.payment_date > group.last_payment_date) {
          group.last_payment_date = pay.payment_date;
        }
      });

      // 2. Map Outstanding to Groups (Even if no payment made? Prompt implies showing payment report, so we focus on payers)
      // If you want to show customers who paid NOTHING but have outstanding, we need to loop rawUnpaid too.
      // For now, let's attach outstanding info to the customers who matched the payment filter or just map all outstanding.
      
      // Map Unpaid to corresponding groups (if exists)
      rawUnpaid.forEach(inv => {
         const cid = inv.customer_id;
         // Note: If a customer has outstanding debt but made NO payment in this period, 
         // they won't be in 'groupMap' currently. 
         // If you want ONLY customers who paid:
         if (groupMap.has(cid)) {
             const group = groupMap.get(cid)!;
             group.outstanding_invoices.push(inv);
             group.total_outstanding += (inv.total_amount - (inv.paid_amount || 0));
         }
      });

      // --- D. Stats Calculation ---
      const totalRecv = rawPayments.reduce((sum, p) => sum + p.amount, 0);
      const totalOut = rawUnpaid.reduce((sum, inv) => sum + (inv.total_amount - (inv.paid_amount || 0)), 0);

      let totalDays = 0;
      let count = 0;
      rawPayments.forEach((p) => {
        p.payment_allocations?.forEach((alloc: any) => {
          if (alloc.invoices?.invoice_date) {
            const days = getDaysDiff(p.payment_date, alloc.invoices.invoice_date);
            totalDays += Math.max(0, days);
            count++;
          }
        });
      });
      const avgDays = count > 0 ? totalDays / count : 0;

      // Final Set
      setGroupedList(Array.from(groupMap.values()));
      
      setSummary({
        totalReceived: totalRecv,
        totalOutstanding: totalOut,
        avgPayDays: avgDays
      });

    } catch (e: any) {
      console.error(e);
      alert("Error generating report: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Excel Download (Flattened View) ---
  const handleDownloadExcel = () => {
    if (!hasSearched) return;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Payment Details (Flattened)
    const payRows: any[] = [];
    groupedList.forEach(group => {
      group.payments.forEach(p => {
        payRows.push({
          "Customer": group.customer_name,
          "Payment Date": p.payment_date,
          "Amount ($)": p.amount,
          "Credit ($)": p.unallocated_amount || 0,
          "Category": p.category,
          "Reason": p.reason,
          "Allocated Invoice #": p.payment_allocations.map(a => a.invoices?.id.substring(0, 8)).join(", ")
        });
      });
    });
    
    const ws1 = XLSX.utils.aoa_to_sheet([
      ["Payment History Report"],
      ["Period:", startDate, "~", endDate],
      ["Avg Payment Days:", summary.avgPayDays.toFixed(1) + " Days"],
      []
    ]);
    XLSX.utils.sheet_add_json(ws1, payRows, { origin: "A5", skipHeader: false });
    XLSX.utils.book_append_sheet(workbook, ws1, "Payments");

    // Sheet 2: Outstanding
    const unpaidRows: any[] = [];
    groupedList.forEach(group => {
        group.outstanding_invoices.forEach(inv => {
            unpaidRows.push({
                "Customer": group.customer_name,
                "Invoice ID": inv.id.substring(0, 8),
                "Invoice Date": inv.invoice_date,
                "Due Date": inv.due_date,
                "Total Amount ($)": inv.total_amount,
                "Paid So Far ($)": inv.paid_amount,
                "Balance Due ($)": inv.total_amount - inv.paid_amount,
                "Status": inv.status
            });
        });
    });

    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Outstanding Invoices Report (For Selected Payers)"],
      ["Generated on:", new Date().toLocaleDateString()],
      []
    ]);
    XLSX.utils.sheet_add_json(ws2, unpaidRows, { origin: "A4", skipHeader: false });
    XLSX.utils.book_append_sheet(workbook, ws2, "Outstanding");

    XLSX.writeFile(workbook, `PaymentReport_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            Payment Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track received payments and outstanding balances.
          </p>
        </div>
        {hasSearched && (
          <Button onClick={handleDownloadExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <Download className="w-4 h-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      {/* Configuration */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
          <Filter className="w-4 h-4" /> Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Start Date <span className="text-red-500">*</span></label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">End Date <span className="text-red-500">*</span></label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
          <Calendar className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Select a date range to generate the payment report.</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-emerald-500 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Total Received <DollarSign className="w-4 h-4 text-emerald-500"/></CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-black text-slate-900">${summary.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Total Outstanding <AlertCircle className="w-4 h-4 text-red-500"/></CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900">${summary.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <p className="text-xs text-slate-400 mt-1">Current unpaid balance</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Avg. Pay Days <Clock className="w-4 h-4 text-blue-500"/></CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900">{summary.avgPayDays.toFixed(1)} <span className="text-sm font-normal text-slate-400">Days</span></div>
                <p className="text-xs text-slate-400 mt-1">Invoice date to Payment date</p>
              </CardContent>
            </Card>
          </div>

          {/* Customer Grouped Table */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" /> Payment Summary by Customer
            </h3>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-[40px]"></th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Last Pay Date</th>
                    <th className="px-4 py-3 text-right">Total Paid</th>
                    <th className="px-4 py-3 text-right text-blue-600">Total Credit</th>
                    <th className="px-4 py-3 text-right text-red-600">Total Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedList.map((group) => {
                    const isExpanded = expandedRows[group.customer_id];
                    return (
                      <React.Fragment key={group.customer_id}>
                        {/* Main Group Row */}
                        <tr 
                          onClick={() => toggleRow(group.customer_id)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-4 py-3 text-center">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">{group.customer_name}</td>
                          <td className="px-4 py-3 font-medium text-slate-600">{group.last_payment_date}</td>
                          <td className="px-4 py-3 text-right font-black text-emerald-600">${group.total_received.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-medium text-blue-600">
                             ${group.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">
                             ${group.total_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>

                        {/* Expanded Detail View */}
                        {isExpanded && (
                          <tr className="bg-emerald-50/30 animate-in fade-in slide-in-from-top-1">
                            <td colSpan={6} className="p-0 border-b border-slate-200">
                              <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 divide-y xl:divide-y-0 xl:divide-x divide-emerald-200">
                                
                                {/* Left: Individual Payments & Allocations */}
                                <div className="p-4">
                                  <p className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-2">
                                    <Receipt className="w-3 h-3" /> Payment Breakdown
                                  </p>
                                  <div className="space-y-3">
                                    {group.payments.map((pay, idx) => (
                                      <div key={idx} className="bg-white/60 rounded border border-emerald-100 p-3 text-xs">
                                        <div className="flex justify-between items-center mb-2">
                                          <div className="flex gap-2 items-center">
                                            <span className="font-bold text-slate-700">{pay.payment_date}</span>
                                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{pay.category}</span>
                                          </div>
                                          <span className="font-bold text-emerald-700 text-sm">${pay.amount.toLocaleString()}</span>
                                        </div>
                                        
                                        {/* Allocations Table inside Payment */}
                                        <table className="w-full text-[11px] text-left">
                                           <thead className="text-slate-400 border-b border-emerald-100/50">
                                             <tr>
                                               <th className="pb-1">Invoice</th>
                                               <th className="pb-1">Inv. Date</th>
                                               <th className="pb-1 text-center">Days</th>
                                               <th className="pb-1 text-right">Applied</th>
                                             </tr>
                                           </thead>
                                           <tbody>
                                             {pay.payment_allocations.map((alloc, i) => {
                                                const days = getDaysDiff(pay.payment_date, alloc.invoices?.invoice_date || "");
                                                return (
                                                  <tr key={i}>
                                                    <td className="py-1 text-slate-600">#{alloc.invoices?.id.substring(0, 8)}</td>
                                                    <td className="py-1 text-slate-500">{alloc.invoices?.invoice_date}</td>
                                                    <td className="py-1 text-center text-slate-500">{days}d</td>
                                                    <td className="py-1 text-right font-medium text-slate-800">${alloc.amount.toLocaleString()}</td>
                                                  </tr>
                                                );
                                             })}
                                           </tbody>
                                        </table>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Right: Outstanding Invoices */}
                                <div className="p-4 bg-red-50/30">
                                  <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-red-600 uppercase flex items-center gap-2">
                                      <AlertCircle className="w-3 h-3" /> Outstanding Invoices
                                    </p>
                                  </div>
                                  
                                  {group.outstanding_invoices.length > 0 ? (
                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar border border-red-100 rounded bg-white/60">
                                      <table className="w-full text-xs text-left">
                                        <thead className="text-slate-500 border-b border-red-100 bg-red-50/50 sticky top-0">
                                          <tr>
                                            <th className="py-2 px-3">Date</th>
                                            <th className="py-2 px-3">Due</th>
                                            <th className="py-2 px-3 text-right">Total</th>
                                            <th className="py-2 px-3 text-right text-red-600">Balance</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-50">
                                          {group.outstanding_invoices.map((inv, idx) => (
                                            <tr key={idx} className="hover:bg-red-50/50">
                                              <td className="py-2 px-3 text-slate-600">{inv.invoice_date}</td>
                                              <td className="py-2 px-3 text-slate-500">{inv.due_date}</td>
                                              <td className="py-2 px-3 text-right text-slate-500">${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                              <td className="py-2 px-3 text-right font-bold text-red-600">${(inv.total_amount - inv.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="py-4 text-center text-emerald-600 font-medium text-xs bg-emerald-50 rounded border border-emerald-100">
                                      <Check className="w-4 h-4 mx-auto mb-1" />
                                      All clear! No outstanding invoices.
                                    </div>
                                  )}
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  
                  {groupedList.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">No payment data found in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}