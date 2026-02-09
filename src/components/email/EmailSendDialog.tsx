"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Paperclip, Send } from "lucide-react";

// [중요] downloadPdf 유틸에서 모든 PDF 생성 함수 import (PurchaseOrder 포함)
import { 
  fetchAndGenerateQuotationBlob, 
  fetchAndGenerateBlob, 
  fetchAndGenerateStatementBlob,
  fetchAndGeneratePurchaseOrderBlob 
} from "@/utils/downloadPdf";

interface EmailSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    id: string;           
    // [UPDATE] purchase-order 타입 추가
    type: 'quotation' | 'invoice' | 'statement' | 'purchase-order'; 
    customerName: string;
    customerEmail: string;
    docNumber: string;    
  } | null;
}

export default function EmailSendDialog({ open, onOpenChange, data }: EmailSendDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  
  // 폼 상태
  const [to, setTo] = useState("");
  const [cc, setCc] = useState(""); // [NEW] CC 상태 추가
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  
  // 첨부파일 상태
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState("");

  // 다이얼로그가 열릴 때 초기화 및 PDF 생성
  useEffect(() => {
    if (open && data) {
      setTo(data.customerEmail || "");
      setCc(""); // CC 초기화
      
      // 제목 및 메시지 자동 설정
      let typeLabel = "";
      if (data.type === 'purchase-order') typeLabel = "Purchase Order";
      else typeLabel = data.type.charAt(0).toUpperCase() + data.type.slice(1);

      setSubject(`${typeLabel} #${data.docNumber} from Klean King`);
      setMessage(`Dear ${data.customerName},\n\nPlease find attached the ${typeLabel} #${data.docNumber}.\n\nBest regards,\nKlean King`);
      
      generatePdf(data);
    }
  }, [open, data]);

  const generatePdf = async (targetData: any) => {
    setLoading(true);
    setPdfBlob(null);
    try {
      let result = null;
      
      if (targetData.type === 'quotation') {
        result = await fetchAndGenerateQuotationBlob(targetData.id);
      } else if (targetData.type === 'invoice') {
        result = await fetchAndGenerateBlob([targetData.id], 'single');
      } else if (targetData.type === 'statement') {
        // ID 필드에 JSON 문자열이 들어있으므로 파싱
        const info = JSON.parse(targetData.id);
        result = await fetchAndGenerateStatementBlob(
            info.customerId,
            info.startDate,
            info.endDate,
            info.customerName
        );
      } else if (targetData.type === 'purchase-order') {
        // [NEW] PO PDF 생성 연결
        result = await fetchAndGeneratePurchaseOrderBlob(targetData.id);
      }
      
      if (result) {
        setPdfBlob(result.blob);
        setFilename(result.filename);
      } else {
        console.error("PDF generation returned null");
      }
    } catch (e) {
      console.error("PDF Generation failed:", e);
      alert("Failed to generate PDF attachment.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!to || !subject || !pdfBlob) return;
    setSending(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(pdfBlob);
      
      reader.onloadend = async () => {
        try {
            const base64data = reader.result as string;
            const content = base64data.split(',')[1];

            const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to,
                cc, // [NEW] CC 데이터 전송
                subject,
                html: message.replace(/\n/g, '<br/>'),
                attachments: [
                {
                    filename: filename,
                    content: content,
                },
                ],
            }),
            });

            const result = await res.json();

            if (!res.ok) {
                const errorMsg = result.error?.message || JSON.stringify(result.error) || "Failed to send email";
                throw new Error(errorMsg);
            }

            alert("Email sent successfully!");
            onOpenChange(false);
        } catch (innerError: any) {
            console.error("Inner Error:", innerError);
            alert("Error sending email: " + innerError.message);
        } finally {
            setSending(false);
        }
      };
      
      reader.onerror = () => {
        alert("Failed to read PDF file.");
        setSending(false);
      };

    } catch (e: any) {
      console.error(e);
      alert("Error preparing email: " + e.message);
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Email</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="to" className="text-right">To</Label>
            <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} className="col-span-3" />
          </div>

          {/* [NEW] CC Input Field */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cc" className="text-right">CC</Label>
            <Input 
                id="cc" 
                value={cc} 
                onChange={(e) => setCc(e.target.value)} 
                className="col-span-3" 
                placeholder="email@example.com, another@example.com"
            />
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="subject" className="text-right">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="col-span-3" />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="message" className="text-right pt-2">Message</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} className="col-span-3 h-32" />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Attachment</Label>
            <div className="col-span-3">
                {loading ? (
                    <div className="flex items-center text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF...
                    </div>
                ) : pdfBlob ? (
                    <div className="flex items-center p-2 bg-slate-100 rounded border border-slate-200 text-sm text-slate-700">
                        <Paperclip className="w-4 h-4 mr-2 text-slate-500" />
                        <span className="truncate max-w-[250px]">{filename}</span>
                        <span className="ml-2 text-xs text-slate-400">({(pdfBlob.size / 1024).toFixed(1)} KB)</span>
                    </div>
                ) : (
                    <span className="text-sm text-red-500">Failed to attach PDF (Try reopening)</span>
                )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={loading || sending || !pdfBlob} className="bg-blue-600 hover:bg-blue-700">
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}