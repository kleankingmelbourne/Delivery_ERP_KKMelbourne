"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Phone, Check, Navigation, Package, Camera, X, Loader2, 
  ArrowUpDown, Play, Unlock, Save, Home, 
  Sparkles, Building2, MousePointerClick, Flag, Circle,
  MessageSquareText, MapPin // ✅ MapPin 아이콘 추가
} from "lucide-react";
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge"; 
import { Textarea } from "@/components/ui/textarea"; 
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import imageCompression from "browser-image-compression"; 
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

declare var google: any;

interface DeliveryItem {
  id: string;
  customer_id: string; // ✅ 위치 업데이트를 위해 customer_id 추가
  invoice_to: string;
  delivery_address: string;
  phone?: string;
  status: string;
  is_completed: boolean;
  delivery_run: number;
  delivery_order: number; 
  lat?: number;
  lng?: number;
}

interface RunState {
    isStarted: boolean;
    isEditing: boolean;
}

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

const addTimestampToImage = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.src = readerEvent.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file); 
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const dateStr = new Date().toLocaleString('en-AU', { 
          timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        }); 
        const fontSize = Math.floor(img.width * 0.04); 
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000000'; ctx.lineWidth = fontSize / 5;
        const x = img.width - (fontSize / 2); const y = img.height - (fontSize / 2);
        ctx.strokeText(dateStr, x, y); ctx.fillText(dateStr, x, y);
        canvas.toBlob((blob) => { resolve(blob ? new File([blob], file.name, { type: file.type }) : file); }, file.type);
      };
    };
  });
};

const LIBRARIES: ("places" | "geometry" | "routes")[] = ["places", "geometry", "routes"];

