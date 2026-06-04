"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Calendar, Download, Save, FileText, AlertCircle, Printer, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ✅ [복구] 요청하신 유틸리티 파일 사용
import { downloadStatementPdf, printStatementPdf } from "@/utils/downloadPdf";

interface StatementProps {
  customerId: string;
  customerName: string;
  customerCompany: string;
  initialStartDate?: string;
  initialEndDate?: string;
  autoGenerate?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  // [NEW] 이메일 발송을 위한 콜백 함수 (부모 컴포넌트에서 처리)
  onEmail?: () => void;
  // [NEW] 저장 성공 시 부모에게 알림 (리스트로 돌아가기 위함)
  onSuccess?: () => void;
}

export default function StatementGenerator({ 
  customerId, 
  customerName, 
  customerCompany,
  initialStartDate,
  initialEndDate,
  autoGenerate = false,
  onDirtyChange,
  onEmail, // [NEW]
  onSuccess // [NEW]
}: StatementProps) {
  const supabase = createClient();
  
  const [startDate, setStartDate] = useState(initialStartDate || "");
  const [endDate, setEndDate] = useState(initialEndDate || "");
  const [invoices, setInvoices] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false); // [NEW] 다운로드 로딩 상태
  const [generated, setGenerated] = useState(false);
  const [unsaved, setUnsaved] = useState(false);

  // 부모 컴포넌트에 상태 전달 및 브라우저 이탈 방지
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(unsaved);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved) {
        e.preventDefault();
        e.returnValue = ''; 
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsaved, onDirtyChange]);

  // 자동 생성 (View 모드)
  useEffect(() => {
    if (autoGenerate && startDate && endDate) {
      handleGenerate(true); 
    }
  }, [autoGenerate]);

  const handleGenerate = async (isAuto = false) => {
    if (!startDate || !endDate) return alert("Select date range.");
    setLoading(true);
    setGenerated(false);

    try {
      // 1. 인보이스와 남은 크레딧(Payment) 데이터를 동시에 가져옵니다.
      const [invRes, payRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("customer_id", customerId)
          .gte("invoice_date", startDate)
          .lte("invoice_date", endDate)
          .order("invoice_date", { ascending: true }),
        supabase
          .from("payments")
          .select("id, payment_date, unallocated_amount")
          .eq("customer_id", customerId)
          .gt("unallocated_amount", 0) // 잔액이 남아있는 것만
      ]);

      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;

      // 2. 인보이스 필터링: Paid, Completed, Cancel 제외 & 잔액 0원 제외
      const openInvoices = invRes.data?.filter(inv => {
         const s = (inv.status || '').toLowerCase();
         if (s === 'paid' || s === 'completed' || s.includes('cancel')) return false;
         if (inv.total_amount > 0 && Math.abs(inv.total_amount - (inv.paid_amount || 0)) < 0.01) return false;
         
         // 화면에 이미 사용된 크레딧 메모도 표시하지 않음
         const isCredit = (typeof inv.id === 'string' && inv.id.startsWith('CR-')) || inv.total_amount < 0 || s === 'credit';
         if (isCredit) return false;

         return true;
      }).map(inv => ({
          id: inv.id,
          date: inv.invoice_date,
          type: 'Invoice',
          status: inv.status,
          total: inv.total_amount,
          balance: inv.total_amount - (inv.paid_amount || 0)
      })) || [];

      // 3. 남은 크레딧을 목록 형식에 맞게 변환
      const openCredits = payRes.data?.map(pay => {
          const isCrMemo = typeof pay.id === 'string' && pay.id.startsWith('CR-');
          return {
              id: pay.id,
              date: pay.payment_date || endDate,
              type: isCrMemo ? 'Credit Memo' : 'Payment',
              status: 'Available',
              total: 0, 
              balance: -(pay.unallocated_amount || 0) // 잔액 깎아주는 역할이므로 마이너스 표기
          };
      }) || [];

      // 4. 합친 후 날짜순(오름차순) 정렬
      const combinedList = [...openInvoices, ...openCredits].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      setInvoices(combinedList);
      setGenerated(true);

      if (!isAuto) {
        setUnsaved(true);
      }
    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 수동 저장 핸들러
  const handleSaveLog = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.from("statement_logs").insert({
        customer_id: customerId,
        start_date: startDate,
        end_date: endDate
      });

      if (error) throw error;

      setUnsaved(false); // 저장 상태 해제
      if (onDirtyChange) {
        onDirtyChange(false);
      }
      alert("✅ Statement saved to history!");
      
      // ✅ [NEW] 저장 성공 시 부모 컴포넌트의 콜백 호출 (리스트로 돌아가기)
      if (onSuccess) {
        onSuccess();
      }

    } catch (e: any) {
      alert("Failed to save: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ [수정] 유틸리티(downloadPdf) 사용하여 다운로드
  const handleDownload = async () => {
    if (!generated) return;
    setDownloading(true); // 로딩 시작
    try {
        await downloadStatementPdf(customerId, startDate, endDate, customerName);
    } catch (error) {
        console.error("Download failed:", error);
        alert("Failed to download PDF.");
    } finally {
        setDownloading(false); // 로딩 종료
    }
  };

  // ✅ [수정] 유틸리티(downloadPdf) 사용하여 프린트
  const handlePrint = () => {
    if (!generated) return;
    printStatementPdf(customerId, startDate, endDate, customerName);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">Start Date</label>
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setUnsaved(true); }} />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase">End Date</label>
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setUnsaved(true); }} />
        </div>
        <Button onClick={() => handleGenerate(false)} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 font-bold">
          {loading ? "Processing..." : "Generate Preview"}
        </Button>
      </div>

      {generated && (
        <div className="mt-6 border-t border-slate-100 pt-6 animate-in fade-in">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600"/> 
              Statement Preview ({invoices.length} invoices)
            </h3>
            
            <div className="flex items-center gap-2">
               {/* Save Button */}
               {unsaved ? (
                 <Button size="sm" onClick={handleSaveLog} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold animate-pulse">
                   <Save className="w-4 h-4 mr-2"/> Save
                 </Button>
               ) : (
                 <Button size="sm" variant="outline" disabled className="text-emerald-600 border-emerald-200 bg-emerald-50">
                   <Save className="w-4 h-4 mr-2"/> Saved
                 </Button>
               )}

               {/* ✅ [추가] 이메일 버튼 */}
               {onEmail && (
                   <Button size="sm" variant="outline" onClick={onEmail} title="Email Statement">
                       <Mail className="w-4 h-4 mr-2"/> Email
                   </Button>
               )}

               {/* ✅ [추가] 프린트 버튼 */}
               <Button size="sm" variant="outline" onClick={handlePrint} title="Print Statement">
                   <Printer className="w-4 h-4"/> 
               </Button>

               {/* ✅ [수정] 다운로드 버튼 (로딩 표시) */}
               <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
                 {downloading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Download className="w-4 h-4"/>}
               </Button>
            </div>
          </div>

          {unsaved && (
            <div className="mb-4 p-3 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg flex items-center gap-2 border border-amber-100">
                <AlertCircle className="w-4 h-4" />
                This statement has changes that are not saved to history yet.
            </div>
          )}

          <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b font-bold text-slate-600 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
                <tbody className="divide-y">
                  {invoices.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-400">No active invoices or credits found for this period.</td></tr>
                  ) : (
                      invoices.map(inv => (
                          <tr key={inv.id}>
                              <td className="px-4 py-3">{inv.date}</td>
                              <td className="px-4 py-3">{inv.id.slice(0,13).toUpperCase()}</td>
                              <td className="px-4 py-3">
                                  {inv.type === 'Payment' || inv.type === 'Credit Memo' ? (
                                      <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px]">{inv.type}</span>
                                  ) : (
                                      inv.status
                                  )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                  {inv.total > 0 ? `$${inv.total.toFixed(2)}` : '-'}
                              </td>
                              <td className={`px-4 py-3 text-right font-bold ${inv.balance < 0 ? 'text-emerald-600' : ''}`}>
                                  {inv.balance < 0 
                                      ? `-$${Math.abs(inv.balance).toFixed(2)}` 
                                      : `$${inv.balance.toFixed(2)}`}
                              </td>
                          </tr>
                      ))
                  )}
                </tbody>
              </table>
          </div>
        </div>
      )}
    </div>
  );
}