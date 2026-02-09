"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, Calendar, Save, Trash2, Plus, 
  Search, ChevronDown, Check, Building2, FileText, Loader2,
  Printer, Download, Mail, DollarSign // DollarIcon 추가
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { pdf } from "@react-pdf/renderer";
import PurchaseOrderDocument, { PurchaseOrderData } from "@/components/pdf/PurchaseOrderDocument";
import EmailSendDialog from "@/components/email/EmailSendDialog";

const toFixed2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// ... (SearchableSelect 컴포넌트는 기존과 동일하므로 생략) ...
interface Option { id: string; label: string; subLabel?: string; }
interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}
function SearchableSelect({ options, value, onChange, placeholder, disabled, className, onClick }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    return options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
  }, [options, searchTerm]);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div onClick={() => { if (!disabled) { setIsOpen(!isOpen); if (onClick) onClick(); } }} className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white transition-all ${disabled ? "bg-slate-100 text-slate-400" : "hover:border-slate-400 focus:ring-2 focus:ring-slate-900"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}>
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>{selectedOption ? selectedOption.label : (value ? "Loading..." : placeholder)}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50 shrink-0" />
      </div>
      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1 w-full z-50 bg-white border border-slate-200 rounded-md shadow-xl max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100 z-10"><div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input autoFocus className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></div>
          <div className="p-1">{filteredOptions.map((opt: any) => (<div key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }} className={`flex items-center justify-between px-3 py-2 text-sm rounded-md cursor-pointer ${opt.id === value ? "bg-slate-100 font-bold" : "hover:bg-slate-50"}`}><div className="flex flex-col"><span>{opt.label}</span>{opt.subLabel && <span className="text-[10px] text-slate-400">{opt.subLabel}</span>}</div>{opt.id === value && <Check className="w-3.5 h-3.5" />}</div>))}</div>
        </div>
      )}
    </div>
  );
}

interface Vendor { id: string; vendor_name: string; address?: string; suburb?: string; state?: string; postcode?: string;email?: string; tel?: string; }
interface Product { id: string; product_name: string; buy_price: number; vendor_id?: string; current_stock_level?: number; gst?: boolean; vendor_product_id?: string; } 
interface POItem { productId: string; vendorProductId: string; quantity: number; unitPrice: number; description?: string; gst: boolean; }

