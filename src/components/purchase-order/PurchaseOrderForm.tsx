"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, Calendar, Save, Trash2, Plus, 
  Search, ChevronDown, Check, Building2, FileText, Loader2,
  Calculator, Lock
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import EmailSendDialog from "@/components/email/EmailSendDialog";

const toFixed2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// 🚀 단위가 박스(CTN/Carton/Box)인지 정확히 판별하는 도우미 함수
const isCtnUnit = (unitStr: string | undefined | null) => {
    if (!unitStr) return false;
    const s = unitStr.toLowerCase();
    return s.includes('ctn') || s.includes('carton') || s.includes('box');
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

// --- [컴포넌트] SearchableSelect ---
interface Option { id: string; label: string; subLabel?: string; }
interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  onSearch?: (term: string) => void;
}

function SearchableSelect({ options, value, onChange, placeholder, disabled, className, onClick, onSearch }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [highlightedIndex, setHighlightedIndex] = useState(0); 
  
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]); 
  const triggerRef = useRef<HTMLDivElement>(null); // 💡 [추가] 포커스를 다시 돌려주기 위한 Ref
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (onSearch && isOpen) onSearch(debouncedSearchTerm);
  }, [debouncedSearchTerm, isOpen, onSearch]);

  const selectedOption = options.find((o: any) => o.id === value);
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    return options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
  }, [options, searchTerm]);
  
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ 
        block: "nearest",
        behavior: "auto" 
      });
    }
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 💡 [추가] 항목 선택 시 실행 (드롭다운 닫고 포커스 돌려주기)
  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchTerm("");
    setTimeout(() => triggerRef.current?.focus(), 0); // 선택 완료 후 탭(Tab) 이동이 매끄럽게 되도록 원래 박스로 포커스 복귀
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
    } 
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } 
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        const opt = filteredOptions[highlightedIndex];
        if (opt) handleSelect(opt.id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };
  
  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        ref={triggerRef} // 포커스를 잡기 위한 ref
        tabIndex={disabled ? -1 : 0} // 💡 [추가] 탭(Tab) 키로 이동 가능하도록 설정
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(!isOpen);
            if (onClick) onClick();
          }
        }}
        onClick={() => { if (!disabled) { setIsOpen(!isOpen); if (onClick) onClick(); } }} 
        className={`flex items-center justify-between outline-none w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}
      >
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>{selectedOption ? selectedOption.label : (value ? "Loading..." : placeholder)}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0" />
      </div>
      {isOpen && !disabled && (
        <div 
            className="absolute left-0 top-full mt-1 z-[99999] bg-white border border-slate-200 rounded-lg shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-100"
            style={{ minWidth: "500px", width: "max-content", maxWidth: "800px", maxHeight: "500px" }}
        >
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100 shrink-0 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                autoFocus 
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400" 
                placeholder="Search Product or Code..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
          <div className="p-1 overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">No results found.</div>
            ) : (
                filteredOptions.map((opt: any, index) => (
                    <div 
                        key={opt.id} 
                        ref={(el) => { itemRefs.current[index] = el; }} 
                        onMouseEnter={() => setHighlightedIndex(index)} 
                        onClick={() => handleSelect(opt.id)} 
                        className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${index === highlightedIndex ? "bg-slate-100" : "bg-transparent"} ${opt.id === value ? "font-bold text-slate-900" : "text-slate-700"}`}
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{opt.label}</span>
                            <span className="text-[11px] text-slate-500 mt-0.5">{opt.subLabel}</span>
                        </div>
                        {opt.id === value && <Check className="w-4 h-4 text-slate-900 shrink-0 ml-2" />}
                    </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Interfaces ---
interface Vendor { id: string; vendor_name: string; address?: string; suburb?: string; state?: string; postcode?: string;email?: string; tel?: string; }
interface Product { 
  id: string; 
  product_name: string; 
  buy_price: number | null; 
  vendor_id?: string; 
  current_stock_level?: number; 
  current_stock_level_pack?: number; 
  total_pack_ctn?: number; 
  vendor_product_id?: string; 
  product_units?: any; 
  unit_name?: string;
}
interface POItem { 
  productId: string; 
  vendorProductId: string; 
  quantity: number; 
  unit: string; 
  defaultUnitName?: string; 
  unitPrice: number; 
  description?: string; 
  gst: boolean; 
}

