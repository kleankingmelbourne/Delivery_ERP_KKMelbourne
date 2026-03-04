"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Phone, MapPin, Check, Navigation, Package, Camera, X, Loader2, 
  ArrowUpDown, Play, Unlock, Save, Home, 
  Sparkles, Building2, User, MousePointerClick
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
// ✅ [추가] 실시간 교통상황을 위한 TrafficLayer 임포트
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker, TrafficLayer } from '@react-google-maps/api';
import imageCompression from "browser-image-compression"; 

// ✅ [핵심] 전역 변수 사용
import { useAuth } from "@/components/providers/AuthProvider";

declare var google: any;

interface DeliveryItem {
  id: string;
  invoice_to: string;
  delivery_address: string;
  phone?: string;
  status: string;
  is_completed: boolean;
  memo?: string;
  delivery_run: number;
  delivery_order: number; 
  // ✅ [추가] 배송지 좌표
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

// 이미지에 날짜/시간 합성 (유지)
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

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

export default function DriverDeliveryPage() {
  const supabase = createClient();
  
  // 🚀 [초고속 최적화 1] 불필요한 DB 조회 대신 이미 있는 내 정보, 회사 정보 좌표를 꺼내옵니다.
  // ✅ driverLocation 꺼내오기 추가
  const { user, profile, currentUserName: authUserName, companyLocation, driverLocation } = useAuth() as any;

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

  const hasNewInRun1 = deliveries.some(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === 1 && d.delivery_order === 0);
  const hasNewInRun2 = deliveries.some(d => d.delivery_run === 2 && d.delivery_order === 0);

  const [returnAddress, setReturnAddress] = useState(""); 
  const [finalDestType, setFinalDestType] = useState<'company' | 'driver' | 'custom'>('company');
  const [customAddress, setCustomAddress] = useState("");

  const [isDestinationModalOpen, setIsDestinationModalOpen] = useState(false); 
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isAutoRouting, setIsAutoRouting] = useState(false); 
  
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const currentRunState = runStates[activeRun];
  const isStarted = currentRunState.isStarted;
  const isEditing = currentRunState.isEditing;

  const updateRunState = (run: number, updates: Partial<RunState>) => setRunStates(prev => ({ ...prev, [run]: { ...prev[run], ...updates } }));

  const sortDeliveries = (items: DeliveryItem[]) => {
      const newItems = items.filter(d => d.delivery_order === 0);
      const savedItems = items.filter(d => d.delivery_order > 0).sort((a, b) => a.delivery_order - b.delivery_order);
      return [...newItems, ...savedItems];
  };

