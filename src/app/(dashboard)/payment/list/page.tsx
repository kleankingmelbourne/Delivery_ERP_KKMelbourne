"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Search, Filter, X, 
  Eye, ChevronUp, CreditCard, Trash2, AlertTriangle, MoreHorizontal, FileText
} from "lucide-react";
import Link from "next/link";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- 타입 정의 ---
interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  unallocated_amount: number; // Credit
  category: string; // Payment Method
  reason: string;
  customer: {
    name: string;
  };
}

interface PaymentAllocation {
  id: string;
  amount: number;
  created_at: string;
  invoice: {
    id: string;
    invoice_date: string;
    total_amount: number;
  };
}

export default function PaymentListPage() {
  const supabase = createClient();
  
  // --- States ---
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Method 필터 상태
  const [selectedMethod, setSelectedMethod] = useState("");

  // ------------------------------------------------------------------
  // [FIX] 날짜 초기화 로직 (서버 시간 문제 해결)
  // ------------------------------------------------------------------
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const now = new Date();
    // 로컬 시간 기준 YYYY-MM-DD
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    setStartDate(localDate);
    setEndDate(localDate);
  }, []);
  // ------------------------------------------------------------------

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [allocationsCache, setAllocationsCache] = useState<Record<string, PaymentAllocation[]>>({});
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  // [FIX] 데이터 로딩 (날짜가 세팅된 후에 실행)
  useEffect(() => {
    if (startDate && endDate) {
      fetchPayments();
    }
  }, [startDate, endDate]);

  const fetchPayments = async () => {
    setLoading(true);
    let query = supabase
      .from("payments")
      .select(`
        *,
        customer:customers (name)
      `)
      // [UPDATE] CR- 제외 필터 삭제 -> 모든 Payment 표시
      .order("payment_date", { ascending: false });

    if (startDate) query = query.gte("payment_date", startDate);
    if (endDate) query = query.lte("payment_date", `${endDate}T23:59:59`);

    const { data, error } = await query;
    if (!error && data) {
      setPayments(data as any); 
    }
    setLoading(false);
  };

  const toggleRow = async (paymentId: string) => {
    const newExpanded = new Set(expandedRowIds);

    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
      setExpandedRowIds(newExpanded);
    } else {
      newExpanded.add(paymentId);
      setExpandedRowIds(newExpanded);

      if (!allocationsCache[paymentId]) {
        setLoadingRows(prev => new Set(prev).add(paymentId));

        const { data, error } = await supabase
          .from("payment_allocations")
          .select(`
            id,
            amount,
            created_at,
            invoice:invoices (
              id,
              invoice_date,
              total_amount
            )
          `)
          .eq("payment_id", paymentId)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setAllocationsCache(prev => ({ ...prev, [paymentId]: data as any }));
        }
        
        setLoadingRows(prev => {
          const next = new Set(prev);
          next.delete(paymentId);
          return next;
        });
      }
    }
  };

  // --- [핵심] Payment 삭제 로직 (동기화 포함) ---
  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("⚠️ WARNING: 정말 삭제하시겠습니까?\n\n이 결제를 삭제하면 연결된 모든 인보이스의 결제 상태가 원래대로(미납) 되돌아갑니다.")) {
      return;
    }

    setLoading(true);

    try {
      // 1. 할당 내역 조회 및 인보이스 상태 복구
      const { data: allocations, error: allocError } = await supabase
        .from('payment_allocations')
        .select('id, invoice_id, amount')
        .eq('payment_id', paymentId);

      if (allocError) throw allocError;

      if (allocations && allocations.length > 0) {
        for (const alloc of allocations) {
          const { data: invoice } = await supabase
            .from('invoices')
            .select('id, total_amount, paid_amount')
            .eq('id', alloc.invoice_id)
            .single();

          if (invoice) {
            // 결제 취소 금액 반영
            const newPaidAmount = roundAmount(invoice.paid_amount - alloc.amount);
            
            // 상태 재계산 (오차 방지)
            const isFullyPaid = Math.abs(invoice.total_amount - newPaidAmount) < 0.01;
            const isUnpaid = newPaidAmount < 0.01;

            let newStatus = 'Unpaid';
            if (isFullyPaid) newStatus = 'Paid';
            else if (!isUnpaid) newStatus = 'Partial'; 

            await supabase
              .from('invoices')
              .update({ 
                paid_amount: Math.max(0, newPaidAmount), 
                status: newStatus 
              })
              .eq('id', invoice.id);
          }
        }
      }

      // 2. [SYNC DELETION] 만약 CR- 로 시작하는 Payment라면 Invoice 테이블에서도 삭제
      if (paymentId.startsWith('CR-')) {
          // Invoice 삭제
          await supabase.from('invoices').delete().eq('id', paymentId);
          // (옵션) Invoice Items 삭제 (CASCADE 설정이 없다면 필수)
          await supabase.from('invoice_items').delete().eq('invoice_id', paymentId);
      }

      // 3. Payment 및 Allocation 삭제
      await supabase.from('payment_allocations').delete().eq('payment_id', paymentId);
      const { error: deleteError } = await supabase.from('payments').delete().eq('id', paymentId);
      
      if (deleteError) throw deleteError;

      alert("삭제되었습니다.");
      fetchPayments(); // 목록 새로고침

    } catch (error: any) {
      console.error("Delete Error:", error);
      alert("삭제 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };


  // --- Helpers ---
  const uniqueMethods = Array.from(new Set(payments.map(p => p.category))).filter(Boolean).sort();

  const filteredPayments = payments.filter(p => {
    const matchesSearch = (p.customer?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMethod = selectedMethod ? p.category === selectedMethod : true;
    
    return matchesSearch && matchesMethod;
  });

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-AU');
  };

  const clearDates = () => { setStartDate(""); setEndDate(""); };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment History</h1>
          <p className="text-slate-500 text-sm mt-1">View all transactions and allocated invoices.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/payment/credit">
            <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 flex items-center gap-2">
              <Filter className="w-4 h-4" /> View Credits Only
            </button>
          </Link>
          <Link href="/payment/new">
            <button className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 shadow-md">
              <Plus className="w-4 h-4" /> Receive Payment
            </button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
          <div className="relative group">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase">From</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="pl-10 pr-2 py-1.5 bg-transparent text-sm w-36 focus:outline-none text-slate-700"/>
          </div>
          <div className="w-px h-4 bg-slate-300"></div>
          <div className="relative group">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase">To</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="pl-8 pr-2 py-1.5 bg-transparent text-sm w-36 focus:outline-none text-slate-700"/>
          </div>
          {(startDate || endDate) && (
            <button onClick={clearDates} className="p-1 hover:bg-slate-200 rounded-full text-slate-400"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>

        <div className="flex-1"></div>

        <div className="relative min-w-[180px]">
           <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
             <CreditCard className="w-4 h-4" />
           </div>
           <select 
             value={selectedMethod} 
             onChange={(e) => setSelectedMethod(e.target.value)}
             className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400 bg-white appearance-none cursor-pointer text-slate-700 font-medium"
           >
             <option value="">All Methods</option>
             {uniqueMethods.map(method => (
               <option key={method} value={method}>{method}</option>
             ))}
           </select>
           <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
             <ChevronUp className="w-4 h-4 text-slate-400 rotate-180" />
           </div>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
          <input 
            type="text" 
            placeholder="Search customer..." 
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Payment #</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Method</th>
              <th className="px-6 py-4 text-right">Total Amount</th>
              <th className="px-6 py-4 text-right">Credit</th>
              <th className="px-6 py-4 text-center">Status</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="p-10 text-center text-slate-400">Loading payments...</td></tr>
            ) : filteredPayments.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center text-slate-400">No payments found.</td></tr>
            ) : (
              filteredPayments.map((pay) => {
                const isExpanded = expandedRowIds.has(pay.id);
                const isCreditRemaining = pay.unallocated_amount > 0;
                const isCreditMemo = pay.id.startsWith("CR-");

                return (
                  <React.Fragment key={pay.id}>
                    <tr className={`transition-colors border-b border-slate-50 ${isExpanded ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500" title={pay.id}>
                        {isCreditMemo ? (
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold">
                                {pay.id}
                            </span>
                        ) : (
                            `#${pay.id ? pay.id.slice(0,12).toUpperCase() : "UNKNOWN"}`
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-700">{pay.payment_date}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{pay.customer?.name || "Unknown"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${isCreditMemo ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700'}`}>
                          {isCreditMemo ? <FileText className="w-3 h-3"/> : <CreditCard className="w-3 h-3 text-slate-400" />}
                          {pay.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">{formatCurrency(pay.amount)}</td>
                      <td className="px-6 py-4 text-right">
                        {isCreditRemaining ? (
                          <span className="font-bold text-emerald-600">{formatCurrency(pay.unallocated_amount)}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isCreditRemaining ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">CREDIT AVAILABLE</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200">FULLY USED</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => toggleRow(pay.id)}
                            className={`p-2 rounded-full transition-all ${isExpanded ? 'bg-slate-200 text-slate-900' : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600'}`}
                            title="View Details"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePayment(pay.id);
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                            title="Delete Payment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Detail Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-top-1">
                        <td colSpan={8} className="px-6 py-4 pl-12">
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                              <div>
                                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  Payment Details <span className="text-slate-400 font-normal">#{pay.id}</span>
                                </h4>
                                {pay.reason && <p className="text-xs text-slate-500 mt-1">Note: {pay.reason}</p>}
                              </div>
                              <div className="flex gap-6 text-right">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Received</p>
                                  <p className="text-sm font-bold text-slate-900">{formatCurrency(pay.amount)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase">Allocated</p>
                                  <p className="text-sm font-bold text-slate-700">{formatCurrency(pay.amount - pay.unallocated_amount)}</p>
                                </div>
                                <div className={`px-3 py-1 rounded-lg ${isCreditRemaining ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}>
                                  <p className={`text-[10px] font-bold uppercase ${isCreditRemaining ? 'text-emerald-600' : 'text-slate-400'}`}>Unused (Credit)</p>
                                  <p className={`text-sm font-black ${isCreditRemaining ? 'text-emerald-600' : 'text-slate-300'}`}>{formatCurrency(pay.unallocated_amount)}</p>
                                </div>
                              </div>
                            </div>
                            <h5 className="text-xs font-bold text-slate-500 mb-2 uppercase">Applied to Invoices</h5>
                            {loadingRows.has(pay.id) ? (
                              <div className="text-center py-4 text-slate-400 text-xs">Loading allocations...</div>
                            ) : (allocationsCache[pay.id] && allocationsCache[pay.id].length > 0) ? (
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                                  <tr>
                                    <th className="px-3 py-2">Invoice #</th>
                                    <th className="px-3 py-2">Invoice Date</th>
                                    <th className="px-3 py-2 text-center text-slate-700">Applied Date</th>
                                    <th className="px-3 py-2 text-right">Invoice Total</th>
                                    <th className="px-3 py-2 text-right text-blue-700 bg-blue-50/50">Amount Applied</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {allocationsCache[pay.id].map((alloc) => {
                                    const payDate = new Date(pay.payment_date);
                                    const allocDate = new Date(alloc.created_at);
                                    const isLaterCredit = payDate.setHours(0,0,0,0) < allocDate.setHours(0,0,0,0);
                                    return (
                                      <tr key={alloc.id} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 font-medium text-slate-700">#{alloc.invoice?.id}</td>
                                        <td className="px-3 py-2 text-slate-500">{alloc.invoice?.invoice_date}</td>
                                        <td className="px-3 py-2 text-center">
                                          <div className="flex items-center justify-center gap-2">
                                            <span className="text-slate-600 font-medium">{formatDate(alloc.created_at)}</span>
                                            {isLaterCredit && <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-bold border border-purple-200">CREDIT USED</span>}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-500">{formatCurrency(alloc.invoice?.total_amount)}</td>
                                        <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50/30">{formatCurrency(alloc.amount)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div className="p-4 text-center bg-slate-50 rounded-lg text-slate-400 text-xs border border-dashed border-slate-200">No invoices have been allocated to this payment yet.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}