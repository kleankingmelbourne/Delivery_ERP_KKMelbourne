"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Search, Filter, X, 
  Eye, ChevronUp, CreditCard, Trash2, AlertTriangle, MoreHorizontal, FileText,
  Edit, ChevronLeft, ChevronRight // ✅ 좌우 화살표 아이콘 추가
} from "lucide-react";
import Link from "next/link";

import { revertAllocationsFromPaymentSource } from "@/utils/credit";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- 타입 정의 ---
interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  unallocated_amount: number;
  category: string;
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
  const [selectedMethod, setSelectedMethod] = useState("");
  // ✅ 수정: 결제 수단 옵션들을 유지하기 위한 state 추가
  const [methodOptions, setMethodOptions] = useState<string[]>([]);

  // ✅ 페이지네이션 관련 상태 추가
  const [limit, setLimit] = useState<number | "all">(20); // 기본값 20개
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ✅ 검색어 디바운스 상태 (서버에 검색 요청을 너무 자주 보내지 않기 위함)
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [allocationsCache, setAllocationsCache] = useState<Record<string, PaymentAllocation[]>>({});
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  // 날짜 초기화 로직
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    setStartDate(localDate);
    setEndDate(localDate);
  }, []);

  // ✅ 1. 사용자가 검색어를 입력하면 0.5초 대기 후 서버 요청 검색어 업데이트
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  //✅ 2. 필터(날짜, 보기 개수, 메서드, 검색어)가 변경되면 무조건 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, limit, selectedMethod, debouncedSearch]);

  // ✅ 3. 조건이나 페이지가 변경될 때마다 데이터 다시 읽어오기
  useEffect(() => {
    if (startDate && endDate) {
      fetchPayments();
    }
  }, [startDate, endDate, limit, currentPage, selectedMethod, debouncedSearch]);

  // ✅ 수정: 전체 데이터를 불러왔을 때(메서드 필터가 없을 때)만 결제 수단 고유 목록을 저장합니다.
  useEffect(() => {
    if (!selectedMethod && payments.length > 0) {
      const methods = Array.from(new Set(payments.map(p => p.category))).filter(Boolean).sort();
      setMethodOptions(methods);
    }
  }, [payments, selectedMethod]);

  const fetchPayments = async () => {
    setLoading(true);

    // 1. 기본 쿼리 설정
    let query = supabase
      .from("payments")
      .select(`
        *,
        customer:customers (name)
      `, { count: "exact" })
      .order("payment_date", { ascending: false });

    // 2. 날짜 및 메서드 필터 적용
    if (startDate) query = query.gte("payment_date", startDate);
    if (endDate) query = query.lte("payment_date", `${endDate}T23:59:59`);
    if (selectedMethod) query = query.eq("category", selectedMethod);

    // ✅ 3. 검색 로직 수정: Two-step 검색 적용
    if (debouncedSearch) {
      // Step A: 고객 테이블에서 검색어가 포함된 고객의 ID들을 먼저 찾습니다.
      const { data: matchedCustomers } = await supabase
        .from("customers")
        .select("id")
        .ilike("name", `%${debouncedSearch}%`);

      // 찾은 고객 ID들을 배열로 추출
      const customerIds = matchedCustomers?.map((c) => c.id) || [];

      // Step B: 찾아낸 고객 ID가 있으면 or 조건에 포함하고, 없으면 결제 ID만 검색
      if (customerIds.length > 0) {
        // 💡 주의: payments 테이블이 customers 테이블과 연결된 컬럼명이 'customer_id'라고 가정했습니다.
        query = query.or(`id.ilike.%${debouncedSearch}%,customer_id.in.(${customerIds.join(',')})`);
      } else {
        query = query.ilike("id", `%${debouncedSearch}%`);
      }
    }

    // 4. 페이지네이션 적용
    if (limit !== "all") {
      const from = (currentPage - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query;
    
    if (error) {
      console.error("Fetch Error:", error);
    } else if (data) {
      setPayments(data as any); 
      if (count !== null) setTotalCount(count);
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
            id, amount, created_at,
            invoice:invoices ( id, invoice_date, total_amount )
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

  const handleDeletePayment = async (paymentId: string) => {
    const isCreditMemo = paymentId.startsWith('CR-');
    
    const confirmMsg = isCreditMemo 
      ? "⚠️ 이 결제를 삭제하면 연결된 [Credit Memo 인보이스]와 [아이템]이 모두 함께 삭제됩니다. 계속하시겠습니까?"
      : "⚠️ 이 결제 내역을 삭제하시겠습니까?\n(인보이스와 아이템은 안전하게 보존되며, 결제 상태만 미납으로 변경됩니다.)";

    if (!confirm(confirmMsg)) return;

    setLoading(true);

    try {
      // 🌟 [핵심 변경] 공통 유틸리티 적용
      // allocations(할당 내역) 삭제, 인보이스 paid_amount 롤백, payments(결제 내역) 삭제를 한 방에 처리!
      await revertAllocationsFromPaymentSource(supabase, [paymentId]);

      // 🌟 크레딧 메모(CR-)인 경우의 추가 처리
      if (isCreditMemo) {
          // 크레딧 메모는 payments 테이블 외에도 invoices 테이블에 양쪽으로 존재하므로,
          // 결제 내역이 위에서 지워진 후, 인보이스 쪽에 남은 본체와 아이템을 마저 지워줍니다.
          await supabase.from('invoice_items').delete().eq('invoice_id', paymentId);
          const { error: invDelError } = await supabase.from('invoices').delete().eq('id', paymentId);
          if (invDelError) throw invDelError;
      }

      alert(isCreditMemo ? "Credit Memo와 결제 내역이 모두 삭제되었습니다." : "결제 내역이 성공적으로 취소되었습니다.");
      fetchPayments(); 

    } catch (error: any) {
      console.error("Delete Error:", error);
      alert("삭제 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 수정: 기존 실시간 계산 구문 제거 (대신 useEffect와 methodOptions state 사용)
  // const uniqueMethods = Array.from(new Set(payments.map(p => p.category))).filter(Boolean).sort();

  // ✅ 서버 사이드 검색을 적용했으므로, 클라이언트 필터는 Customer Name 보조용으로만 사용
  const filteredPayments = payments.filter(p => {
    return (p.customer?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
           p.id.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-AU');
  };

  const clearDates = () => { setStartDate(""); setEndDate(""); };

  // ✅ 총 페이지 수 계산
  const totalPages = limit === "all" ? 1 : Math.ceil(totalCount / limit);

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

        {/* ✅ 개수 제한 선택 셀렉트 박스 (10, 20, 30, 50, all) */}
        <div className="flex items-center gap-2">
          {/* 1. 라벨 추가 */}
          <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Show:</span> 
          
          {/* 2. 드롭다운 컨테이너 (relative 추가) */}
          <div className="relative min-w-[100px]">
            <select 
              value={limit} 
              onChange={(e) => setLimit(e.target.value === "all" ? "all" : Number(e.target.value))}
              // ✅ w-full 제거 (한 줄에 넣기 위해), pr-8로 화살표 공간 확보
              className="w-full pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400 bg-white appearance-none cursor-pointer text-slate-700 font-medium"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value="all">ALL</option>
            </select>
            
            {/* 3. 화살표 아이콘 */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <ChevronUp className="w-4 h-4 text-slate-400 rotate-180" />
            </div>
          </div>
        </div>

        <div className="relative min-w-[150px]">
           <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
             <CreditCard className="w-4 h-4" />
           </div>
           <select 
             value={selectedMethod} 
             onChange={(e) => setSelectedMethod(e.target.value)}
             className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400 bg-white appearance-none cursor-pointer text-slate-700 font-medium"
           >
             <option value="">All Methods</option>
             {/* ✅ 수정: uniqueMethods 대신 고정 상태인 methodOptions 맵핑 */}
             {methodOptions.map(method => (
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
            placeholder="Search ID or Customer..." 
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto">
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

                            <Link href={`/payment/edit/${pay.id}`}>
                              <button 
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 rounded-full transition-all"
                                title="Edit Payment"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </Link>
                            
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
        
        {/* ✅ 페이지네이션 Footer 컨트롤 */}
        {!loading && limit !== "all" && totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
            <p className="text-sm text-slate-500">
              Showing <span className="font-bold text-slate-700">{(currentPage - 1) * (limit as number) + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * (limit as number), totalCount)}</span> of <span className="font-bold text-slate-700">{totalCount}</span> entries
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <div className="flex items-center px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg">
                Page {currentPage} / {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}