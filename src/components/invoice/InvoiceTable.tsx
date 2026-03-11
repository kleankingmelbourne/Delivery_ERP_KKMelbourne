"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Search, MoreHorizontal, Printer, Trash2, Edit,
  ChevronLeft, ChevronRight, X, CheckSquare, Box,
  Download, ChevronDown, ChevronUp, Mail,
  AlertCircle, Truck, CheckCircle2, Circle, Package, DollarSign,
  Calculator, Receipt, FileStack, Image as ImageIcon, Layers, 
  CreditCard 
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  downloadInvoicePdf, 
  printInvoicePdf, 
  downloadBulkPdf, 
  printBulkPdf, 
  downloadPickingSummary, 
  downloadPackingListPdf, 
} from "@/utils/downloadPdf"; 

import EmailSendDialog from "@/components/email/EmailSendDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- [Utility] Currency Format ---
const formatCurrency = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(roundAmount(amount));

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
  proof_url?: string; 
  
  driver?: { display_name: string } | null; 
  // 🚀 [추가] email_cc 타입 정의
  customers?: { email: string; email_cc?: string } | null;

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
  product_id?: string; 
  products?: { buy_price?: number; total_pack_ctn?: number } | null;
}

interface InvoiceTableProps {
  filterStatus: "ALL" | "PAID" | "UNPAID";
  title: string;
}

type TabType = 'ALL' | 'INVOICE' | 'CREDIT';

