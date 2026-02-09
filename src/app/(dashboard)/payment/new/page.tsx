"use client";

import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  ArrowLeft, User, Calendar, CreditCard, 
  Save, DollarSign, Wallet, FileText, Check, ChevronDown, Search, Loader2,
  AlertCircle, RefreshCw 
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

// --- Utility ---
const roundAmount = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const formatCurrency = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

// --- Components (SearchableSelect) ---
interface Option { id: string; label: string; subLabel?: string; }
function SearchableSelect({ options, value, onChange, placeholder, className }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o:any) => o.id === value);
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    return options.filter((o:any) => o.label.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50);
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
      <div onClick={() => setIsOpen(!isOpen)} className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md cursor-pointer bg-white ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}>
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50" />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100">
            <input autoFocus type="text" className="w-full px-2 py-1 text-sm border rounded bg-slate-50 focus:outline-none" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="p-1">
            {filteredOptions.map((opt:any) => (
              <div key={opt.id} onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }} className={`flex justify-between px-3 py-2 text-sm rounded cursor-pointer ${opt.id === value ? "bg-slate-100 font-bold" : "hover:bg-slate-50"}`}>
                <div>{opt.label}{opt.subLabel && <span className="block text-[10px] text-slate-400 font-normal">{opt.subLabel}</span>}</div>
                {opt.id === value && <Check className="w-3.5 h-3.5" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Interfaces ---
interface Customer { id: string; name: string; }
interface UnpaidInvoice {
  id: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance: number; 
}

const PAYMENT_METHODS = ["Bank Transfer", "Cash", "Cheque", "Credit Card"];

function PaymentFormContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- States ---
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Form Data
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number | string>(""); 
  const [method, setMethod] = useState("Bank Transfer");
  const [reason, setReason] = useState("");

  // Credit Logic
  const [availableCredit, setAvailableCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(false); 

  // Invoice & Allocation Logic
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({}); 
  const [autoAllocate, setAutoAllocate] = useState(false); 

  // --- 1. Load Customers ---
  useEffect(() => {
    const loadCustomers = async () => {
      const { data } = await supabase.from("customers").select("id, name").order("name");
      if (data) {
        setCustomers(data);
        const cidFromUrl = searchParams.get("customerId");
        if (cidFromUrl) {
            setSelectedCustomerId(cidFromUrl);
        }
      }
    };
    loadCustomers();
  }, [searchParams]);

  // --- 2. Customer Selected -> Fetch Data ---
  useEffect(() => {
    if (!selectedCustomerId) {
      setAvailableCredit(0);
      setUnpaidInvoices([]);
      setAllocations({});
      return;
    }
    
    const fetchCustomerData = async () => {
      const { data: credits } = await supabase
        .from('payments')
        .select('unallocated_amount')
        .eq('customer_id', selectedCustomerId)
        .gt('unallocated_amount', 0);
      
      const totalCredit = credits?.reduce((sum, p) => sum + p.unallocated_amount, 0) || 0;
      setAvailableCredit(roundAmount(totalCredit));
      if (totalCredit > 0) setUseCredit(true);

      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_date, due_date, total_amount, paid_amount')
        .eq('customer_id', selectedCustomerId)
        .order('invoice_date', { ascending: true });

      if (invoices) {
        const formatted = invoices
          .map((inv: any) => ({
            ...inv,
            balance: roundAmount(inv.total_amount - inv.paid_amount)
          }))
          .filter(inv => inv.balance > 0.009);

        setUnpaidInvoices(formatted);
      }
    };

    fetchCustomerData();
  }, [selectedCustomerId]);

  // --- 3. Auto Allocation Logic ---
  useEffect(() => {
    if (!autoAllocate) return; 

    const numericAmount = Number(amount) || 0;
    const creditAmount = (useCredit && availableCredit > 0) ? availableCredit : 0;
    let totalFunds = roundAmount(numericAmount + creditAmount);

    const newAllocations: Record<string, number> = {};

    for (const inv of unpaidInvoices) {
      if (totalFunds <= 0) break; 

      const payAmount = Math.min(totalFunds, inv.balance);
      const roundedPay = roundAmount(payAmount);

      if (roundedPay > 0) {
        newAllocations[inv.id] = roundedPay;
        totalFunds = roundAmount(totalFunds - roundedPay);
      }
    }

    setAllocations(newAllocations);

  }, [amount, useCredit, availableCredit, autoAllocate, unpaidInvoices]);


  // --- Calculations ---
  const numericAmount = Number(amount) || 0;
  const creditUsed = (useCredit && availableCredit > 0) ? availableCredit : 0;
  const totalFundsAvailable = roundAmount(numericAmount + creditUsed);
  
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  const remainingFunds = roundAmount(totalFundsAvailable - totalAllocated);


  // --- Handlers ---
  const handleManualAllocation = (invoiceId: string, val: string) => {
    if (autoAllocate) setAutoAllocate(false); 

    let numVal = Number(val);
    if (isNaN(numVal)) numVal = 0;

    const invoice = unpaidInvoices.find(i => i.id === invoiceId);
    if (invoice && numVal > invoice.balance) {
      numVal = invoice.balance;
    }

    setAllocations(prev => ({ ...prev, [invoiceId]: numVal }));
  };

  // [NEW] 개별 체크박스 자동 계산 로직
  const handleCheckboxChange = (invoiceId: string, isChecked: boolean) => {
    if (autoAllocate) setAutoAllocate(false); // 수동 조작 시 전체 자동 끄기

    if (!isChecked) {
        // 체크 해제 시: 해당 할당액 0으로 초기화
        setAllocations(prev => {
            const next = { ...prev };
            delete next[invoiceId]; // 혹은 next[invoiceId] = 0;
            return next;
        });
        return;
    }

    // 체크 선택 시: 계산 로직
    const targetInvoice = unpaidInvoices.find(inv => inv.id === invoiceId);
    if (!targetInvoice) return;

    // 1. 현재 이 인보이스를 제외한 다른 곳에 쓰인 돈 계산
    const usedElsewhere = Object.entries(allocations)
        .filter(([key]) => key !== invoiceId)
        .reduce((sum, [, val]) => sum + val, 0);
    
    // 2. 현재 남은 가용 자금
    const currentRemaining = roundAmount(totalFundsAvailable - usedElsewhere);

    if (currentRemaining <= 0) {
        // 남은 돈이 없으면 0원 할당 (체크는 되지만 금액은 0)
        // 필요하다면 alert("No remaining funds to allocate."); 를 띄울 수도 있음
        setAllocations(prev => ({ ...prev, [invoiceId]: 0 }));
        return;
    }

    // 3. 할당할 금액 결정 (Min: 남은 돈 vs 인보이스 잔액)
    const amountToAllocate = Math.min(currentRemaining, targetInvoice.balance);
    
    setAllocations(prev => ({ ...prev, [invoiceId]: roundAmount(amountToAllocate) }));
  };


  const resetForm = () => {
    setSelectedCustomerId("");
    setAmount("");
    setReason("");
    setUseCredit(false);
    setAllocations({});
    setAutoAllocate(false);
    router.replace("/payment/new");
  };

  const handleSave = async (shouldRedirect: boolean = true) => {
    if (!selectedCustomerId) return alert("Select a customer.");
    
    const currentNumericAmount = Number(amount) || 0;
    const currentCreditUsed = (useCredit && availableCredit > 0) ? availableCredit : 0;
    const currentTotalFunds = roundAmount(currentNumericAmount + currentCreditUsed);
    const currentTotalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);

    if (currentTotalFunds <= 0) {
       return alert("결제할 총 금액이 '0'입니다. 금액을 입력하거나 크레딧을 확인해주세요.");
    }

    if (currentNumericAmount === 0 && roundAmount(currentTotalAllocated) === 0) {
        return alert("적용할 인보이스가 선택되지 않았습니다. 크레딧을 사용하려면 인보이스 'Payment' 칸에 금액을 입력해주세요.");
    }

    if (roundAmount(currentTotalAllocated) > currentTotalFunds) {
      return alert(`Error: You allocated $${currentTotalAllocated}, but only have $${currentTotalFunds} available.`);
    }

    setLoading(true);

    try {
      let newPaymentId: string | null = null;

      if (numericAmount > 0) {
        const { data: pay, error: payError } = await supabase.from('payments').insert({
          customer_id: selectedCustomerId,
          payment_date: paymentDate,
          amount: numericAmount,
          unallocated_amount: numericAmount, 
          category: method,
          reason: reason,
        }).select().single();

        if (payError) throw payError;
        newPaymentId = pay.id;
      }

      let fundingSources: { id: string, balance: number }[] = [];

      if (useCredit && availableCredit > 0) {
        const { data: oldPayments } = await supabase
          .from('payments')
          .select('id, unallocated_amount')
          .eq('customer_id', selectedCustomerId)
          .gt('unallocated_amount', 0)
          .order('payment_date', { ascending: true });
        
        if (oldPayments) {
          fundingSources.push(...oldPayments.map(p => ({ id: p.id, balance: p.unallocated_amount })));
        }
      }

      if (newPaymentId && numericAmount > 0) {
        fundingSources.push({ id: newPaymentId, balance: numericAmount });
      }

      const invoicesToPay = Object.entries(allocations).filter(([_, amt]) => amt > 0);

      for (const [invoiceId, allocatedAmt] of invoicesToPay) {
        let amtToCover = allocatedAmt;

        for (const fund of fundingSources) {
          if (amtToCover <= 0) break;
          if (fund.balance <= 0) continue;

          const take = Math.min(amtToCover, fund.balance);
          const roundedTake = roundAmount(take);

          if (roundedTake > 0) {
            await supabase.from('payment_allocations').insert({
              payment_id: fund.id,
              invoice_id: invoiceId,
              amount: roundedTake
            });

            fund.balance = roundAmount(fund.balance - roundedTake);
            await supabase.from('payments').update({
              unallocated_amount: fund.balance
            }).eq('id', fund.id);

            amtToCover = roundAmount(amtToCover - roundedTake);
          }
        }

        const inv = unpaidInvoices.find(i => i.id === invoiceId);
        if (inv) {
          const newPaid = roundAmount(inv.paid_amount + allocatedAmt);
          const isFullyPaid = Math.abs(inv.total_amount - newPaid) < 0.01;
          const newStatus = isFullyPaid ? 'Paid' : 'Partial';
          
          await supabase.from('invoices').update({
            paid_amount: newPaid,
            status: newStatus
          }).eq('id', invoiceId);
        }
      }

      alert("Payment processed successfully!");

      if (shouldRedirect) {
        router.push("/payment/list");
      } else {
        resetForm();
      }

    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/payment/list">
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100">
            <ArrowLeft className="w-6 h-6 text-slate-600" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Receive Payment</h1>
          <p className="text-slate-500 text-sm">Apply payment to invoices.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left Column: Input Form */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 h-fit sticky top-6">
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Customer
              </label>
              <SearchableSelect 
                options={customers.map(c => ({ id: c.id, label: c.name }))} 
                value={selectedCustomerId} 
                onChange={setSelectedCustomerId} 
                placeholder="Select Customer..." 
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5" /> Amount Received
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <Input 
                    type="number" 
                    className="pl-7 font-bold text-lg" 
                    placeholder="0.00" 
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </label>
                <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Method</label>
                <select 
                  className="w-full h-10 px-3 border border-slate-200 rounded-md bg-white text-sm"
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Reference</label>
                <Input placeholder="Optional note..." value={reason} onChange={e => setReason(e.target.value)} />
              </div>
            </div>

            {availableCredit > 0 && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-emerald-700 uppercase flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5" /> Available Credit
                  </span>
                  <span className="font-bold text-emerald-700">${availableCredit.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="useCredit" 
                    checked={useCredit} 
                    onCheckedChange={(c) => setUseCredit(!!c)} 
                    className="data-[state=checked]:bg-emerald-600"
                  />
                  <label htmlFor="useCredit" className="text-sm text-slate-700 font-medium cursor-pointer">Use Credit</label>
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Amount Received</span>
                <span className="font-medium">${numericAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Credit Used</span>
                <span className="font-medium text-emerald-600">+ ${creditUsed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-100">
                <span>Total Funds</span>
                <span className="text-blue-600">${totalFundsAvailable.toLocaleString()}</span>
              </div>
              
              <div className="flex justify-between text-sm pt-2">
                <span className="text-slate-500">Allocated</span>
                <span className="font-medium text-slate-900">${totalAllocated.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Unallocated (To Credit)</span>
                <span className="font-medium text-slate-400">${Math.max(0, remainingFunds).toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Button 
                    onClick={() => handleSave(false)} 
                    disabled={loading || !selectedCustomerId} 
                    className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 font-bold"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4"/> Save & Cont</span>
                    )}
                </Button>

                <Button 
                    onClick={() => handleSave(true)} 
                    disabled={loading || !selectedCustomerId} 
                    className="bg-slate-900 hover:bg-slate-800 font-bold"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Payment"}
                </Button>
            </div>

          </div>
        </div>

        {/* Right Column: Invoice List Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Unpaid Invoices
            </h3>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="autoAlloc" 
                checked={autoAllocate} 
                onCheckedChange={(c) => {
                    const isChecked = !!c;
                    setAutoAllocate(isChecked);
                    if (!isChecked) {
                        setAllocations({});
                    }
                }} 
              />
              <label htmlFor="autoAlloc" className="text-sm font-medium cursor-pointer">Auto Allocate (Oldest First)</label>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {unpaidInvoices.length === 0 ? (
              <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 opacity-20" />
                <p>No unpaid invoices for this customer.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase">
                  <tr>
                    {/* [NEW] Checkbox Column Header */}
                    <th className="px-6 py-4 w-[50px]">
                        <span className="sr-only">Select</span>
                    </th>
                    <th className="px-6 py-4">Invoice #</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-right">Balance Due</th>
                    <th className="px-6 py-4 text-right w-[180px] bg-blue-50/30 text-blue-700">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unpaidInvoices.map((inv) => {
                    // 할당된 금액이 있으면 체크된 것으로 간주
                    const allocatedAmount = allocations[inv.id] || 0;
                    const isChecked = allocatedAmount > 0;

                    return (
                        <tr key={inv.id} className={`hover:bg-slate-50 ${isChecked ? "bg-blue-50/20" : ""}`}>
                        {/* [NEW] Row Checkbox */}
                        <td className="px-6 py-4">
                            <Checkbox 
                                checked={isChecked}
                                onCheckedChange={(checked) => handleCheckboxChange(inv.id, !!checked)}
                                className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">#{inv.id.slice(0,8).toUpperCase()}</td>
                        <td className="px-6 py-4 text-slate-700">{inv.invoice_date}</td>
                        <td className="px-6 py-4 text-slate-500">{inv.due_date}</td>
                        <td className="px-6 py-4 text-right font-medium text-slate-900">{formatCurrency(inv.total_amount)}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-700">{formatCurrency(inv.balance)}</td>
                        <td className="px-6 py-3 text-right">
                            <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                            <Input 
                                type="number"
                                className={`text-right h-9 pl-6 font-bold ${allocatedAmount > 0 ? "border-blue-500 bg-blue-50 text-blue-700" : ""}`}
                                placeholder="0.00"
                                value={allocatedAmount || ""}
                                onChange={(e) => handleManualAllocation(inv.id, e.target.value)}
                            />
                            </div>
                        </td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// Suspense Boundary Wrapper (URL 파라미터 사용 시 권장)
export default function NewPaymentPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading...</div>}>
      <PaymentFormContent />
    </Suspense>
  );
}