interface PurchaseOrderFormProps {
  orderId?: string;
}

export default function PurchaseOrderForm({ orderId }: PurchaseOrderFormProps) {
  const supabase = useMemo(() => createClient(), []); 
  const router = useRouter();
  const isEditMode = !!orderId;

  const getTodayLocal = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [poDate, setPoDate] = useState(getTodayLocal());
  const [poNumber, setPoNumber] = useState("Loading...");
  const [memo, setMemo] = useState("");
  
  const [isReceived, setIsReceived] = useState(false);
  const [updatePrice, setUpdatePrice] = useState(false);
  const [initialStatus, setInitialStatus] = useState(""); 
  
  const [originalItems, setOriginalItems] = useState<POItem[]>([]);
  const [items, setItems] = useState<POItem[]>([{ productId: "", vendorProductId: "", unit: "CTN", quantity: 1, unitPrice: 0, gst: true }]);
  
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogData, setEmailDialogData] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    
    const initData = async () => {
      setLoading(true);
      try {
        const [vRes, pRes] = await Promise.all([
          supabase.from("product_vendors").select("id, vendor_name, email").order("vendor_name"),
          supabase.from("products").select("id, product_name, buy_price, vendor_id, current_stock_level, current_stock_level_pack, total_pack_ctn, vendor_product_id, product_units(unit_name)").limit(50)
        ]);

        if (!isMounted) return;
        if (vRes.data) setVendors(vRes.data);
        if (pRes.data) setAllProducts(pRes.data as any[]); 

        if (orderId) {
          const { data: order, error: orderError } = await supabase
            .from("purchase_orders")
            .select(`
              *,
              purchase_order_items (
                product_id, quantity, unit_price, description, unit,
                products (id, product_name, buy_price, vendor_id, current_stock_level, current_stock_level_pack, total_pack_ctn, vendor_product_id, product_units(unit_name))
              )
            `)
            .eq("id", orderId)
            .maybeSingle();
          
          if (orderError || !order) {
            alert("Order not found.");
            router.push("/product/purchase");
            return;
          }

          setSelectedVendorId(order.vendor_id || "");
          setPoDate(order.po_date || "");
          setPoNumber(order.po_number || "");
          setMemo(order.memo || "");
          setIsReceived(order.status === "Done");
          setInitialStatus(order.status);

          if (order.purchase_order_items) {
            const loadedProducts = order.purchase_order_items.map((i:any) => i.products).filter(Boolean);
            setAllProducts(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newProds = loadedProducts.filter((p:any) => !existingIds.has(p.id));
                return [...prev, ...newProds] as any[];
            });

            const mappedItems = order.purchase_order_items.map((i: any) => {
              const pUnits = i.products?.product_units;
              const extractedUnitName = Array.isArray(pUnits) ? pUnits[0]?.unit_name : pUnits?.unit_name;
              const defUnitName = extractedUnitName || i.products?.unit_name || "CTN";
              let unitToSet = i.unit || defUnitName;
              
              return {
                productId: i.product_id || "",
                vendorProductId: i.products?.vendor_product_id || "",
                quantity: Number(i.quantity) || 0,
                unit: unitToSet,
                defaultUnitName: defUnitName,
                unitPrice: Number(i.unit_price) || 0,
                description: i.description || i.products?.product_name || "Unknown Item",
                gst: true 
              };
            });
            setItems([...mappedItems, { productId: "", vendorProductId: "", unit: "CTN", quantity: 1, unitPrice: 0, gst: true }]);
            setOriginalItems(mappedItems);
          }
        } 
        else {
          const { data: lastPO } = await supabase.from("purchase_orders").select("po_number").order("created_at", { ascending: false }).limit(1).maybeSingle();
          let nextNumber = "PO-000001";
          if (lastPO?.po_number) {
            const lastNumStr = lastPO.po_number.replace("PO-", "");
            const lastNum = parseInt(lastNumStr, 10);
            if (!isNaN(lastNum)) nextNumber = `PO-${String(lastNum + 1).padStart(6, "0")}`;
          }
          setPoNumber(nextNumber);
        }
      } catch (err) {
        console.error("Initialization Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    initData();
    return () => { isMounted = false; };
  }, [orderId, supabase, router]);

  const handleSearchProducts = async (term: string) => {
    if (!term.trim()) return;
    
    let query = supabase.from("products")
      .select("id, product_name, buy_price, vendor_id, current_stock_level, current_stock_level_pack, total_pack_ctn, vendor_product_id, product_units(unit_name)")
      .ilike("product_name", `%${term}%`)
      .limit(30);

    if (selectedVendorId) {
      query = query.or(`vendor_id.eq.${selectedVendorId},vendor_id.is.null`);
    }

    const { data } = await query;
    if (data && data.length > 0) {
      setAllProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newItems = data.filter(p => !existingIds.has(p.id));
        return [...prev, ...newItems] as any[];
      });
    }
  };

  const filteredProducts = useMemo(() => {
    if (allProducts.length === 0) return [];
    if (!selectedVendorId) return allProducts;
    return allProducts.filter(p => !p.vendor_id || p.vendor_id === selectedVendorId);
  }, [selectedVendorId, allProducts]);

  const handleProductChange = (index: number, productId: string) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;

    const pUnits = product.product_units;
    const extractedUnitName = Array.isArray(pUnits) ? pUnits[0]?.unit_name : pUnits?.unit_name;
    const defUnitName = extractedUnitName || product.unit_name || "CTN";
    
    let unitToSet = defUnitName;
    if (unitToSet.toLowerCase().includes("carton")) unitToSet = "CTN";
    if (unitToSet.toLowerCase() === "pack") unitToSet = "PACK";

    const newItems = [...items];
    newItems[index] = { 
      ...newItems[index], 
      productId, 
      vendorProductId: product.vendor_product_id || "",
      unit: unitToSet,
      defaultUnitName: defUnitName,
      unitPrice: Number(product.buy_price) || 0, 
      description: product.product_name,
      gst: true 
    };
    setItems(newItems);
  };

  const handleUnitChange = (index: number, unit: string) => {
    const newItems = [...items];
    newItems[index].unit = unit;
    setItems(newItems);
  };

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...items];
    // @ts-ignore
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };
  const addItem = () => setItems([...items, { productId: "", vendorProductId: "", unit: "CTN", quantity: 1, unitPrice: 0, gst: true }]);
  const handleProductClick = (index: number) => { if (index === items.length - 1) addItem(); };

  const subTotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const gstTotal = items.reduce((sum, item) => item.gst ? sum + (item.quantity * item.unitPrice * 0.1) : sum, 0);
  const grandTotal = subTotal + gstTotal;

  const productOptions = useMemo(() => filteredProducts.map(p => ({
    id: p.id, 
    label: p.product_name, 
    subLabel: `Code: ${p.vendor_product_id || '-'} | Buy: $${(Number(p.buy_price) || 0).toFixed(2)}`
  })), [filteredProducts]);

  const vendorOptions = useMemo(() => vendors.map(v => ({ id: v.id, label: v.vendor_name })), [vendors]);

  const handleSave = async () => {
    if (!selectedVendorId) return alert("Please select a vendor.");
    setLoading(true);
    try {
      const validItems = items.filter(i => i.productId);
      let targetPoId = orderId;

      if (isEditMode) {
        await supabase.from("purchase_orders").update({
          vendor_id: selectedVendorId, po_date: poDate, total_amount: toFixed2(grandTotal), status: isReceived ? "Done" : "Pending", memo: memo
        }).eq("id", targetPoId!);
        
        await supabase.from("purchase_order_items").delete().eq("po_id", targetPoId!);
      } else {
        const { data: po } = await supabase.from("purchase_orders").insert({
          vendor_id: selectedVendorId, po_number: poNumber, po_date: poDate, total_amount: toFixed2(grandTotal), status: isReceived ? "Done" : "Pending", memo: memo
        }).select().single();
        targetPoId = po?.id;
      }

      if (validItems.length > 0 && targetPoId) {
        const itemsPayload = validItems.map(item => ({
          po_id: targetPoId, product_id: item.productId, description: item.description, 
          unit: item.unit, quantity: item.quantity, unit_price: toFixed2(item.unitPrice), amount: toFixed2(item.quantity * item.unitPrice)
        }));
        await supabase.from("purchase_order_items").insert(itemsPayload);

        for (const newItem of validItems) {
          if (isReceived && initialStatus !== "Done") {
            const product = allProducts.find(p => p.id === newItem.productId);
            if (product) {
              const currentCtn = Number(product.current_stock_level) || 0;
              const currentPack = Number(product.current_stock_level_pack) || 0;
              const packsPerCtn = Number(product.total_pack_ctn) || 0; 
              
              const hasCarton = packsPerCtn > 1;
              const addedQty = Number(newItem.quantity) || 0;

              let newCtn = currentCtn;
              let newPack = currentPack;

              if (hasCarton) {
                  let totalCurrentPacks = (currentCtn * packsPerCtn) + currentPack;
                  const addedPacks = isCtnUnit(newItem.unit) ? (addedQty * packsPerCtn) : addedQty;
                  
                  totalCurrentPacks += addedPacks;

                  newCtn = Math.floor(totalCurrentPacks / packsPerCtn);
                  newPack = totalCurrentPacks % packsPerCtn;
              } else {
                  if (isCtnUnit(newItem.unit)) newCtn += addedQty;
                  else newPack += addedQty;
              }

              await supabase.from("products").update({ 
                  current_stock_level: newCtn, 
                  current_stock_level_pack: newPack 
              }).eq("id", newItem.productId);
            }
          }

          if (updatePrice) {
            await supabase.from("products").update({ buy_price: newItem.unitPrice }).eq("id", newItem.productId);
          }
        }
      }
      router.push("/product/purchase");
    } catch (e) {
      console.error(e);
      alert("Error saving Purchase Order");
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEditMode) return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-500 w-10 h-10" /></div>;

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24 text-slate-900">
      <EmailSendDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen} data={emailDialogData} />
      
      <div className="flex items-center gap-4">
        <Link href="/product/purchase">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100"><ArrowLeft className="w-5 h-5 text-slate-600" /></Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
            {isEditMode ? "Edit Purchase Order" : "New Purchase Order"} 
            {isEditMode && <span className="text-slate-400 font-normal ml-2 tracking-normal">#{poNumber}</span>}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Vendor</label>
                <SearchableSelect options={vendorOptions} value={selectedVendorId} onChange={setSelectedVendorId} placeholder="Select Vendor..." disabled={isEditMode} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> PO Date</label>
                    <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> PO Number</label>
                    <Input value={poNumber} readOnly className="bg-slate-50 text-slate-500 font-medium" />
                </div>
              </div>
            </div>
            
            <div className="border border-slate-200 rounded-lg shadow-sm">
              <table className="w-full text-sm text-left table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-[30%]">Product</th>
                    <th className="px-4 py-3 w-[15%]">Item Code</th>
                    <th className="px-4 py-3 w-[10%] text-right">Cost</th>
                    <th className="px-4 py-3 w-[10%] text-center">Unit</th>
                    <th className="px-4 py-3 w-[8%] text-center">Qty</th>
                    <th className="px-4 py-3 w-[7%] text-center">GST</th>
                    <th className="px-4 py-3 w-[15%] text-right">Subtotal</th>
                    <th className="w-[5%] text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const isCtnOrPack = isCtnUnit(item.defaultUnitName);
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2">
                          <div style={{ zIndex: 100 + (items.length - idx), position: 'relative' }}>
                              <SearchableSelect 
                                  options={productOptions} 
                                  value={item.productId} 
                                  onChange={(val: string) => handleProductChange(idx, val)} 
                                  placeholder="Select product..." 
                                  className="w-full shadow-none border-slate-200" 
                                  onClick={() => handleProductClick(idx)} 
                                  disabled={!selectedVendorId} 
                                  onSearch={handleSearchProducts} 
                              />
                          </div>
                        </td>
                        <td className="p-2 truncate">
                          {/* 💡 [추가] tabIndex={-1}을 주어 탭 이동 시 무시하도록 설정 */}
                          <Input value={item.vendorProductId || ""} readOnly tabIndex={-1} className="bg-transparent border-none h-9 w-full text-slate-500 shadow-none px-1" />
                        </td>
                        <td className="p-2 truncate"><Input type="number" className="text-right h-9 w-full border-slate-200 focus:ring-slate-400" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))} /></td>
                        <td className="p-2">
                          <select 
                            className={`w-full p-2 border border-slate-200 rounded text-center font-medium outline-none focus:ring-2 focus:ring-slate-900 transition-all text-xs h-9 ${!isCtnOrPack && item.productId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`} 
                            value={item.unit} 
                            onChange={(e) => handleUnitChange(idx, e.target.value)} 
                            disabled={!isCtnOrPack && !!item.productId}
                          >
                            {isCtnOrPack ? (<><option value="CTN">CTN</option><option value="PACK">PK</option></>) : (<option value={item.unit}>{item.unit}</option>)}
                          </select>
                        </td>
                        <td className="p-2 truncate"><Input type="number" min="1" className="text-center h-9 w-full border-slate-200 focus:ring-slate-400 px-1" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} /></td>
                        <td className="p-2 text-center"><Checkbox checked={item.gst} onCheckedChange={(c) => updateItem(idx, "gst", !!c)} /></td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 truncate" title={`$${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                          ${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"><Trash2 className="w-4 h-4 mx-auto" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Button variant="ghost" onClick={addItem} className="w-full text-blue-600 border-t rounded-none py-6 font-semibold hover:bg-blue-50/50 transition-colors"><Plus className="w-4 h-4 mr-2" /> Add Line Item</Button>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Memo / Internal Notes</label>
                <Textarea placeholder="Enter any internal notes or instructions..." className="h-24 bg-slate-50 border-slate-200 focus:ring-slate-400 resize-none" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
            <h3 className="font-bold flex items-center gap-2 text-slate-800"><Calculator className="w-4 h-4 text-slate-400" /> Summary</h3>
            <div className="space-y-3 text-sm border-t border-slate-100 pt-4">
                <div className="flex justify-between text-slate-500 font-medium"><span>Subtotal</span><span>${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-slate-500 font-medium"><span>GST (10%)</span><span>${gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between font-black text-xl border-t border-slate-100 pt-3 mt-2 text-slate-900"><span>Total</span><span>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
            
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-center gap-3">
                <Checkbox id="updatePrice" checked={updatePrice} onCheckedChange={(c) => setUpdatePrice(!!c)} className="border-blue-300 data-[state=checked]:bg-blue-600" />
                <label htmlFor="updatePrice" className="text-sm font-bold text-blue-800 cursor-pointer select-none">Update Master Price</label>
            </div>

            <div className={`border p-3 rounded-lg flex items-center justify-between transition-colors ${initialStatus === "Done" ? "bg-slate-100 border-slate-200 opacity-80" : "bg-emerald-50 border-emerald-100"}`}>
                <div className="flex items-center gap-3">
                    <Checkbox 
                        id="markReceived" 
                        checked={isReceived} 
                        onCheckedChange={(c) => setIsReceived(!!c)} 
                        disabled={initialStatus === "Done"} 
                        className="data-[state=checked]:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                    />
                    <label htmlFor="markReceived" className={`text-sm font-bold select-none ${initialStatus === "Done" ? "text-slate-600 cursor-not-allowed" : "text-emerald-800 cursor-pointer"}`}>
                        Mark as Received
                    </label>
                </div>
                {initialStatus === "Done" && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3" /> Stock Locked
                    </div>
                )}
            </div>
            
            <div className="pt-2">
                <Button onClick={() => handleSave()} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-6 shadow-md shadow-slate-200">
                    {loading ? <Loader2 className="animate-spin mr-2 w-4 h-4" /> : <Save className="mr-2 w-4 h-4" />}
                    {isEditMode ? "Save Changes" : "Create Order"}
                </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}