export default function NewPurchaseOrderPage() {
  const supabase = createClient();
  const router = useRouter();

  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [poDate, setPoDate] = useState(getTodayLocal());
  const [poNumber, setPoNumber] = useState("Loading..."); 
  const [memo, setMemo] = useState("");
  
  const [isReceived, setIsReceived] = useState(false);
  // [NEW] Update Price State
  const [updatePrice, setUpdatePrice] = useState(false);

  const [items, setItems] = useState<POItem[]>([{ productId: "", vendorProductId: "", quantity: 1, unitPrice: 0, gst: true }]);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogData, setEmailDialogData] = useState<any>(null);

  useEffect(() => {
    const initData = async () => {
      const { data: vData } = await supabase.from("product_vendors").select("id, vendor_name, address, email, tel").order("vendor_name");
      if (vData) setVendors(vData);
      const { data: pData } = await supabase.from("products").select("id, product_name, buy_price, vendor_id, current_stock_level, gst, vendor_product_id"); 
      if (pData) setAllProducts(pData);
      const { data: cData } = await supabase.from("company_settings").select("*").single();
      if (cData) setCompanySettings(cData);
      const { data: lastPO } = await supabase.from("purchase_orders").select("po_number").order("created_at", { ascending: false }).limit(1).single();
      let nextNumber = "PO-000001";
      if (lastPO && lastPO.po_number) {
        const lastNumStr = lastPO.po_number.replace("PO-", ""); const lastNum = parseInt(lastNumStr, 10); if (!isNaN(lastNum)) nextNumber = `PO-${String(lastNum + 1).padStart(6, "0")}`; 
      }
      setPoNumber(nextNumber);
    };
    initData();
  }, []);

  useEffect(() => {
    if (!selectedVendorId) { setFilteredProducts([]); return; }
    const filtered = allProducts.filter(p => !p.vendor_id || p.vendor_id === selectedVendorId);
    setFilteredProducts(filtered);
  }, [selectedVendorId, allProducts]);

  const handleProductChange = (index: number, productId: string) => {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    const newItems = [...items];
    newItems[index] = { ...newItems[index], productId, vendorProductId: product.vendor_product_id || "", unitPrice: product.buy_price || 0, description: product.product_name, gst: product.gst ?? true };
    setItems(newItems);
  };
  const updateItem = (index: number, field: keyof POItem, value: any) => { const newItems = [...items]; newItems[index] = { ...newItems[index], [field]: value }; setItems(newItems); };
  const removeItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };
  const addItem = () => { setItems([...items, { productId: "", vendorProductId: "", quantity: 1, unitPrice: 0, gst: true }]); };
  const handleProductClick = (index: number) => { if (index === items.length - 1) addItem(); };

  const subTotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const gstTotal = items.reduce((sum, item) => item.gst ? sum + (item.quantity * item.unitPrice * 0.1) : sum, 0);
  const grandTotal = subTotal + gstTotal;

  const preparePdfData = (): PurchaseOrderData => {
    const vendor = vendors.find(v => v.id === selectedVendorId);
    return {
        poNumber, date: poDate,
        companyName: companySettings?.company_name || "KLEAN KING",
        companyAddress1: companySettings?.address_line1 || "",
        companyAddress2: companySettings?.address_line2 || "",
        companySuburb: companySettings?.suburb || "",
        companyState: companySettings?.state || "",
        companyPostcode: companySettings?.postcode || "",
        companyPhone: companySettings?.phone || "",
        companyEmail: companySettings?.email || "",
        companyAbn: companySettings?.abn || "",
        vendorName: vendor?.vendor_name || "Unknown",
        vendorAddress: vendor?.address || "",
        vendorSuburb: vendor?.suburb || "",     
        vendorState: vendor?.state || "",       
        vendorPostcode: vendor?.postcode || "", 
        vendorPhone: vendor?.tel || "", 
        vendorEmail: vendor?.email || "",
        shipToName: companySettings?.company_name || "Warehouse",
        shipToAddress: [companySettings?.address_line1, companySettings?.suburb, companySettings?.state].filter(Boolean).join(", ") || "",
        items: items.filter(i => i.productId).map(i => {
            const productInfo = allProducts.find(p => p.id === i.productId);
            return { description: i.description || "Item", vendorProductId: productInfo?.vendor_product_id, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.quantity * i.unitPrice, gst: i.gst };
        }),
        subtotal: subTotal, gstTotal: gstTotal, grandTotal: grandTotal, memo: memo
    };
  };

  const generateAndDownloadPDF = async () => { const data = preparePdfData(); const blob = await pdf(<PurchaseOrderDocument data={data} />).toBlob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `PO_${poNumber}.pdf`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); };
  const generateAndPrintPDF = async () => { const data = preparePdfData(); const blob = await pdf(<PurchaseOrderDocument data={data} />).toBlob(); const url = URL.createObjectURL(blob); window.open(url, '_blank'); };

  const handlePdf = () => handleSubmit('pdf');
  const handlePrint = () => handleSubmit('print');
  const handleEmail = () => handleSubmit('email');

  const handleSubmit = async (actionType?: 'pdf' | 'print' | 'email') => {
    if (!selectedVendorId) return alert("Please select a vendor.");
    setLoading(true);
    try {
      const { data: po, error: poError } = await supabase.from("purchase_orders").insert({
        vendor_id: selectedVendorId, po_number: poNumber, po_date: poDate, total_amount: toFixed2(grandTotal), status: isReceived ? "Done" : "Pending", memo: memo
      }).select().single();
      if (poError || !po) throw poError || new Error("Failed to create PO");

      const validItems = items.filter(i => i.productId);
      if (validItems.length > 0) {
        const itemsPayload = validItems.map(item => ({
          po_id: po.id, product_id: item.productId, description: item.description, quantity: item.quantity, unit_price: toFixed2(item.unitPrice), amount: toFixed2(item.quantity * item.unitPrice)
        }));
        const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemsPayload);
        if (itemsError) throw itemsError;

        // [NEW] Logic Loop
        for (const item of validItems) {
            // 1. Stock Update (if Received)
            if (isReceived) {
                const product = allProducts.find(p => p.id === item.productId);
                const currentStock = product?.current_stock_level || 0;
                const newStock = currentStock + Number(item.quantity);
                await supabase.from("products").update({ current_stock_level: newStock }).eq("id", item.productId);
            }
            
            // 2. [NEW] Price Update (if Checked)
            if (updatePrice) {
                await supabase.from("products").update({ buy_price: item.unitPrice }).eq("id", item.productId);
            }
        }
      }

      if (actionType === 'pdf') await generateAndDownloadPDF();
      else if (actionType === 'print') await generateAndPrintPDF();
      else if (actionType === 'email') {
        const vendor = vendors.find(v => v.id === selectedVendorId);
        setEmailDialogData({ id: po.id, type: 'purchase-order', customerName: vendor?.vendor_name || "", customerEmail: vendor?.email || "", docNumber: poNumber });
        setEmailDialogOpen(true);
        setLoading(false); return; 
      } else { alert(isReceived ? "Order saved, stock updated!" : "Purchase Order saved!"); }

      router.push("/product/purchase");
    } catch (e: any) { console.error(e); alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const vendorOptions = useMemo(() => vendors.map(v => ({ id: v.id, label: v.vendor_name })), [vendors]);
  const productOptions = useMemo(() => filteredProducts.map(p => ({
    id: p.id, label: p.product_name, subLabel: `VPID: ${p.vendor_product_id || '-'} | Buy: $${p.buy_price.toFixed(2)}`
  })), [filteredProducts]);

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-24">
      <EmailSendDialog open={emailDialogOpen} onOpenChange={(open) => { setEmailDialogOpen(open); if(!open) router.push("/product/purchase"); }} data={emailDialogData} />
      <div className="flex items-center gap-4"><Link href="/product/purchase"><Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5 text-slate-600" /></Button></Link><h1 className="text-2xl font-bold text-slate-900">New Purchase Order</h1></div>
      
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Vendor</label><SearchableSelect options={vendorOptions} value={selectedVendorId} onChange={setSelectedVendorId} placeholder="Select Vendor..." /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> PO Date</label><Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} /></div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> PO Number</label><Input value={poNumber} readOnly className="bg-slate-100 text-slate-500" /></div>
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr><th className="px-4 py-3 w-[35%]">Product</th><th className="px-4 py-3 w-[15%]">Item Code</th><th className="px-4 py-3 w-[10%] text-right">Cost</th><th className="px-4 py-3 w-[10%] text-center">Qty</th><th className="px-4 py-3 w-[10%] text-center">GST</th><th className="px-4 py-3 w-[15%] text-right">Subtotal</th><th className="w-[5%]"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 relative"><div style={{ zIndex: 10 + (items.length - idx), position: 'relative' }}><SearchableSelect options={productOptions} value={item.productId} onChange={(val) => handleProductChange(idx, val)} placeholder="Select product..." className="w-full" onClick={() => handleProductClick(idx)} disabled={!selectedVendorId} /></div></td>
                      <td className="p-2"><Input value={item.vendorProductId || ""} readOnly className="bg-slate-50 text-slate-500 border-none h-9" placeholder="-"/></td>
                      <td className="p-2"><Input type="number" className="text-right h-9" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))} onBlur={(e) => updateItem(idx, "unitPrice", toFixed2(Number(e.target.value)))}/></td>
                      <td className="p-2"><Input type="number" min="1" className="text-center h-9" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} /></td>
                      <td className="p-2 text-center"><Checkbox checked={item.gst} onCheckedChange={(c) => updateItem(idx, "gst", !!c)} /></td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">${(item.quantity * item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-center"><button onClick={() => removeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 p-2 border-t border-slate-200"><Button variant="ghost" size="sm" onClick={addItem} className="text-slate-600 hover:text-slate-900 w-full"><Plus className="w-4 h-4 mr-2" /> Add Item</Button></div>
            </div>
            <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Memo</label><Textarea placeholder="Internal notes..." className="resize-none h-20 bg-slate-50" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
            <h3 className="font-bold text-slate-900">Order Summary</h3>
            <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-sm text-slate-600"><span>Total GST</span><span>${gstTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between font-black text-slate-900 pt-3 border-t border-dashed border-slate-200 text-lg"><span>Total Cost</span><span>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            </div>
            
            {/* [NEW] Update Price Checkbox */}
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-center gap-3 mt-2">
                <Checkbox id="updatePrice" checked={updatePrice} onCheckedChange={(c) => setUpdatePrice(!!c)} className="border-blue-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"/>
                <label htmlFor="updatePrice" className="text-sm font-bold text-blue-800 cursor-pointer select-none">
                    Update Price
                    <span className="block text-[10px] text-blue-600 font-normal">Update product master buy price</span>
                </label>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center gap-3 mt-2">
                <Checkbox id="markReceived" checked={isReceived} onCheckedChange={(c) => setIsReceived(!!c)} className="border-emerald-500 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"/>
                <label htmlFor="markReceived" className="text-sm font-bold text-emerald-800 cursor-pointer select-none">Mark as Received<span className="block text-[10px] text-emerald-600 font-normal">Update stock levels & set status to 'Done'</span></label>
            </div>
            <div className="space-y-3 mt-4">
              <Button onClick={() => handleSubmit()} disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 h-10 font-bold shadow-md">{loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2"/> Saving...</> : <><Save className="w-4 h-4 mr-2" /> Save</>}</Button>
              <Link href="/product/purchase" className="block"><Button variant="ghost" className="w-full text-slate-500 h-10">Cancel</Button></Link>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
                <Button variant="outline" size="sm" disabled={loading} className="flex flex-col h-14 gap-1 text-xs border-slate-200 hover:bg-slate-50 text-slate-600" onClick={handlePdf}><Download className="w-4 h-4" /> PDF</Button>
                <Button variant="outline" size="sm" disabled={loading} className="flex flex-col h-14 gap-1 text-xs border-slate-200 hover:bg-slate-50 text-slate-600" onClick={handlePrint}><Printer className="w-4 h-4" /> Print</Button>
                <Button variant="outline" size="sm" disabled={loading} className="flex flex-col h-14 gap-1 text-xs border-slate-200 hover:bg-slate-50 text-slate-600" onClick={handleEmail}><Mail className="w-4 h-4" /> Email</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}