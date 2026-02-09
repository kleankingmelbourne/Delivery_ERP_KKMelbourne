"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Search, FileText, Building2, Plus, History, ArrowLeft, Calendar, Eye, 
  Trash2, Printer, Download, Mail, MoreHorizontal, CheckSquare,
  User, ChevronRight, Loader2
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

// ✅ [복구] 유틸리티 함수 사용
import { downloadStatementPdf, printStatementPdf } from "@/utils/downloadPdf"; 

import EmailSendDialog from "@/components/email/EmailSendDialog";

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

  // 다중 선택 관리
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [defaultDates, setDefaultDates] = useState<{start: string, end: string} | null>(null);
  const [autoGenTrigger, setAutoGenTrigger] = useState(false);

  // 저장 안 된 변경사항 추적 상태
  const [isGeneratorDirty, setIsGeneratorDirty] = useState(false);

  // 이메일 다이얼로그 상태
  const [emailTarget, setEmailTarget] = useState<{
    id: string; 
    type: 'quotation' | 'invoice' | 'statement';
    customerName: string;
    customerEmail: string;
    docNumber: string;
    statementData?: {
        customerId: string;
        startDate: string;
        endDate: string;
    }
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if(viewMode === 'list') fetchLogs();
    fetchCustomers();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [viewMode]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("statement_logs")
      .select(`*, customers (name, company, email)`)
      .order("generated_at", { ascending: false });

    if (!error && data) setLogs(data as any);
    setLoadingLogs(false);
  };

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, name, company, email")
      .order("name");

    if (data) {
      setCustomers(data);
      setFilteredCustomers(data);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsDropdownOpen(true);

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

  // 🚨 변경사항이 있는지 확인하고 경고창을 띄우는 함수
  const checkUnsaved = () => {
    if (isGeneratorDirty) {
        return !confirm("저장되지 않은 변경 사항이 있습니다. 정말 나가시겠습니까?");
    }
    return false;
  };

  // ✅ [중요] 저장 성공 시 실행되는 함수
  // checkUnsaved()를 호출하지 않고 강제로 리스트 화면으로 이동합니다.
  const handleSaveSuccess = () => {
    setIsGeneratorDirty(false); // 상태 초기화 (다음 동작을 위해)
    setViewMode('list');        // 리스트 화면으로 전환
    setSelectedLogIds(new Set());
    // fetchLogs()는 useEffect([viewMode])에 의해 자동으로 실행됩니다.
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
        .single();

    const startDate = oldestInv ? oldestInv.invoice_date : format(new Date(), "yyyy-MM-01");
    const endDate = format(new Date(), "yyyy-MM-dd");

    setDefaultDates({ start: startDate, end: endDate });
  };

  const handleViewLog = (log: StatementLog) => {
    if (checkUnsaved()) return;

    setSelectedCustomer({
        id: log.customer_id,
        name: log.customers.name,
        company: log.customers.company,
        email: log.customers.email || ""
    });
    setDefaultDates({
        start: log.start_date,
        end: log.end_date
    });
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

  // 일반적인 리스트 전환 (뒤로가기 버튼 등에서 사용 - 검사 수행함)
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
    if (!log.customers?.name) return alert("고객 정보가 없습니다.");
    await downloadStatementPdf(log.customer_id, log.start_date, log.end_date, log.customers.name);
  };

  const handlePrintPdf = async (log: StatementLog) => {
    if (!log.customers?.name) return alert("고객 정보가 없습니다.");
    await printStatementPdf(log.customer_id, log.start_date, log.end_date, log.customers.name);
  };
  
  const handleEmailPdf = (log: StatementLog) => {
    const statementInfo = JSON.stringify({
        customerId: log.customer_id,
        startDate: log.start_date,
        endDate: log.end_date,
        customerName: log.customers.name
    });

    setEmailTarget({
        id: statementInfo, 
        type: 'statement',
        customerName: log.customers.name,
        customerEmail: log.customers.email || "",
        docNumber: `${log.start_date} ~ ${log.end_date}`,
    });
  };

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
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                 <Button onClick={switchToCreate} variant="outline">Create First Statement</Button>
               </div>
            ) : (
              <table className="w-full text-left border-collapse">
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
                  {logs.map((log) => (
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
                        <div className="font-bold text-slate-800 text-sm">{log.customers?.name || "Unknown"}</div>
                        {log.customers?.company && (
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {log.customers.company}
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
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewLog(log)}>
                                    <Eye className="w-4 h-4 mr-2" /> View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadPdf(log)}>
                                    <Download className="w-4 h-4 mr-2" /> Download PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintPdf(log)}>
                                    <Printer className="w-4 h-4 mr-2" /> Print
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEmailPdf(log)}>
                                    <Mail className="w-4 h-4 mr-2" /> Email Customer
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                        autoFocus
                      />
                    </div>

                    {isDropdownOpen && (
                      <div className="absolute top-14 left-0 right-0 bg-white border border-slate-100 rounded-xl shadow-xl max-h-80 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-2">
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm">No customers found.</div>
                        ) : (
                          <div className="divide-y divide-slate-50">
                            {filteredCustomers.map((cust) => (
                              <button
                                key={cust.id}
                                onClick={() => handleSelectCustomer(cust)}
                                className="w-full flex items-center justify-between p-4 hover:bg-indigo-50 transition-colors text-left group"
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
                  
                  // ✅ [핵심 수정] switchToList 대신 handleSaveSuccess를 연결하여 검사 우회
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