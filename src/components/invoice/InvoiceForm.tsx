"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  Plus, Trash2, Save, ArrowLeft, User, Calendar, CreditCard, 
  Calculator, FileText, RefreshCw, Lock, Search, ChevronDown, Check,
  AlertTriangle, Loader2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// --- [Utility] ---
const roundAmount = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// --- [Utility] Debounce Hook ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// --- [Component] SearchableSelect (Fixed: Supports onClick & onSearch) ---
interface Option { id: string; label: string; subLabel?: string; }

// ✅ [수정] onClick, onSearch 속성 복구
interface SearchableSelectProps { 
    options: Option[]; 
    value: string; 
    onChange: (value: string) => void; 
    placeholder?: string; 
    disabled?: boolean; 
    className?: string; 
    onClick?: () => void;              // 행 추가 등을 위한 클릭 이벤트
    onSearch?: (term: string) => void; // 서버 검색이 필요할 경우 사용
}

function SearchableSelect({ options, value, onChange, placeholder = "Select...", disabled = false, className, onClick, onSearch }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0); 
  
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]); 
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // ✅ [수정] onSearch가 있으면 서버 검색 실행
  useEffect(() => {
      if (onSearch && isOpen) {
          onSearch(debouncedSearchTerm);
      }
  }, [debouncedSearchTerm, isOpen, onSearch]);

  const selectedOption = options.find(o => o.id === value);
  
  // 클라이언트 사이드 필터링
  const filteredOptions = useMemo(() => {
    // onSearch가 있으면 서버가 필터링하므로 클라이언트 필터링은 최소화하거나 건너뜀
    // 하지만 UX상 로컬 필터링도 같이 되면 더 부드러움
    if (!searchTerm) return options;
    const lowerTerm = searchTerm.toLowerCase();
    return options.filter(option => 
        option.label.toLowerCase().includes(lowerTerm) || 
        (option.subLabel && option.subLabel.toLowerCase().includes(lowerTerm))
    );
  }, [options, searchTerm]);

  useEffect(() => {
    setHighlightedIndex(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [searchTerm, options]);

  useEffect(() => {
    if (isOpen && listRef.current && optionsRef.current[highlightedIndex]) {
        optionsRef.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault(); 
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filteredOptions[highlightedIndex]) {
        onChange(filteredOptions[highlightedIndex].id);
        setIsOpen(false);
        setSearchTerm("");
        if (e.key === "Enter") e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        // ✅ [수정] onClick 이벤트 핸들러 연결 (행 추가 로직 등)
        onClick={() => { 
            if (!disabled) { 
                setIsOpen(!isOpen); 
                if (!isOpen) setTimeout(() => inputRef.current?.focus(), 0);
                if (onClick) onClick(); 
            } 
        }} 
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}
      >
        <span className={`block truncate ${!selectedOption ? "text-slate-400" : "text-slate-900 font-medium"}`}>
            {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0 ml-2" />
      </div>
      
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col animate-in fade-in zoom-in-95 duration-100"
             style={{ minWidth: "100%", width: "max-content", maxWidth: "500px", maxHeight: "400px" }}
        >
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100 shrink-0 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                ref={inputRef}
                type="text" 
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400" 
                placeholder="Search..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                onKeyDown={handleKeyDown} 
              />
            </div>
          </div>
          <div className="p-1 overflow-y-auto flex-1" ref={listRef}>
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-xs text-center text-slate-400">No results found.</div>
            ) : (
              filteredOptions.map((option, index) => (
                <div 
                  key={option.id} 
                  ref={(el) => { optionsRef.current[index] = el; }} 
                  onClick={() => { onChange(option.id); setIsOpen(false); setSearchTerm(""); }} 
                  onMouseMove={() => setHighlightedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer ${index === highlightedIndex ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-700"}`}
                >
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.subLabel && <span className="text-[10px] text-slate-400">{option.subLabel}</span>}
                  </div>
                  {option.id === value && <Check className="w-3.5 h-3.5 text-slate-900 shrink-0 ml-2" />}
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
interface Customer { id: string; name: string; due_date_term?: string; note?: string; in_charge_delivery?: string | null; } 
interface ProductMaster { 
    id: string; 
    product_name: string; 
    vendor_product_id?: string;
    sell_price_ctn: number; 
    sell_price_pack: number; 
    total_pack_ctn?: number; 
    default_unit_id?: string; 
    product_units?: { unit_name: string }; 
    unit_name?: string; 
    current_stock_level: number;       
    current_stock_level_pack: number;
    is_active?: boolean;
} 
interface AllowedProduct { product_id: string; discount_ctn: number; discount_pack: number; }
interface InvoiceItem { productId: string; unit: string; quantity: number; basePrice: number; discountRate: number; unitPrice: number; defaultUnitName?: string; }

interface InvoiceFormProps {
  invoiceId?: string; 
}

export default function InvoiceForm({ invoiceId }: InvoiceFormProps) {
  const supabase = createClient();
  const router = useRouter();
  const isEditMode = !!invoiceId; 

  // --- State ---
  const [loading, setLoading] = useState(true);
  
  const [customers, setCustomers] = useState<Customer[]>([]); 
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]); 
  const [allowedProducts, setAllowedProducts] = useState<AllowedProduct[]>([]); 
  const [searchResultIds, setSearchResultIds] = useState<Set<string>>(new Set()); 

  const [currentUserName, setCurrentUserName] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(false); 
  const [autoAddProduct, setAutoAddProduct] = useState(false);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);
  const [isPickup, setIsPickup] = useState(false);
  const [customerStats, setCustomerStats] = useState<{ totalOverdue: number; oldestInvoiceDate: string | null; }>({ totalOverdue: 0, oldestInvoiceDate: null });
  
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});

  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getTodayLocal();
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [availableCredit, setAvailableCredit] = useState(0); 
  
  const [originalItems, setOriginalItems] = useState<InvoiceItem[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([
    { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }
  ]);

  // 1. Initial Load 
  useEffect(() => {
    const initData = async () => {
      setLoading(true);

      const [custRes, userRes, unitRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"), 
        supabase.auth.getUser(),
        supabase.from("product_units").select("id, unit_name").limit(10000) 
      ]);

      if (custRes.data) setCustomers(custRes.data); 
      
      if (userRes.data.user) {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userRes.data.user.id).single();
        setCurrentUserName(profile?.display_name || userRes.data.user.email?.split('@')[0] || "Unknown");
      }
      
      const uMap: Record<string, string> = {};
      if (unitRes.data) {
          unitRes.data.forEach((u: any) => uMap[u.id] = u.unit_name);
          setUnitMap(uMap);
      }

      // Edit Mode Load
      if (isEditMode) {
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

          setSelectedCustomerId(inv.customer_id);
          setInvoiceDate(inv.invoice_date);
          setDueDate(inv.due_date);
          setMemo(inv.memo || "");
          setIsPickup(inv.is_pickup || false);
          setCurrentDriverId(inv.driver_id);

          const productIdsInInvoice = inv.invoice_items.map((item: any) => item.product_id);
          let initialProducts: any[] = [];
          if (productIdsInInvoice.length > 0) {
              const { data: productsData } = await supabase.from("products").select("*, product_units (unit_name)").in("id", productIdsInInvoice); 
              if (productsData) initialProducts = productsData;
          }
          const mappedProducts = initialProducts.map((p: any) => ({ ...p, unit_name: p.product_units?.unit_name || "CTN" }));
          setAllProducts(mappedProducts);

          const loadedItems = inv.invoice_items.map((item: any) => {
            let unit = item.unit;
            if (!unit) { const match = item.description.match(/\((CTN|PACK)\)$/); unit = match ? match[1] : "CTN"; }
            const prod = initialProducts.find((p: any) => p.id === item.product_id);
            return {
                productId: item.product_id,
                unit: unit,
                quantity: item.quantity,
                basePrice: item.base_price,
                discountRate: item.discount,
                unitPrice: item.unit_price,
                defaultUnitName: prod?.product_units?.unit_name || "CTN"
            };
          });
          setItems(loadedItems);
          setOriginalItems(JSON.parse(JSON.stringify(loadedItems))); 
      }

      setLoading(false);
    };
    initData();
  }, [invoiceId, isEditMode]);


  // 2. Customer Change Effect 
  useEffect(() => {
    if (!selectedCustomerId) {
        setAllowedProducts([]); 
        setStaffNote(""); 
        setAvailableCredit(0); 
        setCurrentDriverId(null); 
        setCustomerStats({ totalOverdue: 0, oldestInvoiceDate: null }); 
        if (!isEditMode) setAllProducts([]); 
        return;
    }

    const loadCustomerDetail = async () => {
      // ✅ 1. 고객 상세 정보 (Memo, DueDate 등) - 이건 필수니까 유지 (가벼움)
      const { data: fullCustomer } = await supabase
          .from("customers")
          .select("due_date, note, in_charge_delivery")
          .eq("id", selectedCustomerId)
          .single();

      if (fullCustomer) {
        setStaffNote(fullCustomer.note || "");
        if (!isEditMode) calculateDueDate(invoiceDate, fullCustomer.due_date);
        if (!currentDriverId) setCurrentDriverId(fullCustomer.in_charge_delivery); 
      }
      
      // ✅ 2. 고객별 가격 정책(할인율)만 가져옴 (가벼움) - 유지
      const { data: apData } = await supabase
          .from("customer_products")
          .select("product_id, custom_price_ctn, custom_price_pack")
          .eq("customer_id", selectedCustomerId)
          .limit(10000);
      
      if (apData) {
          const mappedAllowed = apData.map((item: any) => ({ 
              product_id: item.product_id, 
              discount_ctn: item.custom_price_ctn || 0, 
              discount_pack: item.custom_price_pack || 0 
          }));
          setAllowedProducts(mappedAllowed);
          // allowedProductIds 배열 생성 로직은 삭제하거나 검색 필터용으로만 남김
      }

      // ❌ [삭제!] 여기서 "Allowed Products"의 모든 상세 정보를 DB에서 긁어오는 부분을 삭제합니다.
      // 이 부분이 Edit 페이지 로딩을 느리게 만드는 주범입니다.
      /* if (!showAllProducts && allowedProductIds.length > 0) {
          const { data: productsData } = await supabase
              .from("products")
              .select("*, product_units (unit_name)")
              .in("id", allowedProductIds);
          
          if (productsData) {
             // ... (이 무거운 로직 삭제) ...
          }
      } 
      */

      // ✅ 3. Credit 및 미수금 조회 - 유지 (필요함)
      const [paymentsRes, unpaidRes] = await Promise.all([
          supabase.from('payments').select('unallocated_amount').eq('customer_id', selectedCustomerId).gt('unallocated_amount', 0),
          supabase.from("invoices").select("due_date, total_amount, paid_amount").eq("customer_id", selectedCustomerId).neq("status", "Paid")
      ]);

      // ... (아래 통계 처리 로직 유지) ...
      if (paymentsRes.data) {
        const total = paymentsRes.data.reduce((sum, p) => sum + p.unallocated_amount, 0);
        setAvailableCredit(roundAmount(total));
      } else {
        setAvailableCredit(0);
      }

      if (unpaidRes.data) {
        const todayStr = new Date().toISOString().split('T')[0];
        const overdueInvoices = unpaidRes.data.filter((inv: any) => inv.due_date < todayStr);
        const overdueTotal = overdueInvoices.reduce((sum: number, inv: any) => sum + (inv.total_amount - (inv.paid_amount || 0)), 0);
        const sortedOverdue = overdueInvoices.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        setCustomerStats({ totalOverdue: roundAmount(overdueTotal), oldestInvoiceDate: sortedOverdue[0]?.due_date || null });
      } else {
        setCustomerStats({ totalOverdue: 0, oldestInvoiceDate: null });
      }
    };

    loadCustomerDetail();
  }, [selectedCustomerId, isEditMode]); 

  const handleShowAllToggle = async (isChecked: boolean) => {
      setShowAllProducts(isChecked);
      if (isChecked) {
          const { data } = await supabase.from("products").select("*, product_units (unit_name)").limit(1000); 
          if (data) {
              const mapped = data.map((p: any) => ({ ...p, unit_name: p.product_units?.unit_name || "CTN" }));
              setAllProducts(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const newItems = mapped.filter(p => !existingIds.has(p.id));
                  return [...prev, ...newItems];
              });
          }
      } else {
          setSearchResultIds(new Set()); 
          const allowedIds = allowedProducts.map(ap => ap.product_id);
          const selectedItemIds = items.map(i => i.productId).filter(Boolean);
          const keepIds = new Set(selectedCustomerId ? [...allowedIds, ...selectedItemIds] : selectedItemIds);
          setAllProducts(prev => prev.filter(p => keepIds.has(p.id)));
      }
  };

  // ✅ [복구] Products는 여전히 서버 검색을 할 수 있도록 유지
  const handleSearchProducts = async (term: string) => {
      if (!term.trim() || !showAllProducts) return;
      const { data } = await supabase.from("products").select("*, product_units (unit_name)").or(`product_name.ilike.%${term}%,vendor_product_id.ilike.%${term}%`).limit(20); 
      if (data && data.length > 0) {
          const newProducts = data.map((p: any) => ({ ...p, unit_name: p.product_units?.unit_name || "CTN" }));
          setAllProducts(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const filteredNew = newProducts.filter(p => !existingIds.has(p.id));
              return [...prev, ...filteredNew];
          });
          setSearchResultIds(prev => {
              const next = new Set(prev);
              data.forEach((d: any) => next.add(d.id));
              return next;
          });
      }
  };

  const calculateDueDate = (startDateStr: string, term: string | null) => {
    if (!term) { setDueDate(startDateStr); return; }
    const termClean = term.replace(/\./g, "").toUpperCase().replace(/\s/g, "");
    const [y, m, d] = startDateStr.split('-').map(Number);
    const currentDate = new Date(y, m - 1, d); 
    if (termClean.includes("COD") || termClean === "CASH") setDueDate(startDateStr);
    else if (termClean.includes("EOM")) {
      if (termClean.includes("30")) setDueDate(formatDateLocal(new Date(y, m + 1, 0)));
      else setDueDate(formatDateLocal(new Date(y, m, 0)));
    } else {
      const days = parseInt(term.match(/\d+/)?.[0] || "0");
      if (days > 0) { currentDate.setDate(currentDate.getDate() + days); setDueDate(formatDateLocal(currentDate)); }
      else setDueDate(startDateStr);
    }
  };
  const formatDateLocal = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const handleInvoiceDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value; setInvoiceDate(newDate);
  };

  const productOptions = useMemo(() => {
    return allProducts.filter(p => {
        if (showAllProducts) return true;
        const isAllowed = allowedProducts.some(ap => ap.product_id === p.id);
        const isSelected = items.some(i => i.productId === p.id);
        const isSearchResult = searchResultIds.has(p.id);
        return isAllowed || isSelected || isSearchResult;
    }).map(p => ({ 
        id: p.id, 
        label: p.product_name, 
        subLabel: `${p.vendor_product_id ? `[${p.vendor_product_id}] ` : ""}$${p.sell_price_ctn} (CTN) / $${p.sell_price_pack} (PK)` 
    }));
  }, [allProducts, allowedProducts, showAllProducts, items, searchResultIds]);

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.name })), [customers]);

  const applyPriceLogic = (index: number, productId: string, unit: string, basePriceInput: number, discountRateInput: number, defaultUnitName?: string) => {
    const netPrice = roundAmount(basePriceInput - (basePriceInput * (discountRateInput / 100)));
    const newItems = [...items];
    newItems[index] = { ...newItems[index], productId, unit, basePrice: basePriceInput, discountRate: discountRateInput, unitPrice: netPrice, defaultUnitName: defaultUnitName || newItems[index].defaultUnitName };
    setItems(newItems);
  };

  const handleProductChange = (index: number, productId: string) => {
    const p = allProducts.find(p => p.id === productId); 
    if (!p) return;
    const defUnitName = p.unit_name || "CTN";
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
  
  const checkStockAvailability = async (itemList: InvoiceItem[]) => {
      const insufficientItems: string[] = [];
      for (const item of itemList) {
          if (!item.productId) continue;
          const { data: product } = await supabase.from('products').select('id, product_name, current_stock_level, current_stock_level_pack, total_pack_ctn').eq('id', item.productId).single();
          if (product) {
              let currentCtn = product.current_stock_level || 0;
              let currentPack = product.current_stock_level_pack || 0;
              const packsPerCtn = product.total_pack_ctn || 1;
              if (isEditMode) {
                  const originalItem = originalItems.find(oi => oi.productId === item.productId && oi.unit === item.unit);
                  if (originalItem) {
                      if (originalItem.unit === 'CTN') currentCtn += originalItem.quantity; else currentPack += originalItem.quantity;
                  }
              }
              if (item.unit === "CTN") {
                  if (currentCtn < item.quantity) insufficientItems.push(`${product.product_name} (${item.unit})`);
              } else {
                  const totalAvailablePacks = currentPack + (currentCtn * packsPerCtn);
                  if (totalAvailablePacks < item.quantity) insufficientItems.push(`${product.product_name} (${item.unit})`);
              }
          }
      }
      return insufficientItems;
  };

  const updateInventory = async (itemList: InvoiceItem[], isReturn: boolean) => {
    for (const item of itemList) {
        if (!item.productId) continue;
        const { data: product } = await supabase.from('products').select('current_stock_level, current_stock_level_pack, total_pack_ctn').eq('id', item.productId).single();
        if (!product) continue;
        let currentCtn = product.current_stock_level || 0;
        let currentPack = product.current_stock_level_pack || 0;
        const packsPerCtn = product.total_pack_ctn || 1; 
        const qty = item.quantity; 
        if (isReturn) {
            if (item.unit === 'CTN') currentCtn += qty; else currentPack += qty;
        } else {
            if (item.unit === 'CTN') currentCtn -= qty; 
            else { 
                if (currentPack >= qty) currentPack -= qty;
                else {
                    if (currentCtn > 0) { currentCtn -= 1; currentPack += packsPerCtn; currentPack -= qty; } 
                    else currentPack -= qty;
                }
            }
        }
        await supabase.from('products').update({ current_stock_level: currentCtn, current_stock_level_pack: currentPack }).eq('id', item.productId);
    }
  };

  const handleCreditMemoCreation = async (redirect: boolean) => {
    try {
        const { data: lastCr } = await supabase.from('invoices').select('id').ilike('id', 'CR-%').order('id', { ascending: false }).limit(1).single();
        let nextId = "CR-00001";
        if (lastCr?.id) { const match = lastCr.id.match(/CR-(\d+)/); if (match && match[1]) nextId = `CR-${String(parseInt(match[1]) + 1).padStart(5, '0')}`; }
        
        const customerName = customers.find(c => c.id === selectedCustomerId)?.name || "Unknown Customer";
        const { error: invError } = await supabase.from("invoices").insert({
          id: nextId, customer_id: selectedCustomerId, invoice_to: customerName, invoice_date: invoiceDate, due_date: invoiceDate, total_amount: grandTotal, subtotal: subTotal, gst_total: gstTotal, paid_amount: grandTotal, status: "Credit", created_who: currentUserName, updated_who: currentUserName, memo: memo, is_pickup: isPickup
        });
        if (invError) throw invError;
        const validItems = items.filter(item => item.productId);
        if (validItems.length > 0) {
          const itemsData = validItems.map(item => {
              const p = allProducts.find(x => x.id === item.productId);
              return { invoice_id: nextId, product_id: item.productId, description: `${p?.product_name || 'Item'} (${item.unit})`, quantity: item.quantity, unit: item.unit, base_price: item.basePrice, discount: item.discountRate, unit_price: item.unitPrice, amount: roundAmount(item.quantity * item.unitPrice) };
          });
          const { error: itemError } = await supabase.from("invoice_items").insert(itemsData);
          if (itemError) throw itemError;
          await updateInventory(validItems, true);
        }
        const creditAmount = Math.abs(grandTotal); 
        const itemSummary = validItems.map(i => { const p = allProducts.find(x => x.id === i.productId); return `${p?.product_name} x${i.quantity}`; }).join(', ');
        const { error: payError } = await supabase.from('payments').insert({
            id: nextId, customer_id: selectedCustomerId, amount: creditAmount, unallocated_amount: creditAmount, payment_date: invoiceDate, category: 'Credit Memo', reason: `Generated from ${nextId}`, note: `[Credit Memo] ${memo} / Items: ${itemSummary}`, created_at: new Date().toISOString()
        });
        if (payError) throw payError;
        await supabase.from("customers").update({ note: staffNote }).eq("id", selectedCustomerId);
        alert(`Credit Memo (${nextId}) created successfully!`);
        if (redirect) router.push("/invoice"); else { resetForm(); }
        setLoading(false);
      } catch (e: any) { console.error(e); alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const handleSave = async (redirectOrNew: boolean) => {
    if (!selectedCustomerId) return alert("Please select a customer.");
    setLoading(true);
    const validItems = items.filter(item => item.productId);
    
    if (grandTotal < 0 && !isEditMode) { await handleCreditMemoCreation(redirectOrNew); return; }
    if (grandTotal >= 0) {
        const insufficientItems = await checkStockAvailability(validItems);
        if (insufficientItems.length > 0) { alert(`Stock Insufficient for the following items:\n- ${insufficientItems.join('\n- ')}\n\nCannot save/update invoice.`); setLoading(false); return; }
    }

    try {
      const customerName = customers.find(c => c.id === selectedCustomerId)?.name || "Customer";
      if (isEditMode) {
          if (originalItems.length > 0) await updateInventory(originalItems, true);
          const { error: invError } = await supabase.from("invoices").update({ customer_id: selectedCustomerId, invoice_to: customerName, invoice_date: invoiceDate, due_date: dueDate, total_amount: grandTotal, subtotal: subTotal, gst_total: gstTotal, updated_who: currentUserName, memo: memo, driver_id: currentDriverId, is_pickup: isPickup }).eq("id", invoiceId);
          if (invError) throw invError;
          await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      } else {
          const { data: inv, error: err1 } = await supabase.from("invoices").insert({ customer_id: selectedCustomerId, invoice_to: customerName, invoice_date: invoiceDate, due_date: dueDate, total_amount: grandTotal, paid_amount: 0, subtotal: subTotal, gst_total: gstTotal, created_who: currentUserName, updated_who: currentUserName, status: "Unpaid", memo: memo, driver_id: currentDriverId, is_pickup: isPickup }).select().single();
          if (err1 || !inv) throw err1 || new Error("Invoice creation failed");
          var newInvoiceId = inv.id;
      }
      const targetId = isEditMode ? invoiceId : newInvoiceId!;
      const itemsData = validItems.map(item => {
        const p = allProducts.find(x => x.id === item.productId);
        return { invoice_id: targetId, product_id: item.productId, description: `${p?.product_name || 'Unknown'} (${item.unit})`, quantity: item.quantity, unit: item.unit, base_price: item.basePrice, discount: item.discountRate, unit_price: item.unitPrice, amount: roundAmount(item.quantity * item.unitPrice) };
      });
      if (itemsData.length > 0) {
        const { error: err2 } = await supabase.from("invoice_items").insert(itemsData);
        if (err2) throw err2;
        await updateInventory(validItems, false);
      }
      await supabase.from("customers").update({ note: staffNote }).eq("id", selectedCustomerId);
      if (autoAddProduct && validItems.length > 0) {
        const updatesMap = new Map();
        allowedProducts.forEach(ap => updatesMap.set(ap.product_id, { ctn: ap.discount_ctn, pack: ap.discount_pack }));
        validItems.forEach(item => {
          const current = updatesMap.get(item.productId) || { ctn: 0, pack: 0 };
          if (item.unit === "CTN") current.ctn = item.discountRate; else current.pack = item.discountRate; 
          updatesMap.set(item.productId, current);
        });
        const updates = validItems.map(item => {
          const rates = updatesMap.get(item.productId)!;
          return { customer_id: selectedCustomerId, product_id: item.productId, custom_price_ctn: rates.ctn, custom_price_pack: rates.pack };
        });
        const uniqueUpdates = Array.from(new Map(updates.map(item => [item.product_id, item])).values());
        await supabase.from("customer_products").upsert(uniqueUpdates, { onConflict: 'customer_id, product_id' });
      }
      alert(isEditMode ? "Invoice updated successfully!" : "Invoice saved successfully!");
      if (isEditMode) router.push("/invoice");
      else { if (redirectOrNew) router.push("/invoice"); else resetForm(); }
    } catch (e: any) { console.error(e); alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const resetForm = () => {
    setSelectedCustomerId(""); setInvoiceDate(today); setDueDate(""); setMemo("");
    setItems([{ productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);
    setShowAllProducts(false); setAutoAddProduct(false); setAvailableCredit(0); setCurrentDriverId(null); 
    setIsPickup(false); setCustomerStats({ totalOverdue: 0, oldestInvoiceDate: null });
    setAllProducts([]); 
  };

  if (loading && items.length === 0 && isEditMode) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-slate-400"/></div>;
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Link href="/invoice"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5 text-slate-600" /></Button></Link>
        <h1 className="text-2xl font-bold text-slate-900">{isEditMode ? <>Edit Invoice <span className="text-slate-400">#{invoiceId}</span></> : "New Invoice"}</h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><User className="w-3.5 h-3.5" /> Customer</label>
                <SearchableSelect options={customerOptions} value={selectedCustomerId} onChange={setSelectedCustomerId} placeholder={loading ? "Loading list..." : "Search customer..."} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Date</label><Input type="date" value={invoiceDate} onChange={handleInvoiceDateChange} /></div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" /> Due Date</label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-white text-slate-900" /></div>
              </div>
            </div>
            <div className="flex items-center space-x-2"><Checkbox id="pickup" checked={isPickup} onCheckedChange={(c) => setIsPickup(!!c)} /><label htmlFor="pickup" className="text-sm font-bold text-slate-700">Customer Pick Up (No Delivery)</label></div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-500 uppercase">Items</label>
                <div className="flex items-center gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="showAll" checked={showAllProducts} onCheckedChange={(c) => handleShowAllToggle(!!c)} />
                    <label htmlFor="showAll" className="text-xs font-bold text-slate-800">Show All Products</label>
                  </div>
                  <div className="flex items-center space-x-2"><Checkbox id="autoAdd" checked={autoAddProduct} onCheckedChange={(c) => setAutoAddProduct(!!c)} /><label htmlFor="autoAdd" className={`text-xs font-bold ${!autoAddProduct ? 'text-slate-500' : 'text-blue-600'}`}>Auto-add/Update List</label></div>
                </div>
            </div>
            <div className="border border-slate-200 rounded-lg"> 
              <table className="w-full text-sm text-left table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-[3%] text-center text-slate-400">#</th>
                    <th className="px-4 py-3 w-[32%]">Product</th>
                    <th className="px-4 py-3 w-[8%]">Unit</th>
                    <th className="px-4 py-3 w-[10%] text-right bg-slate-100/50">Base</th>
                    <th className="px-4 py-3 w-[10%] text-right text-blue-700">Net</th>
                    <th className="px-4 py-3 w-[8%] text-right">Disc %</th>
                    <th className="px-4 py-3 w-[8%] text-center">Qty</th>
                    <th className="px-4 py-3 w-[12%] text-right">Total</th>
                    <th className="w-[4%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const isCtnOrPack = item.defaultUnitName?.toLowerCase().includes("carton") || item.defaultUnitName?.toLowerCase().includes("ctn") || item.defaultUnitName === "CTN";
                    return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2 text-center text-xs text-slate-400 font-bold">{idx + 1}</td>
                          <td className="p-2">
                            <SearchableSelect options={productOptions} value={item.productId} onChange={(val) => handleProductChange(idx, val)} placeholder="Search product..." className="w-full" onClick={() => handleProductClick(idx)} onSearch={handleSearchProducts} />
                          </td>
                          <td className="p-2">
                              <select className={`w-full p-2 border border-slate-200 rounded text-center font-medium outline-none text-xs ${!isCtnOrPack && item.productId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50'}`} value={item.unit} onChange={(e) => handleUnitChange(idx, e.target.value as any)} disabled={!isCtnOrPack && !!item.productId}>
                                {isCtnOrPack ? (<><option value="CTN">CTN</option><option value="PACK">PK</option></>) : (<option value={item.unit}>{item.unit}</option>)}
                              </select>
                          </td>
                          <td className="p-2 text-right text-slate-400 text-xs line-through decoration-slate-300">${item.basePrice.toFixed(2)}</td>
                          <td className="p-2 text-right font-bold text-blue-700 text-sm">${item.unitPrice.toFixed(2)}</td>
                          <td className="p-2 relative"><Input type="number" min="0" max="100" className="text-right h-9 text-xs border-blue-100 focus:border-blue-500 font-bold pr-2 bg-blue-50/50 text-blue-700" value={item.discountRate} onChange={(e) => handleDiscountChange(idx, Number(e.target.value))} /></td>
                          <td className="p-2"><Input type="number" step="1" onKeyDown={(e) => { if (e.key === '.' || e.key === 'e') e.preventDefault(); }} className="text-center h-9" value={item.quantity} onChange={(e) => { const val = e.target.value; if (val === '') updateItem(idx, "quantity", ''); else updateItem(idx, "quantity", parseInt(val, 10)); }} /></td>
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
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Invoice Memo</label><Textarea placeholder="Visible on invoice..." className="resize-none h-[80px] bg-slate-50" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
                <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 shadow-sm space-y-2"><div className="flex items-center justify-between"><h3 className="font-bold text-amber-900 text-xs uppercase flex items-center gap-2"><Lock className="w-3 h-3"/> Staff Note</h3><span className="text-[10px] text-amber-700 font-medium px-2 py-0.5 bg-amber-100 rounded-full">Auto-updates Customer Profile</span></div><Textarea className="bg-white border-amber-200 text-sm min-h-[100px] resize-y" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="Internal notes about this customer..." /></div>
            </div>
          </div>
        </div>

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
              {grandTotal < 0 && (<div className="text-xs text-red-500 bg-red-50 border border-red-200 p-2 rounded text-center mt-2">⚠ This will create a <strong>CREDIT MEMO</strong></div>)}
            </div>
            <div className="space-y-3 mt-6">
              <Button onClick={() => handleSave(true)} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 text-sm font-bold shadow-md">
                {loading ? (isEditMode ? "Updating..." : "Saving...") : <><Save className="w-4 h-4 mr-2" /> {isEditMode ? "Update Invoice" : "Save Invoice"}</>}
              </Button>
              {!isEditMode && (<Button onClick={() => handleSave(false)} disabled={loading} variant="outline" className="w-full border-slate-300 text-slate-700 h-10 text-sm font-bold hover:bg-slate-50">{loading ? "Saving..." : <><RefreshCw className="w-4 h-4 mr-2" /> Save & New</>}</Button>)}
              <Link href="/invoice" className="block"><Button variant="ghost" className="w-full text-slate-500 h-10 text-sm">Cancel</Button></Link>
            </div>
          </div>
          {selectedCustomerId && customerStats.totalOverdue > 0 && (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-right-4 sticky top-80">
               <h3 className="font-bold text-red-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Account Status</h3>
               <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm"><span className="text-red-700 font-medium">Overdue Amount</span><span className="font-black text-red-700">${customerStats.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  {customerStats.oldestInvoiceDate && (<div className="flex justify-between items-center text-sm"><span className="text-red-700 font-medium">Oldest Due</span><span className="font-bold text-red-700">{customerStats.oldestInvoiceDate}</span></div>)}
               </div>
               <div className="pt-3 border-t border-red-100 text-center"><span className="text-xs font-bold text-red-600 bg-white px-3 py-1 rounded-full border border-red-100">Check Payment Required</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}