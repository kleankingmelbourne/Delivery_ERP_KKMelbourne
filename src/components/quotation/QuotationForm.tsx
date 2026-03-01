"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  Plus, Trash2, Save, ArrowLeft, User, Calendar, 
  Calculator, FileText, RefreshCw, Search, ChevronDown, Check, Clock, Loader2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ✅ [추가] 전역 상태에서 사용자 이름을 가져오기 위한 훅
import { useAuth } from "@/components/providers/AuthProvider";

// --- [Utility] ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

const generateQuotationNumber = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000); 
  return `QT-${yyyy}${mm}${dd}-${random}`;
};

// --- [컴포넌트] CreatableSelect ---
// --- [컴포넌트] CreatableSelect (키보드 조작 및 자동 스크롤 추가) ---
interface Option { id: string; label: string; subLabel?: string; }
interface CreatableSelectProps {
  options: Option[];
  value: { id: string | null; name: string }; 
  onChange: (value: { id: string | null; name: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowCreate?: boolean; 
  onDropdownOpen?: () => void; 
}

function CreatableSelect({ options, value, onChange, placeholder = "Select...", disabled = false, className, allowCreate = false, onDropdownOpen }: CreatableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  // 💡 [키보드 네비게이션용 상태]
  const [highlightedIndex, setHighlightedIndex] = useState(0); 
  
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null); // 리스트 컨테이너
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]); // 아이템 포인터 배열

  const displayLabel = value.id ? options.find(o => o.id === value.id)?.label || value.name : value.name;

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    return options.filter(option => option.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
  }, [options, searchTerm]);

  // 검색어가 바뀌거나 메뉴가 열릴 때 하이라이트 위치를 맨 위로 리셋
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  // 방향키 이동 시 화면 자동 스크롤
  useEffect(() => {
    if (isOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ 
        block: "nearest",
        behavior: "auto" // 부드러운 스크롤 끄고 즉시 이동
      });
    }
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOpen = () => {
    if (disabled) return;
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
        setSearchTerm("");
        if (onDropdownOpen) onDropdownOpen(); 
    }
  };

  // 💡 [핵심] 키보드 입력 핸들러
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
        // 현재 파란색으로 선택된 항목을 엔터 쳤을 때 적용
        const opt = filteredOptions[highlightedIndex];
        if (opt) onChange({ id: opt.id, name: opt.label });
      } else if (allowCreate && searchTerm) {
        onChange({ id: null, name: searchTerm });
      }
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        onClick={toggleOpen}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}
      >
        <span className={`truncate ${!displayLabel ? "text-slate-400" : "text-slate-900 font-medium"}`}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0" />
      </div>
      {isOpen && !disabled && (
        // 💡 1. w-full을 w-[500px]로 고정하여 넓히고, max-h-60(240px)을 max-h-[400px]로 길게 늘림!
        <div className="absolute z-50 w-[500px] max-w-[90vw] mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl max-h-[400px] flex flex-col animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 bg-white border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                autoFocus 
                type="text" 
                className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400 placeholder:text-xs" 
                placeholder={allowCreate ? "Search or type new name..." : "Search..."}
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown} 
              />
            </div>
          </div>
          <div className="p-1 overflow-y-auto" ref={listRef}>
            {allowCreate && searchTerm && filteredOptions.length === 0 && (
                <div 
                    onClick={() => { onChange({ id: null, name: searchTerm }); setIsOpen(false); }}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm rounded-md cursor-pointer hover:bg-blue-50 text-blue-600 font-bold"
                >
                    <Plus className="w-4 h-4"/> Use "{searchTerm}"
                </div>
            )}
            {filteredOptions.length === 0 && !searchTerm && (
              <div className="p-4 text-xs text-center text-slate-400">Type to search...</div>
            )}
            {filteredOptions.map((option, index) => (
              <div 
                key={option.id} 
                ref={(el) => { itemRefs.current[index] = el; }} 
                onMouseEnter={() => setHighlightedIndex(index)} 
                onClick={() => { onChange({ id: option.id, name: option.label }); setIsOpen(false); }} 
                className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${index === highlightedIndex ? "bg-slate-100" : "bg-transparent"} ${option.id === value.id ? "font-bold text-slate-900" : "text-slate-700"}`}
              >
                {/* 💡 flex-col을 주어 세로로 배치하고, 두 텍스트 모두 길어지면 ... 으로 잘리게(truncate) 설정했습니다 */}
                <div className="flex flex-col flex-1 overflow-hidden pr-4">
                    <span className="truncate font-medium" title={option.label}>
                        {option.label}
                    </span>
                    {option.subLabel && (
                        <span className="text-[11px] text-slate-500 truncate mt-0.5" title={option.subLabel}>
                            {option.subLabel}
                        </span>
                    )}
                </div>
                {/* 체크박스가 우측 끝에 고정되도록 유지 */}
                {option.id === value.id && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}      
    </div>
  );
}

// --- Types ---
interface Customer { id: string; name: string; note: string; }
interface ProductMaster { 
  id: string; 
  product_name: string; 
  sell_price_ctn: number; 
  sell_price_pack: number; 
  unit_name?: string; 
}
interface QuotationItem {
  productId: string;
  unit: string; 
  quantity: number;
  basePrice: number;    
  discountRate: number; 
  unitPrice: number;    
}

// ✅ Props 정의: quotationId가 있으면 Edit 모드, 없으면 New 모드
interface QuotationFormProps {
  quotationId?: string;
}

export default function QuotationForm({ quotationId }: QuotationFormProps) {
  const supabase = createClient();
  const router = useRouter();
  
  const isEditMode = !!quotationId; // true면 Edit, false면 New

  // ✅ 전역 상태에서 접속자 이름 즉시 호출
  const { currentUserName } = useAuth();

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]); 

  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string | null; name: string }>({ id: null, name: "" });
  const [quotationNumber, setQuotationNumber] = useState(""); 
  
  const today = new Date().toISOString().split('T')[0];
  const [quotationDate, setQuotationDate] = useState(today);
  const [validUntil, setValidUntil] = useState(""); 
  const [memo, setMemo] = useState("");
  
  const [items, setItems] = useState<QuotationItem[]>([
    { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }
  ]);

  // 1. 기초 데이터 및 Quotation 데이터 로딩 (🚀 초고속 병렬 최적화)
  useEffect(() => {
    const initData = async () => {
      setDataLoading(true);
      
      if (isEditMode) {
        // --- [EDIT MODE] ---
        // 💡 최적화 1: 4번의 순차 통신을 Promise.all을 이용해 1번의 병렬 통신으로 압축!
        // 💡 최적화 2: quotations와 quotation_items를 따로 부르지 않고 JOIN으로 한 번에 가져옴!
        // 💡 최적화 3: products에서 * 대신 진짜 화면에 필요한 컬럼만 명시하여 용량 최소화!
        const [custRes, prodRes, quoteRes] = await Promise.all([
          supabase.from("customers").select("id, name, note"),
          supabase.from("products").select("id, product_name, sell_price_ctn, sell_price_pack, product_units(unit_name)"),
          supabase.from("quotations").select("*, quotation_items(*)").eq("id", quotationId).single()
        ]);

        // 1. Customer 세팅
        if (custRes.data) setCustomers(custRes.data);
        
        // 2. Product 세팅
        if (prodRes.data) {
          const mappedProducts = prodRes.data.map((p: any) => ({
              ...p,
              unit_name: p.product_units?.unit_name || "CTN"
          }));
          setAllProducts(mappedProducts);
        }

        // 3. Quotation 세팅
        const quote = quoteRes.data;
        if (quoteRes.error || !quote) {
          alert("Quotation not found.");
          router.push("/quotation");
          return;
        }

        let initialCustomerName = quote.quotation_to || "";
        if (quote.customer_id && custRes.data) {
          const matchedCustomer = custRes.data.find((c: any) => c.id === quote.customer_id);
          if (matchedCustomer) initialCustomerName = matchedCustomer.name;
        }

        setSelectedCustomer({ id: quote.customer_id || null, name: initialCustomerName });
        setQuotationNumber(quote.quotation_number);
        setQuotationDate(quote.issue_date);
        setValidUntil(quote.valid_until || "");
        setMemo(quote.memo || "");

        // 💡 JOIN으로 한 번에 가져온 items 배열 사용
        const qItems = quote.quotation_items; 
        if (qItems && qItems.length > 0) {
          const mappedItems = qItems.map((item: any) => ({
            productId: item.product_id,
            unit: item.unit, 
            quantity: item.quantity,
            basePrice: item.base_price,
            discountRate: item.discount,
            unitPrice: item.unit_price
          }));
          setItems(mappedItems);
        }

      } else {
        // --- [NEW MODE] ---
        // New 모드일 때는 Quotation 데이터가 필요 없으므로 고객과 상품만 병렬로 가져옵니다.
        const [custRes, prodRes] = await Promise.all([
          supabase.from("customers").select("id, name, note"),
          supabase.from("products").select("id, product_name, sell_price_ctn, sell_price_pack, product_units(unit_name)")
        ]);

        if (custRes.data) setCustomers(custRes.data);
        if (prodRes.data) {
          const mappedProducts = prodRes.data.map((p: any) => ({
              ...p,
              unit_name: p.product_units?.unit_name || "CTN"
          }));
          setAllProducts(mappedProducts);
        }

        const d = new Date();
        d.setDate(d.getDate() + 14); 
        setValidUntil(d.toISOString().split('T')[0]);
      }

      setDataLoading(false);
    };

    initData();
  }, [quotationId, isEditMode, supabase, router]);

  // --- Helpers & Handlers ---
  const productOptions = useMemo(() => allProducts.map(p => ({
    id: p.id, label: p.product_name, subLabel: `$${p.sell_price_ctn} (CTN) / $${p.sell_price_pack} (PK)`
  })), [allProducts]);

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.name })), [customers]);

  const applyPriceLogic = (index: number, productId: string, unit: string, basePriceInput: number, discountRateInput: number) => {
    let netPrice = 0;
    if (basePriceInput > 0) netPrice = basePriceInput - (basePriceInput * (discountRateInput / 100));
    const newItems = [...items];
    newItems[index] = { ...newItems[index], productId, unit, basePrice: basePriceInput, discountRate: discountRateInput, unitPrice: netPrice };
    setItems(newItems);
  };

  const handleProductChange = (index: number, val: { id: string | null; name: string }) => {
    const productId = val.id;
    if (!productId) return; 

    const productMaster = allProducts.find(p => p.id === productId);
    if (!productMaster) return;
    
    const defaultUnit = productMaster.unit_name || "CTN";
    const isCarton = defaultUnit.toUpperCase().includes("CTN") || defaultUnit.toUpperCase().includes("CARTON");
    const base = isCarton ? productMaster.sell_price_ctn : productMaster.sell_price_pack;
    
    applyPriceLogic(index, productId, defaultUnit, base, 0);
    if (index === items.length - 1) addItem(); 
  };

  const handleProductDropdownOpen = (index: number) => {
    if (index === items.length - 1) addItem();
  };

  const handleUnitChange = (index: number, unit: string) => {
    const item = items[index];
    const productMaster = allProducts.find(p => p.id === item.productId);
    if (productMaster) {
      const isCarton = unit.toUpperCase().includes("CTN") || unit.toUpperCase().includes("CARTON");
      const base = isCarton ? productMaster.sell_price_ctn : productMaster.sell_price_pack;
      applyPriceLogic(index, item.productId, unit, base, item.discountRate);
    } else {
      const newItems = [...items];
      newItems[index].unit = unit;
      setItems(newItems);
    }
  };

  const handleDiscountChange = (index: number, newRate: number) => {
    const item = items[index];
    if (!item.productId) return; 
    applyPriceLogic(index, item.productId, item.unit, item.basePrice, newRate);
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };
  
  const addItem = () => setItems(prev => [...prev, { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);

  const subTotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const gstTotal = subTotal * 0.1;
  const grandTotal = roundAmount(subTotal + gstTotal);

  // --- 통합 저장 로직 ---
  // --- 통합 저장 로직 (병렬 처리 최적화) ---
  const handleSave = async (redirectOrNew: boolean) => {
    if (!selectedCustomer.name) return alert("Please select or enter a customer name.");
    setLoading(true);

    try {
      let targetQuoteId = quotationId;

      if (isEditMode) {
        // 🚀 [EDIT MODE: 병렬 최적화] 
        // 헤더 내용 업데이트와 기존 아이템 삭제는 서로 의존성이 없으므로 동시에 실행합니다! (속도 2배 향상)
        const [updateRes, deleteRes] = await Promise.all([
          supabase.from("quotations").update({
            customer_id: selectedCustomer.id || null, 
            quotation_to: selectedCustomer.name,      
            issue_date: quotationDate,
            valid_until: validUntil,
            total_amount: grandTotal,
            subtotal: subTotal,
            gst_total: gstTotal,
            updated_who: currentUserName, 
            updated_at: new Date(),
            memo: memo
          }).eq("id", targetQuoteId!),
          
          supabase.from("quotation_items").delete().eq("quotation_id", targetQuoteId!)
        ]);

        if (updateRes.error) throw updateRes.error;
        if (deleteRes.error) throw deleteRes.error;

      } else {
        // 🛑 [NEW MODE: 순차 실행 필수] 
        // 부모(헤더)가 생성되어 고유 ID가 발급되어야만 자식(아이템)을 넣을 수 있습니다.
        const newQuotationNumber = generateQuotationNumber();
        const { data: quote, error: err1 } = await supabase.from("quotations").insert({
          customer_id: selectedCustomer.id || null, 
          quotation_to: selectedCustomer.name,      
          quotation_number: newQuotationNumber, 
          issue_date: quotationDate,   
          valid_until: validUntil,
          total_amount: grandTotal,
          subtotal: subTotal,
          gst_total: gstTotal,
          created_who: currentUserName, 
          updated_who: currentUserName, 
          status: "Draft",
          memo: memo
        }).select().single();
        
        if (err1 || !quote) throw err1 || new Error("Quotation creation failed");
        targetQuoteId = quote.id;
      }

      // [공통] 새로운 Items 추가
      const validItems = items.filter(item => item.productId);
      
      if (validItems.length > 0) {
        const itemsData = validItems.map(item => {
          const product = allProducts.find(p => p.id === item.productId);
          const productName = product ? product.product_name : "Unknown Product";
          return {
            quotation_id: targetQuoteId,
            product_id: item.productId,
            description: `${productName} (${item.unit})`, 
            quantity: item.quantity,
            unit: item.unit,
            base_price: item.basePrice,
            discount: item.discountRate, 
            unit_price: item.unitPrice, 
            amount: item.quantity * item.unitPrice
          };
        });

        // 💡 [Bulk Insert 최적화] 여러 개의 아이템을 하나의 배열로 묶어서 단 한 번의 통신으로 밀어 넣습니다!
        const { error: insError } = await supabase.from("quotation_items").insert(itemsData);
        if (insError) throw insError;
      }

      alert(isEditMode ? "Quotation updated successfully!" : "Quotation saved successfully!");

      // 저장 후 이동 처리
      if (isEditMode) {
        router.push("/quotation");
      } else {
        if (redirectOrNew) {
          router.push("/quotation");
        } else {
          // Save & New 클릭 시 폼 초기화 (화면 이동 없음)
          setSelectedCustomer({ id: null, name: "" });
          setQuotationDate(today);
          const d = new Date();
          d.setDate(d.getDate() + 14); 
          setValidUntil(d.toISOString().split('T')[0]);
          setMemo("");
          setItems([{ productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);
        }
      }
    } catch (e: any) {
      console.error("Save Error:", e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (dataLoading) {
    return <div className="flex h-screen items-center justify-center text-slate-500"><Loader2 className="w-8 h-8 animate-spin"/></div>;
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Link href="/quotation">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          {isEditMode ? "Edit Quotation" : "New Quotation"}
          {isEditMode && <span className="text-slate-400 text-lg font-normal">#{quotationNumber}</span>}
        </h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Customer
                </label>
                <CreatableSelect
                  options={customerOptions}
                  value={selectedCustomer}
                  onChange={setSelectedCustomer}
                  placeholder="Select or enter customer name..."
                  allowCreate={true}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Date (Issue)
                  </label>
                  <Input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Valid Until
                  </label>
                  <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="bg-white text-slate-900" />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
               <label className="text-xs font-bold text-slate-500 uppercase">Items</label>
            </div>

            <div className="border border-slate-200 rounded-lg"> 
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-[35%]">Product</th> 
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
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2">
                        <CreatableSelect
                          options={productOptions}
                          value={{ id: item.productId, name: "" }} 
                          onChange={(val) => handleProductChange(idx, val)}
                          placeholder="Search product..."
                          className="w-full min-w-[250px]"
                          allowCreate={false} 
                          onDropdownOpen={() => handleProductDropdownOpen(idx)}
                        />
                      </td>
                      <td className="p-2">
                        <select 
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-center font-medium outline-none text-xs"
                          value={item.unit}
                          onChange={(e) => handleUnitChange(idx, e.target.value)}
                        >
                          <option value="CTN">CTN</option>
                          <option value="PACK">PK</option>
                          {item.unit && item.unit !== "CTN" && item.unit !== "PACK" && (
                              <option value={item.unit}>{item.unit}</option>
                          )}
                        </select>
                      </td>
                      <td className="p-2 text-right text-slate-400 text-xs line-through decoration-slate-300">
                        ${item.basePrice.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-bold text-blue-700 text-sm">
                        ${item.unitPrice.toFixed(2)}
                      </td>
                      <td className="p-2">
                        <Input 
                          type="number" min="0" max="100"
                          className="text-right h-9 text-xs border-blue-100 focus:border-blue-500 font-bold pr-2 bg-blue-50/50 text-blue-700"
                          value={item.discountRate}
                          onChange={(e) => handleDiscountChange(idx, Number(e.target.value))}
                        />
                      </td>
                      <td className="p-2">
                        <Input type="number" min="1" className="text-center h-9" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        ${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">
                        <button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 p-2 border-t border-slate-200">
                <Button variant="ghost" size="sm" onClick={addItem} className="text-blue-600 hover:text-blue-700 w-full">
                  <Plus className="w-4 h-4 mr-2" /> Add Line Item
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Memo
              </label>
              <Textarea placeholder="Quotation notes..." className="resize-none h-20 bg-slate-50" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Calculator className="w-4 h-4" /> Summary</h3>
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-sm text-slate-600"><span>GST (10%)</span><span>${gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between font-bold text-slate-900 pt-3 border-t border-dashed border-slate-200">
                <span>Total Amount</span><span>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="space-y-3 mt-6">
              <Button onClick={() => handleSave(true)} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 text-sm font-bold shadow-md">
                {loading ? (isEditMode ? "Updating..." : "Saving...") : <><Save className="w-4 h-4 mr-2" /> {isEditMode ? "Update Quotation" : "Save Quotation"}</>}
              </Button>
              
              {/* New 모드일 때만 Save & New 버튼 표시 */}
              {!isEditMode && (
                <Button onClick={() => handleSave(false)} disabled={loading} variant="outline" className="w-full border-slate-300 text-slate-700 h-10 text-sm font-bold hover:bg-slate-50">
                  {loading ? "Saving..." : <><RefreshCw className="w-4 h-4 mr-2" /> Save & New</>}
                </Button>
              )}
              
              <Link href="/quotation" className="block">
                <Button variant="ghost" className="w-full text-slate-500 h-10 text-sm">Cancel</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}