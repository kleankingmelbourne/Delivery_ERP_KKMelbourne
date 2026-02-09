"use client";

import { useEffect, useState, Fragment } from "react";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Plus, Search, Calendar, MoreHorizontal, Trash2, 
  Download, Printer, Mail, Edit, Loader2, X, ChevronDown, ChevronUp, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

import { downloadPurchaseOrderPdf, printPurchaseOrderPdf } from "@/utils/downloadPdf";
import EmailSendDialog from "@/components/email/EmailSendDialog";

export default function PurchaseOrderListPage() {
  const supabase = createClient();
  const router = useRouter();
  
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDialogData, setEmailDialogData] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(`
        *, 
        product_vendors(vendor_name, email),
        purchase_order_items (
            id, quantity, unit_price, amount, description,
            products ( product_name, vendor_product_id )
        )
      `) 
      .order("created_at", { ascending: false });

    if (!error && data) setOrders(data);
    setLoading(false);
  };

  const filteredOrders = orders.filter((po) => 
    po.product_vendors?.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (po.po_number && po.po_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = filteredOrders.map((o) => o.id);
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) setSelectedIds((prev) => [...prev, id]);
    else setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} orders?`)) return;

    setLoading(true);
    try {
        const { error } = await supabase.from("purchase_orders").delete().in("id", selectedIds);
        if (error) throw error;
        setOrders((prev) => prev.filter((o) => !selectedIds.includes(o.id)));
        setSelectedIds([]);
        alert("Deleted successfully.");
    } catch (e: any) {
        console.error(e);
        alert("Failed to delete: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Purchase Order?")) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (!error) {
      setOrders(orders.filter(o => o.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      alert("Failed to delete order.");
    }
  };

  const toggleRow = (id: string) => {
    if (expandedOrderId === id) {
        setExpandedOrderId(null); 
    } else {
        setExpandedOrderId(id); 
    }
  };

  const handleDownload = async (id: string) => {
    setActionLoading(id);
    await downloadPurchaseOrderPdf(id);
    setActionLoading(null);
  };

  const handlePrint = async (id: string) => {
    setActionLoading(id);
    await printPurchaseOrderPdf(id);
    setActionLoading(null);
  };

  const handleEmail = (po: any) => {
    const vendorName = po.product_vendors?.vendor_name || "Vendor";
    const vendorEmail = po.product_vendors?.email || "";
    setEmailDialogData({
      id: po.id,
      type: 'purchase-order',
      customerName: vendorName,
      customerEmail: vendorEmail,
      docNumber: po.po_number
    });
    setEmailDialogOpen(true);
  };

  // [NEW] Status Color Helper
  const getStatusStyle = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === 'done' || s === 'received') return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (s === 'pending') return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-600 border-slate-200";
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <EmailSendDialog 
        open={emailDialogOpen} 
        onOpenChange={setEmailDialogOpen} 
        data={emailDialogData} 
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Orders</h1>
          <p className="text-sm text-slate-500">Manage supplier orders and procurement.</p>
        </div>
        
        <div className="flex gap-2">
            {selectedIds.length > 0 && (
                <Button variant="destructive" onClick={handleBulkDelete} className="animate-in fade-in zoom-in duration-200">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.length})
                </Button>
            )}
            <Link href="/product/purchase/new">
                <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md">
                    <Plus className="w-4 h-4 mr-2" /> New Purchase Order
                </Button>
            </Link>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search vendor or PO #..." 
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {selectedIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="text-slate-500">
                <X className="w-4 h-4 mr-2" /> Clear Selection
            </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
            <tr>
              {/* Checkbox Col */}
              <th className="px-4 py-4 w-10 text-center">
                <Checkbox 
                    checked={filteredOrders.length > 0 && selectedIds.length === filteredOrders.length}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </th>
              {/* Columns Reordered */}
              <th className="px-6 py-4">PO Number</th>
              <th className="px-6 py-4">Vendor</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Total</th>
              {/* [NEW] View Detail Column moved here */}
              <th className="px-4 py-4 w-10 text-center">View</th> 
              <th className="px-6 py-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="p-10 text-center text-slate-400"><div className="flex justify-center items-center gap-2"><Loader2 className="animate-spin w-4 h-4"/> Loading orders...</div></td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center text-slate-400">No purchase orders found.</td></tr>
            ) : (
              filteredOrders.map((po) => (
                <Fragment key={po.id}>
                    {/* Main Row */}
                    <tr 
                        className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(po.id) ? "bg-slate-50" : ""} ${expandedOrderId === po.id ? "bg-slate-50 border-b-0" : ""}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <Checkbox 
                            checked={selectedIds.includes(po.id)}
                            onCheckedChange={(checked) => handleSelectRow(po.id, !!checked)}
                        />
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-700 cursor-pointer" onClick={() => toggleRow(po.id)}>
                        {po.po_number || <span className="text-slate-400 italic">Auto-generated</span>}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {po.product_vendors?.vendor_name || "Unknown Vendor"}
                      </td>
                      <td className="px-6 py-4 text-slate-500 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" /> {po.po_date}
                      </td>
                      <td className="px-6 py-4">
                        {/* [UPDATE] Status with Color */}
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyle(po.status)}`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        ${Number(po.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      
                      {/* [NEW] Expand Toggle Button Moved Here (Left of Action) */}
                      <td className="px-4 py-4 text-center">
                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-slate-200" onClick={() => toggleRow(po.id)}>
                            {expandedOrderId === po.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </Button>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-200">
                              {actionLoading === po.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <MoreHorizontal className="w-4 h-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => router.push(`/product/purchase/edit/${po.id}`)}>
                              <Edit className="w-4 h-4 mr-2 text-slate-500" /> Edit Order
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDownload(po.id)}>
                              <Download className="w-4 h-4 mr-2 text-slate-500" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrint(po.id)}>
                              <Printer className="w-4 h-4 mr-2 text-slate-500" /> Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEmail(po)}>
                              <Mail className="w-4 h-4 mr-2 text-slate-500" /> Send Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(po.id)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* Expanded Detail Row */}
                    {expandedOrderId === po.id && (
                        <tr className="bg-slate-50/50">
                            <td colSpan={8} className="p-0 border-t border-dashed border-slate-200">
                                <div className="p-6 pl-16 pr-10 animate-in slide-in-from-top-2 duration-200">
                                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <Package className="w-4 h-4 text-slate-500" /> Order Items
                                            </h4>
                                            <span className="text-xs text-slate-400">ID: {po.id}</span>
                                        </div>
                                        <table className="w-full text-sm">
                                            <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                                                <tr>
                                                    <th className="px-4 py-2 text-left w-[40%]">Product</th>
                                                    <th className="px-4 py-2 text-center w-[15%]">Vendor ID</th>
                                                    <th className="px-4 py-2 text-center w-[10%]">Qty</th>
                                                    <th className="px-4 py-2 text-right w-[15%]">Unit Cost</th>
                                                    <th className="px-4 py-2 text-right w-[20%]">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {po.purchase_order_items && po.purchase_order_items.length > 0 ? (
                                                    po.purchase_order_items.map((item: any) => (
                                                        <tr key={item.id} className="hover:bg-slate-50">
                                                            <td className="px-4 py-2 font-medium text-slate-700">
                                                                {item.description || item.products?.product_name || "Unknown Item"}
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-slate-500 font-mono text-xs">
                                                                {item.products?.vendor_product_id || "-"}
                                                            </td>
                                                            <td className="px-4 py-2 text-center">{item.quantity}</td>
                                                            <td className="px-4 py-2 text-right">${Number(item.unit_price).toLocaleString()}</td>
                                                            <td className="px-4 py-2 text-right font-bold">${Number(item.amount).toLocaleString()}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan={5} className="text-center py-4 text-slate-400 text-xs italic">No items found.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            <tfoot className="border-t border-slate-200">
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-3 text-right font-bold text-slate-600">Grand Total</td>
                                                    <td className="px-4 py-3 text-right font-bold text-slate-900">${Number(po.total_amount).toLocaleString()}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                        {po.memo && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                                                <span className="font-bold mr-2">Memo:</span> {po.memo}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>
                        </tr>
                    )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}