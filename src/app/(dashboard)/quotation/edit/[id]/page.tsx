"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { 
  Plus, Trash2, Save, ArrowLeft, User, Calendar, 
  Calculator, FileText, Search, ChevronDown, Check, Clock, Edit
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- [컴포넌트] SearchableSelect ---
interface Option { id: string; label: string; subLabel?: string; }
interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
function SearchableSelect({ options, value, onChange, placeholder = "Select...", disabled = false, className }: SearchableSelectProps) {
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
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}
      >
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>
          {selectedOption ? selectedOption.label : (value ? "Loading..." : placeholder)}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0" />
      </div>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input autoFocus type="text" className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400 placeholder:text-xs" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="p-1">
            {filteredOptions.length === 0 ? <div className="p-3 text-xs text-center text-slate-400">No results found.</div> : filteredOptions.map((option) => (
              <div key={option.id} onClick={() => { onChange(option.id); setIsOpen(false); setSearchTerm(""); }} className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${option.id === value ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-700"}`}>
                <div className="flex flex-col"><span>{option.label}</span>{option.subLabel && <span className="text-[10px] text-slate-400 font-normal">{option.subLabel}</span>}</div>
                {option.id === value && <Check className="w-3.5 h-3.5 text-slate-900" />}
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
interface ProductMaster { id: string; product_name: string; sell_price_ctn: number; sell_price_pack: number; }
interface QuotationItem {
  productId: string;
  unit: "CTN" | "PACK";
  quantity: number;
  basePrice: number;    
  discountRate: number; 
  unitPrice: number;    
}

export default function EditQuotationPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams(); // URL에서 ID 가져오기
  const id = params.id as string;

  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]); 
  const [currentUserName, setCurrentUserName] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [quotationNumber, setQuotationNumber] = useState(""); // 번호 표시용
  const [quotationDate, setQuotationDate] = useState("");
  const [validUntil, setValidUntil] = useState(""); 
  const [memo, setMemo] = useState("");
  
  const [items, setItems] = useState<QuotationItem[]>([
    { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }
  ]);

  // 1. 기초 데이터 및 Quotation 데이터 로딩
  useEffect(() => {
    const initData = async () => {
      setDataLoading(true);
      
      // 1-1. 마스터 데이터 로드
      const { data: custData } = await supabase.from("customers").select("id, name, note");
      if (custData) setCustomers(custData);
      
      const { data: prodData } = await supabase.from("products").select("*");
      if (prodData) setAllProducts(prodData);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.display_name || user.email?.split('@')[0] || "Unknown";
        setCurrentUserName(name);
      }

      // 1-2. 수정할 Quotation 데이터 로드
      const { data: quote, error: qError } = await supabase.from("quotations").select("*").eq("id", id).single();
      const { data: qItems, error: iError } = await supabase.from("quotation_items").select("*").eq("quotation_id", id);

      if (qError || !quote) {
        alert("Quotation not found.");
        router.push("/quotation");
        return;
      }

      // State 적용
      setSelectedCustomerId(quote.customer_id);
      setQuotationNumber(quote.quotation_number);
      setQuotationDate(quote.issue_date);
      setValidUntil(quote.valid_until || "");
      setMemo(quote.memo || "");

      if (qItems && qItems.length > 0) {
        // DB 컬럼 -> 화면 State 매핑
        const mappedItems = qItems.map((item: any) => ({
          productId: item.product_id,
          unit: item.unit as "CTN" | "PACK",
          quantity: item.quantity,
          basePrice: item.base_price,
          discountRate: item.discount,
          unitPrice: item.unit_price
        }));
        setItems(mappedItems);
      } else {
        setItems([{ productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);
      }

      setDataLoading(false);
    };

    if (id) initData();
  }, [id, supabase, router]);

  // --- Helpers & Handlers (NewPage와 동일) ---
  const productOptions = useMemo(() => allProducts.map(p => ({
    id: p.id, label: p.product_name, subLabel: `$${p.sell_price_ctn} (CTN) / $${p.sell_price_pack} (PK)`
  })), [allProducts]);

  const customerOptions = useMemo(() => customers.map(c => ({ id: c.id, label: c.name })), [customers]);

  const applyPriceLogic = (index: number, productId: string, unit: "CTN" | "PACK", basePriceInput: number, discountRateInput: number) => {
    let netPrice = 0;
    if (basePriceInput > 0) netPrice = basePriceInput - (basePriceInput * (discountRateInput / 100));
    const newItems = [...items];
    newItems[index] = { ...newItems[index], productId, unit, basePrice: basePriceInput, discountRate: discountRateInput, unitPrice: netPrice };
    setItems(newItems);
  };

  const handleProductChange = (index: number, productId: string) => {
    const productMaster = allProducts.find(p => p.id === productId);
    if (!productMaster) return;
    const currentUnit = items[index].unit;
    const base = currentUnit === "CTN" ? productMaster.sell_price_ctn : productMaster.sell_price_pack;
    applyPriceLogic(index, productId, currentUnit, base, 0);
  };

  const handleUnitChange = (index: number, unit: "CTN" | "PACK") => {
    const item = items[index];
    const productMaster = allProducts.find(p => p.id === item.productId);
    if (productMaster) {
      const base = unit === "CTN" ? productMaster.sell_price_ctn : productMaster.sell_price_pack;
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
  const addItem = () => setItems([...items, { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);

  const subTotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const gstTotal = subTotal * 0.1;
  const grandTotal = roundAmount(subTotal + gstTotal);

  // --- [UPDATE] 저장 로직 ---
  const handleUpdate = async () => {
    if (!selectedCustomerId) return alert("Please select a customer.");
    setLoading(true);

    try {
      // 1. Header 업데이트
      const { error: err1 } = await supabase.from("quotations").update({
        customer_id: selectedCustomerId,
        issue_date: quotationDate,
        valid_until: validUntil,
        total_amount: grandTotal,
        subtotal: subTotal,
        gst_total: gstTotal,
        updated_who: currentUserName,
        updated_at: new Date(), // 명시적 업데이트 시간
        memo: memo
      }).eq("id", id);

      if (err1) throw err1;

      // 2. Items 업데이트 전략: 기존 아이템 전부 삭제 후 -> 현재 상태로 재입력 (가장 깔끔함)
      // 2-1. 기존 아이템 삭제
      const { error: delError } = await supabase.from("quotation_items").delete().eq("quotation_id", id);
      if (delError) throw delError;

      // 2-2. 새 아이템 입력
      const validItems = items.filter(item => item.productId);
      const itemsData = validItems.map(item => {
        const product = allProducts.find(p => p.id === item.productId);
        const productName = product ? product.product_name : "Unknown Product";
        return {
          quotation_id: id,
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

      if (itemsData.length > 0) {
        const { error: insError } = await supabase.from("quotation_items").insert(itemsData);
        if (insError) throw insError;
      }

      alert("Quotation updated successfully!");
      router.push("/quotation"); // 리스트로 이동

    } catch (e: any) {
      console.error(e);
      alert("Error updating quotation: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading quotation details...</div>;
  }

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/quotation">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              Edit Quotation <span className="text-slate-400 text-lg font-normal">#{quotationNumber}</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Customer
                </label>
                <SearchableSelect
                  options={customerOptions}
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  placeholder="Select customer..."
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
                        <SearchableSelect
                          options={productOptions}
                          value={item.productId}
                          onChange={(val) => handleProductChange(idx, val)}
                          placeholder="Search product..."
                          className="w-full min-w-[250px]"
                        />
                      </td>
                      <td className="p-2">
                        <select 
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-center font-medium outline-none text-xs"
                          value={item.unit}
                          onChange={(e) => handleUnitChange(idx, e.target.value as any)}
                        >
                          <option value="CTN">CTN</option>
                          <option value="PACK">PK</option>
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
              <Button onClick={handleUpdate} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 text-sm font-bold shadow-md">
                {loading ? "Updating..." : <><Save className="w-4 h-4 mr-2" /> Update Quotation</>}
              </Button>
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