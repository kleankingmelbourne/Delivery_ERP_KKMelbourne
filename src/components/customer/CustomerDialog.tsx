"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  X, Save, Eye, EyeOff, CheckCircle2, XCircle, 
  Ban, ShieldCheck, Loader2, ChevronDown, MapPin, Users, Key, MailPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { getPlaceSuggestions, getPlaceDetails } from "@/app/actions/google-maps";
import { issueCustomerLoginAccount } from "@/app/actions/user-actions"; 

interface CustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customerData?: any; 
}

const PAYMENT_TERMS = ["C.O.D", "+7 Days", "+14 Days", "+30 Days", "EOM+30 Days"];

const initialData = {
  name: "", company: "", email: "", email_cc: "", contact_name: "", mobile: "", tel: "", abn: "",
  group_id: "", 
  in_charge_sale: "",     
  in_charge_delivery: "", 
  login_permit: true, disable_order: false,
  use_key: false,
  credit_limit: "", due_date: "C.O.D",
  customer_pw: "", 
  address: "", suburb: "", state: "", postcode: "", lat: null as number | null, lng: null as number | null,
  delivery_address: "", delivery_suburb: "", delivery_state: "", delivery_postcode: "", delivery_lat: null as number | null, delivery_lng: null as number | null,
  note: "",
  login_email: "", 
  password: "", 
};

