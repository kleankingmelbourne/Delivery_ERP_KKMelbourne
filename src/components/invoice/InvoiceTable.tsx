"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Search, MoreHorizontal, FileText, 
  CreditCard, Printer, Trash2, Eye, Edit,
  ChevronLeft, ChevronRight, X, CheckSquare, Box,
  Download, FileDown, ChevronDown, ChevronUp, Mail,
  AlertCircle, Truck, CheckCircle2, Circle, Package, DollarSign,
  Calculator, Receipt, FileStack 
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  downloadInvoicePdf, 
  printInvoicePdf, 
  downloadBulkPdf, 
  printBulkPdf, 
  downloadPickingSummary, 
} from "@/utils/downloadPdf"; 

import EmailSendDialog from "@/components/email/EmailSendDialog";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- 타입 정의 ---
interface Invoice {
  id: string;
  invoice_to: string; 
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number; 
  subtotal?: number;   
  gst_total?: number;  
  memo?: string;       
  status: "Paid" | "Unpaid" | "Partial" | "Credit"; 
  created_who?: string;
  updated_who?: string;
  customer_id?: string;
  
  driver_id?: string | null; 
  is_completed?: boolean;
  is_pickup?: boolean; 

  [key: string]: any;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  unit?: string;
  base_price?: number;
  discount?: number;
  product_id?: string; // [NEW] 재고 복구용
}

interface InvoiceTableProps {
  filterStatus: "ALL" | "PAID" | "UNPAID";
  title: string;
}

const INITIAL_WIDTHS = {
  checkbox: 50, id: 100, invoice_to: 250, invoice_date: 120,
  due_date: 120, 
  total_amount: 140, 
  driver_id: 150, 
  is_completed: 110, 
  status: 100, actions: 100,
};

type TabType = 'ALL' | 'INVOICE' | 'CREDIT';