  // ✅ [초고속 최적화 2] 화면 렌더링 시, 프로필과 회사 DB 쿼리 완전히 삭제. 오직 '내 배송리스트' 1개만 조회!
  useEffect(() => {
      if (!user) return;
      let isMounted = true;

      const initData = async () => {
          setLoading(true);
          try {
              if (isMounted) {
                  setCurrentUserId(user.id);
                  setCurrentUserName(authUserName);
              }
              const today = getMelbourneDate();

              // 기존에 있던 회사(company_settings) 조회 쿼리 삭제!
              const { data: invoiceData } = await supabase.from('invoices').select(`
                  id, invoice_to, status, is_completed, memo, delivery_run, delivery_order, driver_id, invoice_date, 
                  customers ( mobile, delivery_address, delivery_state, delivery_suburb, delivery_postcode, delivery_lat, delivery_lng, lat, lng )
              `).eq('invoice_date', today).eq('driver_id', user.id).neq('delivery_run', 0).order('delivery_order', { ascending: true });

              if (!isMounted) return;

              const savedType = localStorage.getItem("finalDestType") as any;
              if (savedType) setFinalDestType(savedType);

              const savedReturn = localStorage.getItem("returnAddress");
              if (savedReturn) setReturnAddress(savedReturn);
              else if (profile?.address) setReturnAddress(profile.address); 
              else if (companyLocation?.address) setReturnAddress(companyLocation.address);

              if (invoiceData) {
                  const rawItems = invoiceData.map((item: any) => {
                      const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers;
                      const fullAddress = customer ? `${customer.delivery_address || ''}, ${customer.delivery_suburb || ''} ${customer.delivery_state || ''}`.trim() : "No Address Info";
                      return {
                          id: item.id, invoice_to: item.invoice_to, delivery_address: fullAddress.replace(/^, /, ""),
                          phone: customer?.mobile || "", status: item.status, is_completed: item.is_completed, memo: item.memo,
                          delivery_run: item.delivery_run || 1, delivery_order: item.delivery_order || 0,
                          lat: customer?.delivery_lat || customer?.lat, lng: customer?.delivery_lng || customer?.lng // ✅ 배송지 좌표 확보
                      } as DeliveryItem;
                  });
                  
                  const sortedItems = sortDeliveries(rawItems);
                  setDeliveries(sortedItems); setOriginalDeliveries(sortedItems);
                  
                  setRunStates({
                      1: { isStarted: sortedItems.some(d => d.delivery_run === 1 && d.is_completed), isEditing: sortedItems.some(d => d.delivery_run === 1 && d.delivery_order === 0) },
                      2: { isStarted: sortedItems.some(d => d.delivery_run === 2 && d.is_completed), isEditing: sortedItems.some(d => d.delivery_run === 2 && d.delivery_order === 0) }
                  });
              }
          } catch (error) { console.error("Init Error:", error); } finally { if (isMounted) setLoading(false); }
      };
      initData();
      return () => { isMounted = false; };
  }, [user, profile, companyLocation, authUserName, supabase]);

