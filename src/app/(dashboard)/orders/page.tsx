"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, MoreHorizontal, Trash2, Edit, CheckCircle,
  ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp,
  AlertCircle, Package, Calculator, Receipt, FileStack,
  FileDown, ArrowRightCircle, CheckSquare, Clock, XCircle, ExternalLink
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider"; 

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

interface Order {
  id: string;
  customer_id: string;
  order_date: string;
  requested_date: string;
  total_amount: number;
  status: "draft" | "pending" | "invoiced" | "cancelled";
  order_memo?: string;
  invoice_id?: string;
  is_pickup?: boolean; 
  customers?: { company: string; name: string; in_charge_delivery?: string } | null;
  [key: string]: any;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit: string;
  base_price: number;
  discount: number;
  unit_price: number;
}

type TabType = 'ALL' | 'PENDING' | 'INVOICED' | 'CANCELLED';

export default function AdminOrderTable() {
  const supabase = createClient();
  const router = useRouter();
  const { user } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState(""); 
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>('PENDING'); 
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("10"); 
  const [totalCount, setTotalCount] = useState(0); 
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [detailsCache, setDetailsCache] = useState<Record<string, OrderItem[]>>({});
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const now = new Date();
    const past = new Date(now);
    past.setMonth(past.getMonth() - 1); 
    const future = new Date(now);
    future.setMonth(future.getMonth() + 1);
    
    setStartDate(past.toISOString().split('T')[0]);
    setEndDate(future.toISOString().split('T')[0]);
  }, []);

  const fetchMatchingCustomerIds = async (term: string) => {
    if (!term.trim()) return [];
    const safeTerm = term.replace(/"/g, '""');
    const { data } = await supabase
        .from("customers")
        .select("id")
        .or(`name.ilike."%${safeTerm}%",company.ilike."%${safeTerm}%"`)
        .limit(100);
    return data?.map(c => c.id) || [];
  };

  const buildQuery = useCallback((customerIds: string[]) => {
    let query = supabase.from("orders").select(`
      id, customer_id, order_date, requested_date, total_amount, status, order_memo, invoice_id, is_pickup,
      customers ( company, name, in_charge_delivery )
    `, { count: 'exact' });

    if (activeTab === "PENDING") query = query.eq("status", "pending");
    else if (activeTab === "INVOICED") query = query.eq("status", "invoiced");
    else if (activeTab === "CANCELLED") query = query.eq("status", "cancelled");
    
    if (startDate) query = query.gte("requested_date", startDate);
    if (endDate) query = query.lte("requested_date", endDate);
    
    if (debouncedSearch) {
        const safeTerm = debouncedSearch.replace(/"/g, '""'); 
        const isNumeric = !isNaN(Number(debouncedSearch)) && debouncedSearch.trim() !== "";

        let orConditions = [`id.ilike."%${safeTerm}%"`, `invoice_id.ilike."%${safeTerm}%"`];
        if (isNumeric) orConditions.push(`total_amount.eq.${Number(debouncedSearch)}`);
        if (customerIds.length > 0) orConditions.push(`customer_id.in.(${customerIds.join(',')})`);

        query = query.or(orConditions.join(','));
    }
    return query;
  }, [supabase, startDate, endDate, activeTab, debouncedSearch]);

  const fetchOrders = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const customerIds = await fetchMatchingCustomerIds(debouncedSearch);
    let query = buildQuery(customerIds); 
    
    const limit = pageSize === "all" ? 10000 : parseInt(pageSize);
    const from = (currentPage - 1) * limit;
    const to = from + limit - 1;
    
    query = query.order("requested_date", { ascending: false }).order("id", { ascending: false }).range(from, to);
    
    const { data, count, error } = await query;
    if (!error && data) {
        setOrders(data as unknown as Order[]);
        if (count !== null) setTotalCount(count); 
    }
    setLoading(false);
  }, [buildQuery, currentPage, pageSize, startDate, endDate, debouncedSearch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]); 

  // 🚀 인보이스 변환 시 GST 계산 로직 수정 완료
  const handleConvertToInvoice = async (order: Order) => {
    if (!confirm(`Create an invoice for Order #${order.id}?`)) return;
    setLoading(true);
    try {
        let items = detailsCache[order.id];
        if (!items) {
            const { data } = await supabase.from("order_items").select("*").eq("order_id", order.id);
            if (data) items = data as OrderItem[];
        }
        if (!items || items.length === 0) throw new Error("No items found in this order.");

        const { data: lastInv } = await supabase.from("invoices").select("id").order("id", { ascending: false }).limit(1);
        let newInvId = "IV-1001"; 
        if (lastInv && lastInv.length > 0) {
            const lastNum = parseInt(lastInv[0].id.replace(/[^0-9]/g, ""));
            if (!isNaN(lastNum)) newInvId = `IV-${lastNum + 1}`; 
        }

        // 🚀 수식 수정 포인트
        const orderSubtotal = order.total_amount; // 넘어온 가격을 100%(Subtotal)로 설정
        const gstTotal = roundAmount(orderSubtotal * 0.1); // 10% 플러스
        const finalInvoiceTotal = roundAmount(orderSubtotal + gstTotal); // 최종 합계는 110%

        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const currentAdminName = user?.user_metadata?.full_name || user?.email || "Admin";

        const invoiceData = {
            id: newInvId,
            customer_id: order.customer_id,
            invoice_to: order.customers?.name || 'Unknown', 
            invoice_date: order.requested_date,
            due_date: dueDate,
            total_amount: finalInvoiceTotal, // 수정된 최종 합계 (110%)
            paid_amount: 0,
            subtotal: orderSubtotal,         // 오더 가격 그대로 Subtotal (100%)
            gst_total: gstTotal,             // 10% 가산된 세금
            status: 'Unpaid',
            created_who: 'customer',
            updated_who: currentAdminName,
            driver_id: order.customers?.in_charge_delivery || null,
            memo: order.order_memo || "",
            is_pickup: order.is_pickup || false
        };

        const { error: invError } = await supabase.from("invoices").insert([invoiceData]);
        if (invError) throw invError;

        const invItemsData = items.map(item => ({
            invoice_id: newInvId,
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            base_price: item.base_price,
            discount: item.discount,
            amount: roundAmount(item.quantity * item.unit_price)
        }));

        await supabase.from("invoice_items").insert(invItemsData);
        await supabase.from("orders").update({ status: 'invoiced', invoice_id: newInvId }).eq('id', order.id);

        alert(`✅ Invoice ${newInvId} created (Subtotal: ${formatCurrency(orderSubtotal)} + GST: ${formatCurrency(gstTotal)})`);
        fetchOrders(); 
    } catch (error: any) {
        alert(`Failed: ${error.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (newStatus === 'cancelled' && !confirm("Cancel this order?")) return;
    setLoading(true);
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    fetchOrders();
    setLoading(false);
  };

  const toggleRow = async (orderId: string) => {
    const newExpanded = new Set(expandedRowIds);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
      if (!detailsCache[orderId]) {
        setLoadingRows(prev => new Set(prev).add(orderId));
        const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
        if (data) setDetailsCache(prev => ({ ...prev, [orderId]: data as OrderItem[] }));
        setLoadingRows(prev => { const next = new Set(prev); next.delete(orderId); return next; });
      }
    }
    setExpandedRowIds(newExpanded);
  };

  const renderStatus = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending": return <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-black rounded-full border border-amber-200 flex items-center gap-1 w-fit"><Clock className="w-3 h-3"/> Pending</span>;
      case "invoiced": return <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full border border-emerald-200 flex items-center gap-1 w-fit"><Receipt className="w-3 h-3"/> Invoiced</span>;
      case "cancelled": return <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-black rounded-full border border-rose-200 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3"/> Cancelled</span>;
      default: return <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-black rounded-full border border-slate-200 uppercase">{status}</span>;
    }
  };

  return (
    <div className="p-6 w-full max-w-full mx-auto min-h-screen pb-20 space-y-6 text-slate-900">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Order Management</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium italic">Filter & Sort by Requested Date</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200">
          {['ALL', 'PENDING', 'INVOICED', 'CANCELLED'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as TabType)} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
               {tab} 
            </button>
          ))}
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Req. Date Range</label>
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32 font-medium outline-none"/>
            <span className="text-slate-400">-</span>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32 font-medium outline-none"/>
          </div>
        </div>
        <div className="relative flex-1 w-full max-w-sm mt-5">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
          <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search Name, Order ID..." className="w-full pl-10 pr-4 py-2 text-sm font-medium border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-colors"/>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] uppercase font-black tracking-wider">
            <tr>
              <th className="px-6 py-4">Order Info</th>
              <th className="px-4 py-4 text-emerald-700 bg-emerald-50/50">Linked IV #</th>
              <th className="px-4 py-4">Customer Name</th>
              <th className="px-4 py-4">Order Date</th>
              <th className="px-4 py-4 text-indigo-700 bg-indigo-50/30">Req. Date</th>
              <th className="px-4 py-4 text-right">Amount</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-6 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm font-medium">
            {loading ? (
              <tr><td colSpan={8} className="py-20 text-center font-bold text-slate-400">Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-24 text-center">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-black text-slate-700">No orders found</h3>
                </td>
              </tr>
            ) : orders.map(order => {
              const isExpanded = expandedRowIds.has(order.id);
              return (
                <React.Fragment key={order.id}>
                  <tr className={`border-b border-slate-100 transition-colors ${isExpanded ? "bg-indigo-50/30" : "hover:bg-slate-50"}`}>
                    
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-black text-slate-700">#{order.id}</span>
                        {order.is_pickup && (
                          <span className="text-[9px] font-black text-white bg-indigo-500 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-fit">
                            <Package className="w-2.5 h-2.5" /> PICK UP
                          </span>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      {order.invoice_id ? (
                        <Link href={`/invoice/edit/${order.invoice_id}`}>
                          <span className="font-black text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs hover:bg-emerald-100 cursor-pointer inline-flex items-center gap-1.5">
                            {order.invoice_id} <ExternalLink className="w-3 h-3 opacity-50" />
                          </span>
                        </Link>
                      ) : <span className="text-slate-300 text-xs">-</span>}
                    </td>

                    <td className="px-4 py-4 font-bold text-slate-900">{order.customers?.name || "Unknown"}</td>
                    <td className="px-4 py-4 text-slate-500 text-xs">{order.order_date}</td>
                    <td className="px-4 py-4 text-indigo-700 font-black">{order.requested_date}</td>
                    <td className="px-4 py-4 text-right font-black text-slate-900">{formatCurrency(order.total_amount)}</td>
                    <td className="px-4 py-4">{renderStatus(order.status)}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => toggleRow(order.id)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 hover:bg-slate-100 rounded-full outline-none text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-white shadow-xl rounded-xl border border-slate-200 p-1">
                            {order.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => handleConvertToInvoice(order)} className="px-3 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer flex items-center gap-2">
                                  <ArrowRightCircle className="w-4 h-4" /> Convert to Invoice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, 'cancelled')} className="px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-2">
                                  <XCircle className="w-4 h-4" /> Cancel Order
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={8} className="px-14 py-4">
                        <div className="bg-white border rounded-xl p-4 shadow-sm">
                          <h4 className="text-xs font-black uppercase text-slate-400 mb-3">Item Details</h4>
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="text-slate-400 border-b">
                                <th className="pb-2">Description</th>
                                <th className="pb-2 text-center">Qty</th>
                                <th className="pb-2 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(detailsCache[order.id] || []).map((item, i) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-slate-50/50">
                                  <td className="py-2 font-bold text-slate-700">{item.description}</td>
                                  <td className="py-2 text-center font-medium">{item.quantity} {item.unit}</td>
                                  <td className="py-2 text-right font-black text-slate-900">{formatCurrency(item.unit_price * item.quantity)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {order.order_memo && (
                            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                               <p className="text-[10px] font-black text-amber-700 uppercase mb-1">Customer Note</p>
                               <p className="text-xs text-amber-900 font-medium">{order.order_memo}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}