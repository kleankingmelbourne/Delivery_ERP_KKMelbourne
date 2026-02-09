"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Users, Search, Trash2, Edit, ChevronLeft, ChevronRight, 
  CheckCircle2, XCircle, Ban, Loader2, ShieldCheck, Package, 
  ArrowUpDown, Download, Upload 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import CustomerDialog from "@/components/customer/CustomerDialog";
import CustomerProductDialog from "@/components/customer/CustomerProductDialog";
import * as XLSX from "xlsx";

// --- Type Definitions ---
interface Customer {
  id: string;
  name: string;
  password?: string;
  login_permit: boolean;
  disable_order: boolean;
  company: string | null;
  email: string | null;
  mobile: string | null;
  tel: string | null;
  abn: string | null;
  credit_limit: number | null;
  due_date: string | null;
  note: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  delivery_address: string | null;
  delivery_suburb: string | null;
  delivery_state: string | null;
  delivery_postcode: string | null;
  group_id: number | null; 
  in_charge_sale: string | null;     
  in_charge_delivery: string | null; 
  customer_groups: { name: string; color: string; } | null; 
  created_at: string;
  [key: string]: any; 
}

type SortConfig = { key: keyof Customer | null; direction: 'asc' | 'desc' };

// Helpers
const getGroupBadgeColor = (colorName: string) => {
  const map: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
    green: "bg-green-100 text-green-700 border-green-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    red: "bg-red-100 text-red-700 border-red-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return map[colorName] || map.slate;
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU");
};