export default function CustomerDialog({ isOpen, onClose, onSuccess, customerData }: CustomerDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  
  // 기본값을 true로 유지
  const [isSameAddress, setIsSameAddress] = useState(true);
  
  const [groupOptions, setGroupOptions] = useState<{id: number, name: string}[]>([]);
  const [staffOptions, setStaffOptions] = useState<{id: string, name: string}[]>([]);

  // --- Google Maps States ---
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearchField, setActiveSearchField] = useState<'billing' | 'delivery' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [addressHighlightedIndex, setAddressHighlightedIndex] = useState(0); 

  const billingRef = useRef<HTMLDivElement>(null);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const searchCache = useRef<Record<string, any[]>>({});

  const [formData, setFormData] = useState(initialData);

  // 옵션 데이터 로드
  useEffect(() => {
    let isMounted = true;
    const fetchOptions = async () => {
      try {
        const [groupRes, staffRes] = await Promise.all([
          supabase.from('customer_groups').select('id, name').order('name'),
          supabase.from('profiles').select('id, display_name').eq('status', 'active').order('display_name')
        ]);
        
        if (isMounted) {
          if (groupRes.data) setGroupOptions(groupRes.data);
          if (staffRes.data) setStaffOptions(staffRes.data.map((s: any) => ({ id: s.id, name: s.display_name || "Unknown" })));
        }
      } catch (err) {
        console.error("Fetch Options Error:", err);
      }
    };
    fetchOptions();
    return () => { isMounted = false; };
  }, [supabase]);

  // DB의 null 값을 모두 ""(빈 글자)로 필터링 & 초기 세팅
  useEffect(() => {
    if (!isOpen) return;

    if (customerData) {
      // 수정 모드: 기존 데이터가 있으면 주소가 같은지 비교해서 체크박스 상태 결정
      const isSame = customerData.address === customerData.delivery_address && 
                     customerData.suburb === customerData.delivery_suburb;
      
      setFormData({
        ...initialData,
        ...customerData,
        name: customerData.name || "",
        company: customerData.company || "",
        email: customerData.email || "",
        email_cc: customerData.email_cc || "",
        contact_name: customerData.contact_name || "",
        mobile: customerData.mobile || "",
        tel: customerData.tel || "",
        abn: customerData.abn || "",
        customer_pw: customerData.customer_pw || "",
        address: customerData.address || "",
        suburb: customerData.suburb || "",
        state: customerData.state || "",
        postcode: customerData.postcode || "",
        delivery_address: customerData.delivery_address || "",
        delivery_suburb: customerData.delivery_suburb || "",
        delivery_state: customerData.delivery_state || "",
        delivery_postcode: customerData.delivery_postcode || "",
        note: customerData.note || "",
        credit_limit: customerData.credit_limit || "",
        group_id: customerData.group_id || "", 
        in_charge_sale: customerData.in_charge_sale || "",     
        in_charge_delivery: customerData.in_charge_delivery || "",
        due_date: customerData.due_date || "C.O.D",
        login_email: customerData.login_email || "",
        password: customerData.password || "",
        lat: customerData.lat || null, 
        lng: customerData.lng || null,
        delivery_lat: customerData.delivery_lat || null, 
        delivery_lng: customerData.delivery_lng || null,
      });
      setIsSameAddress(isSame);
    } else {
      // 신규 등록 모드: 초기 폼 데이터 세팅 및 배송지 동일 체크박스를 기본 true로 설정!
      setFormData(initialData);
      setIsSameAddress(true); 
    }
    
    setShowPassword(false);
    setSuggestions([]); 
    setActiveSearchField(null);
    setAddressHighlightedIndex(0);
  }, [isOpen, customerData]);

  // 외부 클릭 시 검색어 추천창 닫기
  useEffect(() => {
    if (!activeSearchField) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (activeSearchField === 'billing' && billingRef.current && !billingRef.current.contains(event.target as Node)) {
        setActiveSearchField(null);
        setSuggestions([]);
      } else if (activeSearchField === 'delivery' && deliveryRef.current && !deliveryRef.current.contains(event.target as Node)) {
        setActiveSearchField(null);
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeSearchField]);

  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleIssueAccount = async () => {
    if (!customerData?.id) return alert("Please save the new customer first before issuing an account.");
    if (!formData.login_email || !formData.password) return alert("Please enter both Login Email and Password to issue an account.");

    setIsIssuing(true);
    const result = await issueCustomerLoginAccount(customerData.id, formData.name, formData.login_email, formData.password);
    setIsIssuing(false);

    if (result.success) {
      alert("✅ Login account has been successfully issued & linked!");
      onSuccess(); 
    } else {
      alert("❌ Failed to issue account: " + result.message);
    }
  };

  useEffect(() => {
    const targetAddress = activeSearchField === 'billing' ? formData.address : formData.delivery_address;
    
    if (!activeSearchField || !targetAddress || targetAddress.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    if (searchCache.current[targetAddress]) {
      setSuggestions(searchCache.current[targetAddress]);
      setAddressHighlightedIndex(0);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await getPlaceSuggestions(targetAddress);
        searchCache.current[targetAddress] = results; 
        setSuggestions(results);
        setAddressHighlightedIndex(0); 
      } catch (err) {
        console.error("Map suggestion error", err);
      } finally {
        setIsSearching(false);
      }
    }, 300); 

    return () => clearTimeout(timer);
  }, [formData.address, formData.delivery_address, activeSearchField]);

  const handleAddressInput = (field: 'billing' | 'delivery', value: string) => {
    setActiveSearchField(field);
    handleChange(field === 'billing' ? 'address' : 'delivery_address', value);
  };

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'billing' | 'delivery') => {
      if (suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAddressHighlightedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAddressHighlightedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = suggestions[addressHighlightedIndex];
          if (selected) handleSelectPlace(selected.place_id, selected.description, field);
      } else if (e.key === 'Escape') {
          setActiveSearchField(null);
          setSuggestions([]);
      }
  };

  const handleSelectPlace = async (placeId: string, description: string, field: 'billing' | 'delivery') => {
    setActiveSearchField(null);
    setSuggestions([]);
    handleChange(field === 'billing' ? 'address' : 'delivery_address', description);

    try {
        const details = await getPlaceDetails(placeId);
        if (!details) return;

        let refinedAddress = description;
        if (details.address && description.includes(details.address)) {
            refinedAddress = description.substring(0, description.indexOf(details.address) + details.address.length);
        } else {
            const parts = description.split(',').map(s => s.trim());
            if (parts[parts.length - 1] === 'Australia') parts.pop();
            if (details.suburb && parts[parts.length - 1].includes(details.suburb)) parts.pop();
            refinedAddress = parts.join(', ').trim();
        }

        if (field === 'billing') {
            setFormData(prev => ({
                ...prev, address: refinedAddress, suburb: details.suburb || prev.suburb,
                state: details.state || prev.state, postcode: details.postcode || prev.postcode,
                lat: details.lat, lng: details.lng  
            }));
        } else {
            setFormData(prev => ({
                ...prev, delivery_address: refinedAddress, delivery_suburb: details.suburb || prev.delivery_suburb,
                delivery_state: details.state || prev.delivery_state, delivery_postcode: details.postcode || prev.delivery_postcode,
                delivery_lat: details.lat, delivery_lng: details.lng  
            }));
        }
    } catch (e) {
        console.error("Map Details Error:", e);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) return alert("Customer Name is required.");
    setLoading(true);
    
    try {
      const { id, customer_groups, profiles, created_at, ...cleanData } = formData as any;
      
      const payload: any = {
        ...cleanData,
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
        group_id: formData.group_id ? Number(formData.group_id) : null,
        in_charge_sale: formData.in_charge_sale || null,
        in_charge_delivery: formData.in_charge_delivery || null,
      };

      if (isSameAddress) {
        payload.delivery_address = formData.address;
        payload.delivery_suburb = formData.suburb;
        payload.delivery_state = formData.state;
        payload.delivery_postcode = formData.postcode;
        
        // 🚀 요청하신 핵심 방어 로직: 
        // 배송지 좌표가 '비어있을 때'만 결제지 좌표를 복사합니다.
        // 이미 값이 들어가 있다면 그 값(기존 값)을 덮어씌우지 않고 유지합니다.
        if (!payload.delivery_lat || !payload.delivery_lng) {
          payload.delivery_lat = formData.lat;
          payload.delivery_lng = formData.lng;
        }
      }

      if (customerData) {
        delete payload.login_email;
        delete payload.password;

        const isBillingChanged = customerData.address !== formData.address || customerData.suburb !== formData.suburb || customerData.postcode !== formData.postcode;
        const isDeliveryChanged = customerData.delivery_address !== formData.delivery_address || customerData.delivery_suburb !== formData.delivery_suburb || customerData.delivery_postcode !== formData.delivery_postcode;

        // 수정사항이 없으면 기존 좌표 보호를 위해 payload에서 제거
        if (!isBillingChanged) { delete payload.lat; delete payload.lng; }
        if (!isSameAddress && !isDeliveryChanged) { delete payload.delivery_lat; delete payload.delivery_lng; }
      }

      const { error } = customerData?.id 
        ? await supabase.from("customers").update(payload).eq("id", customerData.id)
        : await supabase.from("customers").insert({ ...payload, created_at: new Date().toISOString() });

      if (error) throw error;

      alert(customerData ? "Customer updated!" : "Customer added successfully!");
      onSuccess();
      onClose();

    } catch (e: any) {
      console.error("🔥 Submission Failed:", e);
      let msg = e.message || e.details || JSON.stringify(e);
      if (msg.includes("customers_pkey")) msg = "System ID Error. Please contact admin.";
      else if (msg.includes("customers_email_key")) msg = "This email is already registered.";
      alert("Failed to save: " + msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">{customerData ? "Edit Customer" : "Add New Customer"}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            <section className="space-y-4 bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
              <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2 border-b border-indigo-200 pb-2">
                <Key className="w-4 h-4" /> App Login Account
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-indigo-900">App Login Email</Label>
                  <Input 
                    type="email"
                    value={formData.login_email || ""} 
                    onChange={(e) => handleChange("login_email", e.target.value)} 
                    placeholder="customer@example.com" 
                    className="border-indigo-200 focus-visible:ring-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-bold text-indigo-900">App Password (For Issue/Reset)</Label>
                    <div className="relative">
                        <Input 
                            type={showPassword ? "text" : "password"} 
                            value={formData.password || ""} 
                            onChange={(e) => handleChange("password", e.target.value)} 
                            className="pr-10 border-indigo-200 focus-visible:ring-indigo-500" 
                            placeholder="Enter temporary password" 
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <Button 
                    type="button" 
                    onClick={handleIssueAccount} 
                    disabled={isIssuing || !customerData?.id} 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 h-10"
                  >
                    {isIssuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><MailPlus className="w-4 h-4 mr-2"/> Issue / Update</>}
                  </Button>
                  {!customerData?.id && <span className="text-[10px] text-indigo-400 text-center font-semibold">Please save customer first</span>}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Status & Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2"><Label className="text-xs text-slate-500">Customer ID</Label><div className="h-10 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-md text-sm text-slate-400 font-mono select-none">{customerData ? customerData.id.slice(0, 8) + "..." : "Auto-generated"}</div></div>
                <div className="space-y-2 flex flex-col"><Label className="text-xs font-bold text-slate-700 mb-1">Login Permission</Label><Button type="button" variant="outline" onClick={() => handleChange("login_permit", !formData.login_permit)} className={`justify-start gap-2 h-10 border ${formData.login_permit ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>{formData.login_permit ? <><CheckCircle2 className="w-4 h-4" /> Allowed</> : <><XCircle className="w-4 h-4" /> Denied</>}</Button></div>
                <div className="space-y-2 flex flex-col"><Label className="text-xs font-bold text-slate-700 mb-1">Order Status</Label><Button type="button" variant="outline" onClick={() => handleChange("disable_order", !formData.disable_order)} className={`justify-start gap-2 h-10 border ${formData.disable_order ? "bg-red-50 border-red-200 text-red-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>{formData.disable_order ? <><Ban className="w-4 h-4" /> Order Blocked</> : <><ShieldCheck className="w-4 h-4" /> Order Active</>}</Button></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Basic Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Customer Name <span className="text-red-500">*</span></Label><Input value={formData.name || ""} onChange={(e) => handleChange("name", e.target.value)} placeholder="Full Name" /></div>
                <div className="space-y-2"><Label>Company Name</Label><Input value={formData.company || ""} onChange={(e) => handleChange("company", e.target.value)} placeholder="Company Pty Ltd" /></div>
                
                <div className="space-y-2"><Label>General Email</Label><Input type="email" value={formData.email || ""} onChange={(e) => handleChange("email", e.target.value)} placeholder="name@example.com" /></div>
                
                <div className="space-y-2">
                  <Label>Email CC</Label>
                  <Input 
                    type="text" 
                    value={formData.email_cc || ""} 
                    onChange={(e) => handleChange("email_cc", e.target.value)} 
                    placeholder="cc1@example.com, cc2@example.com" 
                  />
                </div>

                <div className="space-y-2"><Label>Customer Group</Label><div className="relative"><select value={formData.group_id || ""} onChange={(e) => handleChange("group_id", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 appearance-none"><option value="">No Group</option>{groupOptions.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
                <div className="space-y-2"><Label>ABN</Label><Input value={formData.abn || ""} onChange={(e) => handleChange("abn", e.target.value)} placeholder="XX XXX XXX XXX" /></div>
                
                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 items-end">
                    <div className="space-y-2">
                        <Label className="text-blue-700 font-bold block">Delivery Access PW (Max 50)</Label>
                        <Input 
                            value={formData.customer_pw || ""} 
                            onChange={(e) => handleChange("customer_pw", e.target.value)} 
                            maxLength={50} 
                            placeholder="e.g. 1234 or *9999" 
                            className="bg-white border-blue-200 focus-visible:ring-blue-500 h-11"
                        />
                    </div>
                    
                    <div className={cn(
                        "flex items-center space-x-3 px-4 h-11 rounded-lg border-2 transition-all cursor-pointer",
                        formData.use_key 
                            ? "bg-amber-100 border-amber-500 shadow-md" 
                            : "bg-white border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                    )}
                    onClick={() => handleChange("use_key", !formData.use_key)}
                    >
                        <Checkbox 
                            id="useKey" 
                            checked={formData.use_key} 
                            onCheckedChange={(c) => handleChange("use_key", !!c)} 
                            className="w-5 h-5 rounded border-slate-400 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                            onClick={(e) => e.stopPropagation()} 
                        />
                        <label htmlFor="useKey" className="text-sm font-medium cursor-pointer select-none flex items-center gap-2 flex-1">
                            <Key className={cn("w-5 h-5", formData.use_key ? "text-amber-600" : "text-slate-400")}/> 
                            <span className={formData.use_key ? "text-amber-900" : "text-slate-600"}>
                                Physical Key Required
                            </span>
                        </label>
                    </div>
                </div>

                <div className="space-y-2"><Label>Contact Name</Label><Input value={formData.contact_name || ""} onChange={(e) => handleChange("contact_name", e.target.value)} placeholder="Manager or Contact Person" /></div>
                <div className="space-y-2"><Label>Mobile</Label><Input value={formData.mobile || ""} onChange={(e) => handleChange("mobile", e.target.value)} placeholder="0400 000 000" /></div>
                <div className="space-y-2"><Label>Tel</Label><Input value={formData.tel || ""} onChange={(e) => handleChange("tel", e.target.value)} placeholder="03 0000 0000" /></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2 flex items-center gap-2"><Users className="w-4 h-4"/> Staff Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-blue-700 font-semibold">Sales Representative</Label><div className="relative"><select value={formData.in_charge_sale || ""} onChange={(e) => handleChange("in_charge_sale", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 appearance-none"><option value="">Select Sales Person...</option>{staffOptions.map((staff) => (<option key={staff.id} value={staff.id}>{staff.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
                <div className="space-y-2"><Label className="text-emerald-700 font-semibold">Delivery Driver</Label><div className="relative"><select value={formData.in_charge_delivery || ""} onChange={(e) => handleChange("in_charge_delivery", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 appearance-none"><option value="">Select Driver...</option>{staffOptions.map((staff) => (<option key={staff.id} value={staff.id}>{staff.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Financial</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Credit Limit ($)</Label><Input type="number" value={formData.credit_limit || ""} onChange={(e) => handleChange("credit_limit", e.target.value)} placeholder="0.00" /></div>
                <div className="space-y-2"><Label>Payment Terms (Due Date)</Label><div className="relative"><select value={formData.due_date || "C.O.D"} onChange={(e) => handleChange("due_date", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 appearance-none">{PAYMENT_TERMS.map((term) => (<option key={term} value={term}>{term}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
              </div>
            </section>

            <section className="space-y-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    Address Details 
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-normal normal-case">Google Maps Auto-complete</span>
                  </div>
              </h3>
              
              {/* Billing Address Section */}
              <div ref={billingRef} className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-4 relative">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600"/> Billing Address
                </h4>
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 relative">
                        <Label className="text-xs text-slate-500">Street Address</Label>
                        <Input 
                            value={formData.address || ""}
                            onChange={(e) => handleAddressInput('billing', e.target.value)}
                            onFocus={() => setActiveSearchField('billing')}
                            onKeyDown={(e) => handleAddressKeyDown(e, 'billing')}
                            autoComplete="off"
                            placeholder="Start typing billing address..."
                        />
                        {isSearching && activeSearchField === 'billing' && <Loader2 className="absolute right-3 top-8 w-4 h-4 animate-spin text-slate-400" />}
                        {activeSearchField === 'billing' && suggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {suggestions.map((p, index) => (
                                    <div key={p.place_id} 
                                         className={`px-4 py-2 text-sm cursor-pointer flex gap-2 ${index === addressHighlightedIndex ? 'bg-blue-50 text-slate-900' : 'hover:bg-blue-50'}`}
                                         onMouseEnter={() => setAddressHighlightedIndex(index)}
                                         onMouseDown={(e) => { e.preventDefault(); handleSelectPlace(p.place_id, p.description, 'billing'); }}>
                                        <MapPin className="w-3 h-3 text-slate-400 mt-1" />
                                        <span>{p.description}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="col-span-5"><Label className="text-xs text-slate-500">Suburb</Label><Input value={formData.suburb || ""} onChange={(e) => handleChange("suburb", e.target.value)} /></div>
                    <div className="col-span-4"><Label className="text-xs text-slate-500">State</Label><Input value={formData.state || ""} onChange={(e) => handleChange("state", e.target.value)} /></div>
                    <div className="col-span-3"><Label className="text-xs text-slate-500">Postcode</Label><Input value={formData.postcode || ""} onChange={(e) => handleChange("postcode", e.target.value)} /></div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pl-1"><Checkbox id="sameAddress" checked={isSameAddress} onCheckedChange={(c) => setIsSameAddress(!!c)} className="border-slate-400 data-[state=checked]:bg-slate-900" /><label htmlFor="sameAddress" className="text-sm font-medium leading-none cursor-pointer select-none text-slate-700">Delivery address is same as billing address</label></div>

              {!isSameAddress && (
                <div ref={deliveryRef} className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-4 animate-in slide-in-from-top-2 fade-in relative">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600"/> Delivery Address
                  </h4>
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 relative">
                          <Label className="text-xs text-slate-500">Street Address</Label>
                          <Input
                            value={formData.delivery_address || ""}
                            onChange={(e) => handleAddressInput('delivery', e.target.value)}
                            onFocus={() => setActiveSearchField('delivery')}
                            onKeyDown={(e) => handleAddressKeyDown(e, 'delivery')}
                            autoComplete="off"
                            placeholder="Start typing delivery address..."
                          />
                          {isSearching && activeSearchField === 'delivery' && <Loader2 className="absolute right-3 top-8 w-4 h-4 animate-spin text-slate-400" />}
                          {activeSearchField === 'delivery' && suggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                  {suggestions.map((p, index) => (
                                      <div key={p.place_id} 
                                           className={`px-4 py-2 text-sm cursor-pointer flex gap-2 ${index === addressHighlightedIndex ? 'bg-blue-50 text-slate-900' : 'hover:bg-blue-50'}`}
                                           onMouseEnter={() => setAddressHighlightedIndex(index)}
                                           onMouseDown={(e) => { e.preventDefault(); handleSelectPlace(p.place_id, p.description, 'delivery'); }}>
                                          <MapPin className="w-3 h-3 text-slate-400 mt-1" />
                                          <span>{p.description}</span>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      <div className="col-span-5"><Label className="text-xs text-slate-500">Suburb</Label><Input value={formData.delivery_suburb || ""} onChange={(e) => handleChange("delivery_suburb", e.target.value)} /></div>
                      <div className="col-span-4"><Label className="text-xs text-slate-500">State</Label><Input value={formData.delivery_state || ""} onChange={(e) => handleChange("delivery_state", e.target.value)} /></div>
                      <div className="col-span-3"><Label className="text-xs text-slate-500">Postcode</Label><Input value={formData.delivery_postcode || ""} onChange={(e) => handleChange("delivery_postcode", e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Staff Note</h3>
              <Textarea value={formData.note || ""} onChange={(e) => handleChange("note", e.target.value)} placeholder="Internal notes..." className="h-24" />
            </section>

          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading} className="bg-slate-900 hover:bg-slate-800 min-w-[120px]">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2"/> Saving...</> : <><Save className="w-4 h-4 mr-2"/> {customerData ? "Update" : "Save"}</>}
            </Button>
          </div>

        </div>
      </div>
    </>
  );
}