export default function InvoiceTable({ filterStatus, title }: InvoiceTableProps) {
  const supabase = createClient();
  const router = useRouter();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [driversMap, setDriversMap] = useState<Record<string, string>>({});

  // ------------------------------------------------------------------
  // 날짜 및 Today 로직
  // ------------------------------------------------------------------
  const [searchTerm, setSearchTerm] = useState("");
  const [today, setToday] = useState(""); 
  const [startDate, setStartDate] = useState(""); 
  const [endDate, setEndDate] = useState("");
  
  const [activeTab, setActiveTab] = useState<TabType>('ALL');

  const [emailTarget, setEmailTarget] = useState<{
    id: string;
    type: 'invoice';
    customerName: string;
    customerEmail: string;
    docNumber: string;
  } | null>(null);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    setToday(localDate);     
    setStartDate(localDate); 
    setEndDate(localDate);   
  }, []);
  // ------------------------------------------------------------------

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("10"); 

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState(INITIAL_WIDTHS);
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [detailsCache, setDetailsCache] = useState<Record<string, InvoiceItem[]>>({});
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  // 데이터 로딩 트리거
  useEffect(() => { 
    if (startDate && endDate) { 
        fetchInvoices(); 
    }
  }, [filterStatus, startDate, endDate]); 

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set()); 
    setExpandedRowIds(new Set()); 
  }, [searchTerm, startDate, endDate, pageSize, activeTab]); 

  // 리사이징 로직
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const diff = e.clientX - startX;
      requestAnimationFrame(() => {
        // @ts-ignore
        setColWidths((prev) => ({ ...prev, [key]: Math.max(50, startWidth + diff) }));
      });
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = "default";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // 데이터 Fetching
  const fetchInvoices = async () => {
    setLoading(true);
    
    let query = supabase.from("invoices").select("*, customers(email)").order("id", { ascending: false });

    if (filterStatus === "PAID") {
      query = query.eq("status", "Paid");
    } else if (filterStatus === "UNPAID") {
      query = query.in("status", ["Unpaid", "Partial"]);
    }

    if (startDate) query = query.gte("invoice_date", startDate);
    if (endDate) query = query.lte("invoice_date", `${endDate}T23:59:59`);

    const { data, error } = await query;
    if (!error && data) {
      setInvoices(data);

      const driverIds = Array.from(new Set(data.map((inv: Invoice) => inv.driver_id).filter(Boolean))) as string[];
      
      if (driverIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", driverIds);
        
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => {
            map[p.id] = p.display_name || "Unknown";
          });
          setDriversMap(map);
        }
      }
    }
    setLoading(false);
  };

  // --- Handlers ---
  
  const handleEmail = (invoice: Invoice) => {
    setOpenMenuId(null);
    setEmailTarget({
      id: invoice.id,
      type: 'invoice',
      customerName: invoice.invoice_to || "Customer",
      customerEmail: invoice.customers?.email || "",
      docNumber: invoice.id,
    });
  };

  const handlePaymentRedirect = (customerId: string) => {
    if (!customerId) return alert("Customer information is missing.");
    router.push(`/payment/new?customerId=${customerId}`);
  };

  const toggleRow = async (invoiceId: string) => {
    const newExpanded = new Set(expandedRowIds);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId);
      setExpandedRowIds(newExpanded);
    } else {
      newExpanded.add(invoiceId);
      setExpandedRowIds(newExpanded);
      if (!detailsCache[invoiceId]) {
        setLoadingRows(prev => new Set(prev).add(invoiceId));
        const { data: items, error } = await supabase.from("invoice_items").select("id, description, quantity, unit_price, amount, unit, base_price, discount").eq("invoice_id", invoiceId);
        if (!error && items) setDetailsCache(prev => ({ ...prev, [invoiceId]: items }));
        setLoadingRows(prev => { const next = new Set(prev); next.delete(invoiceId); return next; });
      }
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = inv.invoice_to?.toLowerCase().includes(searchTerm.toLowerCase()) || inv.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const isCredit = inv.id.startsWith("CR-") || inv.status === "Credit";
      let matchesTab = true;

      if (activeTab === 'INVOICE') {
        matchesTab = !isCredit; 
      } else if (activeTab === 'CREDIT') {
        matchesTab = isCredit; 
      }

      return matchesSearch && matchesTab;
    });
  }, [invoices, searchTerm, activeTab]);

  const paginatedInvoices = useMemo(() => {
    if (pageSize === "all") return filteredInvoices;
    const limit = parseInt(pageSize);
    const startIndex = (currentPage - 1) * limit;
    return filteredInvoices.slice(startIndex, startIndex + limit);
  }, [filteredInvoices, currentPage, pageSize]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(filteredInvoices.length / parseInt(pageSize));

  const pageTotal = useMemo(() => {
    return paginatedInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  }, [paginatedInvoices]);

  const tabCounts = useMemo(() => {
    const creditCount = invoices.filter(inv => inv.id.startsWith("CR-") || inv.status === "Credit").length;
    return {
      all: invoices.length,
      credit: creditCount,
      invoice: invoices.length - creditCount
    };
  }, [invoices]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSelected = new Set(selectedIds);
    if (e.target.checked) { paginatedInvoices.forEach(inv => newSelected.add(inv.id)); } 
    else { paginatedInvoices.forEach(inv => newSelected.delete(inv.id)); }
    setSelectedIds(newSelected);
  };
  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };
  const isAllSelected = paginatedInvoices.length > 0 && paginatedInvoices.every(inv => selectedIds.has(inv.id));

  // --- Actions Handlers ---
  const handleDownload = async (id: string) => { 
    setOpenMenuId(null); 
    await downloadInvoicePdf(id); 
  };
  const handlePrint = async (id: string) => { 
    setOpenMenuId(null); 
    await printInvoicePdf(id); 
  };
  
  const handleBulkDownload = async () => { 
    if (selectedIds.size === 0) return; 
    if (!confirm(`Download ${selectedIds.size} invoices?`)) return; 
    setLoading(true); 
    await downloadBulkPdf(Array.from(selectedIds)); 
    setLoading(false); 
  };
  
  const handleBulkPrint = async () => { 
    if (selectedIds.size === 0) return; 
    if (!confirm(`Print ${selectedIds.size} invoices?`)) return; 
    setLoading(true); 
    await printBulkPdf(Array.from(selectedIds)); 
    setLoading(false); 
  };
  
  const handleProductSummary = async () => { 
    if (selectedIds.size === 0) return; 
    setLoading(true); 
    await downloadPickingSummary(Array.from(selectedIds)); 
    setLoading(false); 
  };
  
  // ✅ [수정됨] 단일 삭제: 재고 원복 로직 추가
  const handleDelete = async (id: string) => { 
    if(!confirm("Are you sure you want to delete this? This will restore stock.")) return; 
    setLoading(true); 
    try { 
      // 1. Credit Note 관련 삭제
      if (id.startsWith("CR-")) {
          await supabase.from("payment_allocations").delete().eq("payment_id", id);
          await supabase.from("payments").delete().eq("id", id);
      }

      // 2. [NEW] 재고 원복 로직
      // 삭제할 아이템 정보 조회 (product_id 필요)
      const { data: itemsToDelete } = await supabase
          .from("invoice_items")
          .select("product_id, quantity, unit")
          .eq("invoice_id", id);

      if (itemsToDelete && itemsToDelete.length > 0) {
          for (const item of itemsToDelete) {
              if (!item.product_id) continue;

              const { data: product } = await supabase
                  .from("products")
                  .select("current_stock_level, current_stock_level_pack")
                  .eq("id", item.product_id)
                  .single();

              if (product) {
                  let currentCtn = product.current_stock_level || 0;
                  let currentPack = product.current_stock_level_pack || 0;

                  // 삭제 시에는 수량을 다시 더해줌 (+)
                  if (item.unit === "CTN") {
                      currentCtn += item.quantity;
                  } else {
                      currentPack += item.quantity;
                  }

                  await supabase
                      .from("products")
                      .update({ 
                          current_stock_level: currentCtn,
                          current_stock_level_pack: currentPack
                      })
                      .eq("id", item.product_id);
              }
          }
      }

      // 3. 아이템 및 인보이스 삭제
      await supabase.from("invoice_items").delete().eq("invoice_id", id); 
      await supabase.from("invoices").delete().eq("id", id); 
      
      fetchInvoices(); 
      alert("Deleted successfully and stock restored.");
    } catch (e: any) { 
      console.error(e);
      alert("Error: " + e.message); 
    } finally { 
      setLoading(false); 
      setOpenMenuId(null);
    } 
  };

  // ✅ [수정됨] 일괄 삭제: 재고 원복 로직 추가
  const handleBulkDelete = async () => { 
    if (!confirm(`Delete ${selectedIds.size} invoices? This will restore stock.`)) return; 
    setLoading(true);
    try {
        const ids = Array.from(selectedIds);
        const creditIds = ids.filter(id => id.startsWith("CR-"));
        
        if (creditIds.length > 0) {
            await supabase.from("payment_allocations").delete().in("payment_id", creditIds);
            await supabase.from("payments").delete().in("id", creditIds);
        }

        // [NEW] 일괄 재고 원복
        const { data: allItemsToDelete } = await supabase
            .from("invoice_items")
            .select("product_id, quantity, unit")
            .in("invoice_id", ids);

        if (allItemsToDelete && allItemsToDelete.length > 0) {
            // 제품별로 수량 합산 (DB 호출 최소화)
            const stockUpdates: Record<string, { ctn: number, pack: number }> = {};

            for (const item of allItemsToDelete) {
                if (!item.product_id) continue;
                if (!stockUpdates[item.product_id]) {
                    stockUpdates[item.product_id] = { ctn: 0, pack: 0 };
                }
                if (item.unit === "CTN") {
                    stockUpdates[item.product_id].ctn += item.quantity;
                } else {
                    stockUpdates[item.product_id].pack += item.quantity;
                }
            }

            // 각 제품별로 업데이트 실행
            for (const [prodId, adjustment] of Object.entries(stockUpdates)) {
                const { data: product } = await supabase
                    .from("products")
                    .select("current_stock_level, current_stock_level_pack")
                    .eq("id", prodId)
                    .single();

                if (product) {
                    await supabase
                        .from("products")
                        .update({
                            current_stock_level: (product.current_stock_level || 0) + adjustment.ctn,
                            current_stock_level_pack: (product.current_stock_level_pack || 0) + adjustment.pack
                        })
                        .eq("id", prodId);
                }
            }
        }

        await supabase.from("invoice_items").delete().in("invoice_id", ids);
        const { error } = await supabase.from("invoices").delete().in("id", ids); 
        
        if (error) throw error;
        
        alert("Deleted and stock restored."); 
        setSelectedIds(new Set()); 
        fetchInvoices(); 
    } catch (e: any) {
        console.error(e);
        alert("Failed: " + e.message);
    } finally {
        setLoading(false);
    }
  };
  
  const handleEdit = (id: string) => {
    if (id.startsWith("CR-")) {
      router.push(`/invoice/edit/${id}`); 
    } else {
      router.push(`/invoice/edit/${id}`);
    }
  };
  
  const formatCurrency = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(roundAmount(amount));
  
  const renderStatus = (status: string) => {
    switch (status) {
      case "Paid": return <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200">PAID</span>;
      case "Partial": return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full border border-amber-200">PARTIAL</span>;
      case "Credit": return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200">CREDIT</span>;
      default: return <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200">UNPAID</span>;
    }
  };
  const clearDates = () => { setStartDate(""); setEndDate(""); };
  
  // @ts-ignore
  const startResizing = (key: keyof typeof INITIAL_WIDTHS, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] }; document.body.style.cursor = "col-resize"; };
  
  const measureTextWidth = (text: string, font = "14px sans-serif") => { const canvas = document.createElement("canvas"); const context = canvas.getContext("2d"); return context ? (context.font = font, context.measureText(text).width) : 0; };
  
  // @ts-ignore
  const autoFitColumn = (key: keyof typeof INITIAL_WIDTHS) => { 
    let maxContentWidth = 0; 
    paginatedInvoices.forEach(inv => { 
      let text = ""; 
      if (key === 'total_amount') text = formatCurrency(inv[key] || 0); 
      else if (key === 'status') text = inv.status; 
      else if (inv[key]) text = String(inv[key]); 
      const width = measureTextWidth(text); 
      if (width > maxContentWidth) maxContentWidth = width; 
    }); 
    // @ts-ignore
    setColWidths(prev => ({ ...prev, [key]: Math.min(Math.max(80, maxContentWidth + 40), 600) })); 
  };
  
  const Resizer = ({ colKey }: { colKey: keyof typeof INITIAL_WIDTHS }) => ( <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-400 z-10 select-none group-hover:bg-slate-200/50" onMouseDown={(e) => startResizing(colKey, e)} onDoubleClick={() => autoFitColumn(colKey)} /> );

  return (
    <div className="p-6 max-w-[1600px] mx-auto min-h-screen pb-20 space-y-6" onClick={() => setOpenMenuId(null)}>
      {/* 1. Header (Button Removed) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 text-sm mt-1">Manage {title.toLowerCase()}, track payments & reporting.</p>
        </div>
        {/* Create Invoice 버튼은 아래로 이동됨 */}
      </div>

      {/* 2. Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 px-2">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-bold text-blue-800">{selectedIds.size} Selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleProductSummary} className="px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 transition-colors"><Box className="w-3.5 h-3.5" /> Picking Summary (.txt)</button>
            <button onClick={handleBulkPrint} className="px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 transition-colors"><Printer className="w-3.5 h-3.5" /> Print Selected</button>
            <button onClick={handleBulkDownload} className="px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 transition-colors"><Download className="w-3.5 h-3.5" /> Download Selected</button>
            <button onClick={handleBulkDelete} className="px-4 py-2 bg-white text-red-600 text-xs font-bold rounded-lg border border-slate-200 hover:bg-red-50 hover:border-red-200 flex items-center gap-2 transition-colors"><Trash2 className="w-3.5 h-3.5" /> Delete Selected</button>
          </div>
        </div>
      )}

      {/* 3. [UPDATED] Tabs (Left) + Create Button (Right) */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Tab Group */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200">
            <button 
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
            >
            <FileStack className="w-4 h-4"/>
            All <span className="text-xs opacity-60 bg-slate-100 px-1.5 py-0.5 rounded-full ml-1 border border-slate-200">{tabCounts.all}</span>
            </button>
            <button 
            onClick={() => setActiveTab('INVOICE')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'INVOICE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
            >
            <Receipt className="w-4 h-4"/>
            Invoices <span className="text-xs opacity-60 bg-slate-100 px-1.5 py-0.5 rounded-full ml-1 border border-slate-200">{tabCounts.invoice}</span>
            </button>
            <button 
            onClick={() => setActiveTab('CREDIT')}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'CREDIT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
            >
            <CreditCard className="w-4 h-4"/>
            Credit Notes <span className="text-xs opacity-60 bg-slate-100 px-1.5 py-0.5 rounded-full ml-1 border border-slate-200">{tabCounts.credit}</span>
            </button>
        </div>

        {/* Create Button (Moved Here) */}
        <Link href="/invoice/new">
          <button className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md active:scale-95">
            <Plus className="w-4 h-4" /> Create Invoice
          </button>
        </Link>
      </div>

      {/* 4. Filters & Total */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Left Side: Date, Search, Total */}
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3 w-full">
          
          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32"/>
            <span className="text-slate-400">-</span>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32"/>
            <button onClick={clearDates}><X className="w-4 h-4"/></button>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-2 w-4 h-4 text-slate-400"/>
            <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg"/>
          </div>

          {/* Total Badge */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg shadow-sm whitespace-nowrap">
            <Calculator className="w-4 h-4 opacity-70" />
            <span className="text-xs font-medium opacity-80 uppercase">Total:</span>
            <span className="text-sm font-bold">{formatCurrency(pageTotal)}</span>
          </div>

        </div>

        {/* Right Side: Page Size */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase">Show:</span>
          <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg" value={pageSize} onChange={e=>setPageSize(e.target.value)}>
            <option value="5">5 Rows</option>
            <option value="10">10 Rows</option>
            <option value="30">30 Rows</option>
            <option value="all">All ({filteredInvoices.length})</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[400px] flex flex-col justify-between">
        
        {/* pb-40 추가: 스크롤 여백 확보 */}
        <div className="overflow-x-auto pb-40">
          <table className="w-full text-left border-collapse table-fixed">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase font-bold tracking-wide whitespace-nowrap">
              <tr>
                <th className="px-6 py-4" style={{ width: colWidths.checkbox }}><input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="w-4 h-4"/></th>
                <th className="px-6 py-4 relative group" style={{width:colWidths.id}}>Invoice # <Resizer colKey="id"/></th>
                <th className="px-6 py-4 relative group" style={{width:colWidths.invoice_to}}>Customer <Resizer colKey="invoice_to"/></th>
                <th className="px-6 py-4 relative group" style={{width:colWidths.invoice_date}}>Date <Resizer colKey="invoice_date"/></th>
                <th className="px-6 py-4 relative group" style={{width:colWidths.due_date}}>Due Date <Resizer colKey="due_date"/></th>
                
                <th className="px-6 py-4 text-right relative group" style={{width:colWidths.total_amount}}>Total <Resizer colKey="total_amount"/></th>
                
                <th className="px-6 py-4 text-center relative group" style={{width:colWidths.driver_id}}>Delivery By <Resizer colKey="driver_id"/></th>
                <th className="px-6 py-4 text-center relative group" style={{width:colWidths.is_completed}}>Delivered? <Resizer colKey="is_completed"/></th>

                <th className="px-6 py-4 text-center relative group" style={{width:colWidths.status}}>Status <Resizer colKey="status"/></th>
                <th className="px-6 py-4 text-center relative group" style={{width:colWidths.actions}}>Actions <Resizer colKey="actions"/></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? <tr><td colSpan={10} className="p-20 text-center animate-pulse">Loading...</td></tr> : 
                paginatedInvoices.map(inv => {
                  const isExpanded = expandedRowIds.has(inv.id);
                  const isOverdue = inv.status !== "Paid" && inv.status !== "Credit" && inv.due_date < today;
                  const isCredit = inv.status === "Credit" || inv.id.startsWith("CR-");
                  
                  const driverName = inv.driver_id ? (driversMap[inv.driver_id] || "Unknown") : null;
                  
                  const balanceDue = (inv.total_amount || 0) - (inv.paid_amount || 0);

                  return (
                    <React.Fragment key={inv.id}>
                      <tr className={`transition-colors border-b border-slate-100 whitespace-nowrap ${selectedIds.has(inv.id) ? "bg-blue-50/50" : isExpanded ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                        <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.has(inv.id)} onChange={()=>handleSelectOne(inv.id)} className="w-4 h-4"/></td>
                        
                        <td className="px-6 py-4 font-semibold text-slate-700">
                          {isCredit ? (
                             <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold text-xs">{inv.id}</span>
                          ) : (
                             `#${inv.id}`
                          )}
                        </td>

                        <td className="px-6 py-4 font-bold text-slate-900 truncate" title={inv.invoice_to}>{inv.invoice_to}</td>
                        <td className="px-6 py-4 text-slate-500">{inv.invoice_date}</td>
                        
                        <td className={`px-6 py-4 truncate ${isOverdue ? "text-red-600 font-bold" : "text-slate-500"}`}>
                          <div className="flex items-center gap-1">
                            {inv.due_date}
                            {isOverdue && (
                              <div className="flex items-center text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 ml-1" title="Payment Overdue">
                                <AlertCircle className="w-3 h-3 mr-0.5" /> LATE
                              </div>
                            )}
                          </div>
                        </td>

                        <td className={`px-6 py-4 text-right font-bold ${isCredit ? "text-blue-700" : "text-slate-900"}`}>{formatCurrency(inv.total_amount)}</td>
                        
                        <td className="px-6 py-4 text-center">
                          {inv.is_pickup ? (
                             <div className="flex items-center justify-center gap-1.5 text-purple-700 font-bold bg-purple-50 px-2 py-1 rounded-full border border-purple-200">
                                 <Package className="w-3.5 h-3.5" />
                                 <span className="text-xs">Pick Up</span>
                             </div>
                          ) : driverName ? (
                             <div className="flex items-center justify-center gap-1.5 text-slate-700 font-medium">
                                 <Truck className="w-3.5 h-3.5 text-slate-400" />
                                 <span className="truncate max-w-[100px]" title={driverName}>{driverName}</span>
                             </div>
                          ) : (
                             <span className="text-slate-300 text-xs italic">Unassigned</span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-center">
                          {inv.is_completed || inv.is_pickup ? (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200">
                                 <CheckCircle2 className="w-3 h-3" /> Done
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200">
                                 <Circle className="w-3 h-3" /> Pending
                             </span>
                          )}
                        </td>

                        <td className="px-6 py-4 text-center">{renderStatus(inv.status)}</td>
                        <td className="px-6 py-4 text-center relative">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => toggleRow(inv.id)} className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-slate-200 text-slate-800' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <div className="relative">
                              <button onClick={(e)=>{e.stopPropagation(); setOpenMenuId(openMenuId===inv.id?null:inv.id)}} className="p-2 hover:bg-slate-200 rounded-full"><MoreHorizontal className="w-4 h-4"/></button>
                              {openMenuId === inv.id && (
                                <div ref={menuRef} className="absolute right-0 top-10 w-48 bg-white border shadow-xl z-50 py-1" onClick={e=>e.stopPropagation()}>
                                  
                                  {/* Receive Payment 버튼 (Credit 아닐 때만) */}
                                  {!isCredit && (
                                     <button 
                                         onClick={() => handlePaymentRedirect(inv.customer_id || "")} 
                                         className="w-full px-4 py-2 text-sm text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 flex gap-2 border-b border-slate-100 mb-1"
                                     >
                                         <DollarSign className="w-4 h-4"/> Receive Payment
                                     </button>
                                  )}

                                  {/* Email Action */}
                                  <button onClick={()=>handleEmail(inv)} className="w-full px-4 py-2 text-sm hover:bg-slate-50 flex gap-2"><Mail className="w-4 h-4 text-purple-600"/> Email Invoice</button>
                                  
                                  <button onClick={()=>handlePrint(inv.id)} className="w-full px-4 py-2 text-sm hover:bg-slate-50 flex gap-2"><Printer className="w-4 h-4"/> Print</button>
                                  <button onClick={()=>handleDownload(inv.id)} className="w-full px-4 py-2 text-sm hover:bg-slate-50 flex gap-2"><Download className="w-4 h-4"/> PDF</button>
                                  <div className="border-t my-1"></div>
                                  
                                  <button onClick={()=>handleEdit(inv.id)} className="w-full px-4 py-2 text-sm hover:bg-slate-50 flex gap-2"><Edit className="w-4 h-4"/> Edit</button>
                                  
                                  <button onClick={()=>handleDelete(inv.id)} className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex gap-2"><Trash2 className="w-4 h-4"/> Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                          <td colSpan={10} className="px-6 py-4 pl-14">
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                              <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-2">
                                <div>
                                  <h4 className="font-bold text-slate-800 text-sm mb-1">
                                      {isCredit ? "Credit Memo Details" : `Invoice Details #${inv.id}`}
                                  </h4>
                                  {inv.memo && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mb-2">📝 Memo: {inv.memo}</p>}
                                  <div className="text-[10px] text-slate-400 flex flex-col gap-0.5 mt-2">
                                      <span>Created: {inv.created_who || "-"}</span>
                                      <span>Updated: {inv.updated_who || "-"}</span>
                                  </div>
                                </div>

                                <div className="text-right text-xs text-slate-500">
                                  <p>Subtotal: <span className="font-medium text-slate-700">{formatCurrency(inv.subtotal || 0)}</span></p>
                                  <p>Total GST: <span className="font-medium text-slate-700">{formatCurrency(inv.gst_total || 0)}</span></p>
                                  <p className="mt-1">Total (inc GST): <span className={`font-bold ${isCredit ? "text-blue-700" : "text-slate-800"}`}>{formatCurrency(inv.total_amount)}</span></p>
                                  {!isCredit && (
                                     <>
                                         <p className="text-emerald-600 font-medium">Received: - {formatCurrency(inv.paid_amount || 0)}</p>
                                         <div className="mt-2 pt-1 border-t border-slate-200">
                                             <p className="text-sm font-black text-slate-900 uppercase">Balance Due: {formatCurrency(balanceDue)}</p>
                                         </div>
                                     </>
                                  )}
                                </div>
                              </div>
                              {loadingRows.has(inv.id) ? ( <div className="text-center py-4 text-slate-400 text-sm">Loading items...</div> ) : (
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-slate-100 text-slate-500 font-bold border-b border-slate-200">
                                    <tr><th className="px-3 py-2">Product Name</th><th className="px-3 py-2 text-center">Unit</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2 text-right">Base Price</th><th className="px-3 py-2 text-right">Net Price (Unit)</th><th className="px-3 py-2 text-right text-red-500">Disc %</th><th className="px-3 py-2 text-right">Total Price</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {(detailsCache[inv.id] || []).map((item, idx) => {
                                      const unitMatch = item.description.match(/\((CTN|PACK)\)$/);
                                      const unit = item.unit || (unitMatch ? unitMatch[1] : "EA");
                                      const cleanName = item.description.replace(/\((CTN|PACK)\)$/, '').trim();
                                      const qty = item.quantity;
                                      const basePrice = item.base_price || item.unit_price; 
                                      const netPrice = item.unit_price;
                                      const finalTotal = item.amount || (netPrice * qty);
                                      const discountRate = item.discount || 0;
                                      return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-medium text-slate-700">{cleanName}</td><td className="px-3 py-2 text-center text-slate-400">{unit}</td><td className="px-3 py-2 text-center font-bold text-slate-700">{qty}</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(basePrice)}</td><td className="px-3 py-2 text-right font-medium text-slate-700">{formatCurrency(netPrice)}</td><td className="px-3 py-2 text-right text-red-400">{discountRate > 0 ? `${discountRate}%` : "-"}</td><td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(finalTotal)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                   );
                 })
               }
             </tbody>
           </table>
         </div>
         
         {filteredInvoices.length > 0 && pageSize !== "all" && (
           <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
             <span className="text-xs text-slate-500 font-medium">Showing <strong className="text-slate-900">{(currentPage - 1) * parseInt(pageSize) + 1}</strong> to <strong className="text-slate-900">{Math.min(currentPage * parseInt(pageSize), filteredInvoices.length)}</strong> of <strong className="text-slate-900">{filteredInvoices.length}</strong></span>
             <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"><ChevronLeft className="w-4 h-4 text-slate-600" /></button><span className="text-sm font-bold text-slate-700 px-2">{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"><ChevronRight className="w-4 h-4 text-slate-600" /></button></div>
           </div>
         )}
       </div>

       {/* [NEW] Email Send Dialog */}
       <EmailSendDialog 
         open={!!emailTarget} 
         onOpenChange={(open) => !open && setEmailTarget(null)}
         data={emailTarget as any}
       />

    </div> 
  );
}