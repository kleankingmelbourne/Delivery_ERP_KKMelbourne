"use client";

import { useEffect, useState, useRef, useMemo, use } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  Plus, Trash2, Save, ArrowLeft, User, Calendar, CreditCard, 
  Calculator, FileText, Lock, Search, ChevronDown, Check,
  Wallet, Truck, Clock, DollarSign, AlertTriangle, Loader2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- [Components] ---
interface Option { id: string; label: string; subLabel?: string; }
interface SearchableSelectProps { options: Option[]; value: string; onChange: (value: string) => void; placeholder?: string; disabled?: boolean; className?: string; onClick?: () => void; }

function SearchableSelect({ options, value, onChange, placeholder = "Select...", disabled = false, className, onClick }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    return options.filter(option => option.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
  }, [options, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false); setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div onClick={() => { if (!disabled) { setIsOpen(!isOpen); if (onClick) onClick(); } }} className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}>
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>{selectedOption ? selectedOption.label : (value ? "Loading..." : placeholder)}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0" />
      </div>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100">
            <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input autoFocus type="text" className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400 placeholder:text-xs" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
          </div>
          <div className="p-1">
            {filteredOptions.length === 0 ? (<div className="p-3 text-xs text-center text-slate-400">No results found.</div>) : (filteredOptions.map((option) => (<div key={option.id} onClick={() => { onChange(option.id); setIsOpen(false); setSearchTerm(""); }} className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${option.id === value ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-700"}`}><div className="flex flex-col"><span>{option.label}</span>{option.subLabel && <span className="text-[10px] text-slate-400 font-normal">{option.subLabel}</span>}</div>{option.id === value && <Check className="w-3.5 h-3.5 text-slate-900" />}</div>)))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Interfaces ---
interface Customer { id: string; name: string; due_date_term: string; note: string; in_charge_delivery: string | null; }
interface ProductMaster { 
    id: string; 
    product_name: string; 
    sell_price_ctn: number; 
    sell_price_pack: number; 
    total_pack_ctn?: number; 
    current_stock_level: number; 
    current_stock_level_pack: number; 
    default_unit_id?: string;
}
interface AllowedProduct { product_id: string; discount_ctn: number; discount_pack: number; }
interface InvoiceItem { productId: string; unit: string; quantity: number; basePrice: number; discountRate: number; unitPrice: number; defaultUnitName?: string; }

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: invoiceId } = use(params); 
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]); 
  const [allowedProducts, setAllowedProducts] = useState<AllowedProduct[]>([]); 
  const [currentUserName, setCurrentUserName] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);
  const [isPickup, setIsPickup] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [availableCredit, setAvailableCredit] = useState(0); 

  const [showAllProducts, setShowAllProducts] = useState(false); 
  const [autoAddProduct, setAutoAddProduct] = useState(false);

  // 중요: 재고 복구를 위해 원래 아이템들을 저장해둠
  const [originalItems, setOriginalItems] = useState<InvoiceItem[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});

  // Stats
  const [customerStats, setCustomerStats] = useState<{ totalOverdue: number; oldestInvoiceDate: string | null; }>({ totalOverdue: 0, oldestInvoiceDate: null });

  // 1. 초기 데이터 및 인보이스 로드
  useEffect(() => {
    const initData = async () => {
      // 마스터 데이터 로드
      const [custRes, prodRes, userRes, unitRes] = await Promise.all([
        supabase.from("customers").select("id, name, due_date, note, in_charge_delivery"),
        supabase.from("products").select("*"),
        supabase.auth.getUser(),
        supabase.from("product_units").select("id, unit_name") 
      ]);

      if (custRes.data) setCustomers(custRes.data.map((c: any) => ({ id: c.id, name: c.name, due_date_term: c.due_date, note: c.note, in_charge_delivery: c.in_charge_delivery })));
      if (prodRes.data) setAllProducts(prodRes.data);
      if (userRes.data.user) {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userRes.data.user.id).single();
        setCurrentUserName(profile?.display_name || userRes.data.user.email?.split('@')[0] || "Unknown");
      }
      
      const uMap: Record<string, string> = {};
      if (unitRes.data) {
          unitRes.data.forEach((u: any) => uMap[u.id] = u.unit_name);
          setUnitMap(uMap);
      }

      // 인보이스 데이터 로드
      const { data: inv, error: invError } = await supabase
        .from("invoices")
        .select(`*, invoice_items(*)`)
        .eq("id", invoiceId)
        .single();

      if (invError || !inv) {
        alert("Invoice not found.");
        router.push("/invoice");
        return;
      }

      // 폼 채우기
      setSelectedCustomerId(inv.customer_id);
      setInvoiceDate(inv.invoice_date);
      setDueDate(inv.due_date);
      setMemo(inv.memo || "");
      setIsPickup(inv.is_pickup || false);
      setCurrentDriverId(inv.driver_id);

      // 아이템 매핑
      const loadedItems = inv.invoice_items.map((item: any) => {
        let unit = item.unit;
        if (!unit) {
            const match = item.description.match(/\((CTN|PACK)\)$/);
            unit = match ? match[1] : "CTN";
        }
        
        const prod = (prodRes.data || []).find((p: any) => p.id === item.product_id);
        let defaultUnitName = "CTN";
        if (prod && prod.default_unit_id && unitRes.data) {
            const u = unitRes.data.find((u: any) => u.id === prod.default_unit_id);
            if (u) defaultUnitName = u.unit_name;
        }

        return {
            productId: item.product_id,
            unit: unit,
            quantity: item.quantity,
            basePrice: item.base_price,
            discountRate: item.discount,
            unitPrice: item.unit_price,
            defaultUnitName: defaultUnitName
        };
      });

      setItems(loadedItems);
      setOriginalItems(JSON.parse(JSON.stringify(loadedItems))); 
      
      setLoading(false);
    };
    initData();
  }, [invoiceId]);

  // 2. 고객 변경 시
  useEffect(() => {
    if (!selectedCustomerId || loading) return;

    const loadCustomerData = async () => {
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        setStaffNote(customer.note || "");
      }

      const { data: apData } = await supabase.from("customer_products").select("product_id, custom_price_ctn, custom_price_pack").eq("customer_id", selectedCustomerId);
      if (apData) setAllowedProducts(apData.map((item: any) => ({ product_id: item.product_id, discount_ctn: item.custom_price_ctn || 0, discount_pack: item.custom_price_pack || 0 })));

      const { data: payments } = await supabase.from('payments').select('unallocated_amount').eq('customer_id', selectedCustomerId).gt('unallocated_amount', 0);
      if (payments && payments.length > 0) {
        const total = payments.reduce((sum, p) => sum + p.unallocated_amount, 0);
        setAvailableCredit(roundAmount(total));
      } else {
        setAvailableCredit(0);
      }

      const { data: unpaidInvoices } = await supabase.from("invoices").select("invoice_date, due_date, total_amount, paid_amount").eq("customer_id", selectedCustomerId).neq("status", "Paid");
      if (unpaidInvoices && unpaidInvoices.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const overdueInvoices = unpaidInvoices.filter(inv => inv.due_date < todayStr);
        const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.total_amount - (inv.paid_amount || 0)), 0);
        const sortedOverdue = overdueInvoices.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        setCustomerStats({ totalOverdue: roundAmount(overdueTotal), oldestInvoiceDate: sortedOverdue[0]?.due_date || null });
      } else {
        setCustomerStats({ totalOverdue: 0, oldestInvoiceDate: null });
      }
    };
    loadCustomerData();
  }, [selectedCustomerId, customers, loading]);

  // --- Calculations ---
  const productOptions = useMemo(() => {
    const targetProducts = showAllProducts 
      ? allProducts 
      : allProducts.filter(p => allowedProducts.some(ap => ap.product_id === p.id) || items.some(i => i.productId === p.id));
    return targetProducts.map(p => ({ id: p.id, label: p.product_name, subLabel: `$${p.sell_price_ctn} (CTN) / $${p.sell_price_pack} (PK)` }));
  }, [allProducts, allowedProducts, showAllProducts, items]);

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.name })), [customers]);

  const applyPriceLogic = (index: number, productId: string, unit: string, basePriceInput: number, discountRateInput: number, defaultUnitName?: string) => {
    const rawNet = basePriceInput - (basePriceInput * (discountRateInput / 100));
    const netPrice = roundAmount(rawNet);
    const newItems = [...items];
    newItems[index] = { 
        ...newItems[index], 
        productId, 
        unit, 
        basePrice: basePriceInput, 
        discountRate: discountRateInput, 
        unitPrice: netPrice,
        defaultUnitName: defaultUnitName || newItems[index].defaultUnitName
    };
    setItems(newItems);
  };

  const handleProductChange = (index: number, productId: string) => {
    const p = allProducts.find(p => p.id === productId); 
    if (!p) return;
    
    const defUnitId = p.default_unit_id;
    const defUnitName = defUnitId ? (unitMap[defUnitId] || "CTN") : "CTN";
    
    let unitToSet = defUnitName;
    if (unitToSet.toLowerCase().includes("carton")) unitToSet = "CTN";
    if (unitToSet.toLowerCase() === "pack") unitToSet = "PACK";

    const ap = allowedProducts.find(ap => ap.product_id === productId);
    
    const isCtn = unitToSet === "CTN";
    const disc = ap ? (isCtn ? ap.discount_ctn : ap.discount_pack) : 0;
    const base = isCtn ? p.sell_price_ctn : p.sell_price_pack;
    
    applyPriceLogic(index, productId, unitToSet, base, disc, defUnitName);
  };

  const handleUnitChange = (index: number, unit: string) => {
    const item = items[index];
    const p = allProducts.find(p => p.id === item.productId);
    if (p) {
      const ap = allowedProducts.find(ap => ap.product_id === item.productId);
      const isCtn = unit === "CTN";
      const disc = ap ? (isCtn ? ap.discount_ctn : ap.discount_pack) : 0;
      const base = isCtn ? p.sell_price_ctn : p.sell_price_pack;
      applyPriceLogic(index, item.productId, unit, base, disc);
    } else { const newItems = [...items]; newItems[index].unit = unit; setItems(newItems); }
  };

  const handleDiscountChange = (index: number, newRate: number) => {
    const item = items[index]; if (!item.productId) return;
    applyPriceLogic(index, item.productId, item.unit, item.basePrice, newRate);
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => { const newItems = [...items]; newItems[index] = { ...newItems[index], [field]: value }; setItems(newItems); };
  const removeItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };
  const addItem = () => setItems([...items, { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);
  const handleProductClick = (index: number) => { if (index === items.length - 1) addItem(); };

  const subTotal = roundAmount(items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0));
  const gstTotal = roundAmount(subTotal * 0.1);
  const grandTotal = roundAmount(subTotal + gstTotal);

  // ----------------------------------------------------------------
  // [NEW] 재고 확인 로직 (Check Stock Availability for Edit)
  // ----------------------------------------------------------------
  const checkStockAvailability = async (newItemsList: InvoiceItem[]) => {
      const insufficientItems: string[] = [];

      for (const item of newItemsList) {
          if (!item.productId) continue;

          // 1. 최신 DB 재고 가져오기
          const { data: product } = await supabase
              .from('products')
              .select('id, product_name, current_stock_level, current_stock_level_pack')
              .eq('id', item.productId)
              .single();

          if (product) {
              let currentStock = item.unit === 'CTN' ? product.current_stock_level : product.current_stock_level_pack;
              
              // 2. [가상 복구] 기존 인보이스에 있던 수량만큼 더해준다 (원복 시뮬레이션)
              const originalItem = originalItems.find(oi => 
                  oi.productId === item.productId && oi.unit === item.unit
              );
              if (originalItem) {
                  currentStock += originalItem.quantity;
              }

              // 3. [가상 차감] 새로운 수량만큼 뺀다
              const remainingStock = currentStock - item.quantity;

              // 4. 부족하면 목록에 추가
              if (remainingStock < 0) {
                  insufficientItems.push(`${product.product_name} (${item.unit})`);
              }
          }
      }
      return insufficientItems;
  };

  // ----------------------------------------------------------------
  // [MODIFIED] 재고 업데이트 함수
  // ----------------------------------------------------------------
  const updateInventory = async (itemList: InvoiceItem[], isReturn: boolean) => {
    for (const item of itemList) {
        if (!item.productId) continue;

        const { data: product } = await supabase.from('products').select('current_stock_level, current_stock_level_pack, total_pack_ctn').eq('id', item.productId).single();
        if (!product) continue;

        let currentCtn = product.current_stock_level || 0;
        let currentPack = product.current_stock_level_pack || 0;
        const qty = item.quantity; 

        if (isReturn) {
            // [재고 복구]
            if (item.unit === 'CTN') currentCtn += qty;
            else currentPack += qty;
        } else {
            // [재고 차감]
            if (item.unit === 'CTN') currentCtn -= qty;
            else currentPack -= qty;
        }

        await supabase.from('products').update({ current_stock_level: currentCtn, current_stock_level_pack: currentPack }).eq('id', item.productId);
    }
  };

  const handleUpdate = async () => {
    if (!selectedCustomerId) return alert("Please select a customer.");
    
    // [NEW] 재고 확인 (저장 전)
    setLoading(true);
    const validItems = items.filter(item => item.productId);
    
    // Credit Memo가 아니면 체크
    if (grandTotal >= 0) {
        const insufficientItems = await checkStockAvailability(validItems);
        if (insufficientItems.length > 0) {
            alert(`Stock Insufficient for the following items:\n- ${insufficientItems.join('\n- ')}\n\nCannot update invoice.`);
            setLoading(false);
            return; // 저장 중단
        }
    }

    try {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

      // 1. 기존 재고 복구 (Revert Original Items)
      if (originalItems.length > 0) {
        await updateInventory(originalItems, true); 
      }

      // 2. 인보이스 업데이트
      const { error: invError } = await supabase.from("invoices").update({
        customer_id: selectedCustomerId,
        invoice_to: selectedCustomer?.name || "",
        invoice_date: invoiceDate,
        due_date: dueDate,
        total_amount: grandTotal,
        subtotal: subTotal,
        gst_total: gstTotal,
        updated_who: currentUserName,
        memo: memo,
        driver_id: currentDriverId,
        is_pickup: isPickup
      }).eq("id", invoiceId);

      if (invError) throw invError;

      // 3. 아이템 재작성
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);

      const itemsData = validItems.map(item => {
        const p = allProducts.find(x => x.id === item.productId);
        return {
          invoice_id: invoiceId,
          product_id: item.productId,
          description: `${p?.product_name || 'Unknown'} (${item.unit})`,
          quantity: item.quantity,
          unit: item.unit,
          base_price: item.basePrice,
          discount: item.discountRate,
          unit_price: item.unitPrice,
          amount: roundAmount(item.quantity * item.unitPrice)
        };
      });

      if (itemsData.length > 0) {
        const { error: itemError } = await supabase.from("invoice_items").insert(itemsData);
        if (itemError) throw itemError;

        // 4. 새 재고 차감 (Apply New Items)
        await updateInventory(validItems, false); 
      }

      await supabase.from("customers").update({ note: staffNote }).eq("id", selectedCustomerId);

      // 5. Custom Price Auto Update
      if (autoAddProduct && validItems.length > 0) {
        const updatesMap = new Map<string, { ctn: number, pack: number }>();
        allowedProducts.forEach(ap => updatesMap.set(ap.product_id, { ctn: ap.discount_ctn, pack: ap.discount_pack }));

        validItems.forEach(item => {
          const current = updatesMap.get(item.productId) || { ctn: 0, pack: 0 };
          if (item.unit === "CTN") current.ctn = item.discountRate; 
          else current.pack = item.discountRate; 
          updatesMap.set(item.productId, current);
        });

        const updates = validItems.map(item => {
          const rates = updatesMap.get(item.productId)!;
          return {
            customer_id: selectedCustomerId,
            product_id: item.productId,
            custom_price_ctn: rates.ctn,
            custom_price_pack: rates.pack
          };
        });

        const uniqueUpdates = Array.from(new Map(updates.map(item => [item.product_id, item])).values());
        await supabase.from("customer_products").upsert(uniqueUpdates, { onConflict: 'customer_id, product_id' });
      }

      alert("Invoice updated successfully!");
      router.push("/invoice");

    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && items.length === 0) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-slate-400"/></div>;
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Link href="/invoice"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5 text-slate-600" /></Button></Link>
        <h1 className="text-2xl font-bold text-slate-900">Edit Invoice <span className="text-slate-400">#{invoiceId}</span></h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><User className="w-3.5 h-3.5" /> Customer</label>
                <SearchableSelect options={customerOptions} value={selectedCustomerId} onChange={setSelectedCustomerId} placeholder="Select customer..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Date</label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" /> Due Date</label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              </div>
            </div>
            <div className="flex items-center space-x-2"><Checkbox id="pickup" checked={isPickup} onCheckedChange={(c) => setIsPickup(!!c)} /><label htmlFor="pickup" className="text-sm font-bold text-slate-700">Customer Pick Up</label></div>
            
            {/* Items Options */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
               <label className="text-xs font-bold text-slate-500 uppercase">Items</label>
               <div className="flex items-center gap-6">
                 <div className="flex items-center space-x-2">
                    <Checkbox id="showAll" checked={showAllProducts} onCheckedChange={(c) => setShowAllProducts(!!c)} />
                    <label htmlFor="showAll" className="text-xs font-bold text-slate-800">Show All Products</label>
                 </div>
                 <div className="flex items-center space-x-2">
                    <Checkbox id="autoAdd" checked={autoAddProduct} onCheckedChange={(c) => setAutoAddProduct(!!c)} />
                    <label htmlFor="autoAdd" className={`text-xs font-bold ${!autoAddProduct ? 'text-slate-500' : 'text-blue-600'}`}>
                      Auto-add/Update List
                    </label>
                 </div>
               </div>
            </div>

            <div className="border border-slate-200 rounded-lg"> 
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr><th className="px-4 py-3 w-[35%]">Product</th><th className="px-4 py-3 w-[8%]">Unit</th><th className="px-4 py-3 w-[10%] text-right bg-slate-100/50">Base</th><th className="px-4 py-3 w-[10%] text-right text-blue-700">Net</th><th className="px-4 py-3 w-[8%] text-right">Disc %</th><th className="px-4 py-3 w-[8%] text-center">Qty</th><th className="px-4 py-3 w-[12%] text-right">Total</th><th className="w-[4%]"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const isCtnOrPack = item.defaultUnitName?.toLowerCase().includes("carton") || item.defaultUnitName?.toLowerCase().includes("ctn") || item.defaultUnitName === "CTN";
                    
                    return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2"><SearchableSelect options={productOptions} value={item.productId} onChange={(val) => handleProductChange(idx, val)} placeholder="Search..." className="w-full min-w-[250px]" onClick={() => handleProductClick(idx)} /></td>
                          <td className="p-2">
                              <select 
                                className={`w-full p-2 border border-slate-200 rounded text-center font-medium outline-none text-xs ${!isCtnOrPack && item.productId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`} 
                                value={item.unit} 
                                onChange={(e) => handleUnitChange(idx, e.target.value as any)}
                                disabled={!isCtnOrPack && !!item.productId}
                              >
                                {isCtnOrPack ? (
                                    <>
                                        <option value="CTN">CTN</option>
                                        <option value="PACK">PK</option>
                                    </>
                                ) : (
                                    <option value={item.unit}>{item.unit}</option>
                                )}
                              </select>
                          </td>
                          <td className="p-2 text-right text-slate-400 text-xs line-through decoration-slate-300">${item.basePrice.toFixed(2)}</td>
                          <td className="p-2 text-right font-bold text-blue-700 text-sm">${item.unitPrice.toFixed(2)}</td>
                          <td className="p-2"><Input type="number" min="0" max="100" className="text-right h-9 text-xs border-blue-100 focus:border-blue-500 font-bold pr-2 bg-blue-50/50 text-blue-700" value={item.discountRate} onChange={(e) => handleDiscountChange(idx, Number(e.target.value))} /></td>
                          <td className="p-2">
                            <Input type="number" step="1" onKeyDown={(e) => { if (e.key === '.' || e.key === 'e') e.preventDefault(); }} className="text-center h-9" value={item.quantity} onChange={(e) => { const val = e.target.value; if (val === '') updateItem(idx, "quantity", ''); else updateItem(idx, "quantity", parseInt(val, 10)); }} />
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-center"><button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="bg-slate-50 p-2 border-t border-slate-200"><Button variant="ghost" size="sm" onClick={addItem} className="text-blue-600 hover:text-blue-700 w-full"><Plus className="w-4 h-4 mr-2" /> Add Line Item</Button></div>
            </div>
            
            <div className="space-y-6">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Invoice Memo</label><Textarea placeholder="Invoice notes..." className="resize-none h-20 bg-slate-50" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 shadow-sm space-y-2"><div className="flex items-center justify-between"><h3 className="font-bold text-amber-900 text-xs uppercase flex items-center gap-2"><Lock className="w-3 h-3"/> Staff Note</h3><span className="text-[10px] text-amber-700 font-medium px-2 py-0.5 bg-amber-100 rounded-full">Auto-updates Customer Profile</span></div><Textarea className="bg-white border-amber-200 text-sm min-h-[100px] resize-y" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Internal notes about this customer..." /></div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Calculator className="w-4 h-4" /> Summary</h3>
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-sm text-slate-600"><span>GST (10%)</span><span>${gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-xl font-black text-slate-900 pt-3 border-t border-dashed border-slate-200">
                <span>Grand Total</span><span>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-bold pt-3 border-t border-slate-100">
                <span className="text-slate-500">Customer Credit</span>
                <span className={availableCredit > 0 ? "text-emerald-600" : "text-slate-400"}>${availableCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <Button onClick={handleUpdate} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 text-sm font-bold shadow-md">
                {loading ? "Updating..." : <><Save className="w-4 h-4 mr-2" /> Update Invoice</>}
              </Button>
              <Link href="/invoice" className="block"><Button variant="ghost" className="w-full text-slate-500 h-10 text-sm">Cancel</Button></Link>
            </div>
          </div>
          
          {selectedCustomerId && customerStats.totalOverdue > 0 && (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-right-4 sticky top-80">
               <h3 className="font-bold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Account Status
               </h3>
               <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                     <span className="text-red-700 font-medium">Overdue Amount</span>
                     <span className="font-black text-red-700">${customerStats.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {customerStats.oldestInvoiceDate && (
                     <div className="flex justify-between items-center text-sm">
                        <span className="text-red-700 font-medium">Oldest Due</span>
                        <span className="font-bold text-red-700">{customerStats.oldestInvoiceDate}</span>
                     </div>
                  )}
               </div>
               <div className="pt-3 border-t border-red-100 text-center">
                   <span className="text-xs font-bold text-red-600 bg-white px-3 py-1 rounded-full border border-red-100">
                      Check Payment Required
                   </span>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}