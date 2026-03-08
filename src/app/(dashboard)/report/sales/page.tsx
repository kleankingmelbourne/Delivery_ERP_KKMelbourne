"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Calendar, Search, Filter, RefreshCw, 
  TrendingUp, DollarSign, Package, CreditCard,
  ChevronDown, Check, ChevronUp, Layers, Users, Download,
  ArrowUp, ArrowDown, ArrowUpDown 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// --- [Utility] Searchable Select ---
interface Option { id: string; label: string; }
interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
function SearchableSelect({ options, value, onChange, placeholder = "Select..." }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-sm border border-slate-200 rounded-md cursor-pointer bg-white hover:border-slate-400"
      >
        <span className={selected ? "text-slate-900 font-medium truncate" : "text-slate-400 truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto p-1">
          <div className="sticky top-0 bg-white pb-1 border-b border-slate-100 mb-1">
            <input
              autoFocus
              className="w-full px-2 py-1 text-sm outline-none placeholder:text-slate-300"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div 
            onClick={() => { onChange(""); setIsOpen(false); setSearchTerm(""); }}
            className="px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer rounded"
          >
            All (Clear Selection)
          </div>
          {filtered.map(opt => (
            <div 
              key={opt.id}
              onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }}
              className={`px-2 py-1.5 text-sm cursor-pointer rounded flex justify-between items-center ${opt.id === value ? "bg-slate-100 font-bold" : "hover:bg-slate-50"}`}
            >
              <span className="truncate pr-2">{opt.label}</span>
              {opt.id === value && <Check className="w-3.5 h-3.5 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Types ---
// 🚀 [수정] 순수매출(Net)과 총매출(Gross, GST포함)을 구분합니다.
interface ReportSummary {
  totalNetSales: number;
  totalGrossSales: number;
  totalCost: number;
  totalProfit: number;
  totalQty: number;
  itemCount: number;
}

interface DetailRow {
  subKey: string;
  subName: string;
  unit: string; 
  lastDate: string;
  qty: number;
  amount: number;
  cost: number;
  profit: number;
}

interface GroupedData {
  id: string;
  name: string;
  totalQty: number;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  details: DetailRow[];
  detailsMap: Map<string, DetailRow>;
}

// Sort Configuration Interface
interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

export default function SalesReportPage() {
  const supabase = createClient();
  
  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [groupBy, setGroupBy] = useState<"item" | "customer">("item");

  // Data
  const [products, setProducts] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);

  // Result
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [groupedList, setGroupedList] = useState<GroupedData[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Sort States (Main & Detail)
  const [mainSortConfig, setMainSortConfig] = useState<SortConfig>({ key: "name", direction: "asc" });
  const [detailSortConfig, setDetailSortConfig] = useState<SortConfig>({ key: "subName", direction: "asc" });

  // 1. Init
  useEffect(() => {
    const loadFilters = async () => {
      const { data: prodData } = await supabase
        .from("products")
        .select("id, product_name")
        .eq("is_active", true) 
        .order("product_name");
        
      if (prodData) setProducts(prodData.map(p => ({ id: p.id, label: p.product_name })));

      const { data: custData } = await supabase.from("customers").select("id, name").order("name");
      if (custData) setCustomers(custData.map(c => ({ id: c.id, label: c.name })));
    };
    loadFilters();
  }, [supabase]);

  // 2. Toggle Row
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Sort Handlers
  const handleMainSort = (key: string) => {
    setMainSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const handleDetailSort = (key: string) => {
    setDetailSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  // 3. Generate Report
  const handleGenerateReport = async () => {
    if (!startDate || !endDate) return alert("Please select a date range.");

    setLoading(true);
    setHasSearched(true);
    setSummary(null);
    setGroupedList([]);
    setExpandedRows({});

    try {
      let query = supabase
        .from("invoice_items")
        .select(`
          quantity, amount, product_id, description, unit,
          invoices!inner ( id, invoice_date, customer_id, customers ( name ) ),
          products ( id, product_name, buy_price, total_pack_ctn ) 
        `)
        .gte("invoices.invoice_date", startDate)
        .lte("invoices.invoice_date", endDate);

      if (selectedProductId) query = query.eq("product_id", selectedProductId);
      if (selectedCustomerId) query = query.eq("invoices.customer_id", selectedCustomerId);

      const { data, error } = await query;
      if (error) throw error;

      let totalSales = 0, totalCost = 0, totalQty = 0;
      const groupMap = new Map<string, GroupedData>();

      if (data) {
        data.forEach((item: any) => {
          const itemQty = Number(item.quantity) || 0;
          const itemAmount = Number(item.amount) || 0; // 순수 매출(Subtotal)
          const invoiceUnit = item.unit || "-"; 
          
          let unitCost = Number(item.products?.buy_price) || 0;
          const upperUnit = invoiceUnit.toUpperCase();
          if (!upperUnit.includes("CTN") && !upperUnit.includes("CARTON") && !upperUnit.includes("BOX")) {
            const packsPerCtn = Math.max(1, Number(item.products?.total_pack_ctn) || 1); 
            unitCost = unitCost / packsPerCtn;
          }

          const itemCost = unitCost * itemQty;
          const itemProfit = itemAmount - itemCost;

          totalSales += itemAmount;
          totalCost += itemCost;
          totalQty += itemQty;

          const isByItem = groupBy === "item";
          
          const groupKey = isByItem 
            ? `${item.products?.id || "unknown-prod"}_${invoiceUnit}`
            : (item.invoices?.customer_id || "unknown-cust");
          
          const groupName = isByItem 
            ? `${item.products?.product_name || item.description || "Unknown Product"} (${invoiceUnit})`
            : (item.invoices?.customers?.name || "Unknown Customer");

          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
              id: groupKey, name: groupName,
              totalQty: 0, totalSales: 0, totalCost: 0, totalProfit: 0,
              details: [], detailsMap: new Map()
            });
          }

          const group = groupMap.get(groupKey)!;
          group.totalQty += itemQty;
          group.totalSales += itemAmount;
          group.totalCost += itemCost;
          group.totalProfit += itemProfit;
          
          const subKey = isByItem 
            ? (item.invoices?.customer_id || "unknown-cust")
            : `${item.products?.id || "unknown-prod"}_${invoiceUnit}`;
            
          const subName = isByItem 
            ? (item.invoices?.customers?.name || "Unknown Customer")
            : (item.products?.product_name || item.description);
            
          const date = item.invoices?.invoice_date;

          if (!group.detailsMap.has(subKey)) {
            group.detailsMap.set(subKey, {
              subKey, subName, unit: invoiceUnit, lastDate: date,
              qty: 0, amount: 0, cost: 0, profit: 0
            });
          }

          const detail = group.detailsMap.get(subKey)!;
          detail.qty += itemQty;
          detail.amount += itemAmount;
          detail.cost += itemCost;
          detail.profit += itemProfit;
          if (date > detail.lastDate) detail.lastDate = date; 
        });
      }

      const finalGroupList = Array.from(groupMap.values()).map(group => {
        group.details = Array.from(group.detailsMap.values());
        return group;
      });

      // 🚀 [수정] Net Sales와 Gross Sales(10% 부가세 포함)를 구분해서 Summary에 저장
      setSummary({
        totalNetSales: totalSales,
        totalGrossSales: totalSales * 1.1, // 인보이스 Total Amount와 동일해짐
        totalCost: totalCost,
        totalProfit: totalSales - totalCost,
        totalQty: totalQty,
        itemCount: data?.length || 0
      });
      
      setGroupedList(finalGroupList);

    } catch (e: any) {
      console.error(e);
      alert("Error generating report: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Excel Download ---
  const handleDownloadExcel = () => {
    if (groupedList.length === 0) return alert("No data to export.");

    const rows: any[] = [];

    groupedList.forEach(group => {
      group.details.forEach(detail => {
        const row: any = {
          "Group Type": groupBy === "item" ? "Product" : "Customer",
          "Group Name": group.name, 
          "Detail Type": groupBy === "item" ? "Customer" : "Product",
          "Detail Name": detail.subName, 
          "Unit": detail.unit,
          "Last Date": detail.lastDate,
          "Quantity": detail.qty,
          "Net Sales ($)": detail.amount,             // 🚀 엑셀 컬럼명 수정
          "Gross Sales ($)": detail.amount * 1.1,     // 🚀 Gross 엑셀에도 추가
          "Cost ($)": detail.cost,
          "Profit ($)": detail.profit,
          "Margin (%)": detail.amount > 0 ? ((detail.profit / detail.amount) * 100).toFixed(2) : "0.00"
        };
        rows.push(row);
      });
    });

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Sales Report"], 
      ["Period:", startDate, "~", endDate],
      [] // A3 공백
    ]);

    XLSX.utils.sheet_add_json(worksheet, rows, { origin: "A3", skipHeader: false });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Data");

    const wscols = [
      { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 40 }, { wch: 8 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
    ];
    worksheet["!cols"] = wscols;

    XLSX.writeFile(workbook, `SalesReport_${startDate}_${endDate}.xlsx`);
  };

  // Reusable Sortable Header Component
  const SortableHeader = ({ 
    label, 
    sortKey, 
    currentSort,
    onSort,
    align = "left", 
    className 
  }: { 
    label: string, 
    sortKey: string, 
    currentSort: SortConfig,
    onSort: (key: string) => void,
    align?: "left"|"right", 
    className?: string 
  }) => {
    const isActive = currentSort.key === sortKey;
    return (
      <th 
        className={cn(
          "py-2 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none group", 
          align === "right" ? "text-right" : "text-left",
          className
        )}
        onClick={() => onSort(sortKey)}
      >
        <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
          {label}
          <span className="text-slate-400">
            {isActive ? (
              currentSort.direction === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
            )}
          </span>
        </div>
      </th>
    );
  };

  // Main Data Sorting Logic
  const sortedGroupedList = [...groupedList].sort((a, b) => {
    let valA: any = (a as any)[mainSortConfig.key];
    let valB: any = (b as any)[mainSortConfig.key];

    if (mainSortConfig.key === "margin") {
      valA = a.totalSales > 0 ? (a.totalProfit / a.totalSales) : 0;
      valB = b.totalSales > 0 ? (b.totalProfit / b.totalSales) : 0;
    }

    if (typeof valA === "string" && typeof valB === "string") {
      return mainSortConfig.direction === "asc" 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    }

    if (valA < valB) return mainSortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return mainSortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-8 pb-20">
      
      {/* 1. Header & Download Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            Sales Report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Analyze your sales performance, costs, and profits.
          </p>
        </div>
        
        {hasSearched && groupedList.length > 0 && (
          <Button 
            onClick={handleDownloadExcel} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      {/* 2. Configuration */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
        <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
          <Filter className="w-4 h-4" /> Configuration
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Group By</label>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setGroupBy("item")} className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all", groupBy === "item" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <Layers className="w-3.5 h-3.5" /> By Item
              </button>
              <button onClick={() => setGroupBy("customer")} className={cn("flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all", groupBy === "customer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <Users className="w-3.5 h-3.5" /> By Customer
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">Start Date <span className="text-red-500">*</span></label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">End Date <span className="text-red-500">*</span></label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="lg:col-span-1 pt-1">
            <Button onClick={handleGenerateReport} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />} Generate Report
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
           <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">Filter Product (Optional)</label>
            <SearchableSelect options={products} value={selectedProductId} onChange={setSelectedProductId} placeholder="All Products" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">Filter Customer (Optional)</label>
            <SearchableSelect options={customers} value={selectedCustomerId} onChange={setSelectedCustomerId} placeholder="All Customers" />
          </div>
        </div>
      </div>

      {/* 3. Results */}
      {!hasSearched ? (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Calendar className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Please select criteria to generate the report.</p>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 🚀 [수정] Net Sales 아래에 Gross Sales 표시 박스 추가 */}
            <Card className="border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Net Sales (ex GST) <DollarSign className="w-4 h-4 text-blue-500" /></CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900">${summary?.totalNetSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="mt-1.5 inline-flex bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 border border-slate-200">
                  Gross: ${summary?.totalGrossSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-400 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Total Cost <CreditCard className="w-4 h-4 text-red-400" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-black text-slate-900">${summary?.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-emerald-50/30"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-700 uppercase flex justify-between">Net Profit <TrendingUp className="w-4 h-4 text-emerald-600" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-black text-emerald-700">${summary?.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><p className="text-xs text-emerald-600 font-medium mt-1">Margin: {summary && summary.totalNetSales > 0 ? ((summary.totalProfit / summary.totalNetSales) * 100).toFixed(1) : 0}%</p></CardContent></Card>
            <Card className="border-l-4 border-l-slate-500 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500 uppercase flex justify-between">Total Qty <Package className="w-4 h-4 text-slate-500" /></CardTitle></CardHeader><CardContent><div className="text-2xl font-black text-slate-900">{summary?.totalQty.toLocaleString()} <span className="text-sm font-normal text-slate-400">Units</span></div></CardContent></Card>
          </div>

          {/* Detailed Table (Grouped) */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                {groupBy === 'item' ? <Layers className="w-4 h-4 text-blue-600" /> : <Users className="w-4 h-4 text-blue-600" />}
                Details by {groupBy === 'item' ? "Item" : "Customer"}
              </h3>
              <span className="text-xs text-slate-500 font-medium">{groupedList.length} Groups Found</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                {/* [Main Table Header] */}
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 w-[40px]"></th>
                    <SortableHeader label={groupBy === 'item' ? "Product Name" : "Customer Name"} sortKey="name" currentSort={mainSortConfig} onSort={handleMainSort} />
                    <SortableHeader label="Total Qty" sortKey="totalQty" align="right" currentSort={mainSortConfig} onSort={handleMainSort} />
                    {/* 🚀 테이블 헤더 명칭 명확하게 변경 */}
                    <SortableHeader label="Net Sales" sortKey="totalSales" align="right" currentSort={mainSortConfig} onSort={handleMainSort} />
                    <SortableHeader label="Cost" sortKey="totalCost" align="right" currentSort={mainSortConfig} onSort={handleMainSort} />
                    <SortableHeader label="Profit" sortKey="totalProfit" align="right" currentSort={mainSortConfig} onSort={handleMainSort} />
                    <SortableHeader label="Margin" sortKey="margin" align="right" currentSort={mainSortConfig} onSort={handleMainSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* [Sorted Main Data Mapping] */}
                  {sortedGroupedList.map((group) => {
                    const isExpanded = expandedRows[group.id];
                    const margin = group.totalSales > 0 ? (group.totalProfit / group.totalSales) * 100 : 0;
                    
                    // [Detail Sorting Logic]
                    const sortedDetails = [...group.details].sort((a, b) => {
                      const valA = (a as any)[detailSortConfig.key];
                      const valB = (b as any)[detailSortConfig.key];
                      
                      if (typeof valA === "string" && typeof valB === "string") {
                        return detailSortConfig.direction === "asc" 
                          ? valA.localeCompare(valB) 
                          : valB.localeCompare(valA);
                      }
                      
                      if (valA < valB) return detailSortConfig.direction === "asc" ? -1 : 1;
                      if (valA > valB) return detailSortConfig.direction === "asc" ? 1 : -1;
                      return 0;
                    });

                    return (
                      <React.Fragment key={group.id}>
                        <tr 
                          onClick={() => toggleRow(group.id)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                        >
                          <td className="px-4 py-3 text-center">
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">{group.name}</td>
                          <td className="px-4 py-3 text-right font-medium">{group.totalQty.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">${group.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right text-slate-500 text-xs">${group.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-600">${group.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">{margin.toFixed(1)}%</td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/30 animate-in fade-in slide-in-from-top-1">
                            <td colSpan={7} className="p-0 border-b border-slate-200">
                              <div className="px-4 py-3 pl-12">
                                <table className="w-full text-xs text-left">
                                  {/* [Detail Table Header] */}
                                  <thead className="text-slate-500 border-b border-slate-200 uppercase font-semibold">
                                    <tr>
                                      <SortableHeader label={groupBy === 'item' ? "Customer" : "Product"} sortKey="subName" currentSort={detailSortConfig} onSort={handleDetailSort} />
                                      <SortableHeader label="Unit" sortKey="unit" align="left" currentSort={detailSortConfig} onSort={handleDetailSort} className="w-20" />
                                      <SortableHeader label="Last Date" sortKey="lastDate" currentSort={detailSortConfig} onSort={handleDetailSort} />
                                      <SortableHeader label="Qty" sortKey="qty" align="right" currentSort={detailSortConfig} onSort={handleDetailSort} />
                                      <SortableHeader label="Net Sales" sortKey="amount" align="right" currentSort={detailSortConfig} onSort={handleDetailSort} />
                                      <SortableHeader label="Profit" sortKey="profit" align="right" currentSort={detailSortConfig} onSort={handleDetailSort} />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-600">
                                    {sortedDetails.map((detail, idx) => (
                                      <tr key={idx} className="hover:bg-slate-100/50">
                                        <td className="py-2 font-medium text-slate-800">{detail.subName}</td>
                                        <td className="py-2 text-slate-500 font-medium">{detail.unit}</td>
                                        <td className="py-2">{detail.lastDate}</td>
                                        <td className="py-2 text-right">{detail.qty}</td>
                                        <td className="py-2 text-right font-bold">${detail.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="py-2 text-right text-emerald-600">${detail.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {groupedList.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">
                No sales data found for the selected period.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}