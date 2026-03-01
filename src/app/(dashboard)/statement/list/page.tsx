"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, FileText, Building2, Plus, History, ArrowLeft, Calendar, Eye, 
  Trash2, Printer, Download, Mail, MoreHorizontal, Loader2, User, ChevronRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StatementGenerator from "@/components/statement/StatementGenerator";
import { format } from "date-fns";

import { downloadStatementPdf, printStatementPdf } from "@/utils/downloadPdf"; 
import EmailSendDialog from "@/components/email/EmailSendDialog";

// ✅ [추가] 검색어 입력을 부드럽게 지연시켜 DB 과부하를 막는 커스텀 훅
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
}

interface StatementLog {
  id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  customers: {
    name: string;
    company: string;
    email?: string;
  };
}

export default function StatementPage() {
  const supabase = createClient();

  const [viewMode, setViewMode] = useState<'list' | 'create'>('list');
  const [logs, setLogs] = useState<StatementLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // ✅ [추가] 리스트 뷰 전용 상태 (페이지네이션 및 검색)
  const [listSearchTerm, setListSearchTerm] = useState("");
  const debouncedListSearch = useDebounce(listSearchTerm, 300); // 0.3초 대기 후 검색
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  // 다중 선택 관리
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [defaultDates, setDefaultDates] = useState<{start: string, end: string} | null>(null);
  const [autoGenTrigger, setAutoGenTrigger] = useState(false);
  const [isGeneratorDirty, setIsGeneratorDirty] = useState(false);
  
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [emailTarget, setEmailTarget] = useState<{
    id: string; 
    type: 'quotation' | 'invoice' | 'statement';
    customerName: string;
    customerEmail: string;
    docNumber: string;
    statementData?: { customerId: string; startDate: string; endDate: string; }
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // 초기 로드 시 고객 목록 가져오기
  useEffect(() => {
    fetchCustomers();
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ [추가] 검색어 또는 보여줄 개수가 변경되면 무조건 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedListSearch, rowsPerPage]);

  // ✅ [추가] 페이지, 검색어, 뷰모드가 바뀔 때마다 서버사이드에서 데이터 가져오기
  useEffect(() => {
    if (viewMode === 'list') {
      fetchLogs();
    }
  }, [viewMode, currentPage, rowsPerPage, debouncedListSearch]);

  // ✅ [수정] 서버사이드 페이지네이션 & 필터링 쿼리
  const fetchLogs = async () => {
    setLoadingLogs(true);
    
    // !inner 옵션을 사용해야 join된 테이블(customers)을 조건으로 필터링 할 수 있습니다.
    let query = supabase
      .from("statement_logs")
      .select(`*, customers!inner (name, company, email)`, { count: 'exact' });

    if (debouncedListSearch) {
      query = query.ilike('customers.name', `%${debouncedListSearch}%`);
    }

    query = query.order("generated_at", { ascending: false });

    // 10000은 ALL을 의미합니다.
    if (rowsPerPage !== 10000) {
      const from = (currentPage - 1) * rowsPerPage;
      const to = from + rowsPerPage - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query;

    if (!error && data) {
      setLogs(data as any);
      setTotalLogs(count || 0);
    }
    setLoadingLogs(false);
  };

  const fetchCustomers = async () => {
    const { data } = await supabase.from("customers").select("id, name, company, email").order("name");
    if (data) {
      setCustomers(data);
      setFilteredCustomers(data);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsDropdownOpen(true);
    setHighlightedIndex(0);

    if (term === "") {
      setFilteredCustomers(customers);
    } else {
      const lowerTerm = term.toLowerCase();
      const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(lowerTerm) || 
        (c.company && c.company.toLowerCase().includes(lowerTerm))
      );
      setFilteredCustomers(filtered);
    }
  };

  useEffect(() => {
    if (isDropdownOpen && itemRefs.current[highlightedIndex]) {
      itemRefs.current[highlightedIndex]?.scrollIntoView({ 
        block: "nearest",
        behavior: "auto"
      });
    }
  }, [highlightedIndex, isDropdownOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || filteredCustomers.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredCustomers.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelectCustomer(filteredCustomers[highlightedIndex]);
    }
  };

  const checkUnsaved = () => {
    if (isGeneratorDirty) {
        return !confirm("저장되지 않은 변경 사항이 있습니다. 정말 나가시겠습니까?");
    }
    return false;
  };

  const handleSaveSuccess = () => {
    setIsGeneratorDirty(false); 
    setViewMode('list');        
    setSelectedLogIds(new Set());
  };

  const handleSelectCustomer = async (customer: Customer) => {
    if (checkUnsaved()) return; 

    setSelectedCustomer(customer);
    setSearchTerm(customer.name);
    setIsDropdownOpen(false);
    setAutoGenTrigger(false);
    setIsGeneratorDirty(false); 

    const { data: oldestInv } = await supabase
        .from('invoices')
        .select('invoice_date')
        .eq('customer_id', customer.id)
        .neq('status', 'Paid')
        .order('invoice_date', { ascending: true })
        .limit(1)
        .maybeSingle();

    const startDate = oldestInv ? oldestInv.invoice_date : format(new Date(), "yyyy-MM-01");
    const endDate = format(new Date(), "yyyy-MM-dd");

    setDefaultDates({ start: startDate, end: endDate });
  };

  const handleViewLog = (log: StatementLog) => {
    if (checkUnsaved()) return;

    // 객체/배열 방어코드
    const safeCustomer = Array.isArray(log.customers) ? log.customers[0] : log.customers;

    setSelectedCustomer({
        id: log.customer_id,
        name: safeCustomer?.name || "Unknown",
        company: safeCustomer?.company || "",
        email: safeCustomer?.email || ""
    });
    setDefaultDates({ start: log.start_date, end: log.end_date });
    setAutoGenTrigger(true);
    setIsGeneratorDirty(false);
    setViewMode('create');
  };

  const switchToCreate = () => {
    if (checkUnsaved()) return;
    setViewMode('create');
    setSelectedCustomer(null);
    setDefaultDates(null);
    setSearchTerm("");
    setAutoGenTrigger(false);
    setIsGeneratorDirty(false);
  };

  const switchToList = () => {
    if (checkUnsaved()) return; 
    setViewMode('list');
    setSelectedLogIds(new Set());
    setIsGeneratorDirty(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedLogIds(new Set(logs.map(l => l.id)));
    else setSelectedLogIds(new Set());
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedLogIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedLogIds(newSet);
  };

  const handleBulkDelete = async () => {
    if (selectedLogIds.size === 0) return;
    if (!confirm(`${selectedLogIds.size}개의 기록을 삭제하시겠습니까?`)) return;

    const { error } = await supabase.from('statement_logs').delete().in('id', Array.from(selectedLogIds));
    if (error) alert("삭제에 실패했습니다.");
    else {
        fetchLogs();
        setSelectedLogIds(new Set());
    }
  };

  const handleDownloadPdf = async (log: StatementLog) => {
    const safeCustomerName = Array.isArray(log.customers) ? log.customers[0]?.name : log.customers?.name;
    if (!safeCustomerName) return alert("고객 정보가 없습니다.");
    await downloadStatementPdf(log.customer_id, log.start_date, log.end_date, safeCustomerName);
  };

  const handlePrintPdf = async (log: StatementLog) => {
    const safeCustomerName = Array.isArray(log.customers) ? log.customers[0]?.name : log.customers?.name;
    if (!safeCustomerName) return alert("고객 정보가 없습니다.");
    await printStatementPdf(log.customer_id, log.start_date, log.end_date, safeCustomerName);
  };
  
  const handleEmailPdf = async (log: StatementLog) => {
    const safeCustomer = Array.isArray(log.customers) ? log.customers[0] : log.customers;
    const customerName = safeCustomer?.name || "Customer";
    let customerEmail = safeCustomer?.email || "";

    if (!customerEmail && log.customer_id) {
        const { data } = await supabase.from('customers').select('email').eq('id', log.customer_id).maybeSingle();
        if (data && data.email) customerEmail = data.email;
    }

    const statementInfo = JSON.stringify({
        customerId: log.customer_id,
        startDate: log.start_date,
        endDate: log.end_date,
        customerName: customerName
    });

    setEmailTarget({
        id: statementInfo, 
        type: 'statement',
        customerName: customerName,
        customerEmail: customerEmail,
        docNumber: `${log.start_date} ~ ${log.end_date}`,
    });
  };

  // 계산
  const totalPages = Math.ceil(totalLogs / (rowsPerPage === 10000 ? (totalLogs || 1) : rowsPerPage));

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 md:p-10 space-y-8">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <FileText className="w-8 h-8 text-indigo-600" /> 
            {viewMode === 'list' ? 'Statement History' : 'Statement Generator'}
          </h1>
          <p className="text-slate-500 mt-2">
            {viewMode === 'list' ? '과거 스테이트먼트 기록을 관리합니다.' : '새로운 고객 스테이트먼트를 생성합니다.'}
          </p>
        </div>

        <div className="flex gap-2">
          {viewMode === 'list' ? (
            <>
                {selectedLogIds.size > 0 && (
                    <Button onClick={handleBulkDelete} variant="destructive" className="shadow-sm">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedLogIds.size})
                    </Button>
                )}
                <Button onClick={switchToCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                    <Plus className="w-4 h-4 mr-2" /> New Statement
                </Button>
            </>
          ) : (
            <Button variant="outline" onClick={switchToList} className="border-slate-300">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to History
            </Button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 w-full max-w-6xl mx-auto"></div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        
        {/* === LIST VIEW === */}
        {viewMode === 'list' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* ✅ [추가] 리스트 뷰용 필터 (개수 선택 및 검색어) */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4 gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Show:</span>
                <select 
                  className="h-10 px-3 pr-8 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                  <option value={30}>30 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={10000}>All ({totalLogs})</option>
                </select>
              </div>
              
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search by customer name..." 
                  className="pl-9 h-10 border-slate-200" 
                  value={listSearchTerm}
                  onChange={(e) => setListSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {loadingLogs ? (
                 <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                     <Loader2 className="w-8 h-8 animate-spin mb-2" />
                     Loading history...
                 </div>
              ) : logs.length === 0 ? (
                 <div className="p-20 text-center">
                   <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <History className="w-8 h-8 text-slate-300" />
                   </div>
                   <h3 className="text-lg font-bold text-slate-700">No History Found</h3>
                   <p className="text-slate-400 mb-6">생성된 스테이트먼트 기록이 없습니다.</p>
                 </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">
                        <th className="px-4 py-4 w-10">
                            <Checkbox 
                                checked={selectedLogIds.size === logs.length && logs.length > 0} 
                                onCheckedChange={(c) => handleSelectAll(!!c)} 
                            />
                        </th>
                        <th className="px-6 py-4">Generated Date</th>
                        <th className="px-6 py-4">Customer</th>
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => {
                        const safeCustomer = Array.isArray(log.customers) ? log.customers[0] : log.customers;
                        return (
                          <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-4">
                              <Checkbox 
                                  checked={selectedLogIds.has(log.id)} 
                                  onCheckedChange={() => handleSelectOne(log.id)} 
                              />
                            </td>
                            <td className="px-6 py-4 text-slate-600 font-medium text-sm">
                              {format(new Date(log.generated_at), "dd MMM yyyy, HH:mm")}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-800 text-sm">{safeCustomer?.name || "Unknown"}</div>
                              {safeCustomer?.company && (
                                <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                  <Building2 className="w-3 h-3" /> {safeCustomer.company}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                                <Calendar className="w-3 h-3 mr-1.5 opacity-50"/>
                                {log.start_date} ~ {log.end_date}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 outline-none data-[state=open]:bg-slate-200">
                                          <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 z-[9999]">
                                      <DropdownMenuItem onClick={() => handleViewLog(log)} className="cursor-pointer">
                                          <Eye className="w-4 h-4 mr-2" /> View
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDownloadPdf(log)} className="cursor-pointer">
                                          <Download className="w-4 h-4 mr-2" /> Download PDF
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePrintPdf(log)} className="cursor-pointer">
                                          <Printer className="w-4 h-4 mr-2" /> Print
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleEmailPdf(log)} className="cursor-pointer">
                                          <Mail className="w-4 h-4 mr-2" /> Email Customer
                                      </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* ✅ [추가] 서버사이드 페이지네이션 푸터 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                    <span className="text-xs font-medium text-slate-500">
                      Page {currentPage} of {totalPages} <span className="mx-1">•</span> Total {totalLogs}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>
                        Next
                      </Button>
                    </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* === GENERATOR VIEW === */}
        {viewMode === 'create' && (
          <div className="animate-in fade-in zoom-in-95 duration-300 space-y-8">
            
            {/* 검색창 */}
            {!selectedCustomer && (
               <div className="max-w-lg mx-auto text-center py-10">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Select a Customer</h2>
                    <p className="text-slate-400">Search for a customer to create a new statement.</p>
                  </div>
                  
                  <div className="relative text-left" ref={dropdownRef}>
                    <div className="relative shadow-lg rounded-full">
                      <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                      <Input 
                        type="text" 
                        placeholder="Search by name or company..." 
                        className="pl-12 h-12 rounded-full border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-lg shadow-sm transition-all"
                        value={searchTerm}
                        onChange={handleSearch}
                        onFocus={() => setIsDropdownOpen(true)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                      />
                    </div>

                    {isDropdownOpen && (
                      <div ref={listRef} className="absolute top-14 left-0 right-0 bg-white border border-slate-100 rounded-xl shadow-xl max-h-80 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-2"> 
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm">No customers found.</div>
                          ) : (
                            <div className="divide-y divide-slate-50">
                              {filteredCustomers.map((cust, index) => ( 
                                <button
                                  key={cust.id}
                                  ref={(el) => { itemRefs.current[index] = el; }} 
                                  onMouseEnter={() => setHighlightedIndex(index)} 
                                  onClick={() => handleSelectCustomer(cust)}
                                  className={`w-full flex items-center justify-between p-4 transition-colors text-left group ${index === highlightedIndex ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                                >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-indigo-200 group-hover:text-indigo-700 transition-colors">
                                    <User className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-800 group-hover:text-indigo-900">{cust.name}</p>
                                    {cust.company && (
                                      <p className="text-xs text-slate-500 flex items-center gap-1">
                                        <Building2 className="w-3 h-3" /> {cust.company}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
               </div>
            )}

            {/* 선택된 고객 및 Generator */}
            {selectedCustomer && (
              <>
                <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100 mb-6">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                        {selectedCustomer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-indigo-900">Selected: {selectedCustomer.name}</p>
                        <p className="text-xs text-indigo-500">{selectedCustomer.company}</p>
                      </div>
                   </div>
                   <Button size="sm" variant="ghost" onClick={() => { if(!checkUnsaved()) setSelectedCustomer(null); }} className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100">
                      Change Customer
                   </Button>
                </div>

                <StatementGenerator 
                  key={`${selectedCustomer.id}-${defaultDates?.start || 'new'}`}
                  customerId={selectedCustomer.id}
                  customerName={selectedCustomer.name}
                  customerCompany={selectedCustomer.company}
                  initialStartDate={defaultDates?.start}
                  initialEndDate={defaultDates?.end}
                  autoGenerate={autoGenTrigger}
                  onDirtyChange={setIsGeneratorDirty}
                  onSuccess={handleSaveSuccess} 
                  onEmail={() => {
                    const statementInfo = JSON.stringify({
                        customerId: selectedCustomer.id,
                        startDate: defaultDates?.start || "",
                        endDate: defaultDates?.end || "",
                        customerName: selectedCustomer.name
                    });
                    
                    setEmailTarget({
                        id: statementInfo, 
                        type: 'statement',
                        customerName: selectedCustomer.name,
                        customerEmail: selectedCustomer.email || "",
                        docNumber: `${defaultDates?.start} ~ ${defaultDates?.end}`,
                    });
                  }}
                />
              </>
            )}
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