"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Building2, Save, CreditCard, MapPin, Globe, Mail, Phone, 
  FileText, Loader2, StickyNote, Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// 타입 정의
interface CompanySettings {
  id?: string;
  company_name: string;
  abn: string;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  address_line2: string;
  suburb: string;
  state: string;
  postcode: string;
  // Bank Info
  bank_name: string;
  account_name: string;
  bsb_number: string;
  account_number: string;
  bank_payid: string;
  gst_rate: number;
  // Footer Info
  invoice_info: string;
  statement_info: string;
  quotation_info: string;
}

// 초기값
const INITIAL_DATA: CompanySettings = {
  company_name: "", abn: "", email: "", phone: "", website: "",
  address_line1: "", address_line2: "", suburb: "", state: "VIC", postcode: "",
  bank_name: "", account_name: "", bsb_number: "", account_number: "", 
  bank_payid: "", 
  gst_rate: 10,
  invoice_info: "",
  statement_info: "",
  quotation_info: ""
};

export default function InfoSettingPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CompanySettings>(INITIAL_DATA);

  // 데이터 조회
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .limit(1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error("Error fetching settings:", error);
        }

        if (data) {
          // ✅ [수정됨] DB의 null 값을 빈 문자열("")로 변환하여 React State 오류 방지
          setFormData({
            id: data.id,
            company_name: data.company_name ?? "",
            abn: data.abn ?? "",
            email: data.email ?? "",
            phone: data.phone ?? "",
            website: data.website ?? "",
            address_line1: data.address_line1 ?? "",
            address_line2: data.address_line2 ?? "",
            suburb: data.suburb ?? "",
            state: data.state ?? "VIC",
            postcode: data.postcode ?? "",
            bank_name: data.bank_name ?? "",
            account_name: data.account_name ?? "",
            bsb_number: data.bsb_number ?? "",
            account_number: data.account_number ?? "",
            bank_payid: data.bank_payid ?? "", // null이면 ""로
            gst_rate: data.gst_rate ?? 10,
            invoice_info: data.invoice_info ?? "",
            statement_info: data.statement_info ?? "",
            quotation_info: data.quotation_info ?? ""
          });
        }
      } catch (error) {
        console.error("Fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 입력 핸들러 (Input용)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'gst_rate' ? Number(value) : value
    }));
  };

  // 입력 핸들러 (Textarea용)
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 저장 핸들러
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert(formData)
        .select()
        .single();

      if (error) throw error;
      
      alert("Settings saved successfully!");
    } catch (error: any) {
      alert("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50/50">
      
      {/* Header */}
      <div className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
             <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Company Information</h1>
            <p className="text-xs text-slate-500 font-medium">Basic business details.</p>
          </div>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md min-w-[120px]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full space-y-6 pb-20">
        
        {/* Section 1: Basic Info */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-slate-500"/> Company Profile
            </CardTitle>
            <CardDescription>Company name and contact details.</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input id="company_name" name="company_name" value={formData.company_name} onChange={handleChange} placeholder="e.g. Klean King Melbourne" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="abn">ABN</Label>
              <Input id="abn" name="abn" value={formData.abn} onChange={handleChange} placeholder="e.g. 12 345 678 901" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" id="email" name="email" value={formData.email} onChange={handleChange} placeholder="admin@example.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="0400 000 000" />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" value={formData.website} onChange={handleChange} placeholder="https://..." />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Address */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-slate-500"/> Address
            </CardTitle>
            <CardDescription>Registered business address.</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address_line1">Street Address</Label>
              <Input id="address_line1" name="address_line1" value={formData.address_line1} onChange={handleChange} placeholder="Unit 1, 123 Street" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suburb">Suburb</Label>
              <Input id="suburb" name="suburb" value={formData.suburb} onChange={handleChange} placeholder="Suburb" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" name="state" value={formData.state} onChange={handleChange} placeholder="VIC" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input id="postcode" name="postcode" value={formData.postcode} onChange={handleChange} placeholder="3000" />
                </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Financial & GST */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-slate-500"/> Banking & Tax
            </CardTitle>
            <CardDescription>Bank details for invoices and tax settings.</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank Name</Label>
              <Input id="bank_name" name="bank_name" value={formData.bank_name} onChange={handleChange} placeholder="Bank Name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_name">Account Name</Label>
              <Input id="account_name" name="account_name" value={formData.account_name} onChange={handleChange} placeholder="Account Name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bsb_number">BSB</Label>
              <Input id="bsb_number" name="bsb_number" value={formData.bsb_number} onChange={handleChange} placeholder="000-000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input id="account_number" name="account_number" value={formData.account_number} onChange={handleChange} placeholder="0000 0000" />
            </div>
            
            {/* PayID Input Field */}
            <div className="space-y-2 md:col-span-2">
                <Label htmlFor="bank_payid" className="flex items-center gap-2 text-emerald-700">
                    <Smartphone className="w-4 h-4"/> PayID
                </Label>
                <Input 
                    id="bank_payid" 
                    name="bank_payid" 
                    value={formData.bank_payid} 
                    onChange={handleChange} 
                    placeholder="Email, Phone, or ABN for PayID" 
                    className="border-emerald-200 focus:ring-emerald-500 bg-emerald-50/30"
                />
                <p className="text-[11px] text-slate-400">This will be displayed on your invoices as a payment option.</p>
            </div>

            <div className="space-y-2 md:col-span-2 border-t pt-4 mt-2">
              <Label htmlFor="gst_rate" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400"/> GST Rate (%)
              </Label>
              <Input type="number" id="gst_rate" name="gst_rate" value={formData.gst_rate} onChange={handleChange} className="max-w-[150px]" />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Document Notes */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-slate-500"/> Document Footers & Notes
            </CardTitle>
            <CardDescription>Default text to appear on the bottom of your documents.</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="grid grid-cols-1 gap-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="invoice_info">Invoice Footer Info</Label>
              <Textarea 
                id="invoice_info" 
                name="invoice_info" 
                value={formData.invoice_info} 
                onChange={handleTextareaChange} 
                placeholder="Enter default notes for Invoices (e.g. Thank you for your business!)"
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statement_info">Statement Footer Info</Label>
              <Textarea 
                id="statement_info" 
                name="statement_info" 
                value={formData.statement_info} 
                onChange={handleTextareaChange} 
                placeholder="Enter default notes for Statements (e.g. Please pay by due date.)"
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quotation_info">Quotation Footer Info</Label>
              <Textarea 
                id="quotation_info" 
                name="quotation_info" 
                value={formData.quotation_info} 
                onChange={handleTextareaChange} 
                placeholder="Enter default notes for Quotation (e.g. Please contact to Sales person any questions.)"
                className="min-h-[100px]"
              />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}