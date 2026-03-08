"use client";

import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  ArrowLeft, User, Calendar, CreditCard, 
  DollarSign, Wallet, FileText, Check, ChevronDown, Loader2,
  AlertCircle, RefreshCw, Search
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

// --- Utility ---
const roundAmount = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const formatCurrency = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

const getTodayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- Components (SearchableSelect) ---
interface Option { id: string; label: string; subLabel?: string; }
interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

function SearchableSelect({ options, value, onChange, placeholder, className, disabled }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0); 
  
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]); 
  
  const inputMethod = useRef<"mouse" | "keyboard">("keyboard");
  const mouseCoords = useRef({ x: 0, y: 0 });

  const selectedOption = options.find(o => o.id === value);
  
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    const lowerTerm = searchTerm.toLowerCase();
    return options.filter(option => 
        option.label.toLowerCase().includes(lowerTerm) || 
        (option.subLabel && option.subLabel.toLowerCase().includes(lowerTerm))
    ).slice(0, 50);
  }, [options, searchTerm]);

  useEffect(() => {
    setHighlightedIndex(0);
    inputMethod.current = "keyboard"; 
    if (listRef.current) listRef.current.scrollTop = 0; 
  }, [searchTerm]);

  useEffect(() => {
    if (isOpen && inputMethod.current === "keyboard") {
        const item = optionsRef.current[highlightedIndex];
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    inputMethod.current = "keyboard"; 

    if (e.key === "ArrowDown") {
      e.preventDefault(); 
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (filteredOptions[highlightedIndex]) {
        e.preventDefault();
        onChange(filteredOptions[highlightedIndex].id);
        setIsOpen(false);
        setSearchTerm("");
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        onClick={() => { if(!disabled) setIsOpen(!isOpen) }} 
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-md transition-colors ${disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "cursor-pointer bg-white"} ${isOpen ? "ring-2 ring-slate-900 border-slate-900" : "border-slate-200"}`}
      >
        <span className={`truncate ${!selectedOption && !value ? "text-slate-400" : "text-slate-900 font-medium"}`}>
            {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 opacity-50" />
      </div>
      
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 flex flex-col">
          <div className="sticky top-0 p-2 bg-white border-b border-slate-100 shrink-0">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                    autoFocus 
                    type="text" 
                    className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400 placeholder:text-xs" 
                    placeholder="Search..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    onKeyDown={handleKeyDown} 
                />
            </div>
          </div>
          <div className="p-1 overflow-y-auto flex-1" ref={listRef}>
            {filteredOptions.length === 0 ? (
                <div className="p-3 text-xs text-center text-slate-400">No results found.</div>
            ) : (
                filteredOptions.map((opt, index) => (
                <div 
                    key={opt.id} 
                    ref={(el) => { optionsRef.current[index] = el; }}
                    onClick={() => { onChange(opt.id); setIsOpen(false); setSearchTerm(""); }} 
                    
                    onMouseMove={(e) => {
                        if (mouseCoords.current.x !== e.clientX || mouseCoords.current.y !== e.clientY) {
                            inputMethod.current = "mouse"; 
                            setHighlightedIndex(index);
                            mouseCoords.current = { x: e.clientX, y: e.clientY };
                        }
                    }}

                    className={`flex justify-between px-3 py-2 text-sm rounded cursor-pointer ${index === highlightedIndex ? "bg-slate-100 font-bold text-slate-900" : "hover:bg-slate-50 text-slate-700"}`}
                >
                    <div className="flex flex-col truncate">
                        <span>{opt.label}</span>
                        {opt.subLabel && <span className="text-[10px] text-slate-400 font-normal">{opt.subLabel}</span>}
                    </div>
                    {opt.id === value && <Check className="w-3.5 h-3.5 text-slate-900 shrink-0" />}
                </div>
                ))
            )}
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
  original_balance?: number;
}

const PAYMENT_METHODS = ["Bank Transfer", "Cash", "Cheque", "Credit Card"];

// --- 내부 메인 컴포넌트 ---
function PaymentFormInner({ paymentId }: { paymentId?: string }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const isEditMode = !!paymentId;

  // ✅ 초기 로딩 플래그를 true로 두어 깜빡임(Flicker)을 방지합니다.
  const [loading, setLoading] = useState(true); 
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentDate, setPaymentDate] = useState(getTodayLocal());
  const [amount, setAmount] = useState<number | string>(""); 
  const [method, setMethod] = useState("Bank Transfer");
  const [reason, setReason] = useState("");

  const [availableCredit, setAvailableCredit] = useState(0);
  const [useCredit, setUseCredit] = useState(false); 

  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({}); 
  
  const [autoAllocate, setAutoAllocate] = useState(false); 
  const [exactInvoiceAmount, setExactInvoiceAmount] = useState(false);

  // --- 1. [스피드업] Load Customers & Edit Data 병렬 처리 ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      
      // 🚀 Promise.all을 통해 고객 리스트와 특정 결제 정보를 "동시"에 요청
      const [custRes, payRes] = await Promise.all([
        supabase.from("customers").select("id, name").order("name"),
        paymentId ? supabase.from("payments").select("*").eq("id", paymentId).single() : Promise.resolve({ data: null })
      ]);

      if (custRes.data) setCustomers(custRes.data);

      if (paymentId && payRes.data) {
          const paymentInfo = payRes.data;
          setPaymentDate(paymentInfo.payment_date);
          setAmount(paymentInfo.amount);
          setMethod(paymentInfo.category);
          setReason(paymentInfo.reason || "");
          
          // 고객 ID를 세팅하면 아래 2번 useEffect가 발동되어 인보이스를 가져옵니다.
          setSelectedCustomerId(paymentInfo.customer_id);
      } else {
          const cidFromUrl = searchParams.get("customerId");
          if (cidFromUrl) {
              setSelectedCustomerId(cidFromUrl);
          } else {
              setLoading(false); // 고객이 없으면 로딩 끝
          }
      }
    };
    initData();
  }, [searchParams, paymentId]);

  // --- 2. [스피드업] Customer Selected -> Fetch Invoices & Sync Allocations ---
  useEffect(() => {
    if (!selectedCustomerId) {
      setAvailableCredit(0);
      setUnpaidInvoices([]);
      if (!isEditMode) setAllocations({});
      setLoading(false);
      return;
    }
    
    const fetchCustomerData = async () => {
      setLoading(true);

      // 🚀 Promise.all을 통해 1)크레딧, 2)기존할당내역, 3)인보이스 목록을 "동시"에 요청
      const [creditsRes, allocRes, invoicesRes] = await Promise.all([
        supabase.from('payments').select('id, unallocated_amount').eq('customer_id', selectedCustomerId).gt('unallocated_amount', 0),
        (isEditMode && paymentId) 
            ? supabase.from("payment_allocations").select("invoice_id, amount").eq("payment_id", paymentId) 
            : Promise.resolve({ data: null }),
        supabase.from('invoices').select('id, invoice_date, due_date, total_amount, paid_amount').eq('customer_id', selectedCustomerId).order('invoice_date', { ascending: true })
      ]);

      // 1. 크레딧 세팅
      const credits = creditsRes.data || [];
      const otherCredits = credits.filter(c => c.id !== paymentId);
      const totalCredit = otherCredits.reduce((sum, p) => sum + p.unallocated_amount, 0) || 0;
      
      setAvailableCredit(roundAmount(totalCredit));
      if (totalCredit > 0 && !isEditMode) setUseCredit(true);

      // 2. 기존 할당 내역 세팅 (Edit 모드)
      let currentAllocations: Record<string, number> = {};
      if (allocRes.data) {
          allocRes.data.forEach(a => {
              currentAllocations[a.invoice_id] = a.amount;
          });
          setAllocations(currentAllocations);
      }

      // 3. 인보이스 잔액 계산 세팅
      if (invoicesRes.data) {
        const formatted = invoicesRes.data
          .map((inv: any) => {
            const preAllocated = currentAllocations[inv.id] || 0;
            // Edit 모드일 때는 현재 결제가 납부했던 금액(preAllocated)을 일시적으로 다시 잔액에 더해줍니다.
            const realBalance = isEditMode 
                ? roundAmount(inv.total_amount - inv.paid_amount + preAllocated) 
                : roundAmount(inv.total_amount - inv.paid_amount);
            
            return {
              ...inv,
              balance: realBalance
            };
          })
          // 미납이거나, 현재 결제에 이미 할당되었던 인보이스만 화면에 출력
          .filter((inv: any) => inv.balance > 0.009 || currentAllocations[inv.id] > 0);

        setUnpaidInvoices(formatted);
      }
      
      setLoading(false); // 모든 병렬 데이터 처리가 끝난 뒤에 비로소 화면을 보여줌
    };

    fetchCustomerData();
  }, [selectedCustomerId, paymentId, isEditMode]);

  // --- 3. Auto Allocation Logic ---
  useEffect(() => {
    if (!autoAllocate || isEditMode) return; 
    if (exactInvoiceAmount) setExactInvoiceAmount(false);

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
  }, [amount, useCredit, availableCredit, autoAllocate, unpaidInvoices, isEditMode]);

  // --- 4. Exact Invoice Amount Logic ---
  useEffect(() => {
    if (!exactInvoiceAmount || unpaidInvoices.length === 0 || isEditMode) return;
    if (autoAllocate) setAutoAllocate(false);

    const totalBalanceDue = unpaidInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    setAmount(roundAmount(totalBalanceDue));

    const exactAllocations: Record<string, number> = {};
    unpaidInvoices.forEach(inv => {
      exactAllocations[inv.id] = inv.balance;
    });
    setAllocations(exactAllocations);
  }, [exactInvoiceAmount, unpaidInvoices, isEditMode]);


  const numericAmount = Number(amount) || 0;
  const creditUsed = (useCredit && availableCredit > 0) ? availableCredit : 0;
  const totalFundsAvailable = roundAmount(numericAmount + creditUsed);
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  const remainingFunds = roundAmount(totalFundsAvailable - totalAllocated);

  const handleManualAllocation = (invoiceId: string, val: string) => {
    if (autoAllocate) setAutoAllocate(false); 
    if (exactInvoiceAmount) setExactInvoiceAmount(false);

    let numVal = Number(val);
    if (isNaN(numVal)) numVal = 0;

    const invoice = unpaidInvoices.find(i => i.id === invoiceId);
    if (invoice && numVal > invoice.balance) {
      numVal = invoice.balance;
    }
    setAllocations(prev => ({ ...prev, [invoiceId]: numVal }));
  };

  const handleCheckboxChange = (invoiceId: string, isChecked: boolean) => {
    if (autoAllocate) setAutoAllocate(false); 
    if (exactInvoiceAmount) setExactInvoiceAmount(false); 

    if (!isChecked) {
        setAllocations(prev => {
            const next = { ...prev };
            delete next[invoiceId];
            return next;
        });
        return;
    }

    const targetInvoice = unpaidInvoices.find(inv => inv.id === invoiceId);
    if (!targetInvoice) return;

    const usedElsewhere = Object.entries(allocations)
        .filter(([key]) => key !== invoiceId)
        .reduce((sum, [, val]) => sum + val, 0);
    
    const currentRemaining = roundAmount(totalFundsAvailable - usedElsewhere);

    if (currentRemaining <= 0) {
        setAllocations(prev => ({ ...prev, [invoiceId]: 0 }));
        return;
    }

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
    setExactInvoiceAmount(false);
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
      let finalPaymentId = paymentId;

      if (isEditMode && paymentId) {
          const { data: oldAllocations } = await supabase.from('payment_allocations').select('*').eq('payment_id', paymentId);
          if (oldAllocations && oldAllocations.length > 0) {
              for (const old of oldAllocations) {
                  const { data: inv } = await supabase.from('invoices').select('id, paid_amount, total_amount').eq('id', old.invoice_id).single();
                  if (inv) {
                      const rollbackPaid = roundAmount(inv.paid_amount - old.amount);
                      let newStatus = 'Unpaid';
                      if (rollbackPaid >= inv.total_amount) newStatus = 'Paid';
                      else if (rollbackPaid > 0) newStatus = 'Partial';
                      await supabase.from('invoices').update({ paid_amount: Math.max(0, rollbackPaid), status: newStatus }).eq('id', inv.id);
                  }
              }
          }
          await supabase.from('payment_allocations').delete().eq('payment_id', paymentId);
          
          await supabase.from('payments').update({
              payment_date: paymentDate,
              amount: currentNumericAmount,
              unallocated_amount: currentNumericAmount,
              category: method,
              reason: reason
          }).eq('id', paymentId);
      } else {
          if (currentNumericAmount > 0) {
              const { data: pay, error: payError } = await supabase.from('payments').insert({
                customer_id: selectedCustomerId,
                payment_date: paymentDate,
                amount: currentNumericAmount,
                unallocated_amount: currentNumericAmount, 
                category: method,
                reason: reason,
              }).select().single();
              if (payError) throw payError;
              finalPaymentId = pay.id;
          }
      }

      let fundingSources: { id: string, balance: number }[] = [];

      if (useCredit && availableCredit > 0 && !isEditMode) {
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

      if (finalPaymentId && currentNumericAmount > 0) {
        fundingSources.push({ id: finalPaymentId, balance: currentNumericAmount });
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

        const { data: currentInv } = await supabase.from('invoices').select('id, total_amount, paid_amount').eq('id', invoiceId).single();
        if (currentInv) {
          const newPaid = roundAmount(currentInv.paid_amount + allocatedAmt);
          const isFullyPaid = Math.abs(currentInv.total_amount - newPaid) < 0.01;
          const newStatus = isFullyPaid ? 'Paid' : 'Partial';
          
          await supabase.from('invoices').update({
            paid_amount: newPaid,
            status: newStatus
          }).eq('id', invoiceId);
        }
      }

      alert(isEditMode ? "Payment updated successfully!" : "Payment processed successfully!");

      if (shouldRedirect) {
        router.push("/payment/list");
      } else {
        setSelectedCustomerId("");
        setAmount("");
        setReason("");
        setUseCredit(false);
        setAllocations({});
        setAutoAllocate(false);
        setExactInvoiceAmount(false);
        router.replace("/payment/new");
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
          <h1 className="text-2xl font-bold text-slate-900">{isEditMode ? "Edit Payment" : "Receive Payment"}</h1>
          <p className="text-slate-500 text-sm">{isEditMode ? `Updating Payment #${paymentId}` : "Apply payment to invoices."}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* Left Column: Input Form */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 h-fit sticky top-6 relative">
            {/* 로딩 오버레이 (자연스러운 전환을 위함) */}
            {loading && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Customer
              </label>
              <SearchableSelect 
                options={customers.map(c => ({ id: c.id, label: c.name }))} 
                value={selectedCustomerId} 
                onChange={setSelectedCustomerId} 
                placeholder="Select Customer..." 
                disabled={isEditMode} 
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
                    onChange={e => {
                        setAmount(e.target.value);
                        if (exactInvoiceAmount) setExactInvoiceAmount(false); 
                    }}
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
                  disabled={isEditMode} 
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Reference</label>
                <Input placeholder="Optional note..." value={reason} onChange={e => setReason(e.target.value)} />
              </div>
            </div>

            {availableCredit > 0 && !isEditMode && (
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
              {!isEditMode && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Credit Used</span>
                  <span className="font-medium text-emerald-600">+ ${creditUsed.toLocaleString()}</span>
                </div>
              )}
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
                    disabled={loading || !selectedCustomerId || isEditMode} 
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
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEditMode ? "Update Payment" : "Save Payment")}
                </Button>
            </div>

          </div>
        </div>

        {/* Right Column: Invoice List Table */}
        <div className="xl:col-span-2 space-y-4 relative">
          {loading && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-xl"></div>
          )}
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {isEditMode ? "Allocated Invoices" : "Unpaid Invoices"}
            </h3>
            <div className="flex items-center gap-6">
              
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="exactInvoice" 
                  checked={exactInvoiceAmount} 
                  onCheckedChange={(c) => setExactInvoiceAmount(!!c)} 
                  disabled={isEditMode}
                  className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
                <label htmlFor="exactInvoice" className={`text-sm font-medium ${isEditMode ? 'text-slate-400 cursor-not-allowed' : 'cursor-pointer text-blue-700 hover:text-blue-900'}`}>
                    Exact Invoice Amount
                </label>
              </div>

              <div className="w-px h-5 bg-slate-200"></div>

              <div className="flex items-center gap-2">
                <Checkbox 
                  id="autoAlloc" 
                  checked={autoAllocate} 
                  disabled={isEditMode}
                  onCheckedChange={(c) => {
                      const isChecked = !!c;
                      setAutoAllocate(isChecked);
                      if (!isChecked) {
                          setAllocations({});
                      }
                  }} 
                />
                <label htmlFor="autoAlloc" className={`text-sm font-medium ${isEditMode ? 'text-slate-400 cursor-not-allowed' : 'cursor-pointer text-slate-600 hover:text-slate-900'}`}>
                    Auto Allocate (Oldest First)
                </label>
              </div>

            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {unpaidInvoices.length === 0 ? (
              <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 opacity-20" />
                <p>{isEditMode ? "No invoices found." : "No unpaid invoices for this customer."}</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase">
                  <tr>
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
                    const allocatedAmount = allocations[inv.id] || 0;
                    const isChecked = allocatedAmount > 0;
                    // Edit 모드일 때는 보여지는 잔액에서 할당된 금액을 빼서 화면상 0(Paid)으로 보이게 함
                    const remainingBalance = Math.max(0, roundAmount(inv.balance - allocatedAmount));

                    return (
                        <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${isChecked ? "bg-blue-50/20" : ""}`}>
                        <td className="px-6 py-4">
                            <Checkbox 
                                checked={isChecked}
                                onCheckedChange={(checked) => handleCheckboxChange(inv.id, !!checked)}
                                className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">#{inv.id.slice(0,13).toUpperCase()}</td>
                        <td className="px-6 py-4 text-slate-700">{inv.invoice_date}</td>
                        <td className="px-6 py-4 text-slate-500">{inv.due_date}</td>
                        <td className="px-6 py-4 text-right font-medium text-slate-900">{formatCurrency(inv.total_amount)}</td>
                        <td className={`px-6 py-4 text-right font-bold ${remainingBalance === 0 ? "text-emerald-600" : "text-slate-700"}`}>
                            {remainingBalance === 0 ? "Paid" : formatCurrency(remainingBalance)}
                        </td>
                        <td className="px-6 py-3 text-right">
                            <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                            <Input 
                                type="number"
                                className={`text-right h-9 pl-6 font-bold transition-all ${allocatedAmount > 0 ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : ""}`}
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

// ✅ Suspense 래핑을 통해 SearchParams 안전하게 처리
export default function PaymentForm({ paymentId }: { paymentId?: string }) {
  return (
    <Suspense fallback={<div className="p-10 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
      <PaymentFormInner paymentId={paymentId} />
    </Suspense>
  );
}