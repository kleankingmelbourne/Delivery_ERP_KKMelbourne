"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, Save, Package, Loader2, User, Plus, Globe, Trash2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface CustomerProductDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
}

interface Product {
  id: string; 
  product_name: string;    
  product_barcode: string; 
  vendor_product_id?: string;
  sell_price_ctn: number;  
  sell_price_pack: number; 
  buy_price: number;
  total_pack_ctn: number;
  unit_name?: string;
}

interface ProductItem extends Product {
  table_id?: string; 
  custom_price_ctn: number | ""; 
  custom_price_pack: number | ""; 
  original_pack_rate: number | ""; 
  is_new?: boolean;
  sync_enabled?: boolean;
}

const safeFixed = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return "0.00";
    return num.toFixed(2);
};

export default function CustomerProductDialog({ isOpen, onClose, customerId, customerName }: CustomerProductDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<Product[]>([]);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const [isGlobalDropdownOpen, setIsGlobalDropdownOpen] = useState(false);
  
  const [items, setItems] = useState<ProductItem[]>([]);

  useEffect(() => {
    if (isOpen && customerId) {
      setLocalSearchTerm("");
      setGlobalSearchTerm("");
      setGlobalSearchResults([]);
      setIsGlobalDropdownOpen(false);
      fetchMyItems();
    }
  }, [isOpen, customerId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (globalSearchRef.current && !globalSearchRef.current.contains(event.target as Node)) {
        setIsGlobalDropdownOpen(false); 
      }
    };
    
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const fetchMyItems = async () => {
    setLoading(true);
    const { data: customData } = await supabase
      .from("customer_products")
      .select("*")
      .eq("customer_id", customerId);

    if (!customData || customData.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const productIds = customData.map(c => c.product_id);
    const { data: productsData } = await supabase
      .from("products")
      .select(`
        id, product_name, product_barcode, vendor_product_id, 
        sell_price_ctn, sell_price_pack, buy_price, total_pack_ctn,
        product_units (unit_name)
      `)
      .in("id", productIds)
      .order("product_name");

    if (productsData) {
      const merged: ProductItem[] = productsData.map((prod: any) => {
        const custom = customData.find((c: any) => c.product_id === prod.id);
        const pRate = custom?.custom_price_pack ?? "";
        return {
          ...prod,
          unit_name: prod.product_units?.unit_name || "",
          table_id: custom?.id,
          custom_price_ctn: custom?.custom_price_ctn ?? "", 
          custom_price_pack: pRate,
          original_pack_rate: pRate, 
          sync_enabled: false,
        };
      });
      setItems(merged);
    }
    setLoading(false);
  };

  const getProcessedItem = (item: ProductItem, shouldSync: boolean): ProductItem => {
    if (shouldSync) {
      const baseCtnPrice = Number(item.sell_price_ctn);
      const packsPerCtn = Number(item.total_pack_ctn) || 1;
      const basePackPrice = Number(item.sell_price_pack);
      
      const discountRateCtn = item.custom_price_ctn === "" ? 0 : Number(item.custom_price_ctn);
      const finalCtnPrice = baseCtnPrice * (1 - discountRateCtn / 100);
      
      const targetSinglePackPrice = finalCtnPrice / packsPerCtn;
      const requiredPackDiscount = ((1 - (targetSinglePackPrice / basePackPrice)) * 100);
      
      return { 
        ...item, 
        sync_enabled: true,
        custom_price_pack: Number(requiredPackDiscount.toFixed(2))
      };
    } else {
      return { 
        ...item, 
        sync_enabled: false,
        custom_price_pack: item.original_pack_rate 
      };
    }
  };

  const handleToggleSync = (productId: string) => {
    setItems(prev => prev.map(item => 
      item.id === productId ? getProcessedItem(item, !item.sync_enabled) : item
    ));
  };

  const isAllSynced = useMemo(() => items.length > 0 && items.every(i => i.sync_enabled), [items]);

  const handleToggleAllSync = (checked: boolean) => {
    setItems(prev => prev.map(item => getProcessedItem(item, checked)));
  };

  const handleGlobalSearch = async (term: string) => {
    setGlobalSearchTerm(term);
    setIsGlobalDropdownOpen(true); 

    if (term.length < 2) {
        setGlobalSearchResults([]);
        return; 
    }

    setSearchingGlobal(true);
    const { data: searchResults } = await supabase
      .from("products")
      .select(`
        id, product_name, product_barcode, vendor_product_id,
        sell_price_ctn, sell_price_pack, buy_price, total_pack_ctn,
        product_units (unit_name)
      `)
      .or(`product_name.ilike.%${term}%,product_barcode.ilike.%${term}%,vendor_product_id.ilike.%${term}%`)
      .limit(10);

    if (searchResults) {
        const existingIds = new Set(items.map(i => i.id));
        const filtered = searchResults
            .filter((p: any) => !existingIds.has(p.id))
            .map((p: any) => ({
                ...p,
                unit_name: p.product_units?.unit_name || ""
            }));
        setGlobalSearchResults(filtered);
    }
    setSearchingGlobal(false);
  };

  const handleAddItem = (product: Product) => {
    const newItem: ProductItem = {
        ...product,
        table_id: undefined,
        custom_price_ctn: "" as const,
        custom_price_pack: "" as const,
        original_pack_rate: "" as const,
        is_new: true,
        sync_enabled: false
    };
    setItems(prev => [newItem, ...prev]);
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);
    setIsGlobalDropdownOpen(false); 
    setLocalSearchTerm(""); 
  };

  // 🚀 [핵심 수정] index가 아닌 고유 id 값을 기준으로 삭제하도록 변경
  const handleDeleteItem = async (productId: string, tableId?: string) => {
    if (!confirm("Are you sure you want to remove this item?")) return;

    if (tableId) {
        setLoading(true);
        const { error } = await supabase
            .from("customer_products")
            .delete()
            .eq("id", tableId);
        setLoading(false);
        if (error) {
            alert("Failed to delete: " + error.message);
            return;
        }
    }
    
    // 🚀 [핵심 수정] 배열 순서가 아닌 실제 상품 id를 비교하여 삭제
    setItems(prev => prev.filter(item => item.id !== productId));
    setLocalSearchTerm("");
  };

  const handleRateChange = (id: string, type: 'ctn' | 'pack', value: string) => {
    const numValue = parseFloat(value);
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      let newValue: number | "" = "";
      if (value === "") newValue = "";
      else if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) newValue = numValue;
      else return item;

      const updatedItem = { 
        ...item, 
        [type === 'ctn' ? 'custom_price_ctn' : 'custom_price_pack']: newValue 
      };

      if (type === 'ctn' && updatedItem.sync_enabled) {
        const baseCtnPrice = Number(item.sell_price_ctn);
        const packsPerCtn = Number(item.total_pack_ctn) || 1;
        const basePackPrice = Number(item.sell_price_pack);
        const discountRateCtn = newValue === "" ? 0 : Number(newValue);
        const finalCtnPrice = baseCtnPrice * (1 - discountRateCtn / 100);
        const targetSinglePackPrice = finalCtnPrice / packsPerCtn;
        const requiredPackDiscount = ((1 - (targetSinglePackPrice / basePackPrice)) * 100);
        updatedItem.custom_price_pack = Number(requiredPackDiscount.toFixed(2));
      }

      return updatedItem;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const upsertData = items
      .map(item => ({
        id: item.table_id || crypto.randomUUID(), 
        customer_id: customerId,
        product_id: item.id,
        custom_price_ctn: item.custom_price_ctn === "" ? 0 : item.custom_price_ctn,
        custom_price_pack: item.custom_price_pack === "" ? 0 : item.custom_price_pack,
        created_at: new Date().toISOString()
      }));

    if (upsertData.length > 0) {
      const { error } = await supabase
        .from("customer_products")
        .upsert(upsertData, { onConflict: "customer_id, product_id" });

      if (error) {
        alert("Error saving: " + error.message);
      } else {
        alert("Saved successfully!");
        onClose();
      }
    } else {
      onClose();
    }
    setSaving(false);
  };

  const calculateFinalPrice = (basePrice: any, discountRate: number | "") => {
    const price = Number(basePrice) || 0;
    if (discountRate === "" || discountRate === 0) return price;
    return price * (1 - (Number(discountRate) / 100));
  };

  const displayItems = items.filter(item => {
    const term = localSearchTerm.toLowerCase();
    return (item.product_name?.toLowerCase() || "").includes(term) || 
           (item.product_barcode?.toLowerCase() || "").includes(term) ||
           (item.vendor_product_id?.toLowerCase() || "").includes(term);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl flex flex-col max-h-[90vh] relative">
        
        {/* Header */}
        <div className="flex flex-col px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Package className="w-5 h-5" />
              <span className="text-sm font-bold uppercase tracking-wide">Manage Custom Discounts</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex items-end gap-3 mt-1">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><User className="w-8 h-8" /></div>
            <div>
                <span className="text-xs text-slate-400 font-medium ml-1">Selected Customer</span>
                <h1 className="text-3xl font-black text-slate-800 leading-none tracking-tight">{customerName}</h1>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-8 py-4 bg-white border-b border-slate-100 sticky top-0 z-20">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* 글로벌 검색창 영역 */}
            <div className="relative w-full sm:w-2/3 max-w-2xl" ref={globalSearchRef}>
              <Globe className="absolute left-3 top-3 w-4 h-4 text-blue-500"/>
              <Input 
                  placeholder="Search GLOBAL products by name, barcode, or vendor ID..." 
                  className="pl-9 bg-white w-full border-2 border-blue-100 focus:border-blue-400 h-10 font-medium"
                  value={globalSearchTerm}
                  onChange={(e) => handleGlobalSearch(e.target.value)}
                  onFocus={() => setIsGlobalDropdownOpen(true)} 
              />
              
              {isGlobalDropdownOpen && globalSearchTerm.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-50">
                      {searchingGlobal ? (
                          <div className="p-4 text-center text-slate-400 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Searching...</div>
                      ) : globalSearchResults.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm">No new products found.</div>
                      ) : (
                          <div className="divide-y divide-slate-50">
                              {globalSearchResults.map(prod => (
                                  <div key={prod.id} className="flex items-center justify-between p-3 hover:bg-blue-50 transition-colors">
                                      <div className="flex flex-col">
                                          <span className="font-bold text-slate-700 text-sm">{prod.product_name}</span>
                                          <span className="text-xs text-slate-400">
                                            Code: {prod.vendor_product_id || '-'} | Cost: ${safeFixed(prod.buy_price)}
                                          </span>
                                      </div>
                                      <Button 
                                          size="sm" 
                                          onMouseDown={(e) => {
                                              e.preventDefault(); 
                                              e.stopPropagation();
                                              handleAddItem(prod);
                                          }} 
                                          className="h-8 bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white"
                                      >
                                          <Plus className="w-3 h-3 mr-1"/> Add
                                      </Button>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              )}
            </div>

            {/* 오른쪽: Local 필터 검색창 */}
            <div className="relative w-full sm:w-1/3 max-w-xs ml-auto">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                <Input 
                  placeholder="Filter loaded items..." 
                  className="pl-9 bg-slate-50 border-slate-200 text-sm h-9"
                  value={localSearchTerm}
                  onChange={(e) => setLocalSearchTerm(e.target.value)}
                />
                {localSearchTerm && (
                  <button 
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setLocalSearchTerm("");
                    }}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
             </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-white text-slate-500 font-bold sticky top-0 z-10 shadow-sm text-xs uppercase">
              <tr>
                <th className="px-4 py-4 w-[60px] border-b text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px]">ctn/pack Sync</span>
                    <Checkbox 
                        checked={isAllSynced} 
                        onCheckedChange={(c) => handleToggleAllSync(!!c)}
                        title="전체 박스단가로 동기화"
                    />
                  </div>
                </th>
                <th className="px-6 py-4 w-[10%] border-b">Code</th>
                <th className="px-6 py-4 w-[25%] border-b">Product Info</th>
                <th className="px-4 py-4 w-[8%] border-b text-right bg-slate-50/50">Cost</th>
                <th className="px-2 py-3 w-[24%] bg-blue-50/30 text-center border-r border-b border-blue-100">
                  <span className="text-blue-700">CARTON (CTN)</span>
                  <div className="flex justify-center gap-6 mt-1.5 text-[10px] text-slate-400 font-normal">
                    <span className="w-16 text-right">Base</span>
                    <span className="w-20 text-center">Discount %</span>
                    <span className="w-16 text-right">Final</span>
                  </div>
                </th>
                <th className="px-2 py-3 w-[24%] bg-amber-50/30 text-center border-b border-amber-100">
                  <span className="text-amber-700">PACK (PK)</span>
                  <div className="flex justify-center gap-6 mt-1.5 text-[10px] text-slate-400 font-normal">
                    <span className="w-16 text-right">Base</span>
                    <span className="w-20 text-center">Discount %</span>
                    <span className="w-16 text-right">Final</span>
                  </div>
                </th>
                <th className="px-2 py-3 w-[5%] text-center border-b">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="p-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-slate-300"/></td></tr>
              ) : displayItems.length === 0 && !loading ? (
                <tr><td colSpan={7} className="p-20 text-center text-slate-400">No items found matching your search.</td></tr>
              ) : displayItems.map((item, index) => { // index는 더이상 삭제 로직에 안 쓰임
                const unitName = item.unit_name?.toLowerCase() || "";
                const isCarton = unitName.includes('ctn') || unitName.includes('carton');
                const resultCtn = calculateFinalPrice(item.sell_price_ctn, item.custom_price_ctn);
                const resultPack = calculateFinalPrice(item.sell_price_pack, item.custom_price_pack);

                return (
                  <tr key={item.id} className={cn("hover:bg-slate-50/80 transition-colors", item.sync_enabled && "bg-green-50/20")}>
                    <td className="px-2 py-4 text-center border-b border-slate-50">
                      <Checkbox 
                        checked={item.sync_enabled} 
                        onCheckedChange={() => handleToggleSync(item.id)}
                      />
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 border-b border-slate-50">
                      {item.vendor_product_id || item.product_barcode || "-"}
                    </td>
                    <td className="px-6 py-4 border-b border-slate-50">
                        <div className="font-bold text-slate-700 text-sm">{item.product_name}</div>
                        <div className="text-[10px] text-slate-400">{item.total_pack_ctn} PK/CTN</div>
                    </td>
                    <td className="px-4 py-4 text-right border-b border-r border-slate-100 bg-slate-50/30 font-mono text-xs font-bold">${safeFixed(item.buy_price)}</td>
                    
                    <td className={`px-2 py-4 border-r border-b border-slate-50 ${!isCarton && 'opacity-60'}`}>
                      <div className="flex items-center gap-3 justify-center">
                        <span className="text-xs text-slate-400 w-16 text-right font-mono">${safeFixed(item.sell_price_ctn)}</span>
                        <div className="relative w-20">
                          <Input 
                            type="number" 
                            disabled={!isCarton}
                            className="h-9 text-center pr-6 font-bold"
                            value={item.custom_price_ctn}
                            onChange={(e) => handleRateChange(item.id, 'ctn', e.target.value)}
                          />
                          <span className="absolute right-2 top-2.5 text-xs font-bold text-slate-400">%</span>
                        </div>
                        <div className="w-16 text-right font-bold text-sm text-blue-600">${safeFixed(resultCtn)}</div>
                      </div>
                    </td>

                    <td className={`px-2 py-4 border-b border-slate-50 ${item.sync_enabled && 'bg-green-50/30'}`}>
                      <div className="flex items-center gap-3 justify-center">
                        <span className="text-xs text-slate-400 w-16 text-right font-mono">${safeFixed(item.sell_price_pack)}</span>
                        <div className="relative w-20">
                          <Input 
                            type="number" 
                            disabled={item.sync_enabled}
                            className={cn("h-9 text-center pr-6 font-bold", item.sync_enabled && "bg-white border-green-500 text-green-700")}
                            value={item.custom_price_pack}
                            onChange={(e) => handleRateChange(item.id, 'pack', e.target.value)}
                          />
                          <span className="absolute right-2 top-2.5 text-xs font-bold text-slate-400">%</span>
                        </div>
                        <div className={cn("w-16 text-right font-bold text-sm", item.sync_enabled ? "text-green-600" : "text-amber-600")}>
                          ${safeFixed(resultPack)}
                        </div>
                      </div>
                    </td>

                    <td className="px-2 py-4 border-b border-slate-50 text-center">
                        {/* 🚀 [핵심 수정] index 대신 item.id 를 파라미터로 넘김 */}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="text-slate-300 hover:text-red-500 w-8 h-8 rounded-full" 
                          onClick={() => handleDeleteItem(item.id, item.table_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center rounded-b-xl z-30">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <CheckSquare className="w-3 h-3 text-green-500"/>
            "Sync"를 체크하면 박스 단가에 맞춰 낱개 할인율이 자동 계산됩니다. 해제 시 원래 할인율로 복구됩니다.
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-slate-900 min-w-[160px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Save className="w-4 h-4 mr-2"/>} Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}