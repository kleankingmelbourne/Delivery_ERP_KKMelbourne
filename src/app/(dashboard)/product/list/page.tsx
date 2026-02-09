"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import { 
  Plus, Package, AlertTriangle, DollarSign, Search, 
  MoreHorizontal, Edit, Trash2, Loader2,
  ChevronLeft, ChevronRight, ArrowUpDown, Users, Save, X, Calculator,
  Filter, Download, Upload, ImageIcon, BarChart3, Eye 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

import { PRODUCT_SCHEMA } from "@/constants/schemas"
import Papa from "papaparse"; 

const toFixed2 = (num: number | string) => {
  const parsed = Number(num);
  if (isNaN(parsed)) return 0;
  return Number(parsed.toFixed(2));
};

export default function ProductPage() {
  const supabase = createClient()

  // --- 상태 관리 ---
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // 실제 업로드할 파일 객체 저장용
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [totalStockValue, setTotalStockValue] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);

  const [isUseModalOpen, setIsUseModalOpen] = useState(false);
  const [usageList, setUsageList] = useState<any[]>([]);
  const [currentUsageProduct, setCurrentUsageProduct] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const [dynamicSchema, setDynamicSchema] = useState(PRODUCT_SCHEMA);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [vendorMap, setVendorMap] = useState<Record<string, string>>({});
  const [unitMap, setUnitMap] = useState<Record<string, string>>({}); 
  
  const [categoryOptions, setCategoryOptions] = useState<{label: string, value: string}[]>([]);
  const [vendorOptions, setVendorOptions] = useState<{label: string, value: string}[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialFormState = {
    buy_price: 0,
    sell_price_ctn: 0,
    margin_ctn: 0,
    total_pack_ctn: 1,
    sell_price_pack: 0,
    margin_pack: 0,
    gst: true,
    product_name: "",
    product_barcode: "", 
    vendor_product_id: "", 
    category_id: "",
    default_unit_id: "",
    vendor_id: "",
    location: "",
    current_stock_level: 0,      
    current_stock_level_pack: 0, 
    min_stock_level: 5,
    product_image: "",
  };
  const [formData, setFormData] = useState<any>(initialFormState);

  // --- 1. 데이터 불러오기 ---
  const fetchProduct = async () => {
    setLoading(true);
    
    // [MODIFIED] product_units 조인 추가 (Unit 이름 가져오기 위함)
    const { data, error } = await supabase
      .from("products")
      .select(`
        *,
        product_categories (category_name),
        product_vendors (vendor_name),
        product_units (unit_name) 
      `)
      .order("id", { ascending: false })
    
    if (error) {
      console.error("Error fetching:", error);
    } else {
      const calculatedData = (data || []).map((item: any) => {
        const price = Number(item.buy_price) || 0;
        
        // Stock Value 계산 (CTN 기준 혹은 Pack 기준 - 여기서는 단순하게 CTN 재고 * 매입가로 가정하거나, 비즈니스 로직에 따라 수정 가능)
        // 일단 기존 로직 유지 (current_stock_level * buy_price)
        // 만약 Pack 단위 상품이라면 pack 재고 * pack 매입가로 계산해야 할 수도 있음.
        const stock = Number(item.current_stock_level) || 0;
        
        return {
          ...item,
          stock_value: price * stock 
        };
      });

      const lowStockList = calculatedData.filter((item: any) => {
        // Low Stock 판단 기준 (여기서도 Unit에 따라 다르게 할 수 있음)
        const current = Number(item.current_stock_level) || 0;
        const min = Number(item.min_stock_level) || 5; 
        return current < min;
      });
      setLowStockItems(lowStockList);

      const total = calculatedData.reduce((acc: number, cur: any) => acc + cur.stock_value, 0);
      setTotalStockValue(total);

      setProducts(calculatedData);
    }
    setLoading(false);
  }

  const fetchReferenceData = async () => {
    try {
      const [units, categories, vendors] = await Promise.all([
        supabase.from("product_units").select("id, unit_name"),
        supabase.from("product_categories").select("id, category_name"),
        supabase.from("product_vendors").select("id, vendor_name"),
      ]);

      const newSchema = JSON.parse(JSON.stringify(PRODUCT_SCHEMA));

      if (units.data) {
        const uMap: Record<string, string> = {};
        newSchema.default_unit_id.options = units.data.map((u: any) => {
            uMap[u.id] = u.unit_name;
            return { label: u.unit_name, value: u.id };
        });
        setUnitMap(uMap);
      }
      
      if (categories.data) {
        const catOpts = categories.data.map((c: any) => ({ label: c.category_name, value: c.id }));
        newSchema.category_id.options = catOpts;
        setCategoryOptions(catOpts);
      }
      
      const vMap: Record<string, string> = {};
      if (vendors.data) {
        const vendOpts = vendors.data.map((v: any) => {
            vMap[v.id] = v.vendor_name; 
            return { label: v.vendor_name, value: v.id };
        });
        newSchema.vendor_id.options = vendOpts;
        setVendorOptions(vendOpts);
      }
      setVendorMap(vMap);

      setDynamicSchema(newSchema);
    } catch (error) {
      console.error("Failed to fetch reference data:", error);
    }
  };

  useEffect(() => {
    fetchProduct();
    fetchReferenceData();
  }, []);

  // --- Export Function ---
  const handleExport = async () => {
    const exportData = products.map(p => ({
        id: p.id, 
        product_barcode: p.product_barcode || "",
        vendor_product_id: p.vendor_product_id || "",
        product_name: p.product_name || "",
        location: p.location || "",
        gst: p.gst ? "TRUE" : "FALSE", 
        category_id: p.category_id || "",
        vendor_id: p.vendor_id || "",
        default_unit_id: p.default_unit_id || "",
        total_pack_ctn: p.total_pack_ctn || 0,
        sell_price_ctn: p.sell_price_ctn || 0,
        margin_ctn: p.margin_ctn || 0,
        sell_price_pack: p.sell_price_pack || 0,
        margin_pack: p.margin_pack || 0,
        buy_price: p.buy_price || 0,
        current_stock_level: p.current_stock_level || 0,
        current_stock_level_pack: p.current_stock_level_pack || 0,
        min_stock_level: p.min_stock_level || 0,
        product_image: p.product_image || "",
        created_at: p.created_at || ""
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `products_backup_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Import Function ---
  const handleImportClick = () => {
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; 
        fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
            const rows = results.data as any[];
            if (rows.length === 0) {
                alert("CSV file is empty.");
                setIsImporting(false);
                return;
            }

            const upsertData = rows.map(row => {
                if (!row.product_name) return null;
                return {
                    ...(row.id && row.id.trim() !== "" ? { id: row.id } : {}),
                    product_name: row.product_name,
                    product_barcode: row.product_barcode || null,
                    vendor_product_id: row.vendor_product_id || null,
                    location: row.location || null,
                    gst: String(row.gst).toUpperCase() === 'TRUE',
                    category_id: row.category_id || null,
                    vendor_id: row.vendor_id || null,
                    default_unit_id: row.default_unit_id || null,
                    total_pack_ctn: Number(row.total_pack_ctn) || 1,
                    sell_price_ctn: Number(row.sell_price_ctn) || 0,
                    margin_ctn: Number(row.margin_ctn) || 0,
                    sell_price_pack: Number(row.sell_price_pack) || 0,
                    margin_pack: Number(row.margin_pack) || 0,
                    buy_price: Number(row.buy_price) || 0,
                    current_stock_level: Number(row.current_stock_level) || 0,
                    current_stock_level_pack: Number(row.current_stock_level_pack) || 0,
                    min_stock_level: Number(row.min_stock_level) || 0,
                    product_image: row.product_image || null,
                };
            }).filter(Boolean); 

            try {
                const { error } = await supabase
                    .from('products')
                    .upsert(upsertData, { onConflict: 'id' }); 

                if (error) throw error;
                alert(`Successfully imported/updated ${upsertData.length} items.`);
                fetchProduct(); 
            } catch (error: any) {
                console.error("Import Error:", error);
                alert("Import failed: " + error.message);
            } finally {
                setIsImporting(false);
            }
        },
        error: (error) => {
            console.error("CSV Parse Error:", error);
            alert("Failed to parse CSV file.");
            setIsImporting(false);
        }
    });
  };

  // --- 3. 폼 핸들링 ---
  useEffect(() => {
    if (isModalOpen) {
        if (editingProduct) {
            setFormData(editingProduct);
            setImageFile(null);
        } else {
            setFormData(initialFormState);
            setImageFile(null);
        }
    }
  }, [isModalOpen, editingProduct]);

  // 폼 유효성 검사 함수 (Product Name만 필수)
  const validateForm = () => {
    if (!formData.product_name || String(formData.product_name).trim() === "") {
        alert("Please enter the Product Name.");
        return false;
    }
    return true;
  };

  const handleFormChange = (field: string, value: any) => {
    let newData = { ...formData, [field]: value };
    const numValue = Number(value);
    
    const buyPriceCtn = Number(newData.buy_price || 0);
    const packQty = Number(newData.total_pack_ctn || 1);
    const buyPricePack = packQty > 0 ? buyPriceCtn / packQty : 0; 

    if (field === 'buy_price' || field === 'total_pack_ctn') {
      const sellCtn = Number(newData.sell_price_ctn || 0);
      if (sellCtn > 0) {
        const marginCtn = ((sellCtn - buyPriceCtn) / sellCtn) * 100;
        newData.margin_ctn = toFixed2(marginCtn);
      }
      const sellPack = Number(newData.sell_price_pack || 0);
      if (sellPack > 0) {
        const marginPack = ((sellPack - buyPricePack) / sellPack) * 100;
        newData.margin_pack = toFixed2(marginPack);
      }
    }
    if (field === 'sell_price_ctn' && numValue > 0) {
        const margin = ((numValue - buyPriceCtn) / numValue) * 100;
        newData.margin_ctn = toFixed2(margin);
    }
    if (field === 'margin_ctn' && numValue < 100) {
        const sell = buyPriceCtn / (1 - numValue / 100);
        newData.sell_price_ctn = toFixed2(sell);
    }
    if (field === 'sell_price_pack' && numValue > 0) {
        const margin = ((numValue - buyPricePack) / numValue) * 100;
        newData.margin_pack = toFixed2(margin);
    }
    if (field === 'margin_pack' && numValue < 100) {
        const sell = buyPricePack / (1 - numValue / 100);
        newData.sell_price_pack = toFixed2(sell);
    }

    setFormData(newData);
  };

  const generateBarcode = () => {
    let barcode = "";
    for (let i = 0; i < 12; i++) {
        barcode += Math.floor(Math.random() * 10);
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        const digit = parseInt(barcode[i]);
        sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const finalBarcode = barcode + checkDigit;
    handleFormChange('product_barcode', finalBarcode);
  };

  // 이미지 업로드 핸들러
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        handleFormChange('product_image', reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      let imageUrl = formData.product_image;

      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('product_image') 
            .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('product_image')
            .getPublicUrl(filePath);
        
        imageUrl = publicUrl;
      }

      const dbPayload = {
        product_name: formData.product_name,
        product_barcode: formData.product_barcode || null,
        vendor_product_id: formData.vendor_product_id || null,
        location: formData.location || null,
        gst: formData.gst,
        category_id: formData.category_id || null,
        vendor_id: formData.vendor_id || null,
        default_unit_id: formData.default_unit_id || null,
        
        total_pack_ctn: Number(formData.total_pack_ctn) || 1,
        sell_price_ctn: toFixed2(formData.sell_price_ctn),
        margin_ctn: toFixed2(formData.margin_ctn),
        sell_price_pack: toFixed2(formData.sell_price_pack),
        margin_pack: toFixed2(formData.margin_pack),
        buy_price: toFixed2(formData.buy_price),
        
        current_stock_level: Number(formData.current_stock_level) || 0,
        current_stock_level_pack: Number(formData.current_stock_level_pack) || 0, 
        min_stock_level: Number(formData.min_stock_level) || 0,
        product_image: imageUrl, 
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(dbPayload)
          .eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert(dbPayload);
        if (error) throw error;
      }

      await fetchProduct();
      setIsModalOpen(false);
      setEditingProduct(null);
      setImageFile(null);
      alert("Product saved successfully!");
    } catch (error: any) {
      console.error("Save Error:", error);
      if (error.message.includes("products_product_barcode_key")) {
        alert("Error: This barcode already exists. Please generate a new one.");
      } else {
        alert("Error saving product: " + error.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} items? This will also delete associated images.`)) return;
    
    try {
        const { data: productsToDelete, error: fetchError } = await supabase
            .from('products')
            .select('product_image')
            .in('id', ids);
        
        if (fetchError) throw fetchError;

        const filesToRemove = productsToDelete
            ?.map(p => p.product_image)
            .filter(url => url && url.includes('product_image')) 
            .map(url => {
                const parts = url.split('/product_image/');
                return parts.length > 1 ? parts[1] : null;
            })
            .filter(path => path !== null) as string[];

        if (filesToRemove.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('product_image')
                .remove(filesToRemove);
            
            if (storageError) console.error("Storage Delete Error:", storageError);
        }

        const { error } = await supabase.from("products").delete().in("id", ids);
        if (error) throw error;

        alert("Deleted successfully.");
        setSelectedIds(new Set());
        fetchProduct();

    } catch (error: any) {
      alert("Failed to delete: " + error.message);
    }
  };

  // --- Use Handlers & Rendering ---
  const handleOpenUseModal = async (product: any) => {
    setCurrentUsageProduct(product);
    setIsUseModalOpen(true);
    setUsageLoading(true);
    
    const { data, error } = await supabase
        .from('customer_products')
        .select(`
            id,
            customer_id,
            custom_price_ctn,
            custom_price_pack,
            customers (name, company)
        `)
        .eq('product_id', product.id);

    if (error) {
        setUsageList([]);
    } else {
        setUsageList(data || []);
    }
    setUsageLoading(false);
  };

  const handleUpdateUsage = (id: string, field: string, value: string) => {
    const newList = usageList.map(item => {
        if (item.id === id) {
            return { ...item, [field]: value };
        }
        return item;
    });
    setUsageList(newList);
  };

  const handleSaveUsage = async (item: any) => {
    try {
        const { error } = await supabase
            .from('customer_products')
            .update({
                custom_price_ctn: toFixed2(item.custom_price_ctn),
                custom_price_pack: toFixed2(item.custom_price_pack)
            })
            .eq('id', item.id);
        if (error) throw error;
        alert("Updated successfully!");
    } catch (e: any) {
        alert("Error saving: " + e.message);
    }
  };

  const handleDeleteUsage = async (id: string) => {
    if (!confirm("Remove this customer from usage list?")) return;
    try {
        const { error } = await supabase.from('customer_products').delete().eq('id', id);
        if (error) throw error;
        setUsageList(prev => prev.filter(item => item.id !== id));
    } catch (e: any) {
        alert("Error deleting: " + e.message);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const processedProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        result = result.filter(p => 
            p.product_name?.toLowerCase().includes(lowerTerm) ||
            p.product_barcode?.toLowerCase().includes(lowerTerm)
        );
    }
    if (selectedCategory !== "all") {
        result = result.filter(p => String(p.category_id) === selectedCategory);
    }
    if (selectedVendor !== "all") {
        result = result.filter(p => String(p.vendor_id) === selectedVendor);
    }
    if (sortConfig) {
      result.sort((a, b) => {
        const valA = Number(a[sortConfig.key]) || 0;
        const valB = Number(b[sortConfig.key]) || 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [products, searchTerm, selectedCategory, selectedVendor, sortConfig]);

  const itemsPerPageToUse = itemsPerPage; 
  const totalPages = Math.ceil(processedProducts.length / itemsPerPageToUse);
  
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedData = processedProducts.slice(
    (currentPage - 1) * itemsPerPageToUse,
    currentPage * itemsPerPageToUse
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = paginatedData.map(p => p.id);
      setSelectedIds(new Set([...Array.from(selectedIds), ...allIds]));
    } else {
      const newSet = new Set(selectedIds);
      paginatedData.forEach(p => newSet.delete(p.id));
      setSelectedIds(newSet);
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const renderField = (key: string, labelOverwrite?: string, className: string = "", disabled: boolean = false) => {
    let fieldKey = key;
    if (key === 'product_barcode') fieldKey = 'item_code'; 
    if (key === 'vendor_product_id') fieldKey = 'item_code';

    const field = (dynamicSchema[fieldKey as keyof typeof dynamicSchema] as any) || { label: labelOverwrite || key, type: 'text' };
    const value = formData[key];
    const label = labelOverwrite || field.label;

    return (
        <div className={`space-y-1.5 ${className}`}>
            <Label className={`text-xs font-bold uppercase flex items-center justify-between ${disabled ? "text-slate-300" : "text-slate-500"}`}>
                <span>
                    {label} 
                    {key === 'product_name' && <span className="text-red-500 ml-0.5">*</span>}
                </span>
                {key === 'product_barcode' && !disabled && (
                    <span 
                        onClick={generateBarcode}
                        className="text-[10px] text-blue-600 cursor-pointer hover:underline flex items-center gap-1"
                    >
                        <BarChart3 className="w-3 h-3" /> Generate
                    </span>
                )}
            </Label>
            
            {field.type === "select" ? (
                <Select 
                    value={String(value || "")} 
                    onValueChange={(val) => handleFormChange(key, val)}
                    disabled={disabled || field.readOnly}
                >
                    <SelectTrigger className={`h-9 ${disabled ? "bg-slate-50 text-slate-300" : ""}`}>
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options?.map((opt: any) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : (field.type === "checkbox" || field.type === "boolean" || key === 'gst') ? (
                <div className={`flex items-center space-x-2 h-9 border rounded-md px-3 ${disabled ? "bg-slate-50" : "bg-white"}`}>
                    <Switch 
                        checked={!!value} 
                        onCheckedChange={(checked) => handleFormChange(key, checked)} 
                        disabled={disabled || field.readOnly}
                    />
                    <span className={`text-sm font-medium ${disabled ? "text-slate-300" : "text-slate-700"}`}>{value ? "Yes" : "No"}</span>
                </div>
            ) : (
                <Input 
                    type={field.type === "number" || key.includes('price') || key.includes('margin') || key.includes('stock') ? "number" : "text"}
                    step={field.type === "number" ? "0.01" : undefined}
                    value={value || ""}
                    onChange={(e) => handleFormChange(key, e.target.value)}
                    onBlur={(e) => {
                        if(field.type === 'number' || key.includes('price')) {
                            handleFormChange(key, toFixed2(e.target.value));
                        }
                    }}
                    disabled={disabled || field.readOnly}
                    className={`h-9 ${disabled ? "bg-slate-50 text-slate-300 border-slate-200" : (field.readOnly ? "bg-slate-100 text-slate-500" : "")}`}
                />
            )}
        </div>
    );
  };

  // 선택된 Unit 이름 계산
  const selectedUnitName = unitMap[formData.default_unit_id] || "Pack (Unit)";
  // Carton 활성화 여부 체크 (이름에 Carton 또는 CTN이 없으면 비활성화)
  const isCarton = selectedUnitName.toLowerCase().includes('carton') || selectedUnitName.toLowerCase().includes('ctn');

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen pb-20">
      
      {/* Header, Stats, Table Sections ... (위와 동일) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product Management</h1>
          <p className="text-sm text-slate-500">Manage inventory, pricing, and stock alerts.</p>
        </div>
        <div className="flex gap-2 items-center">
            <div className="flex items-center mr-2 border-r pr-2 gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} title="Download CSV">
                    <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                
                <input 
                    type="file" 
                    accept=".csv" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileChange}
                />
                <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting} title="Upload CSV">
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Upload className="w-4 h-4 mr-2" />}
                    Import
                </Button>
            </div>

            {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
                    <Trash2 className="w-4 h-4 mr-2"/> Delete ({selectedIds.size})
                </Button>
            )}
            <Button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="bg-slate-900">
                <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
        </div>
      </div>

      {/* ... (Stats Cards, Table Section 생략 - 기존 코드와 동일) ... */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl"><Package className="text-blue-600 w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Products</p>
              <h3 className="text-2xl font-bold text-slate-800">{products.length}</h3>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-xl"><AlertTriangle className="text-red-600 w-6 h-6" /></div>
              <div>
                <p className="text-sm text-slate-500 font-medium">Low Stock Items</p>
                <h3 className="text-2xl font-bold text-red-600">{lowStockItems.length}</h3>
              </div>
            </div>
            {lowStockItems.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIsLowStockModalOpen(true)} className="text-red-600 border-red-200 hover:bg-red-50">
                Check List
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-xl"><DollarSign className="text-green-600 w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Stock Value</p>
              <h3 className="text-2xl font-bold text-green-600">${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/50 gap-4">
            <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto flex-1">
                <div className="w-full md:w-[200px]">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="bg-white">
                            <div className="flex items-center gap-2 text-slate-600">
                                <Filter className="w-4 h-4" />
                                <SelectValue placeholder="All Categories" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categoryOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-full md:w-[200px]">
                    <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                        <SelectTrigger className="bg-white">
                            <div className="flex items-center gap-2 text-slate-600">
                                <Users className="w-4 h-4" />
                                <SelectValue placeholder="All Vendors" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Vendors</SelectItem>
                            {vendorOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="relative w-full md:w-[300px]">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <Input 
                        placeholder="Search products..." 
                        className="pl-9 bg-white" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="text-sm text-slate-500 whitespace-nowrap">
                Showing {paginatedData.length} of {processedProducts.length}
            </div>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-xs">
                    <tr>
                        <th className="px-4 py-3 w-[50px] text-center">
                            <Checkbox 
                                checked={paginatedData.length > 0 && paginatedData.every(p => selectedIds.has(p.id))}
                                onCheckedChange={(c) => handleSelectAll(!!c)}
                            />
                        </th>
                        <th className="px-4 py-3">Product Name</th>
                        <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('stock_value')}>
                            <div className="flex items-center justify-end gap-1">Value <ArrowUpDown className="w-3 h-3"/></div>
                        </th>
                        <th className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100" onClick={() => handleSort('buy_price')}>
                            <div className="flex items-center justify-end gap-1">Cost <ArrowUpDown className="w-3 h-3"/></div>
                        </th>
                        <th className="px-4 py-3 text-right">Price(Ctn)</th>
                        <th className="px-4 py-3 text-right text-indigo-600">Margin(C)</th>
                        <th className="px-4 py-3 text-right">Price(Pack)</th>
                        <th className="px-4 py-3 text-right text-indigo-600">Margin(P)</th>
                        <th className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100" onClick={() => handleSort('current_stock_level')}>
                            <div className="flex items-center justify-center gap-1">Stock <ArrowUpDown className="w-3 h-3"/></div>
                        </th>
                        <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        <tr><td colSpan={10} className="p-10 text-center text-slate-400">Loading products...</td></tr>
                    ) : paginatedData.length === 0 ? (
                        <tr><td colSpan={10} className="p-10 text-center text-slate-400">No products found.</td></tr>
                    ) : (
                        paginatedData.map((product) => {
                            const isSelected = selectedIds.has(product.id);
                            const isLowStock = product.current_stock_level < (product.min_stock_level || 5);
                            
                            // [MODIFIED] Unit 이름 찾기 (Join된 데이터 활용)
                            // @ts-ignore
                            const unitName = product.product_units?.unit_name || "CTN";
                            const isCtn = unitName.toLowerCase().includes("ctn") || unitName.toLowerCase().includes("carton");
                            
                            // [MODIFIED] Stock 표시 값 결정
                            const displayStock = isCtn ? product.current_stock_level : product.current_stock_level_pack;

                            return (
                                <tr key={product.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""}`}>
                                    <td className="px-4 py-3 text-center">
                                        <Checkbox 
                                            checked={isSelected}
                                            onCheckedChange={() => handleSelectOne(product.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        <div className="flex items-center gap-3">
                                            {/* [MODIFIED] List에서 이미지 제거 */}
                                            <div>
                                                {product.product_name}
                                                <div className="flex gap-2 mt-0.5">
                                                    {product.product_barcode && <span className="text-[10px] text-slate-400">{product.product_barcode}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                                        ${product.stock_value?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-600">${Number(product.buy_price).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-slate-600 font-bold">${Number(product.sell_price_ctn).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-xs font-bold text-indigo-600">{Number(product.margin_ctn).toFixed(1)}%</td>
                                    <td className="px-4 py-3 text-right text-slate-600">${Number(product.sell_price_pack).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-xs font-bold text-indigo-600">{Number(product.margin_pack).toFixed(1)}%</td>
                                    
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${isLowStock ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-700"}`}>
                                                {displayStock}
                                            </span>
                                            <span className="text-[10px] text-slate-400 mt-0.5">{unitName}</span>
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Button variant="ghost" size="sm" className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50" onClick={() => handleOpenUseModal(product)}>
                                                <Users className="w-4 h-4" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}>
                                                        <Edit className="w-4 h-4 mr-2" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDelete([product.id])} className="text-red-600">
                                                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>

        {processedProducts.length > itemsPerPage && (
            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-slate-600">
                    Page {currentPage} of {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
        )}
      </div>

      {/* 3. Product Form Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                <DialogDescription>Fill in the details below. Pricing calculations are automatic.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                
                {/* Section 1: Basic Info */}
                <div className="border p-4 rounded-xl bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-500" /> Basic Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">{renderField('product_name')}</div>
                        <div className="md:col-span-1">{renderField('location')}</div>
                        
                        <div className="md:col-span-2">{renderField('category_id')}</div>
                        <div className="md:col-span-2">{renderField('vendor_id')}</div>
                        
                        <div className="md:col-span-1">{renderField('product_barcode', "Barcode")}</div>
                        <div className="md:col-span-1">{renderField('vendor_product_id', "Vendor Code")}</div>
                        
                        {/* Image Upload */}
                        <div className="md:col-span-2 flex flex-col gap-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase">Product Image</Label>
                            <div className="flex items-center gap-4 mt-1">
                                {formData.product_image ? (
                                    <div className="flex items-center gap-2 border p-2 rounded-md bg-white">
                                        <ImageIcon className="w-4 h-4 text-slate-500"/>
                                        <span className="text-xs text-slate-600 font-medium">Image Set</span>
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-6 px-2 text-blue-600 hover:text-blue-800"
                                            onClick={() => window.open(formData.product_image, '_blank')}
                                            title="Open image in new tab"
                                        >
                                            <Eye className="w-4 h-4 mr-1" /> Preview
                                        </Button>
                                        <button 
                                            onClick={() => handleFormChange('product_image', '')}
                                            className="text-red-500 hover:text-red-700 ml-1"
                                            title="Remove image"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                        <ImageIcon className="w-4 h-4" /> No image
                                    </div>
                                )}
                                <label className="cursor-pointer bg-white border border-slate-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-50 shadow-sm flex items-center gap-2">
                                    <Upload className="w-4 h-4 text-slate-500"/>
                                    <span>Upload</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Pricing */}
                <div className="border p-4 rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-600" /> Pricing & Unit Configuration
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Cost & Specs</div>
                            {renderField('buy_price')}
                            {renderField('gst')}
                            <div className="grid grid-cols-2 gap-2">
                                {renderField('default_unit_id')}
                                {/* ✅ [MODIFIED] Disable if not carton */}
                                {renderField('total_pack_ctn', 'Packs in Ctn', '', !isCarton)}
                            </div>
                        </div>
                        {/* Carton Pricing - Disable if not Carton */}
                        <div className={`p-4 rounded-lg border space-y-4 ${!isCarton ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-indigo-50/50 border-indigo-100'}`}>
                            <div className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-2 ${!isCarton ? 'text-slate-400' : 'text-indigo-700'}`}>
                                <Package className="w-3 h-3"/> Carton (CTN)
                            </div>
                            {renderField('sell_price_ctn', 'Price (Ctn)', 'bg-white', !isCarton)}
                            {renderField('margin_ctn', 'Margin %', 'bg-white', !isCarton)}
                        </div>
                        {/* Dynamic Unit Header */}
                        <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100 space-y-4">
                            <div className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                                <Package className="w-3 h-3"/> {selectedUnitName}
                            </div>
                            {renderField('sell_price_pack', `Price (${selectedUnitName})`, 'bg-white')}
                            {renderField('margin_pack', 'Margin %', 'bg-white')}
                        </div>
                    </div>
                </div>

                {/* Section 3: Inventory */}
                <div className="border p-4 rounded-xl bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Inventory Control
                    </h3>
                    <div className="grid grid-cols-3 gap-4 max-w-2xl">
                        {/* ✅ [MODIFIED] Disable Current Stock (CTN) if not carton */}
                        {renderField('current_stock_level', 'Current Stock (CTN)', '', !isCarton)}
                        {renderField('current_stock_level_pack', `Current Stock (${selectedUnitName})`)}
                        {renderField('min_stock_level', 'Min Stock Level')}
                    </div>
                </div>
            </div>
            <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 text-white min-w-[120px]">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Product
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Low Stock Modal */}
      <Dialog open={isLowStockModalOpen} onOpenChange={setIsLowStockModalOpen}>
        <DialogContent className="max-w-lg">
            <DialogHeader>
                <DialogTitle className="text-red-600 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5"/> Low Stock Alert
                </DialogTitle>
                <DialogDescription>These items are below minimum stock levels.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[300px] overflow-y-auto border rounded-md">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr><th className="p-3">Product</th><th className="p-3 text-center">Current</th><th className="p-3 text-center">Min</th></tr>
                    </thead>
                    <tbody className="divide-y">
                        {lowStockItems.map(item => (
                            <tr key={item.id}>
                                <td className="p-3 font-medium">{item.product_name}</td>
                                <td className="p-3 text-center font-bold text-red-600">{item.current_stock_level}</td>
                                <td className="p-3 text-center text-slate-500">{item.min_stock_level}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <DialogFooter>
                <Button onClick={() => setIsLowStockModalOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5. Customer Usage Modal */}
      <Dialog open={isUseModalOpen} onOpenChange={setIsUseModalOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-600" />
                    Customer Usage (Pricing)
                    <span className="ml-2 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{usageList.length}</span>
                </DialogTitle>
                <DialogDescription>
                    Manage custom discounts for <strong>{currentUsageProduct?.product_name}</strong>.
                </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto border rounded-md my-2">
                {usageLoading ? (
                    <div className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></div>
                ) : usageList.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">No customers are currently linked to this product.</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b">
                            <tr>
                                <th className="p-3">Customer Name</th>
                                <th className="p-3 text-right">Ctn Disc %</th>
                                <th className="p-3 text-right">Pack Disc %</th>
                                <th className="p-3 text-center w-[100px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {usageList.map((item) => {
                                const baseCtn = Number(currentUsageProduct?.sell_price_ctn) || 0;
                                const discCtn = Number(item.custom_price_ctn) || 0;
                                const finalCtn = baseCtn - (baseCtn * (discCtn / 100));

                                const basePack = Number(currentUsageProduct?.sell_price_pack) || 0;
                                const discPack = Number(item.custom_price_pack) || 0;
                                const finalPack = basePack - (basePack * (discPack / 100));

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50/50">
                                        <td className="p-3">
                                            <div className="font-bold text-slate-800">{item.customers?.name}</div>
                                            <div className="text-xs text-slate-400">{item.customers?.company}</div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-1">
                                                    <Input 
                                                        type="number" 
                                                        step="0.01" 
                                                        className="w-20 h-8 text-right bg-white" 
                                                        value={item.custom_price_ctn || 0} 
                                                        onChange={(e) => handleUpdateUsage(item.id, 'custom_price_ctn', e.target.value)}
                                                        onBlur={(e) => handleUpdateUsage(item.id, 'custom_price_ctn', toFixed2(e.target.value).toString())}
                                                    />
                                                    <span className="text-slate-400 text-xs">%</span>
                                                </div>
                                                <div className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1 rounded flex items-center gap-1">
                                                    <Calculator className="w-3 h-3"/> ${finalCtn.toFixed(2)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-1">
                                                    <Input 
                                                        type="number" 
                                                        step="0.01" 
                                                        className="w-20 h-8 text-right bg-white" 
                                                        value={item.custom_price_pack || 0} 
                                                        onChange={(e) => handleUpdateUsage(item.id, 'custom_price_pack', e.target.value)}
                                                        onBlur={(e) => handleUpdateUsage(item.id, 'custom_price_pack', toFixed2(e.target.value).toString())}
                                                    />
                                                    <span className="text-slate-400 text-xs">%</span>
                                                </div>
                                                <div className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-1 rounded flex items-center gap-1">
                                                    <Calculator className="w-3 h-3"/> ${finalPack.toFixed(2)}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center align-middle">
                                            <div className="flex justify-center gap-1 h-full items-center pt-2">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleSaveUsage(item)}>
                                                    <Save className="w-4 h-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteUsage(item.id)}>
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsUseModalOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}