export default function InvoiceTable({ filterStatus, title }: InvoiceTableProps) {
  const supabase = createClient();
  const router = useRouter();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [today, setToday] = useState(""); 
  const [startDate, setStartDate] = useState(""); 
  const [endDate, setEndDate] = useState("");
  
  const [activeTab, setActiveTab] = useState<TabType>('ALL');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("10"); 
  const [totalCount, setTotalCount] = useState(0); 

  const [emailTarget, setEmailTarget] = useState<{
    id: string;
    type: 'invoice';
    customerName: string;
    customerEmail: string;
    customerEmailCc?: string; // 🚀 [추가] CC 이메일 상태
    docNumber: string;
  } | null>(null);

  const [viewProofUrl, setViewProofUrl] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [detailsCache, setDetailsCache] = useState<Record<string, InvoiceItem[]>>({});
  const [loadingRows, setLoadingRows] = useState<Set<string>>(new Set());

  const isInitialMount = useRef(true);

  // [컬럼 리사이징] 상태 및 참조 변수 추가
  const tableRef = useRef<HTMLTableElement>(null);
  const [colWidths, setColWidths] = useState<{ [key: number]: number }>({});
  const resizingCol = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;

    setToday(localDate);     

    const storageKey = `invoiceFilters_${filterStatus}`;
    const savedFilters = sessionStorage.getItem(storageKey);

    if (savedFilters) {
        try {
            const parsed = JSON.parse(savedFilters);
            setStartDate(parsed.startDate || localDate);
            setEndDate(parsed.endDate || localDate);
            setSearchTerm(parsed.searchTerm || "");
            setActiveTab(parsed.activeTab || 'ALL');
            setCurrentPage(parsed.currentPage || 1);
            setPageSize(parsed.pageSize || "10");
        } catch (e) {
            setStartDate(localDate);
            setEndDate(localDate);
        }
    } else {
        setStartDate(localDate);
        setEndDate(localDate);
    }
  }, [filterStatus]);

  useEffect(() => {
    if (!startDate || !endDate) return; 

    const filtersToSave = {
        startDate,
        endDate,
        searchTerm,
        activeTab,
        currentPage,
        pageSize
    };
    sessionStorage.setItem(`invoiceFilters_${filterStatus}`, JSON.stringify(filtersToSave));
  }, [startDate, endDate, searchTerm, activeTab, currentPage, pageSize, filterStatus]);


  const buildQuery = useCallback((isCountQuery: boolean = false) => {
    let query = supabase.from("invoices") as any;

    if (isCountQuery) {
        query = query.select("id", { count: 'exact', head: true }); 
    } else {
        // 🚀 [수정] customers 에서 email 뿐만 아니라 email_cc 도 가져옵니다.
        query = query.select(`
        id,
        invoice_to,
        invoice_date,
        due_date,
        total_amount,
        paid_amount,
        status,
        is_pickup,
        is_completed,
        proof_url,
        customer_id,
        driver_id,
        driver:driver_id ( display_name ),
        customers ( email, email_cc )
      `);
    }

    if (filterStatus === "PAID") {
      query = query.eq("status", "Paid");
    } else if (filterStatus === "UNPAID") {
      query = query.in("status", ["Unpaid", "Partial"]);
    }

    if (startDate) query = query.gte("invoice_date", startDate);
    if (endDate) query = query.lte("invoice_date", `${endDate}T23:59:59`);

    if (activeTab === 'INVOICE') {
        query = query.not('id', 'ilike', 'CR-%').neq('status', 'Credit');
    } else if (activeTab === 'CREDIT') {
        query = query.or('status.eq.Credit,id.ilike.CR-%');
    }

    if (searchTerm) {
        query = query.or(`invoice_to.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%`);
    }

    return query;
  }, [supabase, filterStatus, startDate, endDate, activeTab, searchTerm]);

  useEffect(() => {
    const fetchCount = async () => {
        if (!startDate || !endDate) return;
        const query = buildQuery(true);
        const { count, error } = await query;
        if (!error && count !== null) {
            setTotalCount(count);
        }
    };
    fetchCount();
  }, [buildQuery, startDate, endDate]); 

  const fetchInvoices = useCallback(async () => {
    if (!startDate || !endDate) return;
    
    setLoading(true);
    
    let query = buildQuery(false);

    const limit = pageSize === "all" ? 10000 : parseInt(pageSize);
    const from = (currentPage - 1) * limit;
    const to = from + limit - 1;

    query = query.order("id", { ascending: false }).range(from, to);

    const { data, error } = await query;

    if (!error && data) {
      setInvoices(data);
    } else {
        console.error(error);
    }
    setLoading(false);
  }, [buildQuery, currentPage, pageSize, startDate, endDate]);

  useEffect(() => { 
    fetchInvoices(); 
  }, [fetchInvoices]); 

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
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }
    setCurrentPage(1);
    setSelectedIds(new Set()); 
    setExpandedRowIds(new Set()); 
  }, [searchTerm, startDate, endDate, activeTab]); 


  const handleEmail = (invoice: Invoice) => {
    setOpenMenuId(null); 

    // 🚀 [추가] customerEmailCc 속성 전달
    setEmailTarget({
      id: invoice.id,
      type: 'invoice',
      customerName: invoice.invoice_to || "Customer",
      customerEmail: invoice.customers?.email || "", 
      customerEmailCc: invoice.customers?.email_cc || "",
      docNumber: invoice.id,
    });

    // 만약 JOIN이 실패했거나 정보가 비어있을 때를 대비한 백업 데이터 Fetch
    if (!invoice.customers?.email && invoice.customer_id) {
      (async () => {
        const { data } = await supabase
            .from('customers')
            .select('email, email_cc') // 🚀 백업 쿼리에도 email_cc 포함
            .eq('id', invoice.customer_id)
            .single();
        
        if (data) {
            setEmailTarget((prev) => {
              if (!prev || prev.id !== invoice.id) return prev;
              return { 
                  ...prev, 
                  customerEmail: data.email || prev.customerEmail,
                  customerEmailCc: data.email_cc || prev.customerEmailCc
              };
            });
        }
      })();
    }
  };

  const handlePaymentRedirect = (customerId: string) => {
    if (!customerId) return alert("Customer information is missing.");
    router.push(`/payment/new?customerId=${customerId}`);
  };

  const handlePackingList = async (id: string) => {
    setOpenMenuId(null);
    await downloadPackingListPdf(id);
  };

  const toggleRow = async (invoiceId: string) => {
    const newExpanded = new Set(expandedRowIds);
    if (newExpanded.has(invoiceId)) {
      newExpanded.delete(invoiceId);
      setExpandedRowIds(newExpanded);
    } else {
      newExpanded.add(invoiceId);
      setExpandedRowIds(newExpanded);
      
      const targetInvoice = invoices.find(inv => inv.id === invoiceId);
      const isDetailsLoaded = targetInvoice && 'memo' in targetInvoice;

      if (!detailsCache[invoiceId] || !isDetailsLoaded) {
        setLoadingRows(prev => new Set(prev).add(invoiceId));

        const [itemsRes, detailsRes] = await Promise.all([
          supabase.from("invoice_items").select("*, products(buy_price, total_pack_ctn)").eq("invoice_id", invoiceId),
          supabase.from("invoices")
            .select("subtotal, gst_total, memo, created_who, updated_who")
            .eq("id", invoiceId)
            .single()
        ]);

        if (!itemsRes.error && itemsRes.data) {
            setDetailsCache(prev => ({ ...prev, [invoiceId]: itemsRes.data }));
        }

        if (!detailsRes.error && detailsRes.data) {
            setInvoices(prev => prev.map(inv => {
              if (inv.id === invoiceId) {
                  const newData = detailsRes.data as any;
                  const safeCustomer = Array.isArray(newData.customers) 
                      ? newData.customers[0] 
                      : newData.customers;

                  return { 
                      ...inv, 
                      ...newData,
                      customers: safeCustomer 
                  };
              }
              return inv;
            }));
        }
        setLoadingRows(prev => { const next = new Set(prev); next.delete(invoiceId); return next; });
      }
    }
  };

  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalCount / parseInt(pageSize));

  const pageTotal = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  }, [invoices]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSelected = new Set(selectedIds);
    if (e.target.checked) { invoices.forEach(inv => newSelected.add(inv.id)); } 
    else { invoices.forEach(inv => newSelected.delete(inv.id)); }
    setSelectedIds(newSelected);
  };
  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };
  const isAllSelected = invoices.length > 0 && invoices.every(inv => selectedIds.has(inv.id));

  const handleDetailView = async (type: 'show' | 'hide') => {
      if (type === 'hide') {
          setExpandedRowIds(new Set());
      } else {
          const allIds = invoices.map(inv => inv.id);
          const newExpanded = new Set(allIds);
          const missingIds = allIds.filter(id => !detailsCache[id]);
          
          if (missingIds.length > 0) {
              setLoadingRows(new Set(missingIds)); 
              const { data: items, error } = await supabase
                  .from("invoice_items")
                  .select("*, products(buy_price, total_pack_ctn)")
                  .in("invoice_id", missingIds);

              if (!error && items) {
                  const newCache = { ...detailsCache };
                  items.forEach((item: any) => {
                      if (!newCache[item.invoice_id]) newCache[item.invoice_id] = [];
                      newCache[item.invoice_id].push(item);
                  });
                  missingIds.forEach(id => { if (!newCache[id]) newCache[id] = []; });
                  setDetailsCache(newCache);
              }
              setLoadingRows(new Set()); 
          }
          setExpandedRowIds(newExpanded);
      }
  };

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
  
  const handleDelete = async (id: string) => { 
    if(!confirm("Are you sure you want to delete this? This will restore stock.")) return; 
    setLoading(true); 
    try { 
      if (id.startsWith("CR-")) {
          const { data: allocations } = await supabase.from("payment_allocations").select("invoice_id, amount").eq("payment_id", id);
          if (allocations && allocations.length > 0) {
              const invoiceIdsToUpdate = allocations.map(a => a.invoice_id);
              const { data: targetInvs } = await supabase.from("invoices").select("id, total_amount, paid_amount").in("id", invoiceIdsToUpdate);
              
              if (targetInvs && targetInvs.length > 0) {
                  const updates = targetInvs.map(targetInv => {
                      const alloc = allocations.find(a => a.invoice_id === targetInv.id);
                      const allocAmount = alloc ? alloc.amount : 0;
                      const newPaid = Math.max(0, (targetInv.paid_amount || 0) - allocAmount);
                      let newStatus = "Unpaid";
                      if (newPaid >= targetInv.total_amount && targetInv.total_amount > 0) newStatus = "Paid";
                      else if (newPaid > 0) newStatus = "Partial";
                      
                      return supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", targetInv.id);
                  });
                  await Promise.all(updates);
              }
          }
          await supabase.from("payment_allocations").delete().eq("payment_id", id);
          await supabase.from("payments").delete().eq("id", id);
      }

      const { data: itemsToDelete } = await supabase.from("invoice_items").select("product_id, quantity, unit").eq("invoice_id", id);
      
      if (itemsToDelete && itemsToDelete.length > 0) {
          const stockUpdates: Record<string, { ctn: number, pack: number }> = {};
          itemsToDelete.forEach(item => {
              if (!item.product_id) return;
              if (!stockUpdates[item.product_id]) stockUpdates[item.product_id] = { ctn: 0, pack: 0 };
              
              if (item.unit === "CTN") stockUpdates[item.product_id].ctn += item.quantity;
              else stockUpdates[item.product_id].pack += item.quantity;
          });

          const productIds = Object.keys(stockUpdates);

          if (productIds.length > 0) {
              const { data: products } = await supabase.from("products").select("id, current_stock_level, current_stock_level_pack").in("id", productIds);
              
              if (products && products.length > 0) {
                  const updatePromises = products.map(product => {
                      const adjustment = stockUpdates[product.id];
                      return supabase.from("products").update({
                          current_stock_level: (product.current_stock_level || 0) + adjustment.ctn,
                          current_stock_level_pack: (product.current_stock_level_pack || 0) + adjustment.pack
                      }).eq("id", product.id);
                  });
                  await Promise.all(updatePromises);
              }
          }
      }

      await supabase.from("invoice_items").delete().eq("invoice_id", id); 
      await supabase.from("invoices").delete().eq("id", id); 
      
      fetchInvoices(); 
      setTotalCount(prev => Math.max(0, prev - 1));
      
      alert("Deleted successfully and stock/status restored.");
    } catch (e: any) { 
      console.error(e);
      alert("Error: " + e.message); 
    } finally { 
      setLoading(false); 
      setOpenMenuId(null);
    } 
  };

  const handleBulkDelete = async () => { 
    if (!confirm(`Delete ${selectedIds.size} invoices? This will restore stock.`)) return; 
    setLoading(true);
    try {
        const ids = Array.from(selectedIds);
        const creditIds = ids.filter(id => id.startsWith("CR-"));
        
        if (creditIds.length > 0) {
            const { data: allocations } = await supabase.from("payment_allocations").select("invoice_id, amount, payment_id").in("payment_id", creditIds);
            if (allocations && allocations.length > 0) {
                const invoiceIdsToUpdate = allocations.map(a => a.invoice_id);
                const { data: targetInvs } = await supabase.from("invoices").select("id, total_amount, paid_amount").in("id", invoiceIdsToUpdate);
                
                if (targetInvs && targetInvs.length > 0) {
                    const updates = targetInvs.map(targetInv => {
                        const allocsForThisInv = allocations.filter(a => a.invoice_id === targetInv.id);
                        const totalAllocAmount = allocsForThisInv.reduce((sum, a) => sum + a.amount, 0);
                        const newPaid = Math.max(0, (targetInv.paid_amount || 0) - totalAllocAmount);
                        let newStatus = "Unpaid";
                        if (newPaid >= targetInv.total_amount && targetInv.total_amount > 0) newStatus = "Paid";
                        else if (newPaid > 0) newStatus = "Partial";
                        
                        return supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", targetInv.id);
                    });
                    await Promise.all(updates);
                }
            }
            await supabase.from("payment_allocations").delete().in("payment_id", creditIds);
            await supabase.from("payments").delete().in("id", creditIds);
        }

        const { data: allItemsToDelete } = await supabase.from("invoice_items").select("product_id, quantity, unit").in("invoice_id", ids);
        
        if (allItemsToDelete && allItemsToDelete.length > 0) {
            const stockUpdates: Record<string, { ctn: number, pack: number }> = {};
            allItemsToDelete.forEach(item => {
                if (!item.product_id) return;
                if (!stockUpdates[item.product_id]) stockUpdates[item.product_id] = { ctn: 0, pack: 0 };
                
                if (item.unit === "CTN") stockUpdates[item.product_id].ctn += item.quantity;
                else stockUpdates[item.product_id].pack += item.quantity;
            });

            const productIds = Object.keys(stockUpdates);

            if (productIds.length > 0) {
                const { data: products } = await supabase.from("products").select("id, current_stock_level, current_stock_level_pack").in("id", productIds);
                
                if (products && products.length > 0) {
                    const updatePromises = products.map(product => {
                        const adjustment = stockUpdates[product.id];
                        return supabase.from("products").update({
                            current_stock_level: (product.current_stock_level || 0) + adjustment.ctn,
                            current_stock_level_pack: (product.current_stock_level_pack || 0) + adjustment.pack
                        }).eq("id", product.id);
                    });
                    await Promise.all(updatePromises);
                }
            }
        }

        await supabase.from("invoice_items").delete().in("invoice_id", ids);
        const { error } = await supabase.from("invoices").delete().in("id", ids); 
        
        if (error) throw error;
        
        alert("Deleted and stock/status restored."); 
        setSelectedIds(new Set()); 
        fetchInvoices(); 
        setTotalCount(prev => Math.max(0, prev - ids.length));
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
  
  const renderStatus = (status: string) => {
    switch (status) {
      case "Paid": return <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-full border border-emerald-200">PAID</span>;
      case "Partial": return <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full border border-amber-200">PARTIAL</span>;
      case "Credit": return <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-[11px] font-bold rounded-full border border-blue-200">CREDIT</span>;
      default: return <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[11px] font-bold rounded-full border border-rose-200">UNPAID</span>;
    }
  };
  const clearDates = () => { setStartDate(""); setEndDate(""); };
  
  // [컬럼 리사이징] 마우스 이벤트 핸들러
  const handleMouseDown = (index: number, event: React.MouseEvent) => {
      event.preventDefault();
      const th = event.currentTarget.parentElement;
      if (!th) return;
      resizingCol.current = {
          index,
          startX: event.clientX,
          startWidth: th.getBoundingClientRect().width,
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (event: MouseEvent) => {
      if (!resizingCol.current) return;
      const { index, startX, startWidth } = resizingCol.current;
      const newWidth = Math.max(50, startWidth + (event.clientX - startX)); 
      setColWidths((prev) => ({ ...prev, [index]: newWidth }));
  };

  const handleMouseUp = () => {
      resizingCol.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="p-6 w-full max-w-full mx-auto min-h-screen pb-20 space-y-6" onClick={() => setOpenMenuId(null)}>
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 text-sm mt-1">Manage {title.toLowerCase()}, track payments & reporting.</p>
        </div>
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

      {/* 3. Tabs & Create Button */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200">
            <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            <FileStack className="w-4 h-4"/> All 
            </button>
            <button onClick={() => setActiveTab('INVOICE')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'INVOICE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            <Receipt className="w-4 h-4"/> Invoices 
            </button>
            <button onClick={() => setActiveTab('CREDIT')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'CREDIT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
            <CreditCard className="w-4 h-4"/> Credit Notes 
            </button>
        </div>

        <Link href="/invoice/new">
          <button className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-md active:scale-95">
            <Plus className="w-4 h-4" /> Create Invoice
          </button>
        </Link>
      </div>

      {/* 4. Filters & Total */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3 w-full">
          <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32"/>
            <span className="text-slate-400">-</span>
            <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32"/>
            <button onClick={clearDates}><X className="w-4 h-4"/></button>
          </div>
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-2 w-4 h-4 text-slate-400"/>
            <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg"/>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg shadow-sm whitespace-nowrap">
            <Calculator className="w-4 h-4 opacity-70" />
            <span className="text-xs font-medium opacity-80 uppercase">Page Total:</span>
            <span className="text-sm font-bold">{formatCurrency(pageTotal)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Show:</span>
            <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg" value={pageSize} onChange={e=>setPageSize(e.target.value)}>
              <option value="5">5 Rows</option>
              <option value="10">10 Rows</option>
              <option value="30">30 Rows</option>
              <option value="all">All ({totalCount})</option>
            </select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 h-9 px-3 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
                    <Layers className="w-4 h-4 text-slate-500" />
                    Detail
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDetailView('show')}>
                    <ChevronDown className="w-4 h-4 mr-2" /> Show All Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDetailView('hide')}>
                    <ChevronUp className="w-4 h-4 mr-2" /> Hide All Details
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 5. Fixed Table with Resizable Columns */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[400px] flex flex-col justify-between">
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse table-fixed" ref={tableRef}>
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase font-bold tracking-wide whitespace-nowrap select-none">
              <tr>
                {/* 1. Checkbox */}
                <th className="px-2 py-4 relative group" style={{ width: colWidths[0] || '4%' }}>
                    <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="w-4 h-4 ml-4"/>
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(0, e)} />
                </th>
                {/* 2. Invoice # */}
                <th className="px-2 py-4 relative group" style={{ width: colWidths[1] || '10%' }}>
                    Invoice #
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(1, e)} />
                </th>
                {/* 3. Customer */}
                <th className="px-2 py-4 relative group" style={{ width: colWidths[2] || '20%' }}>
                    Customer
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(2, e)} />
                </th>
                {/* 4. Date */}
                <th className="px-2 py-4 relative group" style={{ width: colWidths[3] || '8%' }}>
                    Date
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(3, e)} />
                </th>
                {/* 5. Due Date */}
                <th className="px-2 py-4 relative group" style={{ width: colWidths[4] || '8%' }}>
                    Due Date
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(4, e)} />
                </th>
                {/* 6. Total */}
                <th className="px-2 py-4 relative group text-right" style={{ width: colWidths[5] || '10%' }}>
                    Total
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(5, e)} />
                </th>
                {/* 7. Delivery By */}
                <th className="px-2 py-4 relative group text-center" style={{ width: colWidths[6] || '12%' }}>
                    Delivery By
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(6, e)} />
                </th>
                {/* 8. Delivered? */}
                <th className="px-2 py-4 relative group text-center" style={{ width: colWidths[7] || '10%' }}>
                    Delivered?
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(7, e)} />
                </th>
                {/* 9. Status */}
                <th className="px-2 py-4 relative group text-center" style={{ width: colWidths[8] || '8%' }}>
                    Status
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => handleMouseDown(8, e)} />
                </th>
                {/* 10. Actions */}
                <th className="px-6 py-4 text-center" style={{ width: colWidths[9] || '10%' }}>
                    Actions
                </th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-20 text-center animate-pulse text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Receipt className="w-12 h-12 text-slate-300" />
                      <h3 className="text-lg font-bold text-slate-700">No invoices found</h3>
                      <p className="text-sm text-slate-400">
                        Try adjusting your dates/filters or create a new invoice.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const isExpanded = expandedRowIds.has(inv.id);
                  const isOverdue = inv.status !== "Paid" && inv.status !== "Credit" && inv.due_date < today;
                  const isCredit = inv.status === "Credit" || inv.id.startsWith("CR-");
                  const driverName = inv.driver?.display_name || "Unknown";
                  const balanceDue = (inv.total_amount || 0) - (inv.paid_amount || 0);

                  return (
                    <React.Fragment key={inv.id}>
                      <tr className={`transition-colors border-b border-slate-100 whitespace-nowrap ${selectedIds.has(inv.id) ? "bg-blue-50/50" : isExpanded ? "bg-slate-50" : "hover:bg-slate-50"}`}>
                        <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.has(inv.id)} onChange={()=>handleSelectOne(inv.id)} className="w-4 h-4"/></td>
                        
                        <td className="px-2 py-4 font-semibold text-slate-700 truncate">
                          {isCredit ? (
                             <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold text-xs">{inv.id}</span>
                          ) : (
                             `#${inv.id}`
                          )}
                        </td>

                        <td className="px-2 py-4 font-bold text-slate-900 truncate" title={inv.invoice_to}>{inv.invoice_to}</td>
                        <td className="px-2 py-4 text-slate-500 truncate">{inv.invoice_date}</td>
                        
                        <td className={`px-2 py-4 truncate ${isOverdue ? "text-red-600 font-bold" : "text-slate-500"}`}>
                          <div className="flex items-center gap-1">
                            {inv.due_date}
                            {isOverdue && (
                              <div className="flex items-center text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200 ml-1" title="Payment Overdue">
                                <AlertCircle className="w-3 h-3 mr-0.5" /> LATE
                              </div>
                            )}
                          </div>
                        </td>

                        <td className={`px-2 py-4 text-right font-bold truncate ${isCredit ? "text-blue-700" : "text-slate-900"}`}>{formatCurrency(inv.total_amount)}</td>
                        
                        <td className="px-2 py-4 text-center truncate">
                          {inv.is_pickup ? (
                             <div className="inline-flex items-center justify-center gap-1.5 text-purple-700 font-bold bg-purple-50 px-2 py-1 rounded-full border border-purple-200">
                                 <Package className="w-3.5 h-3.5" />
                                 <span className="text-xs">Pick Up</span>
                             </div>
                          ) : inv.driver_id ? (
                             <div className="inline-flex items-center justify-center gap-1.5 text-slate-700 font-medium">
                                 <Truck className="w-3.5 h-3.5 text-slate-400" />
                                 <span className="truncate max-w-[100px]" title={driverName}>{driverName}</span>
                             </div>
                          ) : (
                             <span className="text-slate-300 text-xs italic">Unassigned</span>
                          )}
                        </td>

                        <td className="px-2 py-4 text-center truncate">
                          {inv.is_completed || inv.is_pickup ? (
                             inv.proof_url ? (
                               <button 
                                 onClick={(e) => { e.stopPropagation(); setViewProofUrl(inv.proof_url!); }}
                                 className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200 hover:bg-green-200 hover:border-green-300 transition-colors cursor-pointer"
                                 title="View Delivery Proof"
                               >
                                   <CheckCircle2 className="w-3 h-3" /> Done
                                   <ImageIcon className="w-3 h-3 ml-1 opacity-50"/>
                               </button>
                             ) : (
                               <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200 cursor-default">
                                   <CheckCircle2 className="w-3 h-3" /> Done
                               </span>
                             )
                          ) : (
                             <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200">
                                 <Circle className="w-3 h-3" /> Pending
                             </span>
                          )}
                        </td>

                        <td className="px-2 py-4 text-center truncate">{renderStatus(inv.status)}</td>
                        <td className="px-6 py-4 text-center relative">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => toggleRow(inv.id)} className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-slate-200 text-slate-800' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="p-2 hover:bg-slate-200 rounded-full outline-none data-[state=open]:bg-slate-200">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              
                              <DropdownMenuContent align="end" className="w-48 bg-white border shadow-xl z-50">
                                {!isCredit && (
                                  <DropdownMenuItem 
                                    onClick={() => handlePaymentRedirect(inv.customer_id || "")} 
                                    className="w-full px-3 py-2.5 text-sm text-emerald-700 font-bold hover:bg-emerald-50 flex gap-2 cursor-pointer border-b border-slate-100 focus:bg-emerald-50 focus:text-emerald-800"
                                  >
                                    <DollarSign className="w-4 h-4" /> Receive Payment
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEmail(inv)} className="w-full px-3 py-2.5 text-sm hover:bg-slate-50 flex gap-2 cursor-pointer focus:bg-slate-50">
                                  <Mail className="w-4 h-4 text-purple-600" /> Email Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrint(inv.id)} className="w-full px-3 py-2.5 text-sm hover:bg-slate-50 flex gap-2 cursor-pointer focus:bg-slate-50">
                                  <Printer className="w-4 h-4 text-slate-500" /> Print
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownload(inv.id)} className="w-full px-3 py-2.5 text-sm hover:bg-slate-50 flex gap-2 cursor-pointer focus:bg-slate-50">
                                  <Download className="w-4 h-4 text-slate-500" /> PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePackingList(inv.id)} className="w-full px-3 py-2.5 text-sm hover:bg-slate-50 flex gap-2 cursor-pointer focus:bg-slate-50">
                                  <Package className="w-4 h-4 text-orange-600" /> Packing List
                                </DropdownMenuItem>
                                
                                <div className="border-t border-slate-100 my-1"></div>
                                
                                <DropdownMenuItem onClick={() => handleEdit(inv.id)} className="w-full px-3 py-2.5 text-sm hover:bg-slate-50 flex gap-2 cursor-pointer focus:bg-slate-50">
                                  <Edit className="w-4 h-4 text-blue-600" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDelete(inv.id)} className="w-full px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 flex gap-2 cursor-pointer focus:bg-red-50 focus:text-red-700">
                                  <Trash2 className="w-4 h-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                                    <tr>
                                      <th className="px-3 py-2">Product Name</th>
                                      <th className="px-3 py-2 text-center">Unit</th>
                                      <th className="px-3 py-2 text-center">Qty</th>
                                      <th className="px-3 py-2 text-right text-orange-600">Cost (Unit)</th>
                                      <th className="px-3 py-2 text-right">Base Price</th>
                                      <th className="px-3 py-2 text-right">Net Price (Unit)</th>
                                      <th className="px-3 py-2 text-right text-red-500">Disc %</th>
                                      <th className="px-3 py-2 text-right">Total Price</th>
                                    </tr>
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

                                      let unitCost = item.products?.buy_price || 0;
                                      const upperUnit = unit.toUpperCase();
                                      if (!upperUnit.includes("CTN") && !upperUnit.includes("CARTON") && !upperUnit.includes("BOX")) {
                                        const packsPerCtn = Math.max(1, item.products?.total_pack_ctn || 1);
                                        unitCost = unitCost / packsPerCtn;
                                      }

                                      return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-medium text-slate-700">{cleanName}</td>
                                          <td className="px-3 py-2 text-center text-slate-400">{unit}</td>
                                          <td className="px-3 py-2 text-center font-bold text-slate-700">{qty}</td>
                                          <td className="px-3 py-2 text-right font-medium text-orange-600">{formatCurrency(unitCost)}</td>
                                          <td className="px-3 py-2 text-right text-slate-500">{formatCurrency(basePrice)}</td>
                                          <td className="px-3 py-2 text-right font-medium text-slate-700">{formatCurrency(netPrice)}</td>
                                          <td className="px-3 py-2 text-right text-red-400">{discountRate > 0 ? `${discountRate}%` : "-"}</td>
                                          <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(finalTotal)}</td>
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
              )}
             </tbody>
           </table>
         </div>
         
         {invoices.length > 0 && pageSize !== "all" && (
           <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
             <span className="text-xs text-slate-500 font-medium">Showing <strong className="text-slate-900">{(currentPage - 1) * parseInt(pageSize) + 1}</strong> to <strong className="text-slate-900">{Math.min(currentPage * parseInt(pageSize), totalCount)}</strong> of <strong className="text-slate-900">{totalCount}</strong></span>
             <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"><ChevronLeft className="w-4 h-4 text-slate-600" /></button><span className="text-sm font-bold text-slate-700 px-2">{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border rounded-lg hover:bg-white disabled:opacity-50"><ChevronRight className="w-4 h-4 text-slate-600" /></button></div>
           </div>
         )}
       </div>

       {/* Email Send Dialog */}
       <EmailSendDialog 
         open={!!emailTarget} 
         onOpenChange={(open) => !open && setEmailTarget(null)}
         data={emailTarget as any}
       />

      {/* Proof Image Modal */}
      {viewProofUrl && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setViewProofUrl(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <img src={viewProofUrl} alt="Delivery Proof" className="rounded-lg shadow-2xl max-w-full max-h-[85vh] object-contain bg-white" />
              <button 
                onClick={() => setViewProofUrl(null)}
                className="mt-4 bg-white/10 text-white px-6 py-2 rounded-full hover:bg-white/20 backdrop-blur-sm transition-colors border border-white/20 font-medium"
              >
                Close
              </button>
          </div>
        </div>
      )}

    </div> 
  );
}