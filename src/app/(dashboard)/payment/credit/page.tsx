"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  ArrowLeft, Search, Wallet, ArrowRightCircle
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input"; 
import { Button } from "@/components/ui/button"; 

interface CreditPayment {
  id: string;
  payment_date: string;
  amount: number; 
  unallocated_amount: number; 
  customer_id: string; 
  customer: {
    name: string;
  };
}

export default function CreditListPage() {
  const supabase = createClient();
  const [credits, setCredits] = useState<CreditPayment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .select(`
        *,
        customer:customers (name)
      `)
      .gt("unallocated_amount", 0) 
      .order("payment_date", { ascending: false });

    if (!error && data) {
      setCredits(data as any);
    }
    setLoading(false);
  };

  const filteredCredits = useMemo(() => {
    if (!searchTerm) return credits;
    return credits.filter(c => 
      c.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [credits, searchTerm]);

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  // [1] 수정: 검색된 결과(filteredCredits)를 기준으로 합계 계산
  const totalCredit = filteredCredits.reduce((sum, item) => sum + item.unallocated_amount, 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/payment/list">
            <button className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              Customer Credits <span className="text-emerald-600 text-lg font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{filteredCredits.length}</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage unallocated payments.</p>
          </div>
        </div>

        <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input 
                placeholder="Search Customer..." 
                className="pl-9 bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-xl flex items-center gap-4 shadow-sm">
        <div className="p-3 bg-white rounded-full shadow-sm">
          <Wallet className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-800 uppercase tracking-wide">Total Available Credit</p>
          <p className="text-3xl font-black text-emerald-900 mt-1">{formatCurrency(totalCredit)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs whitespace-nowrap">
            <tr>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4 whitespace-nowrap">Payment Date</th>
              <th className="px-6 py-4 whitespace-nowrap">Original Payment #</th>
              <th className="px-6 py-4 text-right text-slate-400 whitespace-nowrap">Original Total</th>
              <th className="px-6 py-4 text-right text-emerald-700 bg-emerald-50/30 whitespace-nowrap">Remaining Credit</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="p-10 text-center text-slate-400">Loading credits...</td></tr>
            ) : filteredCredits.length === 0 ? (
              <tr><td colSpan={6} className="p-10 text-center text-slate-400">No outstanding credits found.</td></tr>
            ) : (
              filteredCredits.map((credit) => (
                <tr key={credit.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{credit.customer?.name}</td>
                  <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{credit.payment_date}</td>
                  
                  {/* [3] 수정: ID 글자수 13자리로 변경 */}
                  <td className="px-6 py-4 font-mono text-xs text-slate-400 whitespace-nowrap">#{credit.id.slice(0,13).toUpperCase()}</td>
                  
                  <td className="px-6 py-4 text-right text-slate-400 whitespace-nowrap">{formatCurrency(credit.amount)}</td>
                  <td className="px-6 py-4 text-right font-bold text-emerald-600 bg-emerald-50/30 whitespace-nowrap">
                    {formatCurrency(credit.unallocated_amount)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Link href={`/payment/new?customerId=${credit.customer_id}`}>
                        <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-bold h-8 text-xs gap-1"
                        >
                            Allocate <ArrowRightCircle className="w-3.5 h-3.5" />
                        </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}