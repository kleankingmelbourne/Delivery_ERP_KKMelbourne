"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Search, Save, Package, Loader2, User, Plus, Globe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  sell_price_ctn: number;  
  sell_price_pack: number; 
  buy_price: number;
  unit_name?: string;
}

interface ProductItem extends Product {
  table_id?: string; 
  custom_price_ctn: number | ""; 
  custom_price_pack: number | ""; 
  is_new?: boolean;
}

// [NEW] 1. 안전한 숫자 변환 헬퍼 (화면 표시용)
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
  
  const [items, setItems] = useState<ProductItem[]>([]);

  useEffect(() => {
    if (isOpen && customerId) {
      setLocalSearchTerm("");
      setGlobalSearchTerm("");
      setGlobalSearchResults([]);
      fetchMyItems();
    }
  }, [isOpen, customerId]);

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
        id, product_name, product_barcode, 
        sell_price_ctn, sell_price_pack, buy_price,
        product_units (unit_name)
      `)
      .in("id", productIds)
      .order("product_name");

    if (productsData) {
      const merged: ProductItem[] = productsData.map((prod: any) => {
        const custom = customData.find((c: any) => c.product_id === prod.id);
        return {
          ...prod,
          unit_name: prod.product_units?.unit_name || "",
          table_id: custom?.id,
          custom_price_ctn: custom?.custom_price_ctn ?? "", 
          custom_price_pack: custom?.custom_price_pack ?? "",
        };
      });
      setItems(merged);
    }
    setLoading(false);
  };

  const handleGlobalSearch = async (term: string) => {
    setGlobalSearchTerm(term);
    if (term.length < 2) {
        setGlobalSearchResults([]);
        return; 
    }

    setSearchingGlobal(true);
    const { data: searchResults } = await supabase
      .from("products")
      .select(`
        id, product_name, product_barcode, 
        sell_price_ctn, sell_price_pack, buy_price,
        product_units (unit_name)
      `)
      .or(`product_name.ilike.%${term}%,product_barcode.ilike.%${term}%`)
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
        is_new: true
    };
    setItems(prev => [newItem, ...prev]);
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);
  };

  const handleDeleteItem = async (index: number, tableId?: string) => {
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
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleRateChange = (id: string, type: 'ctn' | 'pack', value: string) => {
    const numValue = parseFloat(value);
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      let newValue: number | "" = "";
      if (value === "") newValue = "";
      else if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) newValue = numValue;
      else return item;

      return { 
        ...item, 
        [type === 'ctn' ? 'custom_price_ctn' : 'custom_price_pack']: newValue 
      };
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
        console.error(error);
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

  // [NEW] 2. 계산 로직 안전장치 (null 방어)
  const calculateFinalPrice = (basePrice: any, discountRate: number | "") => {
    const price = Number(basePrice) || 0; // null이면 0으로 변환
    if (discountRate === "" || discountRate === 0) return price;
    return price * (1 - (Number(discountRate) / 100));
  };

  const displayItems = items.filter(item => {
    const term = localSearchTerm.toLowerCase();
    const name = item.product_name?.toLowerCase() || "";
    const barcode = item.product_barcode?.toLowerCase() || "";
    return name.includes(term) || barcode.includes(term);
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
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <User className="w-8 h-8" />
            </div>
            <div>
                <span className="text-xs text-slate-400 font-medium ml-1">Selected Customer</span>
                <h1 className="text-3xl font-black text-slate-800 leading-none tracking-tight">{customerName}</h1>
            </div>
          </div>
        </div>

        {/* Search Bars */}
        <div className="px-8 py-4 bg-white border-b border-slate-100 space-y-3 sticky top-0 z-20">
          
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
            <Input 
              placeholder="Search loaded items..." 
              className="pl-9 bg-slate-50 w-full max-w-sm border-slate-200 focus:bg-white transition-all text-sm h-9"
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
            />
          </div>

          <div className="relative w-full">
            <div className="relative">
                <Globe className="absolute left-3 top-3 w-4 h-4 text-blue-500"/>
                <Input 
                    placeholder="Search GLOBAL products to add..." 
                    className="pl-9 bg-white w-full border-2 border-blue-100 focus:border-blue-400 shadow-sm transition-all h-10 font-medium"
                    value={globalSearchTerm}
                    onChange={(e) => handleGlobalSearch(e.target.value)}
                />
            </div>

            {/* Global Search Results Dropdown */}
            {globalSearchTerm.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-xl max-h-60 overflow-y-auto z-50">
                    {searchingGlobal ? (
                        <div className="p-4 text-center text-slate-400 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin"/> Searching database...
                        </div>
                    ) : globalSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-sm">
                            No new products found matching "{globalSearchTerm}".
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {globalSearchResults.map(prod => (
                                <div key={prod.id} className="flex items-center justify-between p-3 hover:bg-blue-50 transition-colors group">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-700 text-sm">{prod.product_name}</span>
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                                                {prod.unit_name || "UNIT"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <span className="font-mono bg-slate-100 px-1 rounded">{prod.product_barcode}</span>
                                            <span>•</span>
                                            {/* [NEW] safeFixed 적용 */}
                                            <span>Cost: ${safeFixed(prod.buy_price)}</span>
                                        </div>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        onClick={() => handleAddItem(prod)} 
                                        className="h-8 bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                                    >
                                        <Plus className="w-3 h-3 mr-1"/> Add Item
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>

        {/* My Items Table */}
        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-white text-slate-500 font-bold sticky top-0 z-10 shadow-sm text-xs uppercase">
              <tr>
                <th className="px-6 py-4 w-[10%] border-b">Code</th>
                <th className="px-6 py-4 w-[25%] border-b">Product Info</th>
                <th className="px-4 py-4 w-[8%] border-b text-right bg-slate-50/50 text-slate-600 border-r border-slate-100">Cost</th>
                
                <th className="px-2 py-3 w-[25%] bg-blue-50/30 text-center border-r border-b border-blue-100">
                  <span className="text-blue-700">CARTON (CTN)</span>
                  <div className="flex justify-center gap-6 mt-1.5 px-2 text-[10px] text-slate-400 font-normal tracking-wide">
                    <span className="w-16 text-right">Base</span>
                    <span className="w-20 text-center">Discount %</span>
                    <span className="w-16 text-right">Your Price</span>
                  </div>
                </th>

                <th className="px-2 py-3 w-[25%] bg-amber-50/30 text-center border-b border-amber-100">
                  <span className="text-amber-700">PACK (PK)</span>
                  <div className="flex justify-center gap-6 mt-1.5 px-2 text-[10px] text-slate-400 font-normal tracking-wide">
                    <span className="w-16 text-right">Base</span>
                    <span className="w-20 text-center">Discount %</span>
                    <span className="w-16 text-right">Your Price</span>
                  </div>
                </th>
                <th className="px-2 py-3 w-[5%] text-center border-b">
                    Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && items.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-slate-300"/></td></tr>
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-24 text-center text-slate-400">
                    <div className="flex flex-col items-center">
                      <Package className="w-16 h-16 mb-4 opacity-10" />
                      <p className="text-lg font-medium text-slate-500">No items found.</p>
                      <p className="text-sm mt-1">Use the "Global Search" above to add products.</p>
                    </div>
                  </td>
                </tr>
              ) : displayItems.map((item, index) => {
                
                const unitName = item.unit_name?.toLowerCase() || "";
                const isCarton = unitName.includes('ctn') || unitName.includes('carton');

                const hasCtnRate = item.custom_price_ctn !== "" && Number(item.custom_price_ctn) > 0;
                const hasPackRate = item.custom_price_pack !== "" && Number(item.custom_price_pack) > 0;

                const resultCtn = calculateFinalPrice(item.sell_price_ctn, item.custom_price_ctn);
                const resultPack = calculateFinalPrice(item.sell_price_pack, item.custom_price_pack);

                return (
                  <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${item.is_new ? "bg-green-50/20" : ""}`}>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 border-b border-slate-50">
                      {item.product_barcode}
                      {item.is_new && <span className="block mt-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded w-fit font-bold">NEW</span>}
                    </td>
                    
                    <td className="px-6 py-4 border-b border-slate-50">
                        <div className="font-bold text-slate-700 text-sm">{item.product_name}</div>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            Unit: <span className="font-semibold bg-slate-100 px-1 rounded">{item.unit_name || "N/A"}</span>
                        </div>
                    </td>

                    <td className="px-4 py-4 text-right border-b border-r border-slate-100 bg-slate-50/30">
                        <span className="font-mono text-xs text-slate-600 font-bold">
                            {/* [NEW] safeFixed 적용 */}
                            ${safeFixed(item.buy_price)}
                        </span>
                    </td>
                    
                    <td className={`px-2 py-4 border-r border-b border-slate-50 ${!isCarton ? 'bg-slate-50 opacity-60' : hasCtnRate ? "bg-blue-50/10" : ""}`}>
                      <div className="flex items-center gap-3 justify-center">
                        <span className="text-xs text-slate-400 w-16 text-right font-mono">
                          {/* [NEW] safeFixed 적용 */}
                          ${safeFixed(item.sell_price_ctn)}
                        </span>
                        
                        <div className="relative w-20">
                          <Input 
                            type="number" 
                            disabled={!isCarton}
                            className={`h-9 text-center pr-6 font-bold transition-all 
                                ${!isCarton 
                                    ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed" 
                                    : hasCtnRate 
                                        ? "border-blue-300 text-blue-700 bg-blue-50 ring-2 ring-blue-100" 
                                        : "bg-white text-slate-600 border-slate-200"
                                }`}
                            value={item.custom_price_ctn}
                            onChange={(e) => handleRateChange(item.id, 'ctn', e.target.value)}
                            placeholder={isCarton ? "0" : "-"}
                          />
                          <span className={`absolute right-2 top-2.5 text-xs font-bold ${!isCarton ? "text-slate-300" : "text-slate-400"}`}>%</span>
                        </div>
                        
                        <div className={`w-16 text-right font-bold text-sm ${!isCarton ? "text-slate-300 decoration-slate-300 line-through" : hasCtnRate ? "text-blue-600" : "text-slate-300"}`}>
                          {/* [NEW] safeFixed 적용 */}
                          ${safeFixed(resultCtn)}
                        </div>
                      </div>
                    </td>

                    <td className={`px-2 py-4 border-b border-slate-50 ${hasPackRate ? "bg-amber-50/10" : ""}`}>
                      <div className="flex items-center gap-3 justify-center">
                        <span className="text-xs text-slate-400 w-16 text-right font-mono">
                          {/* [NEW] safeFixed 적용 */}
                          ${safeFixed(item.sell_price_pack)}
                        </span>
                        
                        <div className="relative w-20">
                          <Input 
                            type="number" 
                            className={`h-9 text-center pr-6 font-bold transition-all ${hasPackRate ? "border-amber-300 text-amber-700 bg-amber-50 ring-2 ring-amber-100" : "bg-white text-slate-600 border-slate-200"}`}
                            value={item.custom_price_pack}
                            onChange={(e) => handleRateChange(item.id, 'pack', e.target.value)}
                            placeholder="0"
                          />
                          <span className="absolute right-2 top-2.5 text-xs text-slate-400 font-bold">%</span>
                        </div>

                        <div className={`w-16 text-right font-bold text-sm ${hasPackRate ? "text-amber-600" : "text-slate-300"}`}>
                          {/* [NEW] safeFixed 적용 */}
                          ${safeFixed(resultPack)}
                        </div>
                      </div>
                    </td>

                    <td className="px-2 py-4 border-b border-slate-50 text-center">
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 w-8 h-8 rounded-full"
                            onClick={() => handleDeleteItem(index, item.table_id)}
                            title="Remove Item"
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
        <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
          <div className="text-xs text-slate-400">
            * Saving updates both CTN and PACK discount rates.
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-slate-700">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 min-w-[160px] shadow-lg shadow-slate-200">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2"/> Saving...</> : <><Save className="w-4 h-4 mr-2"/> Save Changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}