"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Plus, Search, MoreHorizontal, FileText, 
  Printer, Mail, Edit, Trash2, Loader2, ChevronDown, ChevronUp,
  ArrowRightLeft, Download, UserX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { downloadQuotationPdf, printQuotationPdf } from "@/utils/downloadPdf";
import EmailSendDialog from "@/components/email/EmailSendDialog";

// --- Types ---
interface Quotation {
  id: string;
  quotation_number: string;
  issue_date: string;
  valid_until: string;
  total_amount: number;
  subtotal: number;
  gst_total: number;
  status: string;
  memo: string;
  customer_id: string | null; 
  quotation_to: string | null; 
  created_who: string;
  updated_who: string;
  customers: {
    name: string;
    email?: string;
  } | null;
}

interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export default function QuotationListPage() {
  const supabase = createClient();
  const router = useRouter();
  
  // --- States ---
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState("");
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(20); 
  const [currentPage, setCurrentPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Expand Row State
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [cachedItems, setCachedItems] = useState<Record<string, QuotationItem[]>>({});
  
  // Email State
  const [emailTarget, setEmailTarget] = useState<{
    id: string;
    type: 'quotation';
    customerName: string;
    customerEmail: string;
    docNumber: string;
  } | null>(null);

  // --- Init Data ---
  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.display_name || 
                     user.user_metadata?.full_name || 
                     user.user_metadata?.name ||
                     user.email?.split('@')[0] || 
                     "Unknown";
        setCurrentUserName(name);
      }

      const { data, error } = await supabase
        .from("quotations")
        .select(`
          *,
          customers ( name, email )
        `)
        .order("created_at", { ascending: false });

      if (error) console.error("Error fetching quotations:", error);
      else setQuotations(data || []);
      
      setLoading(false);
    };

    init();
  }, []);

  // --- Filtering Logic ---
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      const searchLower = searchTerm.toLowerCase();
      const customerName = (q.customers?.name || q.quotation_to || "").toLowerCase();
      const qNumber = q.quotation_number?.toLowerCase() || "";
      const matchesSearch = customerName.includes(searchLower) || qNumber.includes(searchLower);

      let matchesDate = true;
      if (startDate || endDate) {
        const qDate = new Date(q.issue_date);
        if (startDate) matchesDate = matchesDate && qDate >= new Date(startDate);
        if (endDate) matchesDate = matchesDate && qDate <= new Date(endDate);
      }
      return matchesSearch && matchesDate;
    });
  }, [quotations, searchTerm, startDate, endDate]);

  const totalItems = filteredQuotations.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage);
  const paginatedData = filteredQuotations.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const openEmailDialog = (q: Quotation) => {
    setEmailTarget({
      id: q.id,
      type: 'quotation',
      customerName: q.customers?.name || q.quotation_to || "Customer",
      customerEmail: q.customers?.email || "",
      docNumber: q.quotation_number || q.id.slice(0, 8),
    });
  };

  // --- Handlers ---
  const handleSelectAll = (checked: boolean) => {
    const idsOnPage = paginatedData.map(q => q.id);
    if (checked) setSelectedIds(Array.from(new Set([...selectedIds, ...idsOnPage])));
    else setSelectedIds(selectedIds.filter(id => !idsOnPage.includes(id)));
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) setSelectedIds([...selectedIds, id]);
    else setSelectedIds(selectedIds.filter(sid => sid !== id));
  };

  const deleteQuotations = async (ids: string[]) => {
    if (!confirm(`Are you sure you want to delete ${ids.length} quotation(s)?`)) return;
    const { error } = await supabase.from("quotations").delete().in("id", ids);
    if (error) alert("Error: " + error.message);
    else {
      alert("Deleted successfully!");
      setSelectedIds([]);
      setQuotations(prev => prev.filter(q => !ids.includes(q.id)));
    }
  };

  const handleConvertToInvoice = async (quotation: Quotation) => {
    if (!quotation.customer_id) {
        alert("Cannot convert to Invoice: This quotation is not linked to a registered customer.");
        return;
    }

    if (!confirm("Are you sure you want to convert this quotation to an Invoice?")) return;

    try {
      const { data: quoteData, error: qError } = await supabase
        .from("quotations")
        .select(`*, quotation_items (*), customers ( name )`)
        .eq("id", quotation.id)
        .single();

      if (qError || !quoteData) throw new Error("Failed to load quotation data");

      const today = new Date().toISOString().split('T')[0];
      
      const { data: newInvoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          customer_id: quoteData.customer_id,
          invoice_to: quoteData.customers?.name || "Unknown Customer", 
          invoice_date: today,
          due_date: today,
          total_amount: quoteData.total_amount,
          subtotal: quoteData.subtotal,
          gst_total: quoteData.gst_total,
          status: "Unpaid",
          created_who: quoteData.created_who, 
          updated_who: currentUserName, 
          memo: `Converted from Quotation #${quoteData.quotation_number}\n${quoteData.memo || ""}`
        })
        .select()
        .single();

      if (invError || !newInvoice) throw invError;

      if (quoteData.quotation_items && quoteData.quotation_items.length > 0) {
        const invoiceItems = quoteData.quotation_items.map((item: any) => ({
          invoice_id: newInvoice.id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          base_price: item.base_price,
          discount: item.discount,
          unit_price: item.unit_price,
          amount: item.amount
        }));

        const { error: itemError } = await supabase.from("invoice_items").insert(invoiceItems);
        if (itemError) throw itemError;
      }

      await supabase.from("quotations").update({ status: "Accepted" }).eq("id", quotation.id);

      alert("Successfully converted to Invoice!");
      router.push("/invoice");

    } catch (e: any) {
      console.error(e);
      alert("Error converting to invoice: " + e.message);
    }
  };

  const toggleRow = async (id: string) => {
    if (expandedRowId === id) {
      setExpandedRowId(null);
      return;
    }
    setExpandedRowId(id);

    if (!cachedItems[id]) {
      const { data, error } = await supabase
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", id);
      
      if (!error && data) {
        setCachedItems(prev => ({ ...prev, [id]: data }));
      }
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
          <p className="text-sm text-slate-500">Manage your estimates and proposals</p>
        </div>
        <Link href="/quotation/new">
          <Button className="bg-slate-900 hover:bg-slate-800 shadow-md">
            <Plus className="w-4 h-4 mr-2" /> New Quotation
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row gap-4 justify-between items-end xl:items-center">
          <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto items-start sm:items-center">
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Show:</span>
               <select 
                className="h-10 px-3 pr-8 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              >
                <option value={5}>5 rows</option>
                <option value={10}>10 rows</option>
                <option value={20}>20 rows</option>
                <option value={10000}>All ({filteredQuotations.length})</option>
              </select>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase pointer-events-none">From</span>
                <Input type="date" className="pl-10 h-10 w-36 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <span className="text-slate-400">-</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase pointer-events-none">To</span>
                <Input type="date" className="pl-8 h-10 w-36 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto items-center justify-end">
            {selectedIds.length > 0 && (
              <Button variant="destructive" className="h-10" onClick={() => deleteQuotations(selectedIds)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.length})
              </Button>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search..." className="pl-9 h-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
              <tr>
                <th className="px-4 py-3 w-[40px]">
                  <Checkbox 
                    checked={paginatedData.length > 0 && paginatedData.every(q => selectedIds.includes(q.id))}
                    onCheckedChange={(c) => handleSelectAll(!!c)}
                  />
                </th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Updated By</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center w-[100px]">View Detail</th>
                <th className="px-4 py-3 text-center w-[50px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="p-8 text-center text-slate-500">Loading quotations...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-slate-500">No quotations found.</td></tr>
              ) : (
                paginatedData.map((quotation) => (
                  <React.Fragment key={quotation.id}>
                    {/* Main Row */}
                    <tr className={`hover:bg-slate-50/80 transition-colors border-b border-slate-50 ${selectedIds.includes(quotation.id) ? 'bg-blue-50/30' : ''} ${expandedRowId === quotation.id ? 'bg-slate-50 border-b-0' : ''}`}>
                      <td className="px-4 py-3">
                        <Checkbox 
                          checked={selectedIds.includes(quotation.id)}
                          onCheckedChange={(c) => handleSelectRow(quotation.id, !!c)}
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{quotation.issue_date}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{quotation.quotation_number}</td>
                      
                      {/* [MODIFIED] Customer Name with Badge */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">
                                {quotation.customers?.name || quotation.quotation_to || <span className="text-slate-400 italic">Unknown</span>}
                            </span>
                            {!quotation.customer_id && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap flex items-center gap-1" title="Unregistered Customer">
                                    Manual
                                </span>
                            )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-900">${quotation.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      
                      <td className="px-4 py-3 text-slate-600 text-xs">{quotation.created_who || "-"}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{quotation.updated_who || "-"}</td>

                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${quotation.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700' : quotation.status === 'Sent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {quotation.status}
                        </span>
                      </td>
                      
                      {/* Toggle Button */}
                      <td className="px-4 py-3 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleRow(quotation.id)} 
                          className={`h-8 w-8 p-0 rounded-full hover:bg-slate-200 ${expandedRowId === quotation.id ? 'bg-slate-200 text-slate-900' : 'text-slate-400'}`}
                        >
                          {expandedRowId === quotation.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            
                            <DropdownMenuItem 
                              disabled={!quotation.customer_id}
                              onClick={() => quotation.customer_id && handleConvertToInvoice(quotation)} 
                              className={`cursor-pointer font-medium focus:bg-blue-50 ${!quotation.customer_id ? 'text-slate-400 opacity-50 cursor-not-allowed' : 'text-blue-700 focus:text-blue-800'}`}
                            >
                              <ArrowRightLeft className="w-4 h-4 mr-2" /> Convert to Invoice
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={() => openEmailDialog(quotation)} className="cursor-pointer">
                              <Mail className="w-4 h-4 mr-2 text-slate-500" /> Email
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => router.push(`/quotation/edit/${quotation.id}`)} className="cursor-pointer">
                              <Edit className="w-4 h-4 mr-2 text-slate-500" /> Edit
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={() => printQuotationPdf(quotation.id)} className="cursor-pointer">
                                <Printer className="w-4 h-4 mr-2 text-slate-500" /> Print
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={() => downloadQuotationPdf(quotation.id)} className="cursor-pointer">
                                <Download className="w-4 h-4 mr-2 text-slate-500" /> Download PDF
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteQuotations([quotation.id])} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* Expanded Detail Row */}
                    {expandedRowId === quotation.id && (
                      <tr className="bg-slate-50/50 animate-in fade-in slide-in-from-top-2 duration-200">
                        <td colSpan={10} className="p-0 border-b border-slate-200">
                          <div className="p-6 pl-14">
                            
                            <div className="flex justify-between items-start mb-4">
                              <div className="text-sm space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-slate-700">Customer Details:</p>
                                    {!quotation.customer_id && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded border border-amber-200">Manual</span>}
                                </div>
                                <p className="text-slate-600">{quotation.customers?.name || quotation.quotation_to}</p>
                                {quotation.customers?.email && <p className="text-slate-500">{quotation.customers?.email}</p>}
                              </div>
                              <div className="text-right space-y-1">
                                <p className="text-xs font-bold text-slate-500 uppercase">Valid Until</p>
                                <p className="text-slate-700 font-medium">{quotation.valid_until}</p>
                              </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                              <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-semibold">
                                  <tr>
                                    <th className="px-4 py-2 text-left">Description</th>
                                    <th className="px-4 py-2 text-center w-20">Unit</th>
                                    <th className="px-4 py-2 text-center w-20">Qty</th>
                                    <th className="px-4 py-2 text-right w-32">Price</th>
                                    <th className="px-4 py-2 text-right w-32">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {!cachedItems[quotation.id] ? (
                                    <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400"/></td></tr>
                                  ) : cachedItems[quotation.id].length === 0 ? (
                                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">No items found.</td></tr>
                                  ) : (
                                    cachedItems[quotation.id].map((item, idx) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 font-medium text-slate-800">{item.description}</td>
                                        <td className="px-4 py-2 text-center text-xs text-slate-500">{item.unit}</td>
                                        <td className="px-4 py-2 text-center text-slate-600">{item.quantity}</td>
                                        <td className="px-4 py-2 text-right text-slate-600">${item.unit_price.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right font-bold text-slate-900">${item.amount.toLocaleString()}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>

                            <div className="mt-4 flex justify-between items-end">
                              <div className="text-sm text-slate-500 max-w-lg">
                                {quotation.memo && (
                                  <div className="bg-amber-50 text-amber-900 px-3 py-2 rounded border border-amber-100">
                                    <span className="font-bold mr-2 text-xs uppercase">Memo:</span>
                                    {quotation.memo}
                                  </div>
                                )}
                              </div>
                              
                              <Button 
                                onClick={() => router.push(`/quotation/edit/${quotation.id}`)}
                                className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm h-9 px-4 text-xs font-bold uppercase tracking-wide"
                              >
                                <Edit className="w-3.5 h-3.5 mr-2" /> Edit Quotation
                              </Button>

                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
              <span className="text-xs text-slate-500">Page {currentPage} of {totalPages} (Total {totalItems})</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>Next</Button>
              </div>
          </div>
        )}
      </div>

      <EmailSendDialog 
        open={!!emailTarget} 
        onOpenChange={(open) => !open && setEmailTarget(null)}
        data={emailTarget as any}
      />
    </div>
  );
}