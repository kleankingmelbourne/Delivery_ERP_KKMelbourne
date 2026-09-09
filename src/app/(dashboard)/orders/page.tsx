"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, MoreHorizontal, Trash2, Edit, CheckCircle,
  ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp,
  AlertCircle, Package, Calculator, Receipt, FileStack,
  FileDown, ArrowRightCircle, CheckSquare, Clock, XCircle, ExternalLink,
  Wallet
} from "lucide-react";
import { deductCustomerCredit } from "@/utils/credit"; // 👈 크레딧 차감 함수 추가
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider"; 
import { updateInventory } from "@/utils/inventory"; 
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
  created_at?: string; 
  order_date: string;
  requested_date: string;
  total_amount: number;
  status: "draft" | "pending" | "invoiced" | "cancelled";
  order_memo?: string;
  invoice_id?: string;
  is_pickup?: boolean; 
  customers?: { 
    company: string; 
    name: string; 
    in_charge_delivery?: string;
    payments?: { unallocated_amount: number }[]; // 👈 payments 정보 추가
   } | null;
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const totalPages = pageSize === "all" ? 1 : Math.ceil(totalCount / (parseInt(pageSize) || 10));

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(e.target.value);
    setCurrentPage(1); 
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, debouncedSearch, startDate, endDate]);

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
      id, customer_id, created_at, order_date, requested_date, total_amount, status, order_memo, invoice_id, is_pickup,
      customers ( company, name, in_charge_delivery, payments ( unallocated_amount ) )
    `, { count: 'exact' })
    .neq("status", "draft");

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

  // 🚀 크레딧을 적용하여 인보이스로 일괄 변환하는 함수
  const handleApplyCreditAndInvoice = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개의 주문에 사용 가능한 크레딧을 우선 적용하고 인보이스로 변환하시겠습니까?`)) return;
    setLoading(true);

    try {
      const idsArray = Array.from(selectedIds);
      const targetOrders = orders.filter(o => idsArray.includes(o.id));

      const { data: allItems } = await supabase.from("order_items").select("*").in("order_id", idsArray);
      if (!allItems || allItems.length === 0) throw new Error("선택한 주문들에 상품 내역이 없습니다.");

      // 고객별로 주문 그룹화
      const groupedOrders = targetOrders.reduce((acc, order) => {
        if (!acc[order.customer_id]) acc[order.customer_id] = [];
        acc[order.customer_id].push(order);
        return acc;
      }, {} as Record<string, Order[]>);

      const { data: lastInv } = await supabase.from("invoices").select("id").order("id", { ascending: false }).limit(1);
      let currentInvNum = 1001;
      if (lastInv && lastInv.length > 0) {
        const lastNum = parseInt(lastInv[0].id.replace(/[^0-9]/g, ""));
        if (!isNaN(lastNum)) currentInvNum = lastNum + 1;
      }

      const currentAdminName = user?.user_metadata?.display_name || user?.email || "Admin";

      // 🌟 각 고객별로 순차적으로 처리하여 크레딧 중복 차감 및 꼬임을 방지합니다.
      for (const customerId in groupedOrders) {
        const customerOrders = groupedOrders[customerId];
        const newInvId = `IV-${currentInvNum}`;
        currentInvNum++;

        // 1. 해당 고객의 사용 가능한 크레딧 불러오기
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('id, unallocated_amount, payment_date')
          .eq('customer_id', customerId)
          .gt('unallocated_amount', 0)
          .order('payment_date', { ascending: true });
          
        const creditItems = paymentsData || [];
        const availableCredit = roundAmount(creditItems.reduce((sum, p) => sum + p.unallocated_amount, 0));

        // 2. 주문 총액 및 메모 합산
        let combinedSubtotal = 0;
        let combinedMemos: string[] = [];
        customerOrders.forEach(order => {
          combinedSubtotal += order.total_amount;
          if (order.order_memo) combinedMemos.push(`[Order #${order.id}]: ${order.order_memo}`);
        });

        const gstTotal = roundAmount(combinedSubtotal * 0.1);
        const finalInvoiceTotal = roundAmount(combinedSubtotal + gstTotal);

        // 3. 크레딧 적용 계산
        const creditUsed = Math.min(availableCredit, finalInvoiceTotal);
        
        let initialStatus = "Unpaid";
        if (finalInvoiceTotal <= 0 || creditUsed >= finalInvoiceTotal) initialStatus = "Paid";
        else if (creditUsed > 0) initialStatus = "Partial";

        let finalMemo = combinedMemos.join("\n");

        // 메모장에 크레딧 차감 내역 자동 첨부 (InvoiceForm과 100% 동일한 로직)
        if (creditUsed > 0) {
          let remainingToDeduct = creditUsed;
          const memoLines = [];
          for (const cr of creditItems) {
            if (remainingToDeduct <= 0) break;
            const deduct = Math.min(cr.unallocated_amount, remainingToDeduct);
            if (deduct > 0) {
              const [y, m, d] = cr.payment_date.split('-');
              memoLines.push(`-$${deduct.toFixed(2)} deducted from credit memo issued on ${d}/${m}/${y}`);
              remainingToDeduct -= deduct;
            }
          }
          if (memoLines.length > 0) {
            const creditText = `[Credit Applied History]\n${memoLines.join('\n')}`;
            finalMemo = finalMemo ? `${finalMemo}\n\n${creditText}` : creditText;
          }
        }

        const firstOrder = customerOrders[0];
        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // 4. 인보이스 본체 생성
        const invoiceData = {
          id: newInvId,
          customer_id: customerId,
          invoice_to: firstOrder.customers?.name || 'Unknown',
          invoice_date: firstOrder.requested_date,
          due_date: dueDate,
          total_amount: finalInvoiceTotal,
          paid_amount: creditUsed,
          subtotal: combinedSubtotal,
          gst_total: gstTotal,
          status: initialStatus,
          created_who: 'customer',
          updated_who: currentAdminName,
          driver_id: firstOrder.customers?.in_charge_delivery || null,
          memo: finalMemo,
          is_pickup: customerOrders.some(o => o.is_pickup)
        };
        const { error: invErr } = await supabase.from("invoices").insert([invoiceData]);
        if (invErr) throw invErr;

        // 5. 인보이스 아이템 생성 및 그룹화
        const customerOrderIds = customerOrders.map(o => o.id);
        const groupItems = allItems.filter((item: any) => customerOrderIds.includes(item.order_id));
        const mergedItemsMap = new Map();

        groupItems.forEach((item: any) => {
          const mergeKey = `${item.product_id || item.description}_${item.unit}_${item.unit_price}`;
          if (mergedItemsMap.has(mergeKey)) {
            const existingItem = mergedItemsMap.get(mergeKey);
            existingItem.quantity += item.quantity;
            existingItem.amount = roundAmount(existingItem.quantity * existingItem.unit_price);
          } else {
            mergedItemsMap.set(mergeKey, {
              invoice_id: newInvId,
              product_id: item.product_id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              base_price: item.base_price,
              discount: item.discount,
              amount: roundAmount(item.quantity * item.unit_price),
              is_gst_included: true
            });
          }
        });

        const newInvoiceItems = Array.from(mergedItemsMap.values());
        if (newInvoiceItems.length > 0) {
          const { error: itemErr } = await supabase.from("invoice_items").insert(newInvoiceItems);
          if (itemErr) throw itemErr;

          // 재고 차감 (Inventory Update)
          const bulkInventoryItems = newInvoiceItems.map(item => ({
            productId: item.product_id,
            quantity: item.quantity,
            unit: item.unit
          }));
          await updateInventory(supabase, bulkInventoryItems, false);
        }

        // 6. Orders 상태 업데이트
        const { error: ordErr } = await supabase.from("orders")
          .update({ status: 'invoiced', invoice_id: newInvId })
          .in('id', customerOrderIds);
        if (ordErr) throw ordErr;

        // 7. 🌟 크레딧 실제 차감 (payments 및 payment_allocations 업데이트)
        if (creditUsed > 0) {
          await deductCustomerCredit(supabase, customerId, creditUsed);
          
          let remainingToAllocate = creditUsed;
          const allocations = [];
          for (const cr of creditItems) {
            if (remainingToAllocate <= 0) break;
            const allocateAmount = Math.min(cr.unallocated_amount, remainingToAllocate);
            if (allocateAmount > 0) {
              allocations.push({
                payment_id: cr.id,
                invoice_id: newInvId,
                amount: allocateAmount,
              });
              remainingToAllocate -= allocateAmount;
            }
          }
          if (allocations.length > 0) {
            await supabase.from('payment_allocations').insert(allocations);
          }
        }
      }
      
      alert(`✅ 크레딧 자동 적용 및 인보이스 생성이 완료되었습니다.`);
      setSelectedIds(new Set());
      fetchOrders();

    } catch (error: any) {
      alert(`변환 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const customerIds = await fetchMatchingCustomerIds(debouncedSearch);
    let query = buildQuery(customerIds); 
    
    const limit = pageSize === "all" ? 10000 : parseInt(pageSize);
    const from = (currentPage - 1) * limit;
    const to = from + limit - 1;
    
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
    
    const { data, count, error } = await query;
    if (!error && data) {
        setOrders(data as unknown as Order[]);
        if (count !== null) setTotalCount(count); 
    }
    setLoading(false);
  }, [buildQuery, currentPage, pageSize, startDate, endDate, debouncedSearch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]); 

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

        const orderSubtotal = order.total_amount; 
        const gstTotal = roundAmount(orderSubtotal * 0.1); 
        const finalInvoiceTotal = roundAmount(orderSubtotal + gstTotal); 

        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const currentAdminName = user?.user_metadata?.display_name || user?.email || "Admin";

        const invoiceData = {
            id: newInvId,
            customer_id: order.customer_id,
            invoice_to: order.customers?.name || 'Unknown', 
            invoice_date: order.requested_date,
            due_date: dueDate,
            total_amount: finalInvoiceTotal, 
            paid_amount: 0,
            subtotal: orderSubtotal,         
            gst_total: gstTotal,             
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

        const inventoryItems = items.map(item => ({
          productId: item.product_id,
          quantity: item.quantity,
          unit: item.unit
        }));
        await updateInventory(supabase, inventoryItems, false);

        alert(`✅ Invoice ${newInvId} created (Subtotal: ${formatCurrency(orderSubtotal)} + GST: ${formatCurrency(gstTotal)})`);
        fetchOrders(); 
    } catch (error: any) {
        alert(`Failed: ${error.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleBulkConvertToInvoice = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개의 주문을 인보이스로 변환하시겠습니까?\n(동일한 고객의 주문은 하나의 인보이스로 자동 병합됩니다)`)) return;
    setLoading(true);

    try {
      const idsArray = Array.from(selectedIds);
      const targetOrders = orders.filter(o => idsArray.includes(o.id));

      const { data: allItems } = await supabase.from("order_items").select("*").in("order_id", idsArray);
      if (!allItems || allItems.length === 0) throw new Error("선택한 주문들에 상품 내역이 없습니다.");

      const groupedOrders = targetOrders.reduce((acc, order) => {
        if (!acc[order.customer_id]) {
          acc[order.customer_id] = [];
        }
        acc[order.customer_id].push(order);
        return acc;
      }, {} as Record<string, Order[]>);

      const { data: lastInv } = await supabase.from("invoices").select("id").order("id", { ascending: false }).limit(1);
      let currentInvNum = 1001;
      if (lastInv && lastInv.length > 0) {
          const lastNum = parseInt(lastInv[0].id.replace(/[^0-9]/g, ""));
          if (!isNaN(lastNum)) currentInvNum = lastNum + 1;
      }

      const newInvoices: any[] = [];
      const newInvoiceItems: any[] = [];
      const orderUpdates: any[] = [];
      const currentAdminName = user?.user_metadata?.display_name || user?.email || "Admin";

      for (const customerId in groupedOrders) {
        const customerOrders = groupedOrders[customerId];
        const newInvId = `IV-${currentInvNum}`;
        currentInvNum++;

        let combinedSubtotal = 0;
        let combinedMemos: string[] = [];

        customerOrders.forEach(order => {
            combinedSubtotal += order.total_amount;
            if (order.order_memo) {
              combinedMemos.push(`[Order #${order.id}]: ${order.order_memo}`);
            }
        });

        const gstTotal = roundAmount(combinedSubtotal * 0.1);
        const finalInvoiceTotal = roundAmount(combinedSubtotal + gstTotal);
        const mergedMemo = combinedMemos.join("\n");

        const firstOrder = customerOrders[0];
        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        newInvoices.push({
            id: newInvId,
            customer_id: customerId,
            invoice_to: firstOrder.customers?.name || 'Unknown',
            invoice_date: firstOrder.requested_date,
            due_date: dueDate,
            total_amount: finalInvoiceTotal,
            paid_amount: 0,
            subtotal: combinedSubtotal,
            gst_total: gstTotal,
            status: 'Unpaid',
            created_who: 'customer',
            updated_who: currentAdminName,
            driver_id: firstOrder.customers?.in_charge_delivery || null,
            memo: mergedMemo,
            is_pickup: customerOrders.some(o => o.is_pickup)
        });

        const customerOrderIds = customerOrders.map(o => o.id);
        const groupItems = allItems.filter((item: any) => customerOrderIds.includes(item.order_id));

        const mergedItemsMap = new Map();

        groupItems.forEach((item: any) => {
            const mergeKey = `${item.product_id || item.description}_${item.unit}_${item.unit_price}`;

            if (mergedItemsMap.has(mergeKey)) {
                const existingItem = mergedItemsMap.get(mergeKey);
                existingItem.quantity += item.quantity;
                existingItem.amount = roundAmount(existingItem.quantity * existingItem.unit_price);
            } else {
                mergedItemsMap.set(mergeKey, {
                    invoice_id: newInvId,
                    product_id: item.product_id,
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    unit_price: item.unit_price,
                    base_price: item.base_price,
                    discount: item.discount,
                    amount: roundAmount(item.quantity * item.unit_price)
                });
            }
        });

        mergedItemsMap.forEach(mergedItem => {
            newInvoiceItems.push(mergedItem);
        });

        customerOrders.forEach(order => {
            orderUpdates.push(
                supabase.from("orders").update({ status: 'invoiced', invoice_id: newInvId }).eq('id', order.id)
            );
        });
      }

      if (newInvoices.length > 0) {
        const { error: invError } = await supabase.from("invoices").insert(newInvoices);
        if (invError) throw invError;
      }

      if (newInvoiceItems.length > 0) {
        const { error: itemError } = await supabase.from("invoice_items").insert(newInvoiceItems);
        if (itemError) throw itemError;
      }

      await Promise.all(orderUpdates);

      const bulkInventoryItems = newInvoiceItems.map(item => ({
          productId: item.product_id,
          quantity: item.quantity,
          unit: item.unit
      }));
      await updateInventory(supabase, bulkInventoryItems, false);
      
      alert(`✅ 성공적으로 총 ${newInvoices.length}개의 인보이스가 생성되었습니다.`);
      setSelectedIds(new Set());
      fetchOrders();

    } catch (error: any) {
      alert(`변환 실패: ${error.message}`);
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

  // 💡 새롭게 추가할 날짜 업데이트 함수
  const handleUpdateRequestedDate = async (orderId: string, newDate: string) => {
    if (!newDate) return;

    // 1. UI 즉각 반영 (낙관적 업데이트)
    setOrders((prev) => 
      prev.map((o) => (o.id === orderId ? { ...o, requested_date: newDate } : o))
    );

    // 2. Supabase DB 업데이트
    const { error } = await supabase
      .from('orders')
      .update({ requested_date: newDate })
      .eq('id', orderId);

    if (error) {
      alert(`날짜 업데이트에 실패했습니다: ${error.message}`);
      fetchOrders(); // 실패 시 원래 데이터로 복구
    }
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

  const selectableOrders = orders.filter(o => o.status === 'pending');
  const isAllSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id));

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSelected = new Set(selectedIds);
    if (e.target.checked) {
      selectableOrders.forEach(o => newSelected.add(o.id));
    } else {
      selectableOrders.forEach(o => newSelected.delete(o.id));
    }
    setSelectedIds(newSelected);
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
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

      {selectedIds.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 px-2">
            <CheckSquare className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-800">{selectedIds.size} Selected</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={handleApplyCreditAndInvoice} 
              className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg border border-blue-700 hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Wallet className="w-4 h-4" /> Apply Credit & Convert
            </button>

            <button 
              onClick={handleBulkConvertToInvoice} 
              className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-lg border border-emerald-700 hover:bg-emerald-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <ArrowRightCircle className="w-4 h-4" /> Convert to Invoices
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200">
          {['ALL', 'PENDING', 'INVOICED', 'CANCELLED'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as TabType)} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
               {tab} 
            </button>
          ))}
      </div>

      {/* 🚀 [추가/수정된 부분] 상단 검색 및 필터 영역에 드롭다운 추가, 우측 정렬 반영 */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 w-full">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Req. Date Range</label>
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32 font-medium outline-none"/>
              <span className="text-slate-400">-</span>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="pl-2 bg-transparent text-sm w-32 font-medium outline-none"/>
            </div>
          </div>
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <input type="text" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search Name, Order ID..." className="w-full pl-10 pr-4 py-2 text-sm font-medium border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition-colors"/>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="pageSize" className="text-xs font-black text-slate-400 uppercase">Rows</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={handlePageSizeChange}
            className="border border-slate-200 rounded-lg py-1.5 px-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="all">ALL ({totalCount})</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[11px] uppercase font-black tracking-wider">
            <tr>
              <th className="px-4 py-4 w-10 text-center">
                <input 
                  type="checkbox" 
                  checked={isAllSelected} 
                  onChange={handleSelectAll} 
                  disabled={selectableOrders.length === 0}
                  className="w-4 h-4 rounded border-slate-300 cursor-pointer disabled:opacity-50"
                />
              </th>
              <th className="px-2 py-4">Order Info</th>
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
              <tr><td colSpan={9} className="py-20 text-center font-bold text-slate-400">Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-24 text-center">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-black text-slate-700">No orders found</h3>
                </td>
              </tr>
            ) : orders.map(order => {
              const isExpanded = expandedRowIds.has(order.id);
              const isSelectable = order.status === 'pending'; 
              
              return (
                <React.Fragment key={order.id}>
                  <tr className={`border-b border-slate-100 transition-colors ${selectedIds.has(order.id) ? "bg-emerald-50/50" : isExpanded ? "bg-indigo-50/30" : "hover:bg-slate-50"}`}>
                    
                    <td className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(order.id)} 
                        onChange={() => handleSelectOne(order.id)}
                        disabled={!isSelectable}
                        className="w-4 h-4 rounded border-slate-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </td>

                    <td className="px-2 py-4">
                      {/* items-start 추가하여 왼쪽 정렬 유지 */}
                      <div className="flex flex-col gap-1 items-start">
                        <span className="font-black text-slate-700">#{order.id}</span>
                        
                        {/* 뱃지들을 가로로 나열하기 위해 flex-wrap 적용된 컨테이너 추가 */}
                        <div className="flex flex-wrap gap-1">
                          {/* 기존 PICK UP 뱃지 */}
                          {order.is_pickup && (
                            <span className="text-[9px] font-black text-white bg-indigo-500 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-fit">
                              <Package className="w-2.5 h-2.5" /> PICK UP
                            </span>
                          )}
                          
                          {/* 🚀 새로 추가된 MEMO 뱃지 로직 */}
                          {order.order_memo && order.order_memo.trim() !== "" && (
                            <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded flex items-center justify-center gap-1 w-fit">
                              <FileStack className="w-2.5 h-2.5" /> MEMO
                            </span>
                          )}
                        </div>
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

                    {/* <td className="px-4 py-4 font-bold text-slate-900">{order.customers?.name || "Unknown"}</td> 부분을 아래 코드로 교체하세요. */}
                    <td className="px-4 py-4 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const availableCredit = order.customers?.payments
                            ?.filter((p: any) => p.unallocated_amount > 0)
                            .reduce((sum: number, p: any) => sum + p.unallocated_amount, 0) || 0;
                          
                          return availableCredit > 0 ? (
                            <span title={`Available Credit: ${formatCurrency(availableCredit)}`} className="flex-shrink-0">
                              <Wallet className="w-4 h-4 text-red-500" />
                            </span>
                          ) : null;
                        })()}
                        <span className="truncate">{order.customers?.name || "Unknown"}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-slate-500 text-xs">
                      <div className="flex flex-col">
                        {/* 1. 날짜 렌더링 (호주 포맷: DD/MM/YYYY) */}
                        <span className="font-bold text-slate-700">
                          {order.order_date 
                            ? new Date(order.order_date).toLocaleDateString('en-AU') 
                            : '-'}
                        </span>
                        
                        {/* 2. 시간 렌더링 (오전/오후 버그 픽스 적용) */}
                        {order.order_date && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(order.order_date).toLocaleTimeString('en-AU', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: true // 🚀 오전/오후 명확히 구분
                            })}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-indigo-700 font-black">
                      {order.status === 'pending' ? (
                        <input
                          type="date"
                          value={order.requested_date || ''}
                          onChange={(e) => handleUpdateRequestedDate(order.id, e.target.value)}
                          className="bg-transparent border-b-2 border-indigo-200 hover:border-indigo-400 focus:border-indigo-600 outline-none py-1 cursor-pointer transition-colors"
                        />
                      ) : (
                        <span>{order.requested_date}</span>
                      )}
                    </td>
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
                      <td colSpan={9} className="px-14 py-4">
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

      {/* 🚀 [추가/수정된 부분] 하단에는 페이지 이동 컨트롤만 우측 정렬로 남김 */}
      {orders.length > 0 && (
        <div className="flex items-center justify-end bg-white p-4 border border-slate-200 rounded-xl shadow-sm gap-4">
          <span className="text-sm font-medium text-slate-500">
            Page <span className="font-bold text-slate-700">{currentPage}</span> of <span className="font-bold text-slate-700">{totalPages === 0 ? 1 : totalPages}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
}