export default function CustomerListPage() {
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [selectedProductCustomer, setSelectedProductCustomer] = useState<{id: string, name: string} | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [columnWidths, setColumnWidths] = useState({
    checkbox: 50, id: 80, name: 200, company: 200, group: 120, 
    mobile: 150, login: 120, order: 140, created: 120, action: 100
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select(`*, customer_groups (name, color)`)
      .order("created_at", { ascending: false });

    if (!error && data) setCustomers(data as any);
    else console.error("Error fetching customers:", error);
    setLoading(false);
  };

  // --- Logic: Filtering & Sorting ---
  const processedCustomers = useMemo(() => {
    let result = customers.filter((c) => {
      const searchLower = searchTerm.toLowerCase();
      const name = c.name?.toLowerCase() || "";
      const company = c.company?.toLowerCase() || "";
      const mobile = c.mobile?.toLowerCase() || ""; 
      return (name.includes(searchLower) || company.includes(searchLower) || mobile.includes(searchLower));
    });
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue: any = a[sortConfig.key!];
        let bValue: any = b[sortConfig.key!];
        if (typeof aValue === 'boolean') { aValue = aValue ? 1 : 0; bValue = bValue ? 1 : 0; }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [customers, searchTerm, sortConfig]);

  // --- Pagination Logic ---
  const paginatedCustomers = useMemo(() => {
    if (pageSize === "all") return processedCustomers;
    const limit = parseInt(pageSize);
    const startIndex = (currentPage - 1) * limit;
    return processedCustomers.slice(startIndex, startIndex + limit);
  }, [processedCustomers, currentPage, pageSize]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(processedCustomers.length / parseInt(pageSize));

  // --- Handlers ---
  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };
  const handleSelectAll = (checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) paginatedCustomers.forEach(c => newSelected.add(c.id)); 
    else paginatedCustomers.forEach(c => newSelected.delete(c.id));
    setSelectedIds(newSelected);
  };
  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };
  const isAllSelected = paginatedCustomers.length > 0 && paginatedCustomers.every(c => selectedIds.has(c.id));
  
  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} customers?`)) return;
    setLoading(true);
    const { error } = await supabase.from("customers").delete().in("id", Array.from(selectedIds));
    if (error) alert("Error deleting: " + error.message); 
    else { alert("Deleted successfully."); setSelectedIds(new Set()); fetchCustomers(); }
    setLoading(false);
  };
  
  const handleEdit = (customer: Customer) => { setEditingCustomer(customer); setIsDialogOpen(true); };
  const handleManageProducts = (customer: Customer) => { setSelectedProductCustomer({ id: customer.id, name: customer.name }); setIsProductDialogOpen(true); };

  // --- Export Handler ---
  const handleExport = () => {
    const exportData = processedCustomers.map(c => ({
        ID: c.id,
        Name: c.name,
        Company: c.company || "",
        LoginPermit: c.login_permit ? "TRUE" : "FALSE",
        OrderStatus: c.disable_order ? "BLOCKED" : "ALLOWED",
        Mobile: c.mobile || "",
        Tel: c.tel || "",
        Email: c.email || "",
        ABN: c.abn || "",
        CreditLimit: c.credit_limit || 0,
        DueDate: c.due_date || "",
        Note: c.note || "",
        Group: c.customer_groups?.name || "-",
        GroupID: c.group_id || "", 
        Address: c.address || "",
        Suburb: c.suburb || "",
        State: c.state || "",
        Postcode: c.postcode || "",
        DeliveryAddress: c.delivery_address || "",
        DeliverySuburb: c.delivery_suburb || "",
        DeliveryState: c.delivery_state || "",
        DeliveryPostcode: c.delivery_postcode || "",
        InChargeSale: c.in_charge_sale || "",
        InChargeDelivery: c.in_charge_delivery || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, `Customer_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // --- Import Handler (U00001 Logic) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          alert("Excel file is empty."); setIsUploading(false); return;
        }

        // [중요] 1. DB에서 가장 높은 'U' ID 찾기
        const { data: lastCustomer } = await supabase
            .from('customers')
            .select('id')
            .order('id', { ascending: false }) // ID 역순 정렬
            .limit(1)
            .single();

        let currentMaxIdNumber = 0;
        
        // DB의 마지막 ID 파싱 (예: U00123 -> 123)
        if (lastCustomer?.id) {
            const match = lastCustomer.id.match(/^U(\d+)$/);
            if (match) {
                currentMaxIdNumber = parseInt(match[1], 10);
            }
        }

        // [중요] 2. 엑셀 파일 내에서도 'U' ID가 있다면 충돌 방지를 위해 최대값 갱신
        jsonData.forEach((row: any) => {
            const id = row['ID'] || row['id'];
            if (id && typeof id === 'string') {
                const match = id.match(/^U(\d+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > currentMaxIdNumber) {
                        currentMaxIdNumber = num;
                    }
                }
            }
        });

        // 3. 업데이트용 ID 목록 추출 (비밀번호 보존용)
        const excelIds = jsonData
            .map((row: any) => row['ID'] || row['id'])
            .filter((id) => id)
            .map((id) => String(id).trim());

        // 4. 기존 비밀번호 가져오기
        const passwordMap = new Map<string, string>();
        if (excelIds.length > 0) {
            const { data: existingData, error } = await supabase
                .from('customers')
                .select('id, password')
                .in('id', excelIds);
            
            if (!error && existingData) {
                existingData.forEach((row: any) => {
                    passwordMap.set(row.id, row.password);
                });
            }
        }

        // 5. 데이터 매핑 및 새 ID 부여
        const upsertData = jsonData.map((row: any) => {
            let rawId = row['ID'] || row['id'];
            let id = rawId ? String(rawId).trim() : null;
            let isNewUser = false;

            // ID가 없으면 새 U-ID 생성
            if (!id) {
                currentMaxIdNumber++; // 번호 증가
                // 5자리 숫자로 포맷팅 (예: 1 -> U00001, 123 -> U00123)
                id = `U${String(currentMaxIdNumber).padStart(5, '0')}`;
                isNewUser = true;
            }

            // DB에 존재하는 ID인지 확인 (엑셀에 ID가 있어도 DB에 없으면 신규 취급)
            const existingPassword = passwordMap.get(id);
            // ID를 새로 만들었거나(isNewUser), 엑셀엔 ID가 있지만 DB엔 없는 경우(삭제됨) -> '123456'
            const passwordToUse = existingPassword || '123456';

            return {
                id: id, 
                name: row['Name'] || row['name'],
                password: passwordToUse, // 비밀번호 설정

                company: row['Company'] || row['company'],
                login_permit: String(row['LoginPermit']).toUpperCase() === 'TRUE' || row['LoginPermit'] === true,
                disable_order: String(row['OrderStatus']).toUpperCase() === 'BLOCKED',
                mobile: row['Mobile'] || row['mobile'],
                tel: row['Tel'] || row['tel'],
                email: row['Email'] || row['email'],
                abn: row['ABN'] || row['abn'],
                credit_limit: parseFloat(row['CreditLimit'] || row['credit_limit'] || 0) || 0,
                due_date: row['DueDate'] || row['due_date'],
                note: row['Note'] || row['note'],
                group_id: parseInt(row['GroupID'] || row['group_id']) || null,
                address: row['Address'] || row['address'],
                suburb: row['Suburb'] || row['suburb'],
                state: row['State'] || row['state'],
                postcode: row['Postcode'] || row['postcode'],
                delivery_address: row['DeliveryAddress'] || row['delivery_address'],
                delivery_suburb: row['DeliverySuburb'] || row['delivery_suburb'],
                delivery_state: row['DeliveryState'] || row['delivery_state'],
                delivery_postcode: row['DeliveryPostcode'] || row['delivery_postcode'],
                in_charge_sale: row['InChargeSale'] || row['in_charge_sale'] || null,
                in_charge_delivery: row['InChargeDelivery'] || row['in_charge_delivery'] || null,
            };
        }).filter((item: any) => item.name);

        if (upsertData.length === 0) {
            alert("No valid data found to import."); setIsUploading(false); return;
        }

        if (!confirm(`Process ${upsertData.length} customers?`)) {
            setIsUploading(false); if(fileInputRef.current) fileInputRef.current.value = ""; return;
        }

        // Supabase Upsert
        const { error } = await supabase.from("customers").upsert(upsertData, {
            onConflict: 'id',
            ignoreDuplicates: false,
        });

        if (error) throw error;

        alert("Processed successfully!");
        fetchCustomers();
      } catch (error: any) {
        console.error("Import Error:", error);
        alert("Failed to import: " + error.message);
      } finally {
        setIsUploading(false);
        if(fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Column Resizing ---
  const handleMouseDown = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = columnWidths[key as keyof typeof columnWidths];
    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX)); 
      setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };
  const handleDoubleClick = (key: string) => {
      setColumnWidths(prev => ({ ...prev, [key]: prev[key as keyof typeof columnWidths] === 400 ? 100 : 400 })); 
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Users className="w-6 h-6" /> Customer List</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your client base.</p>
        </div>
        <div className="flex gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
            <Button variant="outline" disabled={isUploading} onClick={() => fileInputRef.current?.click()} className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-sm">
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Upload className="w-4 h-4 mr-2" />} Import (Upsert)
            </Button>
            <Button variant="outline" onClick={handleExport} className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-sm">
                <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button onClick={() => { setEditingCustomer(undefined); setIsDialogOpen(true); }} className="bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md transition-all active:scale-95">
                <Plus className="w-4 h-4 mr-2" /> Add Customer
            </Button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDelete} className="animate-in fade-in zoom-in duration-200"><Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.size})</Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Show:</span>
            <select className="h-9 pl-3 pr-8 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400 bg-slate-50" value={pageSize} onChange={e => { setPageSize(e.target.value); setCurrentPage(1); }}>
              <option value="10">10 Rows</option>
              <option value="20">20 Rows</option>
              <option value="50">50 Rows</option>
              <option value="all">All ({processedCustomers.length})</option>
            </select>
          </div>
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
          <input type="text" placeholder="Search name, company, mobile..." className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400 transition-all focus:ring-2 focus:ring-slate-100" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}/>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm min-h-[400px] flex flex-col justify-between">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm table-fixed"> 
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs tracking-wider">
              <tr>
                <th className="relative px-4 py-4" style={{ width: columnWidths.checkbox }}>
                  <Checkbox checked={isAllSelected} onCheckedChange={(c) => handleSelectAll(!!c)} className="border-slate-400" />
                  <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'checkbox')} />
                </th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.id }}>ID<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'id')} onDoubleClick={() => handleDoubleClick('id')} /></th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.name }}>Name<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'name')} onDoubleClick={() => handleDoubleClick('name')} /></th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.company }}>Company<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'company')} onDoubleClick={() => handleDoubleClick('company')} /></th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.group }}>Group<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'group')} onDoubleClick={() => handleDoubleClick('group')} /></th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.mobile }}>Mobile<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'mobile')} onDoubleClick={() => handleDoubleClick('mobile')} /></th>
                <th className="relative px-4 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center select-none" style={{ width: columnWidths.login }} onClick={() => handleSort('login_permit')}>
                  <div className="flex items-center justify-center gap-1">Login<ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                  <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'login')} onClick={(e) => e.stopPropagation()} />
                </th>
                <th className="relative px-4 py-4 cursor-pointer hover:bg-slate-100 transition-colors text-center select-none" style={{ width: columnWidths.order }} onClick={() => handleSort('disable_order')}>
                  <div className="flex items-center justify-center gap-1">Order<ArrowUpDown className="w-3 h-3 text-slate-400" /></div>
                  <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'order')} onClick={(e) => e.stopPropagation()} />
                </th>
                <th className="relative px-4 py-4 truncate" style={{ width: columnWidths.created }}>Created<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'created')} onDoubleClick={() => handleDoubleClick('created')} /></th>
                <th className="relative px-4 py-4 text-center" style={{ width: columnWidths.action }}>Action<div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10" onMouseDown={(e) => handleMouseDown(e, 'action')} /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="p-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr><td colSpan={10} className="p-20 text-center text-slate-400">No customers found.</td></tr>
              ) : (
                paginatedCustomers.map((customer) => (
                  <tr key={customer.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(customer.id) ? "bg-blue-50/50" : ""}`}>
                    <td className="px-4 py-3"><Checkbox checked={selectedIds.has(customer.id)} onCheckedChange={() => handleSelectOne(customer.id)} className="border-slate-300" /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400 truncate" title={customer.id}>#{customer.id}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 truncate" title={customer.name}>{customer.name}</td>
                    <td className="px-4 py-3 text-slate-600 truncate" title={customer.company || ""}>{customer.company || "-"}</td>
                    <td className="px-4 py-3 truncate">{customer.customer_groups ? <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase border ${getGroupBadgeColor(customer.customer_groups.color)}`}>{customer.customer_groups.name}</span> : <span className="text-slate-300 text-xs">-</span>}</td>
                    <td className="px-4 py-3 text-slate-600 truncate" title={customer.mobile || ""}>{customer.mobile || "-"}</td>
                    <td className="px-4 py-3 text-center">{customer.login_permit ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-200 whitespace-nowrap"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</span> : <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold border border-slate-200 whitespace-nowrap"><XCircle className="w-3 h-3 mr-1" /> Disabled</span>}</td>
                    <td className="px-4 py-3 text-center">{customer.disable_order ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200 whitespace-nowrap"><Ban className="w-3 h-3 mr-1" /> Blocked</span> : <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold border border-emerald-200 whitespace-nowrap"><ShieldCheck className="w-3 h-3 mr-1" /> Allowed</span>}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate">{formatDate(customer.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleManageProducts(customer)} className="h-8 w-8 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400" title="Manage Custom Discounts"><Package className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)} className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 text-slate-400"><Edit className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer (Pagination) */}
        {processedCustomers.length > 0 && pageSize !== "all" && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
            <span className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-900">{(currentPage - 1) * parseInt(pageSize) + 1}</strong> to <strong className="text-slate-900">{Math.min(currentPage * parseInt(pageSize), processedCustomers.length)}</strong> of <strong className="text-slate-900">{processedCustomers.length}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 px-3 text-sm border-slate-200 hover:bg-white disabled:opacity-50" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
              <div className="flex items-center px-3 h-8 bg-white rounded border border-slate-200 text-xs font-bold text-slate-700">{currentPage} / {totalPages}</div>
              <Button variant="outline" size="sm" className="h-8 px-3 text-sm border-slate-200 hover:bg-white disabled:opacity-50" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}
      </div>

      <CustomerDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} onSuccess={fetchCustomers} customerData={editingCustomer} />
      {selectedProductCustomer && <CustomerProductDialog isOpen={isProductDialogOpen} onClose={() => setIsProductDialogOpen(false)} customerId={selectedProductCustomer.id} customerName={selectedProductCustomer.name} />}
    </div>
  );
}