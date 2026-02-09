"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  Plus, Trash2, Save, ArrowLeft, User, Calendar, 
  Calculator, FileText, RefreshCw, Search, ChevronDown, Check, Clock
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// --- [Utility] 반올림 함수 ---
const roundAmount = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- [Utility] 견적 번호 생성기 (예: QT-20240129-XXXX) ---
const generateQuotationNumber = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  // 랜덤 4자리 (실무에서는 DB 시퀀스를 쓰거나, UUID 앞자리를 따기도 합니다)
  const random = Math.floor(1000 + Math.random() * 9000); 
  return `QT-${yyyy}${mm}${dd}-${random}`;
};

// --- [컴포넌트] SearchableSelect (기존과 동일) ---
interface Option {
  id: string;
  label: string;
  subLabel?: string;
}
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
    return options.filter(option => 
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50);
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
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-xs text-center text-slate-400">No results found.</div>
            ) : (
              filteredOptions.map((option) => (
                <div key={option.id} onClick={() => { onChange(option.id); setIsOpen(false); setSearchTerm(""); }} className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer transition-colors ${option.id === value ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-700"}`}>
                  <div className="flex flex-col"><span>{option.label}</span>{option.subLabel && <span className="text-[10px] text-slate-400 font-normal">{option.subLabel}</span>}</div>
                  {option.id === value && <Check className="w-3.5 h-3.5 text-slate-900" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Page Component ---

interface Customer {
  id: string;
  name: string;
  note: string;
}
interface ProductMaster {
  id: string;
  product_name: string;
  sell_price_ctn: number;
  sell_price_pack: number;
}
interface QuotationItem {
  productId: string;
  unit: "CTN" | "PACK";
  quantity: number;
  basePrice: number;    
  discountRate: number; 
  unitPrice: number;    
}

export default function NewQuotationPage() {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]); 
  const [currentUserName, setCurrentUserName] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const today = new Date().toISOString().split('T')[0];
  const [quotationDate, setQuotationDate] = useState(today); // UI용 (DB issue_date 매핑)
  const [validUntil, setValidUntil] = useState(""); 
  const [memo, setMemo] = useState("");
  
  const [items, setItems] = useState<QuotationItem[]>([
    { productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }
  ]);

  useEffect(() => {
    const initData = async () => {
      const { data: custData } = await supabase.from("customers").select("id, name, note");
      if (custData) setCustomers(custData);
      
      const { data: prodData } = await supabase.from("products").select("*");
      if (prodData) setAllProducts(prodData);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.display_name || user.email?.split('@')[0] || "Unknown";
        setCurrentUserName(name);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (!validUntil) {
      const d = new Date();
      d.setDate(d.getDate() + 14); 
      setValidUntil(d.toISOString().split('T')[0]);
    }
  }, []);

  const productOptions = useMemo(() => {
    return allProducts.map(p => ({
      id: p.id,
      label: p.product_name,
      subLabel: `$${p.sell_price_ctn} (CTN) / $${p.sell_price_pack} (PK)`
    }));
  }, [allProducts]);

  const customerOptions = useMemo(() => {
    return customers.map(c => ({ id: c.id, label: c.name }));
  }, [customers]);

  const applyPriceLogic = (index: number, productId: string, unit: "CTN" | "PACK", basePriceInput: number, discountRateInput: number) => {
    let netPrice = 0;
    if (basePriceInput > 0) {
      netPrice = basePriceInput - (basePriceInput * (discountRateInput / 100));
    }
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      productId, unit,
      basePrice: basePriceInput,
      discountRate: discountRateInput, 
      unitPrice: netPrice 
    };
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

  // --- [FIX] handleSubmit 수정 (DB 스키마 매칭) ---
  const handleSubmit = async (redirect: boolean) => {
    if (!selectedCustomerId) return alert("Please select a customer.");
    setLoading(true);

    try {
      // 1. Quotation 헤더 저장
      // (이미지 기준: quotation_number, issue_date, valid_until 사용)
      const newQuotationNumber = generateQuotationNumber();
      
      const { data: quote, error: err1 } = await supabase.from("quotations").insert({
        customer_id: selectedCustomerId,
        // quotation_to: customerName, // [제거] DB 이미지에 없음
        quotation_number: newQuotationNumber, // [추가] 필수값
        issue_date: quotationDate,   // [수정] DB 컬럼명 issue_date
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

      // 2. Quotation 아이템 저장
      const validItems = items.filter(item => item.productId);
      const itemsData = validItems.map(item => {
        const product = allProducts.find(p => p.id === item.productId);
        const productName = product ? product.product_name : "Unknown Product";
        return {
          quotation_id: quote.id,
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
        const { error: err2 } = await supabase.from("quotation_items").insert(itemsData);
        if (err2) throw err2;
      }

      alert("Quotation saved successfully!");

      if (redirect) {
        router.push("/quotation");
      } else {
        setSelectedCustomerId("");
        setQuotationDate(today);
        setMemo("");
        setItems([{ productId: "", unit: "CTN", quantity: 1, basePrice: 0, discountRate: 0, unitPrice: 0 }]);
      }

    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Link href="/quotation">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New Quotation</h1>
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
                  placeholder="Select or search customer..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" /> Date (Issue Date)
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
              <Button onClick={() => handleSubmit(true)} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 text-sm font-bold shadow-md">
                {loading ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Quotation</>}
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={loading} variant="outline" className="w-full border-slate-300 text-slate-700 h-10 text-sm font-bold hover:bg-slate-50">
                {loading ? "Saving..." : <><RefreshCw className="w-4 h-4 mr-2" /> Save & New</>}
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