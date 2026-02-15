"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  X, Save, Eye, EyeOff, CheckCircle2, XCircle, 
  Ban, ShieldCheck, Loader2, ChevronDown, MapPin, Users 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

// 📍 Server Action 임포트
import { getPlaceSuggestions, getPlaceDetails } from "@/app/actions/google-maps";

interface CustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  customerData?: any; 
}

const PAYMENT_TERMS = ["C.O.D", "+7 Days", "+14 Days", "+30 Days", "EOM+30 Days"];

export default function CustomerDialog({ isOpen, onClose, onSuccess, customerData }: CustomerDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [isSameAddress, setIsSameAddress] = useState(false);
  const [groupOptions, setGroupOptions] = useState<{id: number, name: string}[]>([]);
  const [staffOptions, setStaffOptions] = useState<{id: string, name: string}[]>([]);

  // Shadcn 스타일
  const inputClassName = "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

  // --- Google Maps States ---
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearchField, setActiveSearchField] = useState<'billing' | 'delivery' | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const initialData = {
    name: "", company: "", email: "", password: "", mobile: "", tel: "", abn: "",
    group_id: "", 
    in_charge_sale: "",     
    in_charge_delivery: "", 
    login_permit: true, disable_order: false,
    credit_limit: "", due_date: "C.O.D",
    address: "", suburb: "", state: "", postcode: "", lat: null as number | null, lng: null as number | null,
    delivery_address: "", delivery_suburb: "", delivery_state: "", delivery_postcode: "", delivery_lat: null as number | null, delivery_lng: null as number | null,
    note: ""
  };

  const [formData, setFormData] = useState(initialData);

  // 1. 기초 데이터 Fetching
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: groupData } = await supabase.from('customer_groups').select('id, name').order('name');
        if (groupData) setGroupOptions(groupData);
        
        const { data: staffData } = await supabase.from('profiles').select('id, display_name').eq('status', 'active').order('display_name', { ascending: true });
        if (staffData) {
          setStaffOptions(staffData.map((s: any) => ({ id: s.id, name: s.display_name || "Unknown Staff" })));
        }
      } catch (err) {
        console.error("Fetch Error:", err);
      }
    };
    fetchData();
  }, []);

  // 2. 데이터 세팅 및 초기화
  useEffect(() => {
    if (isOpen) {
      if (customerData) {
        // [EDIT MODE]
        const { customer_groups, ...cleanData } = customerData;
        setFormData({
          ...initialData,
          ...cleanData,
          name: cleanData.name || "",
          company: cleanData.company || "",
          email: cleanData.email || "",
          mobile: cleanData.mobile || "",
          tel: cleanData.tel || "",
          abn: cleanData.abn || "",
          address: cleanData.address || "",
          suburb: cleanData.suburb || "",
          state: cleanData.state || "",
          postcode: cleanData.postcode || "",
          lat: cleanData.lat || null, 
          lng: cleanData.lng || null, 
          delivery_address: cleanData.delivery_address || "",
          delivery_suburb: cleanData.delivery_suburb || "",
          delivery_state: cleanData.delivery_state || "",
          delivery_postcode: cleanData.delivery_postcode || "",
          delivery_lat: cleanData.delivery_lat || null, 
          delivery_lng: cleanData.delivery_lng || null, 
          note: cleanData.note || "",
          credit_limit: cleanData.credit_limit || "",
          group_id: cleanData.group_id || "", 
          in_charge_sale: cleanData.in_charge_sale || "",         
          in_charge_delivery: cleanData.in_charge_delivery || "", 
          password: "", 
        });

        const isSame = cleanData.address === cleanData.delivery_address && cleanData.suburb === cleanData.delivery_suburb;
        setIsSameAddress(isSame);

      } else {
        // [ADD MODE]
        setFormData(initialData);
        setIsSameAddress(false);
      }
      
      setShowPassword(false);
      setSuggestions([]); // 초기화
      setActiveSearchField(null);
    }
  }, [isOpen, customerData]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Google Maps Auto-complete Logic
  useEffect(() => {
    let isActive = true;
    const targetAddress = activeSearchField === 'billing' ? formData.address : formData.delivery_address;

    if (!activeSearchField || !targetAddress || targetAddress.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await getPlaceSuggestions(targetAddress);
        if (isActive) setSuggestions(results);
      } catch (err) {
        console.error(err);
      } finally {
        if (isActive) setIsSearching(false);
      }
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [formData.address, formData.delivery_address, activeSearchField]);

  const handleAddressInput = (field: 'billing' | 'delivery', value: string) => {
    setActiveSearchField(field);
    if (field === 'billing') {
        setFormData(prev => ({ ...prev, address: value }));
    } else {
        setFormData(prev => ({ ...prev, delivery_address: value }));
    }
  };

  const handleSelectPlace = async (placeId: string, description: string, field: 'billing' | 'delivery') => {
    setActiveSearchField(null);
    setSuggestions([]);

    if (field === 'billing') {
        setFormData(prev => ({ ...prev, address: description }));
    } else {
        setFormData(prev => ({ ...prev, delivery_address: description }));
    }

    // Server Action 호출
    const details = await getPlaceDetails(placeId);
    
    if (details) {
        // console.log(`📍 ${field.toUpperCase()} Selected Details:`, details);

        if (field === 'billing') {
            setFormData(prev => ({
                ...prev,
                address: details.address,
                suburb: details.suburb,
                state: details.state,
                postcode: details.postcode,
                lat: details.lat, 
                lng: details.lng  
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                delivery_address: details.address,
                delivery_suburb: details.suburb,
                delivery_state: details.state,
                delivery_postcode: details.postcode,
                delivery_lat: details.lat, 
                delivery_lng: details.lng  
            }));
        }
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) return alert("Customer Name is required.");
    setLoading(true);
    try {
      // ---------------------------------------------------------------
      // [NEW] 좌표 자동 보정 로직 (Auto-Correction)
      // 사용자가 드롭다운을 클릭하지 않고 타이핑만 했을 경우를 대비해, 
      // 저장 직전에 주소 텍스트로 좌표를 다시 한 번 검색합니다.
      // ---------------------------------------------------------------
      
      let finalLat = formData.lat;
      let finalLng = formData.lng;
      let finalDeliveryLat = formData.delivery_lat;
      let finalDeliveryLng = formData.delivery_lng;

      // 1. Billing Address 좌표가 없으면 검색 시도
      if ((!finalLat || !finalLng) && formData.address.length > 5) {
          // console.log("⚠️ Billing coordinates missing. Attempting auto-fetch...");
          const suggestions = await getPlaceSuggestions(formData.address);
          if (suggestions.length > 0) {
              const details = await getPlaceDetails(suggestions[0].place_id);
              if (details && details.lat) {
                  finalLat = details.lat;
                  finalLng = details.lng;
                  // console.log("✅ Billing coordinates auto-fetched:", finalLat, finalLng);
              }
          }
      }

      // 2. Delivery Address 좌표가 없으면 검색 시도 (Billing과 다를 경우)
      if (!isSameAddress && (!finalDeliveryLat || !finalDeliveryLng) && formData.delivery_address.length > 5) {
          // console.log("⚠️ Delivery coordinates missing. Attempting auto-fetch...");
          const suggestions = await getPlaceSuggestions(formData.delivery_address);
          if (suggestions.length > 0) {
              const details = await getPlaceDetails(suggestions[0].place_id);
              if (details && details.lat) {
                  finalDeliveryLat = details.lat;
                  finalDeliveryLng = details.lng;
                  // console.log("✅ Delivery coordinates auto-fetched:", finalDeliveryLat, finalDeliveryLng);
              }
          }
      }
      // ---------------------------------------------------------------

      const finalDeliveryData = isSameAddress ? {
        delivery_address: formData.address,
        delivery_suburb: formData.suburb,
        delivery_state: formData.state,
        delivery_postcode: formData.postcode,
        // 같은 주소면 좌표도 복사 (Billing 좌표가 방금 업데이트 되었을 수 있으므로 final 변수 사용)
        delivery_lat: finalLat, 
        delivery_lng: finalLng  
      } : {
        delivery_address: formData.delivery_address,
        delivery_suburb: formData.delivery_suburb,
        delivery_state: formData.delivery_state,
        delivery_postcode: formData.delivery_postcode,
        delivery_lat: finalDeliveryLat,
        delivery_lng: finalDeliveryLng
      };

      const { id, password, customer_groups, profiles, ...restData } = formData as any;
      
      const payload: any = {
        ...restData, 
        lat: finalLat, // 보정된 좌표 사용
        lng: finalLng, // 보정된 좌표 사용
        ...finalDeliveryData,
        credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
        group_id: formData.group_id ? Number(formData.group_id) : null,
        in_charge_sale: formData.in_charge_sale || null,
        in_charge_delivery: formData.in_charge_delivery || null,
      };

      if (formData.password) payload.password = formData.password; 

      // console.log("🚀 [FINAL SUBMIT] Payload:", {
      //     address: payload.address,
      //     lat: payload.lat,
      //     lng: payload.lng,
      //     delivery_lat: payload.delivery_lat,
      //     delivery_lng: payload.delivery_lng
      // });

      let error;
      if (customerData?.id) {
        const { error: updateError } = await supabase.from("customers").update({ ...payload, created_at: undefined }).eq("id", customerData.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from("customers").insert({ ...payload, password: formData.password, created_at: new Date().toISOString() });
        error = insertError;
      }

      if (error) {
        console.error("Supabase Error:", error);
        throw error;
      }

      alert(customerData ? "Customer updated!" : "Customer added!");
      onSuccess();
      onClose();
    } catch (e: any) {
      console.error(e);
      alert("Failed: " + (e.message || "Unknown error"));
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
            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Account Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2"><Label className="text-xs text-slate-500">Customer ID</Label><div className="h-10 px-3 flex items-center bg-slate-100 border border-slate-200 rounded-md text-sm text-slate-400 font-mono select-none">{customerData ? customerData.id.slice(0, 8) + "..." : "Auto-generated"}</div></div>
                <div className="space-y-2"><Label className="text-xs font-bold text-slate-700">Password</Label><div className="relative"><Input type={showPassword ? "text" : "password"} value={formData.password} onChange={(e) => handleChange("password", e.target.value)} className="pr-10" placeholder={customerData ? "(Keep current)" : "Enter password"} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div>
                <div className="space-y-2 flex flex-col"><Label className="text-xs font-bold text-slate-700 mb-1">Login Permission</Label><Button type="button" variant="outline" onClick={() => handleChange("login_permit", !formData.login_permit)} className={`justify-start gap-2 h-10 border ${formData.login_permit ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>{formData.login_permit ? <><CheckCircle2 className="w-4 h-4" /> Allowed</> : <><XCircle className="w-4 h-4" /> Denied</>}</Button></div>
                <div className="space-y-2 flex flex-col"><Label className="text-xs font-bold text-slate-700 mb-1">Order Status</Label><Button type="button" variant="outline" onClick={() => handleChange("disable_order", !formData.disable_order)} className={`justify-start gap-2 h-10 border ${formData.disable_order ? "bg-red-50 border-red-200 text-red-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>{formData.disable_order ? <><Ban className="w-4 h-4" /> Order Blocked</> : <><ShieldCheck className="w-4 h-4" /> Order Active</>}</Button></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Basic Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Customer Name <span className="text-red-500">*</span></Label><Input value={formData.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Full Name" /></div>
                <div className="space-y-2"><Label>Company Name</Label><Input value={formData.company} onChange={(e) => handleChange("company", e.target.value)} placeholder="Company Pty Ltd" /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="name@example.com" /></div>
                <div className="space-y-2"><Label>Customer Group</Label><div className="relative"><select value={formData.group_id} onChange={(e) => handleChange("group_id", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 appearance-none"><option value="">No Group</option>{groupOptions.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
                <div className="space-y-2"><Label>Mobile</Label><Input value={formData.mobile} onChange={(e) => handleChange("mobile", e.target.value)} placeholder="0400 000 000" /></div>
                <div className="space-y-2"><Label>Tel</Label><Input value={formData.tel} onChange={(e) => handleChange("tel", e.target.value)} placeholder="03 0000 0000" /></div>
                <div className="space-y-2"><Label>ABN</Label><Input value={formData.abn} onChange={(e) => handleChange("abn", e.target.value)} placeholder="XX XXX XXX XXX" /></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2 flex items-center gap-2"><Users className="w-4 h-4"/> Staff Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label className="text-blue-700 font-semibold">Sales Representative</Label><div className="relative"><select value={formData.in_charge_sale} onChange={(e) => handleChange("in_charge_sale", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 appearance-none"><option value="">Select Sales Person...</option>{staffOptions.map((staff) => (<option key={staff.id} value={staff.id}>{staff.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
                <div className="space-y-2"><Label className="text-emerald-700 font-semibold">Delivery Driver</Label><div className="relative"><select value={formData.in_charge_delivery} onChange={(e) => handleChange("in_charge_delivery", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 appearance-none"><option value="">Select Driver...</option>{staffOptions.map((staff) => (<option key={staff.id} value={staff.id}>{staff.name}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Financial</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><Label>Credit Limit ($)</Label><Input type="number" value={formData.credit_limit} onChange={(e) => handleChange("credit_limit", e.target.value)} placeholder="0.00" /></div>
                <div className="space-y-2"><Label>Payment Terms (Due Date)</Label><div className="relative"><select value={formData.due_date} onChange={(e) => handleChange("due_date", e.target.value)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-slate-900 appearance-none">{PAYMENT_TERMS.map((term) => (<option key={term} value={term}>{term}</option>))}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" /></div></div>
              </div>
            </section>

            <section className="space-y-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                  Address Details 
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-normal normal-case">Google Maps Auto-complete</span>
              </h3>
              
              <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-4 relative">
                <h4 className="font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600"/> Billing Address</h4>
                
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 relative">
                        <Label className="text-xs text-slate-500">Street Address</Label>
                        <Input 
                            value={formData.address}
                            onChange={(e) => handleAddressInput('billing', e.target.value)}
                            onFocus={() => setActiveSearchField('billing')}
                            placeholder="Start typing billing address..."
                        />
                        {isSearching && activeSearchField === 'billing' && <Loader2 className="absolute right-3 top-8 w-4 h-4 animate-spin text-slate-400" />}
                        {activeSearchField === 'billing' && suggestions.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {suggestions.map((p) => (
                                    <div key={p.place_id} className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer flex gap-2"
                                         onMouseDown={() => handleSelectPlace(p.place_id, p.description, 'billing')}>
                                        <MapPin className="w-3 h-3 text-slate-400 mt-1" />
                                        <span>{p.description}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="col-span-5"><Label className="text-xs text-slate-500">Suburb</Label><Input value={formData.suburb} onChange={(e) => handleChange("suburb", e.target.value)} /></div>
                    <div className="col-span-4"><Label className="text-xs text-slate-500">State</Label><Input value={formData.state} onChange={(e) => handleChange("state", e.target.value)} /></div>
                    <div className="col-span-3"><Label className="text-xs text-slate-500">Postcode</Label><Input value={formData.postcode} onChange={(e) => handleChange("postcode", e.target.value)} /></div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pl-1"><Checkbox id="sameAddress" checked={isSameAddress} onCheckedChange={(c) => setIsSameAddress(!!c)} className="border-slate-400 data-[state=checked]:bg-slate-900" /><label htmlFor="sameAddress" className="text-sm font-medium leading-none cursor-pointer select-none text-slate-700">Delivery address is same as billing address</label></div>

              {!isSameAddress && (
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-200 space-y-4 animate-in slide-in-from-top-2 fade-in relative">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-600"/> Delivery Address</h4>
                  
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 relative">
                          <Label className="text-xs text-slate-500">Street Address</Label>
                          <Input
                            value={formData.delivery_address}
                            onChange={(e) => handleAddressInput('delivery', e.target.value)}
                            onFocus={() => setActiveSearchField('delivery')}
                            placeholder="Start typing delivery address..."
                          />
                          {isSearching && activeSearchField === 'delivery' && <Loader2 className="absolute right-3 top-8 w-4 h-4 animate-spin text-slate-400" />}
                          {activeSearchField === 'delivery' && suggestions.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                  {suggestions.map((p) => (
                                      <div key={p.place_id} className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer flex gap-2"
                                           onMouseDown={() => handleSelectPlace(p.place_id, p.description, 'delivery')}>
                                          <MapPin className="w-3 h-3 text-slate-400 mt-1" />
                                          <span>{p.description}</span>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>

                      <div className="col-span-5"><Label className="text-xs text-slate-500">Suburb</Label><Input value={formData.delivery_suburb} onChange={(e) => handleChange("delivery_suburb", e.target.value)} /></div>
                      <div className="col-span-4"><Label className="text-xs text-slate-500">State</Label><Input value={formData.delivery_state} onChange={(e) => handleChange("delivery_state", e.target.value)} /></div>
                      <div className="col-span-3"><Label className="text-xs text-slate-500">Postcode</Label><Input value={formData.delivery_postcode} onChange={(e) => handleChange("delivery_postcode", e.target.value)} /></div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Staff Note */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider border-b pb-2">Staff Note</h3>
              <Textarea value={formData.note} onChange={(e) => handleChange("note", e.target.value)} placeholder="Internal notes..." className="h-24" />
            </section>

          </div>

          {/* Footer */}
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