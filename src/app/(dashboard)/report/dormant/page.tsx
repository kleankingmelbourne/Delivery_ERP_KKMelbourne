"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  CalendarX, AlertCircle, Phone, Search, 
  Clock, UserX, Loader2, ArrowLeft, Download
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CustomerDormancy {
  id: string;
  name: string;
  company: string;
  mobile: string;
  tel: string;
  lastOrderDate: string | null;
  daysInactive: number;
}

type DormancyFilter = 'all' | '2weeks' | '3weeks' | '4weeks' | 'never';

export default function DormantCustomerReport() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerDormancy[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<DormancyFilter>('4weeks'); // 기본값: 4주 이상 미주문

  useEffect(() => {
    const fetchDormantCustomers = async () => {
      setLoading(true);
      try {
        // 1. 모든 활성 고객 가져오기
        const { data: customerData, error: custError } = await supabase
          .from("customers")
          .select("id, name, company, mobile, tel")
          .order("name");

        if (custError) throw custError;

        // 2. 인보이스 데이터를 가져와서 고객별로 묶기 (가장 최근 날짜순 정렬)
        const { data: invoiceData, error: invError } = await supabase
          .from("invoices")
          .select("customer_id, invoice_date")
          // 🚀 취소된 주문은 제외하고 유효한 주문만 체크하려면 아래 조건을 활성화하세요
          // .neq("status", "Cancelled") 
          .order("invoice_date", { ascending: false });

        if (invError) throw invError;

        const today = new Date();
        today.setHours(0, 0, 0, 0); // 시간 제외, 날짜만 비교

        // 3. 고객별 마지막 주문일 및 미주문 기간 계산
        const analyzedCustomers: CustomerDormancy[] = (customerData || []).map((cust) => {
          const custInvoices = (invoiceData || []).filter(inv => inv.customer_id === cust.id);
          
          if (custInvoices.length === 0) {
            return { ...cust, lastOrderDate: null, daysInactive: Infinity };
          }

          const lastDateStr = custInvoices[0].invoice_date;
          const lastDate = new Date(lastDateStr);
          lastDate.setHours(0, 0, 0, 0);

          const diffTime = Math.abs(today.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            ...cust,
            lastOrderDate: lastDateStr,
            daysInactive: diffDays
          };
        });

        // 4. 최근 주문일 기준으로 내림차순 정렬 (가장 오래된 고객이 먼저 오도록)
        analyzedCustomers.sort((a, b) => b.daysInactive - a.daysInactive);
        setCustomers(analyzedCustomers);

      } catch (error) {
        console.error("Failed to fetch dormant customers:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDormantCustomers();
  }, [supabase]);

  // 필터 및 검색 적용
  const filteredCustomers = customers.filter(c => {
    // 1. 검색어 필터
    const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    // 2. 미주문 기간 필터
    if (filter === 'all') return true;
    if (filter === 'never') return c.daysInactive === Infinity;
    
    if (c.daysInactive === Infinity) return false; // 기간 필터일 때는 아예 주문 없는 사람은 제외
    
    if (filter === '2weeks') return c.daysInactive >= 14 && c.daysInactive < 21;
    if (filter === '3weeks') return c.daysInactive >= 21 && c.daysInactive < 28;
    if (filter === '4weeks') return c.daysInactive >= 28;

    return true;
  });

  const getStatusBadge = (days: number) => {
    if (days === Infinity) return <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-bold border border-slate-200">No Orders Yet</span>;
    if (days >= 28) return <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-bold border border-rose-200 shadow-sm">4+ Weeks ({days} days)</span>;
    if (days >= 21) return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold border border-amber-200">3 Weeks ({days} days)</span>;
    if (days >= 14) return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-200">2 Weeks ({days} days)</span>;
    return <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold border border-emerald-200">Recent ({days} days)</span>;
  };

  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) return alert("No data to export.");
    
    let csvContent = "Customer Name,Company,Last Order Date,Days Inactive,Mobile,Tel\n";
    filteredCustomers.forEach(c => {
        const lastDate = c.lastOrderDate || "Never";
        const daysText = c.daysInactive === Infinity ? "N/A" : c.daysInactive.toString();
        csvContent += `"${c.name}","${c.company || ''}","${lastDate}","${daysText}","${c.mobile || ''}","${c.tel || ''}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Dormant_Customers_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/report">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <UserX className="w-6 h-6 text-rose-500" />
                Dormant Customers
            </h1>
            <p className="text-sm text-slate-500 font-medium">Identify and re-engage customers who haven't ordered recently.</p>
          </div>
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="bg-white border-slate-200 text-slate-700 font-bold shadow-sm">
            <Download className="w-4 h-4 mr-2"/> Export CSV
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
            <button onClick={() => setFilter('all')} className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
            <button onClick={() => setFilter('2weeks')} className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all ${filter === '2weeks' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>2 Weeks</button>
            <button onClick={() => setFilter('3weeks')} className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all ${filter === '3weeks' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>3 Weeks</button>
            <button onClick={() => setFilter('4weeks')} className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all ${filter === '4weeks' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>4+ Weeks</button>
            <button onClick={() => setFilter('never')} className={`px-4 py-2 text-sm font-bold rounded-md whitespace-nowrap transition-all ${filter === 'never' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Never Ordered</button>
        </div>
        
        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
                type="text" 
                placeholder="Search customer..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200"
            />
        </div>
      </div>

      {/* Content */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="font-bold">Analyzing customer orders...</p>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">Customer</th>
                            <th className="px-6 py-4">Company</th>
                            <th className="px-6 py-4">Last Order Date</th>
                            <th className="px-6 py-4">Dormancy Status</th>
                            <th className="px-6 py-4">Contact</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredCustomers.length > 0 ? (
                            filteredCustomers.map((customer) => (
                                <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-slate-900">{customer.name}</td>
                                    <td className="px-6 py-4 text-slate-600">{customer.company || "-"}</td>
                                    <td className="px-6 py-4">
                                        {customer.lastOrderDate ? (
                                            <div className="flex items-center gap-2 text-slate-700">
                                                <CalendarX className="w-4 h-4 text-slate-400" />
                                                <span className="font-medium">{customer.lastOrderDate}</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 italic">No record</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {getStatusBadge(customer.daysInactive)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1 text-slate-600 text-xs">
                                            {customer.mobile && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400"/> {customer.mobile}</span>}
                                            {customer.tel && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400"/> {customer.tel}</span>}
                                            {!customer.mobile && !customer.tel && <span className="text-slate-400">-</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="p-16 text-center text-slate-400">
                                    <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p className="font-bold text-lg">No customers found</p>
                                    <p className="text-sm mt-1">Try changing the filter or search term.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
}