export default function DriverDeliveryPage() {
  const supabase = createClient();
  const { user, profile, currentUserName: authUserName, companyLocation } = useAuth() as any;

  const [dbProfile, setDbProfile] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [originalDeliveries, setOriginalDeliveries] = useState<DeliveryItem[]>([]); 
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<number>(1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("Driver");

  const [runStates, setRunStates] = useState<{ [key: number]: RunState }>({
      1: { isStarted: false, isEditing: false },
      2: { isStarted: false, isEditing: false }
  });

  const [startPointType, setStartPointType] = useState<'company' | 'driver' | 'custom'>('company');
  const [finalDestType, setFinalDestType] = useState<'company' | 'driver' | 'custom'>('company');
  const [customStartAddr, setCustomStartAddr] = useState("");
  const [customFinalAddr, setCustomFinalAddr] = useState("");

  const [isDestModalOpen, setIsDestModalOpen] = useState(false); 
  const [modalTarget, setModalTarget] = useState<'start' | 'final'>('final');

  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isAutoRouting, setIsAutoRouting] = useState(false); 
  
  // ✅ GPS 위치 업데이트 로딩 상태 관리
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [dailyMemo, setDailyMemo] = useState(""); 
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [memoText, setMemoText] = useState(""); 
  const [isSavingMemo, setIsSavingMemo] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const currentRunState = runStates[activeRun];
  const isStarted = currentRunState?.isStarted || false;
  const isEditing = currentRunState?.isEditing || false;

  const currentList = deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === activeRun);
  const activeItem = currentList.find(d => !d.is_completed);

  const updateRunState = (run: number, updates: Partial<RunState>) => setRunStates(prev => ({ ...prev, [run]: { ...prev[run], ...updates } }));

  const sortDeliveries = (items: DeliveryItem[]) => {
      const newItems = items.filter(d => d.delivery_order === 0);
      const savedItems = items.filter(d => d.delivery_order > 0).sort((a, b) => a.delivery_order - b.delivery_order);
      return [...newItems, ...savedItems];
  };

  const getSafeHomeAddress = useCallback(() => {
    return dbProfile?.address || "Address not set";
  }, [dbProfile]);

  useEffect(() => {
      if (!user) return;
      const initData = async () => {
          setLoading(true);
          try {
              const { data: profileFromDb } = await supabase.from('profiles').select('address, lat, lng, route_prefs').eq('id', user.id).single();
              
              if (profileFromDb) {
                setDbProfile(profileFromDb);
                if (profileFromDb.route_prefs) {
                    const prefs = profileFromDb.route_prefs;
                    setStartPointType(prefs.startPointType || 'company');
                    setFinalDestType(prefs.finalDestType || 'company');
                    setCustomStartAddr(prefs.customStartAddr || "");
                    setCustomFinalAddr(prefs.customFinalAddr || "");
                }
              }

              setCurrentUserId(user.id);
              setCurrentUserName(authUserName);

              const today = getMelbourneDate();

              // ✅ customer_id 추가 조회
              const { data: invoiceData } = await supabase.from('invoices').select(`
                  id, invoice_to, status, is_completed, delivery_run, delivery_order, driver_id, invoice_date, customer_id,
                  customers ( mobile, delivery_address, delivery_state, delivery_suburb, delivery_postcode, delivery_lat, delivery_lng, lat, lng )
              `).eq('invoice_date', today).eq('driver_id', user.id).neq('delivery_run', 0).order('delivery_order', { ascending: true });

              const { data: memoData } = await supabase
                  .from('delivery_memos')
                  .select('content')
                  .eq('driver_id', user.id)
                  .eq('memo_date', today)
                  .maybeSingle();
              
              if (memoData) setDailyMemo(memoData.content || "");

              if (invoiceData) {
                  const rawItems = invoiceData.map((item: any) => {
                      const c = Array.isArray(item.customers) ? item.customers[0] : item.customers;
                      return {
                          id: item.id, 
                          customer_id: item.customer_id, // ✅ 매핑
                          invoice_to: item.invoice_to, 
                          delivery_address: `${c?.delivery_address || ''}, ${c?.delivery_suburb || ''}`.replace(/^, /, ""),
                          phone: c?.mobile || "", status: item.status, is_completed: item.is_completed,
                          delivery_run: item.delivery_run || 1, delivery_order: item.delivery_order || 0,
                          lat: c?.delivery_lat || c?.lat, lng: c?.delivery_lng || c?.lng
                      } as DeliveryItem;
                  });
                  const sortedItems = sortDeliveries(rawItems);
                  setDeliveries(sortedItems); setOriginalDeliveries(sortedItems);
                  setRunStates({
                      1: { isStarted: sortedItems.some(d => d.delivery_run === 1 && d.is_completed), isEditing: sortedItems.some(d => (d.delivery_run || 1) === 1 && d.delivery_order === 0) },
                      2: { isStarted: sortedItems.some(d => d.delivery_run === 2 && d.is_completed), isEditing: sortedItems.some(d => d.delivery_run === 2 && d.delivery_order === 0) }
                  });
              }
          } catch (error) { console.error("Init Error:", error); } finally { setLoading(false); }
      };
      initData();
  }, [user, authUserName, supabase]);

  useEffect(() => {
      if (isMemoModalOpen) {
          const timer = setTimeout(() => {
              if (textareaRef.current) {
                  const el = textareaRef.current;
                  el.focus();
                  const len = el.value.length;
                  el.setSelectionRange(len, len);
                  el.scrollTop = el.scrollHeight;
              }
          }, 300);
          return () => clearTimeout(timer);
      }
  }, [isMemoModalOpen]);

  // ✅ [신규] 현재 GPS 위치를 고객 배송지 좌표(delivery_lat/lng)로 업데이트하는 함수
  const handleUpdateLocation = async (invoiceId: string, customerId: string) => {
      if (!navigator.geolocation) {
          alert("이 브라우저에서는 위치 기능을 지원하지 않습니다.");
          return;
      }
      
      // 기사님 실수 방지용 컨펌 창
      if (!confirm("현재 서 계신 위치를 이 고객의 정확한 배송지 좌표로 덮어씌우시겠습니까?")) return;

      setUpdatingLocationId(invoiceId); // 스피너 On

      navigator.geolocation.getCurrentPosition(
          async (position) => {
              const { latitude, longitude } = position.coords;
              try {
                  // 1. Supabase customers 테이블 업데이트
                  const { error } = await supabase
                      .from('customers')
                      .update({ delivery_lat: latitude, delivery_lng: longitude })
                      .eq('id', customerId);

                  if (error) throw error;

                  // 2. 로컬 데이터 즉시 업데이트 (지도 반영을 위함)
                  setDeliveries(prev => prev.map(d => d.id === invoiceId ? { ...d, lat: latitude, lng: longitude } : d));
                  alert("현재 위치가 새로운 배송지로 성공적으로 저장되었습니다!");
              } catch (error: any) {
                  alert("위치 저장 실패: " + error.message);
              } finally {
                  setUpdatingLocationId(null); // 스피너 Off
              }
          },
          (error) => {
              alert("위치를 가져올 수 없습니다. 기기의 GPS 권한이 켜져 있는지 확인해주세요.");
              setUpdatingLocationId(null);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
  };

  const saveRoutePrefs = async (newStartType: string, newFinalType: string, newStartAddr: string, newFinalAddr: string) => {
      if (!user) return;
      const prefs = {
          startPointType: newStartType,
          finalDestType: newFinalType,
          customStartAddr: newStartAddr,
          customFinalAddr: newFinalAddr
      };
      await supabase.from('profiles').update({ route_prefs: prefs }).eq('id', user.id);
  };

  const handleSetPoint = (type: 'company' | 'driver' | 'custom') => {
      if (modalTarget === 'start') {
          setStartPointType(type);
          saveRoutePrefs(type, finalDestType, customStartAddr, customFinalAddr);
      } else {
          setFinalDestType(type);
          saveRoutePrefs(startPointType, type, customStartAddr, customFinalAddr);
      }
      setIsDestModalOpen(false);
  };

  const getPointLocation = (type: 'company' | 'driver' | 'custom', customText: string) => {
      const drvLoc = dbProfile?.lat && dbProfile?.lng ? { lat: dbProfile.lat, lng: dbProfile.lng } : null;
      if (type === 'company') return companyLocation ? { lat: companyLocation.lat, lng: companyLocation.lng } : companyLocation?.address;
      if (type === 'driver') return drvLoc ? drvLoc : getSafeHomeAddress();
      return customText;
  };

  const handleAutoRoute = async () => {
      if (currentList.length === 0 || !window.google) return;
      setIsAutoRouting(true);
      const startLoc = getPointLocation(startPointType, customStartAddr);
      const finalLoc = getPointLocation(finalDestType, customFinalAddr);
      if (!startLoc || !finalLoc) { setIsAutoRouting(false); return alert("Set start and final points."); }

      const waypoints = currentList.map(item => ({ 
          location: (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : item.delivery_address, 
          stopover: true 
      }));

      const ds = new google.maps.DirectionsService();
      ds.route({ origin: startLoc, destination: finalLoc, waypoints, optimizeWaypoints: true, travelMode: google.maps.TravelMode.DRIVING }, (res: any, status: any) => {
          if (status === 'OK') {
              const optimizedList = res.routes[0].waypoint_order.map((i: number) => currentList[i]);
              const merged = [...deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) !== activeRun), ...optimizedList];
              setDeliveries(merged);
              updateRunState(activeRun, { isEditing: true });
          }
          setIsAutoRouting(false);
      });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDeliveries((items) => arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id)));
    }
  };

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
        const upsertData = currentList.map((item, index) => ({ id: item.id, delivery_order: index + 1 }));
        const { error } = await supabase.from('invoices').upsert(upsertData, { onConflict: 'id' });
        if (error) throw error;
        updateRunState(activeRun, { isEditing: false, isStarted: false }); 
        setOriginalDeliveries(deliveries);
    } catch (error: any) { alert(error.message); } finally { setIsSavingOrder(false); }
  };

  const openMemoModal = (invoiceName: string) => {
      if (dailyMemo.includes(`[${invoiceName}]`)) {
          setMemoText(dailyMemo);
      } else {
          const prefix = dailyMemo.trim() ? `${dailyMemo}\n\n[${invoiceName}] ` : `[${invoiceName}] `;
          setMemoText(prefix);
      }
      setIsMemoModalOpen(true);
  };

  const handleSaveMemo = async () => {
      if (!user) return;
      setIsSavingMemo(true);
      try {
          const today = getMelbourneDate();
          
          const { data: existing } = await supabase
              .from('delivery_memos')
              .select('id')
              .eq('driver_id', user.id)
              .eq('memo_date', today)
              .maybeSingle();

          if (existing) {
              await supabase.from('delivery_memos').update({ content: memoText }).eq('id', existing.id);
          } else {
              await supabase.from('delivery_memos').insert({
                  driver_id: user.id,
                  memo_date: today,
                  content: memoText
              });
          }

          setDailyMemo(memoText);
          setIsMemoModalOpen(false);
      } catch (error: any) {
          alert("Failed to save memo: " + error.message);
      } finally {
          setIsSavingMemo(false);
      }
  };

  const handleCancelOrder = () => {
    setDeliveries(originalDeliveries);
    updateRunState(activeRun, { isEditing: false });
  };

  const handleStartRun = () => updateRunState(activeRun, { isStarted: true });
  const handleEditOrder = () => updateRunState(activeRun, { isEditing: true });
  const handleNavigate = (address: string) => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank'); };
  const handleCall = (phone?: string) => { if (phone) window.location.href = `tel:${phone}`; };
  const handleStartComplete = (id: string) => { setTargetId(id); fileInputRef.current?.click(); };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    const file = e.target.files?.[0]; 
    if (file) { 
        const stamped = await addTimestampToImage(file); 
        setSelectedFile(stamped); 
        setPreviewUrl(URL.createObjectURL(stamped)); 
    } 
  };
  
  const handleConfirmUpload = async () => {
    if (!selectedFile || !targetId) return;
    setIsUploading(true);
    try {
        const compressedFile = await imageCompression(selectedFile, { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true, initialQuality: 0.7 });
        const fileName = `${targetId}_${Date.now()}.jpg`;
        await supabase.storage.from('delivery-proofs').upload(fileName, compressedFile);
        const { data: { publicUrl } } = supabase.storage.from('delivery-proofs').getPublicUrl(fileName);
        await supabase.from('invoices').update({ is_completed: true, proof_url: publicUrl }).eq('id', targetId);
        setDeliveries(prev => prev.map(d => d.id === targetId ? { ...d, is_completed: true } : d));
        setPreviewUrl(null); setSelectedFile(null);
    } catch (error: any) { alert(error.message); } finally { setIsUploading(false); }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
            <div className="flex justify-between items-center p-4 text-white"><h3 className="font-bold text-lg">Proof of Delivery</h3><button onClick={() => setPreviewUrl(null)} className="p-2 bg-white/10 rounded-full"><X className="w-6 h-6" /></button></div>
            <div className="flex-1 flex items-center justify-center relative"><img src={previewUrl} alt="Proof" className="max-w-full max-h-full object-contain" /></div>
            <div className="p-6 bg-slate-900 pb-10"><button onClick={handleConfirmUpload} disabled={isUploading} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg">{isUploading ? <Loader2 className="animate-spin" /> : <Check />} Complete & Upload</button></div>
        </div>
      )}

      {/* Daily Memo Modal */}
      <Dialog open={isMemoModalOpen} onOpenChange={setIsMemoModalOpen}>
        <DialogContent className="w-[90%] rounded-2xl max-w-md">
            <DialogHeader>
                <DialogTitle>Daily Delivery Log</DialogTitle>
                <DialogDescription>
                    Record any events or issues for today's run.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Textarea 
                    ref={textareaRef} 
                    value={memoText} 
                    onChange={(e) => setMemoText(e.target.value)} 
                    placeholder="Type your notes here..."
                    className="min-h-[160px] resize-none focus-visible:ring-blue-500 text-sm leading-relaxed"
                />
            </div>
            <DialogFooter className="flex-row gap-2 sm:justify-end">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setIsMemoModalOpen(false)}>Cancel</Button>
                <Button className="flex-1 bg-blue-600 text-white h-12" onClick={handleSaveMemo} disabled={isSavingMemo}>
                    {isSavingMemo ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Daily Log"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preferences Modal */}
      <Dialog open={isDestModalOpen} onOpenChange={setIsDestModalOpen}>
        <DialogContent className="w-[90%] rounded-2xl max-w-md">
            <DialogHeader>
                <DialogTitle>Set {modalTarget === 'start' ? 'Start Point' : 'Final Stop'}</DialogTitle>
                <DialogDescription className="hidden" />
            </DialogHeader>
            <div className="space-y-3 py-4">
                <button onClick={() => handleSetPoint('company')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-left transition-colors">
                    <div className="bg-blue-100 p-2 rounded-full"><Building2 className="w-5 h-5 text-blue-600" /></div>
                    <div className="flex-1 overflow-hidden"><div className="font-bold text-slate-900 text-sm">Company Depot</div><div className="text-[10px] text-slate-500 truncate">{companyLocation?.address}</div></div>
                </button>
                <button onClick={() => handleSetPoint('driver')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-left transition-colors">
                    <div className="bg-emerald-100 p-2 rounded-full"><Home className="w-5 h-5 text-emerald-600" /></div>
                    <div className="flex-1 overflow-hidden"><div className="font-bold text-slate-900 text-sm">Home Address</div><div className="text-[10px] text-slate-500 truncate">{getSafeHomeAddress()}</div></div>
                </button>
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm"><MousePointerClick className="w-4 h-4" /> Custom Address</div>
                    <Input value={modalTarget === 'start' ? customStartAddr : customFinalAddr} onChange={e => { const val = e.target.value; if (modalTarget === 'start') setCustomStartAddr(val); else setCustomFinalAddr(val); }} placeholder="Type address here..." className="h-9 text-xs" />
                    <Button size="sm" className="w-full bg-slate-900 h-8 text-xs font-bold" onClick={() => handleSetPoint('custom')}>Apply Custom</Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="shrink-0 bg-white z-10 border-b border-slate-100 shadow-sm">
        <div className="flex items-center justify-between p-4 pb-2">
            <h1 className="font-extrabold text-xl text-slate-900">{currentUserName}</h1>
            <Badge className="bg-blue-50 text-blue-600 border-blue-100">{isStarted ? 'ON DELIVERY' : 'STATIONARY'}</Badge>
        </div>
        <div className="px-4 pb-3 flex gap-2">
            {[1, 2].map(run => (
                <button key={run} onClick={() => setActiveRun(run)} className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all", activeRun === run ? "bg-slate-900 text-white shadow-md" : "bg-slate-100 text-slate-400")}>
                    {run === 1 ? "1st Run" : "2nd Run"}
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar pb-24">
        {/* Preferences */}
        <div className="p-4 space-y-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Route Preferences</div>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-1 shadow-sm cursor-pointer" onClick={() => { setModalTarget('start'); setIsDestModalOpen(true); }}>
                    <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3 text-blue-600" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Start</span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 truncate">{startPointType === 'company' ? 'Company' : startPointType === 'driver' ? 'Home' : 'Custom'}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-1 shadow-sm cursor-pointer" onClick={() => { setModalTarget('final'); setIsDestModalOpen(true); }}>
                    <div className="flex items-center gap-2">
                        <Home className="w-3 h-3 text-emerald-600" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Final</span>
                    </div>
                    <div className="text-xs font-bold text-slate-700 truncate">{finalDestType === 'company' ? 'Company' : finalDestType === 'driver' ? 'Home' : 'Custom'}</div>
                </div>
            </div>
        </div>

        {/* Action Bar */}
        <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <Button variant="outline" size="sm" onClick={handleAutoRoute} disabled={isAutoRouting} className="bg-white text-blue-600 border-blue-200 text-xs font-bold h-9">
                        {isAutoRouting ? <Loader2 className="animate-spin w-3.5 h-3.5 mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Auto Route
                    </Button>
                ) : (
                    <Button variant="outline" size="sm" onClick={handleEditOrder} className="bg-white text-slate-600 border-slate-200 text-xs font-bold h-9 shadow-sm">
                        <Unlock className="w-3.5 h-3.5 mr-1.5" /> Edit Order
                    </Button>
                )}
            </div>
            <div className="flex gap-2">
                {isEditing ? (
                    <>
                        <Button size="sm" onClick={handleCancelOrder} variant="ghost" className="h-9 text-xs">Cancel</Button>
                        <Button size="sm" onClick={handleSaveOrder} disabled={isSavingOrder} className="bg-blue-600 text-white h-9 font-bold px-4 shadow-md shadow-blue-100">
                            {isSavingOrder ? <Loader2 className="animate-spin" /> : <><Save className="w-4 h-4 mr-1"/> Save</>}
                        </Button>
                    </>
                ) : (
                    !isStarted && <Button size="sm" onClick={handleStartRun} className="bg-slate-900 text-white h-9 font-bold px-6 shadow-lg"><Play className="w-4 h-4 mr-1.5 fill-current" /> Start Delivery</Button>
                )}
            </div>
        </div>

        {/* Delivery List */}
        <div className="px-4 space-y-3 mt-2">
            {loading ? <div className="p-10 text-center text-slate-400">Loading...</div> : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={currentList.map(d => d.id)} strategy={verticalListSortingStrategy}>
                        {currentList.map((item, index) => (
                            <SortableItem 
                                key={item.id} 
                                id={item.id} 
                                item={item} 
                                index={index} 
                                isActive={isStarted && !item.is_completed && activeItem?.id === item.id} 
                                isDone={item.is_completed} 
                                isEditing={isEditing} 
                                dailyMemo={dailyMemo} 
                                isUpdatingLocation={updatingLocationId === item.id} // ✅ 로딩 상태 전달
                                onComplete={() => handleStartComplete(item.id)} 
                                onNavigate={() => handleNavigate(item.delivery_address)} 
                                onCall={() => handleCall(item.phone)}
                                onMemo={() => openMemoModal(item.invoice_to)} 
                                onUpdateLocation={() => handleUpdateLocation(item.id, item.customer_id)} // ✅ 위치 저장 함수 연결
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            )}
        </div>
      </div>
    </div>
  );
}

function SortableItem({ id, item, index, isActive, isDone, isEditing, dailyMemo, isUpdatingLocation, onComplete, onNavigate, onCall, onMemo, onUpdateLocation }: any) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    const hasMemo = dailyMemo && dailyMemo.includes(`[${item.invoice_to}]`);

    if (isDone) return ( 
        <div ref={setNodeRef} style={style} className="bg-slate-50 border p-4 rounded-xl opacity-60 grayscale flex items-center justify-between shadow-none">
            <div className="flex items-center gap-3">
                <div className="bg-slate-200 p-1.5 rounded-full"><Check className="w-4 h-4 text-slate-500" /></div>
                <span className="text-slate-500 font-medium line-through text-sm">{item.invoice_to}</span>
            </div>
            {hasMemo && <MessageSquareText className="w-4 h-4 text-blue-500 mr-2" />}
        </div> 
    );

    if (isActive && !isEditing) return (
        <div ref={setNodeRef} style={style} className="bg-white border-2 border-blue-600 shadow-xl p-5 rounded-2xl transform scale-[1.02] relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-xl uppercase tracking-tight">Current Stop</div>
            
            <div className="mt-4 flex items-center justify-between">
                <h3 className="text-2xl font-black">{index + 1}. {item.invoice_to}</h3>
                <Button size="icon" variant="ghost" onClick={onMemo} className={cn("h-10 w-10 rounded-full", hasMemo ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-100")}>
                    <MessageSquareText className={cn("w-5 h-5", hasMemo && "fill-blue-200")} />
                </Button>
            </div>
            
            <p className="text-slate-600 text-sm mt-1 leading-tight">{item.delivery_address}</p>
            
            {/* ✅ 버튼 그리드 영역 수정 (6칸 배분) */}
            <div className="mt-5 grid grid-cols-6 gap-2">
                <Button onClick={onCall} variant="outline" className="col-span-1 h-14 border-slate-200 shadow-sm p-0">
                    <Phone className="w-6 h-6 text-slate-600"/>
                </Button>
                {/* 🚀 현재 위치(핀) 저장 버튼 */}
                <Button 
                    onClick={onUpdateLocation} 
                    disabled={isUpdatingLocation} 
                    variant="outline" 
                    className="col-span-1 h-14 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 shadow-sm p-0"
                    title="현재 위치를 이 배송지로 저장"
                >
                    {isUpdatingLocation ? <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /> : <MapPin className="w-6 h-6 text-emerald-600"/>}
                </Button>
                <Button onClick={onNavigate} className="col-span-2 h-14 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 border-none shadow-none">
                    <Navigation className="w-5 h-5 mr-1" /> Map
                </Button>
                <Button onClick={onComplete} className="col-span-2 h-14 bg-slate-900 text-white font-bold hover:bg-slate-800 shadow-lg">
                    <Camera className="w-5 h-5 mr-1" /> Done
                </Button>
            </div>
        </div>
    );

    return (
        <div ref={setNodeRef} style={style} className={cn("bg-white p-4 rounded-xl border flex items-center justify-between shadow-sm transition-all", isEditing ? "border-blue-200 ring-2 ring-blue-50" : "opacity-70 border-slate-100")}>
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0", isEditing ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400")}>{index + 1}</div>
                <div className="overflow-hidden pr-2 flex-1">
                    <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-2">
                        {item.invoice_to}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{item.delivery_address}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {!isEditing && (
                    <Button size="icon" variant="ghost" onClick={onMemo} className="h-8 w-8 text-slate-400 p-0">
                        <MessageSquareText className={cn("w-4 h-4", hasMemo && "text-blue-500 fill-blue-100")} />
                    </Button>
                )}
                {isEditing ? (
                    <div {...attributes} {...listeners} className="p-2 touch-none cursor-grab active:cursor-grabbing"><ArrowUpDown className="w-5 h-5 text-blue-400" /></div>
                ) : <div className="flex items-center gap-1 text-[9px] font-bold text-slate-300 uppercase tracking-widest"><Circle className="w-2 h-2 fill-current"/></div>}
            </div>
        </div>
    );
}