  // 실시간 구독 (이전과 동일)
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel('realtime-driver-invoices').on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, async (payload) => {
        const today = getMelbourneDate();
        const newRecord = payload.new as any; const oldRecord = payload.old as any;
        if (newRecord?.invoice_date !== today && oldRecord?.invoice_date !== today) return;
        const isAssignedToMe = newRecord?.driver_id === currentUserId;
        const wasAssignedToMe = oldRecord?.driver_id === currentUserId;
        let shouldRefresh = false;

        if (payload.eventType === 'INSERT' && isAssignedToMe) shouldRefresh = true;
        if (payload.eventType === 'UPDATE') {
            if (isAssignedToMe && (oldRecord?.driver_id !== newRecord.driver_id || oldRecord?.delivery_run !== newRecord.delivery_run || (oldRecord?.delivery_order !== 0 && newRecord.delivery_order === 0))) {
                shouldRefresh = true;
                if (newRecord.delivery_order === 0) updateRunState(newRecord.delivery_run === 0 ? 1 : newRecord.delivery_run, { isEditing: true });
            }
            if (isAssignedToMe && wasAssignedToMe && oldRecord?.delivery_run === newRecord.delivery_run) shouldRefresh = true; 
        }
        if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && wasAssignedToMe && !isAssignedToMe)) shouldRefresh = true;

        if (shouldRefresh) { 
            const { data } = await supabase.from('invoices').select(`id, invoice_to, status, is_completed, memo, delivery_run, delivery_order, driver_id, invoice_date, customers ( mobile, delivery_address, delivery_state, delivery_suburb, delivery_lat, delivery_lng, lat, lng )`).eq('invoice_date', today).eq('driver_id', currentUserId).neq('delivery_run', 0).order('delivery_order', { ascending: true });
            if (data) {
                const rawItems = data.map((item: any) => {
                    const c = Array.isArray(item.customers) ? item.customers[0] : item.customers;
                    const addr = c ? `${c.delivery_address || ''}, ${c.delivery_suburb || ''}`.trim() : "No Address Info";
                    return { id: item.id, invoice_to: item.invoice_to, delivery_address: addr.replace(/^, /, ""), phone: c?.mobile || "", status: item.status, is_completed: item.is_completed, memo: item.memo, delivery_run: item.delivery_run || 1, delivery_order: item.delivery_order || 0, lat: c?.delivery_lat || c?.lat, lng: c?.delivery_lng || c?.lng } as DeliveryItem;
                });
                const sorted = sortDeliveries(rawItems);
                setDeliveries(sorted); setOriginalDeliveries(sorted);
            }
        }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, supabase]); 

  const currentList = deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === activeRun);
  const activeItem = currentList.find(d => !d.is_completed);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDeliveries((items) => arrayMove(items, items.findIndex(i => i.id === active.id), items.findIndex(i => i.id === over.id)));
    }
  };

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
        const updates = currentList.map((item, index) => ({ id: item.id, delivery_order: index + 1 }));
        await Promise.all(updates.map(u => supabase.from('invoices').update({ delivery_order: u.delivery_order }).eq('id', u.id)));
        const updated = deliveries.map(d => { const u = updates.find(x => x.id === d.id); return u ? { ...d, delivery_order: u.delivery_order } : d; });
        const sorted = sortDeliveries(updated);
        setDeliveries(sorted); setOriginalDeliveries(sorted); 
        updateRunState(activeRun, { isEditing: false, isStarted: false }); 
    } catch (error) { console.error(error); } finally { setIsSavingOrder(false); }
  };

  const handleCancelOrder = () => { setDeliveries(originalDeliveries); updateRunState(activeRun, { isEditing: false }); };
  const handleStartRun = () => updateRunState(activeRun, { isStarted: true });
  const handleEditOrder = () => updateRunState(activeRun, { isEditing: true });

  // 🚀 [초고속 최적화 3] 메모리에서 목적지 좌표를 0.1초 만에 꺼내옵니다.
  const getFinalDestinationCoordinates = (): { lat: number, lng: number } | string | null => {
      if (finalDestType === 'company') return companyLocation ? { lat: companyLocation.lat, lng: companyLocation.lng } : (companyLocation?.address || returnAddress);
      if (finalDestType === 'driver') return driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : (profile?.address || returnAddress);
      return customAddress || returnAddress;
  };

  const handleAutoRoute = async () => {
      if (!isLoaded) return alert("Google Maps API loading...");
      if (!returnAddress) return alert("Please set a Final Destination first.");
      if (currentList.length < 2) return alert("Need at least 2 stops.");
      
      setIsAutoRouting(true); 
      try {
          const originItem = currentList[0];
          // 🚀 출발지: 좌표가 있으면 위경도로, 없으면 주소 텍스트로 즉각 실행 (GPS 로딩 없음)
          const origin = (originItem.lat && originItem.lng) ? { lat: originItem.lat, lng: originItem.lng } : originItem.delivery_address;
          
          const waypoints = currentList.slice(1).map(item => ({ 
              location: (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : item.delivery_address, 
              stopover: true 
          }));

          // 🚀 도착지: 메모리에서 즉시 가져옴
          const destination = getFinalDestinationCoordinates();
          if (!destination) return alert("Please set a Final Destination.");

          const ds = new google.maps.DirectionsService();
          ds.route({ origin, destination, waypoints, optimizeWaypoints: true, travelMode: google.maps.TravelMode.DRIVING }, (res: any, status: any) => {
              if (status === 'OK' && res) {
                  const optimizedList = [currentList[0], ...res.routes[0].waypoint_order.map((i: number) => currentList[i + 1])];
                  const merged = [...deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) !== activeRun), ...optimizedList];
                  setDeliveries(merged);
                  updateRunState(activeRun, { isEditing: true });
              } else { alert("Optimization failed."); }
              setIsAutoRouting(false); 
          });
      } catch (e) { setIsAutoRouting(false); }
  }; 
  
  const handleShowMap = () => {
      if (!isLoaded || currentList.length === 0) return alert("No deliveries.");
      setIsMapModalOpen(true);
      
      const originItem = currentList[0];
      const origin = (originItem.lat && originItem.lng) ? { lat: originItem.lat, lng: originItem.lng } : originItem.delivery_address;
      const waypoints = currentList.slice(1).map(item => ({ location: (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : item.delivery_address, stopover: true }));
      const destination = getFinalDestinationCoordinates();

      if(destination) {
          const ds = new google.maps.DirectionsService();
          ds.route({ origin, destination, waypoints, optimizeWaypoints: false, travelMode: google.maps.TravelMode.DRIVING }, (res: any, status: any) => { 
              if (status === 'OK') setDirectionsResponse(res); 
          });
      }
  };
  
  const handleSetDestinationType = (type: 'company' | 'driver' | 'custom', customAddr?: string) => {
      setFinalDestType(type);
      localStorage.setItem("finalDestType", type);
      let addr = type === 'company' ? companyLocation?.address : type === 'driver' ? profile?.address : customAddr;
      if (addr) { setReturnAddress(addr); localStorage.setItem("returnAddress", addr); }
      setIsDestinationModalOpen(false);
  };

  const handleNavigate = (address: string) => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank'); };
  const handleStartComplete = (id: string) => { setTargetId(id); fileInputRef.current?.click(); };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
    const file = e.target.files?.[0]; 
    if (file) { const stamped = await addTimestampToImage(file); setSelectedFile(stamped); setPreviewUrl(URL.createObjectURL(stamped)); } 
  };
  
  const handleConfirmUpload = async () => {
    if (!selectedFile || !targetId) return;
    setIsUploading(true);
    try {
        const compressedFile = await imageCompression(selectedFile, { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true, initialQuality: 0.7 });
        const fileName = `${targetId}_${Date.now()}.${selectedFile.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('delivery-proofs').upload(fileName, compressedFile);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('delivery-proofs').getPublicUrl(fileName);
        await supabase.from('invoices').update({ is_completed: true, proof_url: publicUrl }).eq('id', targetId);
        setDeliveries(prev => prev.map(d => d.id === targetId ? { ...d, is_completed: true } : d));
        handleCloseModal();
    } catch (error: any) { alert("Error: " + error.message); } finally { setIsUploading(false); }
  };
  const handleCloseModal = () => { setSelectedFile(null); setPreviewUrl(null); setTargetId(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      
      {/* Photo Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col animate-in fade-in duration-200">
            <div className="flex justify-between items-center p-4 text-white"><h3 className="font-bold text-lg">Proof</h3><button onClick={handleCloseModal} className="p-2 bg-white/10 rounded-full"><X className="w-6 h-6" /></button></div>
            <div className="flex-1 flex items-center justify-center relative"><img src={previewUrl} alt="Proof" className="max-w-full max-h-full object-contain" /></div>
            <div className="p-6 bg-slate-900 pb-10"><button onClick={handleConfirmUpload} disabled={isUploading} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg">{isUploading ? <Loader2 className="animate-spin" /> : <Check />} Complete</button></div>
        </div>
      )}

      {/* Map Modal */}
      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent className="w-[95%] h-[85vh] rounded-2xl p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-4 bg-white z-10 border-b shrink-0"><DialogTitle>Route Preview</DialogTitle></DialogHeader>
            <div className="flex-1 relative bg-slate-100">
                {isLoaded && directionsResponse ? (
                    <GoogleMap center={{ lat: -37.8136, lng: 144.9631 }} zoom={10} mapContainerStyle={{ width: '100%', height: '100%' }} options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false }}>
                        {/* ✅ [추가] 실시간 교통상황 (빨강, 노랑, 초록 선) */}
                        <TrafficLayer />
                        <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: true, preserveViewport: false }} />
                        {directionsResponse.routes[0]?.legs[0]?.start_location && <Marker position={directionsResponse.routes[0].legs[0].start_location} label={{ text: "S", color: "white", fontWeight: "bold" }} />}
                        {directionsResponse.routes[0]?.legs.map((leg: any, idx: number) => (
                            <Marker key={idx} position={leg.end_location} label={{ text: idx === directionsResponse.routes[0].legs.length - 1 && getFinalDestinationCoordinates() ? "F" : `${idx + 1}`, color: "white", fontWeight: "bold" }} />
                        ))}
                    </GoogleMap>
                ) : (<div className="flex items-center justify-center h-full text-slate-400">Loading Map...</div>)}
            </div>
            <div className="p-4 bg-white border-t shrink-0"><Button onClick={() => setIsMapModalOpen(false)} className="w-full bg-slate-900 text-white">Close</Button></div>
        </DialogContent>
      </Dialog>

      {/* Destination Modal */}
      <Dialog open={isDestinationModalOpen} onOpenChange={setIsDestinationModalOpen}>
        <DialogContent className="w-[90%] rounded-2xl">
            <DialogHeader><DialogTitle>Set Final Destination</DialogTitle></DialogHeader>
            <div className="space-y-3 py-4">
                <button onClick={() => handleSetDestinationType('company')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-left">
                    <div className="bg-blue-100 p-2 rounded-full"><Building2 className="w-5 h-5 text-blue-600" /></div>
                    <div><div className="font-bold text-slate-900">Company Depot</div><div className="text-xs text-slate-500">{companyLocation?.address || "Address not set"}</div></div>
                </button>
                <button onClick={() => handleSetDestinationType('driver')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-left">
                    <div className="bg-emerald-100 p-2 rounded-full"><Home className="w-5 h-5 text-emerald-600" /></div>
                    <div><div className="font-bold text-slate-900">My Address</div><div className="text-xs text-slate-500">{profile?.address || "Address not set"}</div></div>
                </button>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2 font-bold text-slate-900"><MousePointerClick className="w-4 h-4" /> Custom</div>
                    <Input id="custom-addr" value={customAddress} onChange={e => setCustomAddress(e.target.value)} placeholder="Enter new address..." className="mb-2" />
                    <Button size="sm" className="w-full bg-slate-900" onClick={() => handleSetDestinationType('custom', customAddress)}>Set Custom Address</Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Main Header */}
      <div className="shrink-0 bg-white z-10 border-b border-slate-100 shadow-sm">
        <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex flex-col"><span className="text-xs text-slate-500 font-medium">Welcome back,</span><h1 className="font-extrabold text-xl text-slate-900">{currentUserName}</h1></div>
        </div>
        <div className="px-4 pb-3 flex gap-2">
            {[1, 2].map(run => (
                <button key={run} onClick={() => setActiveRun(run)} className={`relative flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeRun === run ? "bg-slate-900 text-white shadow-md transform scale-[1.02]" : "bg-slate-100 text-slate-400"}`}>
                    {run === 1 ? "1st Run" : "2nd Run"} 
                    {(run === 1 ? hasNewInRun1 : hasNewInRun2) && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse shadow-sm" />}
                </button>
            ))}
        </div>
      </div>

      <div className="shrink-0 p-4 flex items-center justify-between bg-slate-50">
         <div className="flex items-center gap-2">
             {isEditing && <Button variant="outline" size="sm" onClick={handleAutoRoute} disabled={isAutoRouting} className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 text-xs font-bold h-9">{isAutoRouting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}Auto Route</Button>}
         </div>
         <div className="flex gap-2">
             {isEditing ? (
                 <><Button size="sm" onClick={handleCancelOrder} variant="ghost" className="text-slate-500 h-9"><X className="w-4 h-4 mr-1" /> Cancel</Button><Button size="sm" onClick={handleSaveOrder} disabled={isSavingOrder} className="bg-blue-600 text-white h-9 font-bold shadow-md shadow-blue-200 min-w-[80px]">{isSavingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}</Button></>
             ) : (
                 <>{isStarted ? (<Button size="sm" variant="outline" onClick={handleEditOrder} className="h-9 border-slate-300 text-slate-600"><Unlock className="w-3.5 h-3.5 mr-1.5" /> Edit Order</Button>) : (<div className="flex gap-2"><Button size="sm" variant="outline" onClick={handleEditOrder} className="h-9"><ArrowUpDown className="w-4 h-4 mr-1" /> Sort</Button><Button size="sm" onClick={handleStartRun} className="bg-slate-900 text-white h-9 font-bold px-4"><Play className="w-4 h-4 mr-1 fill-current" /> Start</Button></div>)}</>
             )}
         </div>
      </div>

      <div className="flex-1 min-h-0 px-4 space-y-3 pb-20 overflow-y-auto custom-scrollbar">
        {loading ? ( <div className="p-10 text-center text-slate-400">Loading...</div> ) : currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl"><Package className="w-12 h-12 mb-2 opacity-20" /><span className="text-sm font-medium">No deliveries for this run.</span></div>
        ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currentList.map(d => d.id)} strategy={verticalListSortingStrategy}>
                    {currentList.map((item, index) => (
                        <SortableItem key={item.id} id={item.id} item={item} index={index} isActive={isStarted && !item.is_completed && activeItem?.id === item.id} isDone={item.is_completed} isEditing={isEditing} isNew={item.delivery_order === 0} onComplete={() => handleStartComplete(item.id)} onNavigate={() => handleNavigate(item.delivery_address)} onCall={() => window.location.href = `tel:${item.phone}`} />
                    ))}
                </SortableContext>
            </DndContext>
        )}
        {currentList.length > 0 && !loading && (
            <div className="mt-8 pt-4 border-t border-slate-200 opacity-90 pb-8">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider flex items-center gap-1"><Home className="w-3 h-3" /> Final Destination</div>
                <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center border border-slate-200">
                    <div className="flex-1 cursor-pointer" onClick={() => setIsDestinationModalOpen(true)}>
                        <div className="font-bold text-slate-700 text-sm">Return to {finalDestType === 'company' ? 'Company Depot' : finalDestType === 'driver' ? 'My Address' : 'Custom Location'}</div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate pr-2">{returnAddress || "Tap to set destination..."}</div>
                    </div>
                    {returnAddress && (<Button size="sm" variant="outline" onClick={() => handleShowMap()} className="h-10 w-10 p-0 rounded-full border-slate-300 bg-white shadow-sm hover:bg-slate-50 shrink-0"><Navigation className="w-4 h-4 text-blue-600" /></Button>)}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

function SortableItem({ id, item, index, isActive, isLocked, isDone, isEditing, isNew, onComplete, onNavigate, onCall }: any) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    if (isDone) return ( <div ref={setNodeRef} style={style} className="bg-slate-50 border p-4 rounded-xl opacity-60 grayscale flex items-center justify-between"><div className="flex items-center gap-3"><div className="bg-slate-200 p-1.5 rounded-full"><Check className="w-4 h-4 text-slate-500" /></div><span className="text-slate-500 font-medium line-through">{item.invoice_to}</span></div></div> );
    if (isActive && !isEditing) return ( <div className="bg-white border-2 border-blue-600 shadow-xl p-5 rounded-2xl transform scale-[1.02] relative"><div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-xl">Current Delivery</div><h3 className="mt-4 text-2xl font-black"><span className="text-blue-600 mr-2">{index + 1}.</span>{item.invoice_to}</h3><p className="text-slate-600 text-sm mt-1">{item.delivery_address}</p><div className="mt-4 grid grid-cols-5 gap-3"><Button onClick={onCall} variant="outline" className="col-span-1 h-12"><Phone className="w-5 h-5 text-slate-600" /></Button><Button onClick={onNavigate} className="col-span-2 h-12 bg-blue-50 text-blue-700 font-bold"><Navigation className="w-5 h-5 mr-2" /> Map</Button><Button onClick={onComplete} className="col-span-2 h-12 bg-slate-900 text-white font-bold"><Camera className="w-5 h-5 mr-2" /> Done</Button></div></div> );
    return ( <div ref={setNodeRef} style={style} className={`bg-white p-4 rounded-xl border flex items-center justify-between ${isEditing ? "border-blue-200 shadow-sm" : "opacity-70"}`}><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isEditing ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`}>{index + 1}</div><div><div className="font-bold text-slate-800">{item.invoice_to}</div><div className="text-xs text-slate-500 truncate max-w-[200px]">{item.delivery_address}</div></div></div>{isEditing ? (<div ref={setActivatorNodeRef} {...attributes} {...listeners} className="p-2 touch-none cursor-grab"><ArrowUpDown className="w-5 h-5 text-blue-400" /></div>) : (<div className="text-xs font-bold text-slate-300">Next</div>)}</div> );
}