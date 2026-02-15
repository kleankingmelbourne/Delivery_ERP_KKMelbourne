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
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import imageCompression from "browser-image-compression"; 

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
}

interface RunState {
    isStarted: boolean;
    isEditing: boolean;
}

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

export default function DriverDeliveryPage() {
  const supabase = createClient();
  
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [originalDeliveries, setOriginalDeliveries] = useState<DeliveryItem[]>([]); 
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<number>(1);
  const [driverProfileAddress, setDriverProfileAddress] = useState(""); 
  const [companyAddress, setCompanyAddress] = useState(""); 
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [currentUserName, setCurrentUserName] = useState("Driver");

  const [runStates, setRunStates] = useState<{ [key: number]: RunState }>({
      1: { isStarted: false, isEditing: false },
      2: { isStarted: false, isEditing: false }
  });

  const hasNewInRun1 = deliveries.some(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === 1 && d.delivery_order === 0);
  const hasNewInRun2 = deliveries.some(d => d.delivery_run === 2 && d.delivery_order === 0);

  const [returnAddress, setReturnAddress] = useState(""); 
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const currentRunState = runStates[activeRun];
  const isStarted = currentRunState.isStarted;
  const isEditing = currentRunState.isEditing;

  const updateRunState = (run: number, updates: Partial<RunState>) => {
      setRunStates(prev => ({ ...prev, [run]: { ...prev[run], ...updates } }));
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel('realtime-driver-invoices').on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, (payload) => {
        const today = getMelbourneDate();
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;
        const eventType = payload.eventType;
        const isToday = newRecord?.invoice_date === today || oldRecord?.invoice_date === today;
        
        if (!isToday) return;

        const isAssignedToMe = newRecord?.driver_id === currentUserId;
        const wasAssignedToMe = oldRecord?.driver_id === currentUserId;
        let shouldRefresh = false;

        if (eventType === 'INSERT' && isAssignedToMe) {
            shouldRefresh = true;
        }

        if (eventType === 'UPDATE') {
            const isRunChanged = oldRecord?.delivery_run !== newRecord.delivery_run;
            const isDriverChanged = oldRecord?.driver_id !== newRecord.driver_id;
            const isOrderReset = oldRecord?.delivery_order !== 0 && newRecord.delivery_order === 0;

            if (isAssignedToMe && (isDriverChanged || isRunChanged || isOrderReset)) {
                shouldRefresh = true;
                if (newRecord.delivery_order === 0) {
                    const targetRun = newRecord.delivery_run === 0 ? 1 : newRecord.delivery_run;
                    updateRunState(targetRun, { isEditing: true });
                }
            }
            if (isAssignedToMe && wasAssignedToMe && !isRunChanged && !isOrderReset) {
                 shouldRefresh = true;
            }
        }

        if (eventType === 'DELETE' || (eventType === 'UPDATE' && wasAssignedToMe && !isAssignedToMe)) {
            shouldRefresh = true;
        }

        if (shouldRefresh) { 
            fetchDeliveries(currentUserId); 
        }
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]); 


  const fetchInitialData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase.from('profiles').select('address, display_name').eq('id', user.id).single();
      if (profile) {
          if (profile.address) setDriverProfileAddress(profile.address);
          const name = profile.display_name || user.email?.split('@')[0] || "Driver";
          setCurrentUserName(name);
      }

      try {
        const { data: company } = await supabase.from('company_settings').select('address_line1, address_line2, state, suburb, postcode').maybeSingle(); 
        if (company) {
            const parts = [company.address_line1, company.address_line2, company.suburb, company.state, company.postcode].filter(p => p && p.trim() !== "");
            const fullCompAddr = parts.join(", ");
            setCompanyAddress(fullCompAddr);
            if (!profile?.address) setReturnAddress(fullCompAddr);
        }
      } catch (e) { console.error("Fetch Company Error:", e); }

      const savedReturn = localStorage.getItem("returnAddress");
      if (savedReturn) setReturnAddress(savedReturn);
      else if (profile?.address) setReturnAddress(profile.address);

      fetchDeliveries(user.id, true);
  };

  const sortDeliveries = (items: DeliveryItem[]) => {
      const newItems = items.filter(d => d.delivery_order === 0);
      const savedItems = items.filter(d => d.delivery_order > 0);
      savedItems.sort((a, b) => a.delivery_order - b.delivery_order);
      return [...newItems, ...savedItems];
  };

  const fetchDeliveries = async (userId: string, isInitialLoad = false) => {
    setLoading(true);

    try {
        const today = getMelbourneDate();
        const { data, error } = await supabase
          .from('invoices')
          .select(`
            id, invoice_to, status, is_completed, memo, delivery_run, delivery_order, driver_id, invoice_date,
            customers ( mobile, delivery_address, delivery_state, delivery_suburb, delivery_postcode )
          `)
          .eq('invoice_date', today)  
          .eq('driver_id', userId)   
          .neq('delivery_run', 0)     
          .order('delivery_order', { ascending: true }); 

        if (error) console.error("🔥 Fetch Error:", error.message);

        if (data) {
          const rawItems = data.map((item: any) => {
            const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers;
            const fullAddress = customer 
                ? `${customer.delivery_address || ''}, ${customer.delivery_suburb || ''} ${customer.delivery_state || ''} ${customer.delivery_postcode || ''}`.trim()
                : "주소 정보 없음";
            const cleanAddress = fullAddress === ",   " ? "주소 정보 없음" : fullAddress.replace(/^, /, "");

            const run = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
            const order = item.delivery_order === null ? 0 : item.delivery_order;

            return {
                id: item.id,
                invoice_to: item.invoice_to,
                delivery_address: cleanAddress, 
                phone: customer?.mobile || "",  
                status: item.status,
                is_completed: item.is_completed,
                memo: item.memo,
                delivery_run: run, 
                delivery_order: order
            } as DeliveryItem;
          });
          
          const sortedItems = sortDeliveries(rawItems);

          setDeliveries(sortedItems);
          setOriginalDeliveries(sortedItems);
          
          const isRun1Started = sortedItems.some((d: any) => d.delivery_run === 1 && d.is_completed);
          const isRun2Started = sortedItems.some((d: any) => d.delivery_run === 2 && d.is_completed);
          
          const hasNew1 = sortedItems.some((d: any) => d.delivery_run === 1 && d.delivery_order === 0);
          const hasNew2 = sortedItems.some((d: any) => d.delivery_run === 2 && d.delivery_order === 0);

          setRunStates(prev => ({
              1: { 
                  isStarted: prev[1].isStarted || isRun1Started, 
                  isEditing: prev[1].isEditing || hasNew1 
              },
              2: { 
                  isStarted: prev[2].isStarted || isRun2Started, 
                  isEditing: prev[2].isEditing || hasNew2 
              }
          }));
        }
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const currentList = deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === activeRun);
  const activeItem = currentList.find(d => !d.is_completed);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDeliveries((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    try {
        const updates = currentList.map((item, index) => ({ 
            id: item.id, 
            delivery_order: index + 1 
        }));

        await Promise.all(updates.map(update => 
            supabase.from('invoices').update({ delivery_order: update.delivery_order }).eq('id', update.id)
        ));
        
        const updatedDeliveries = deliveries.map(d => {
            const update = updates.find(u => u.id === d.id);
            return update ? { ...d, delivery_order: update.delivery_order } : d;
        });
        
        const sorted = sortDeliveries(updatedDeliveries);
        
        setDeliveries(sorted);
        setOriginalDeliveries(sorted); 
        
        updateRunState(activeRun, { isEditing: false, isStarted: false }); 

    } catch (error) { console.error("Save Error:", error); } finally { setIsSavingOrder(false); }
  };

  const handleCancelOrder = () => { 
      setDeliveries(originalDeliveries); 
      updateRunState(activeRun, { isEditing: false });
  };

  const handleStartRun = () => {
      updateRunState(activeRun, { isStarted: true });
  };

  const handleEditOrder = () => {
      updateRunState(activeRun, { isEditing: true });
  };

  const handleAutoRoute = async () => {
      if (!isLoaded) return alert("Google Maps API loading...");
      if (!returnAddress) return alert("Please set a Final Destination first.");
      setIsAutoRouting(true); 
      const waypoints = currentList.map(item => ({ location: item.delivery_address, stopover: true }));
      if (waypoints.length === 0) { setIsAutoRouting(false); return; }
      navigator.geolocation.getCurrentPosition((position) => {
          const origin = { lat: position.coords.latitude, lng: position.coords.longitude };
          calculateAutoRoute(origin, waypoints);
      }, () => { calculateAutoRoute(waypoints[0].location, waypoints.slice(1)); });
  }; 
  const calculateAutoRoute = (origin: any, waypoints: any[]) => {
      const directionsService = new google.maps.DirectionsService();
      directionsService.route({ origin: origin, destination: returnAddress, waypoints: waypoints, optimizeWaypoints: true, travelMode: google.maps.TravelMode.DRIVING }, (result: any, status: any) => {
          setIsAutoRouting(false); 
          if (status === google.maps.DirectionsStatus.OK && result) {
              const newOrder = result.routes[0].waypoint_order;
              const optimizedList: DeliveryItem[] = [];
              if (Array.isArray(origin)) { 
                 optimizedList.push(currentList[0]);
                 newOrder.forEach((index: number) => optimizedList.push(currentList[index + 1]));
              } else {
                 newOrder.forEach((index: number) => optimizedList.push(currentList[index]));
              }
              const otherRunItems = deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) !== activeRun);
              const merged = [...otherRunItems, ...optimizedList];
              setDeliveries(merged);
              updateRunState(activeRun, { isEditing: true });
          } else { alert("Route calculation failed."); }
      });
  }
  const handleShowMap = () => {
      if (!isLoaded || !returnAddress || currentList.length === 0) return alert("No deliveries or Final Destination set.");
      setIsMapModalOpen(true);
      navigator.geolocation.getCurrentPosition((position) => { const pos = { lat: position.coords.latitude, lng: position.coords.longitude }; calculateRouteForMap(pos); }, () => { calculateRouteForMap(currentList[0].delivery_address); });
  };
  const calculateRouteForMap = (origin: any) => {
      const directionsService = new google.maps.DirectionsService();
      const waypoints = currentList.map(item => ({ location: item.delivery_address, stopover: true }));
      directionsService.route({ origin: origin, destination: returnAddress, waypoints: waypoints, optimizeWaypoints: false, travelMode: google.maps.TravelMode.DRIVING }, (result: any, status: any) => { if (status === google.maps.DirectionsStatus.OK) setDirectionsResponse(result); });
  }
  const handleNavigate = (address: string) => { window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank'); };
  const handleSetDestination = (type: 'company' | 'driver' | 'custom', customAddr?: string) => {
      let addr = "";
      if (type === 'company') addr = companyAddress || "";
      else if (type === 'driver') addr = driverProfileAddress;
      else if (type === 'custom' && customAddr) addr = customAddr;
      if (!addr) return alert("Address is empty. Check Company Settings or Profile.");
      setReturnAddress(addr);
      localStorage.setItem("returnAddress", addr);
      setIsDestinationModalOpen(false);
  };
  const handleStartComplete = (id: string) => { setTargetId(id); fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { setSelectedFile(file); setPreviewUrl(URL.createObjectURL(file)); } };
  
  const handleConfirmUpload = async () => {
    if (!selectedFile || !targetId) return;
    setIsUploading(true);
    try {
        const options = {
            maxSizeMB: 1, 
            maxWidthOrHeight: 1280, 
            useWebWorker: true,
            initialQuality: 0.7 
        };

        const compressedFile = await imageCompression(selectedFile, options);
        console.log(`Resize: ${(selectedFile.size/1024).toFixed(2)}kb -> ${(compressedFile.size/1024).toFixed(2)}kb`);

        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${targetId}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('delivery-proofs').upload(fileName, compressedFile);
        if (uploadError) throw uploadError;
        
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
            <div className="flex justify-between items-center p-4 text-white">
                <h3 className="font-bold text-lg">Proof</h3>
                <button onClick={handleCloseModal} className="p-2 bg-white/10 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 flex items-center justify-center relative">
                <img src={previewUrl} alt="Proof" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="p-6 bg-slate-900 pb-10">
                <button onClick={handleConfirmUpload} disabled={isUploading} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg">
                    {isUploading ? <Loader2 className="animate-spin" /> : <Check />} Complete
                </button>
            </div>
        </div>
      )}

      {/* Map Modal */}
      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent className="w-[95%] h-[85vh] rounded-2xl p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-4 bg-white z-10 border-b shrink-0">
                <DialogTitle>Route Preview</DialogTitle>
                <DialogDescription className="hidden">Map visualization of the current delivery route</DialogDescription>
            </DialogHeader>
            <div className="flex-1 relative bg-slate-100">
                {isLoaded && directionsResponse ? (
                    <GoogleMap
                        center={{ lat: -37.8136, lng: 144.9631 }}
                        zoom={10}
                        mapContainerStyle={{ width: '100%', height: '100%' }}
                        options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false }}
                    >
                        <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: true }} />
                        {directionsResponse.routes[0]?.legs[0]?.start_location && (
                            <Marker position={directionsResponse.routes[0].legs[0].start_location} label={{ text: "S", color: "white", fontWeight: "bold" }} />
                        )}
                        {currentList.map((_, index) => {
                            const location = directionsResponse.routes[0]?.legs[index]?.end_location;
                            if (!location) return null;
                            return <Marker key={index} position={location} label={{ text: `${index + 1}`, color: "white", fontWeight: "bold" }} />;
                        })}
                        {directionsResponse.routes[0]?.legs[currentList.length]?.end_location && (
                            <Marker position={directionsResponse.routes[0].legs[currentList.length].end_location} label={{ text: "F", color: "white", fontWeight: "bold" }} />
                        )}
                    </GoogleMap>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">Loading Map...</div>
                )}
            </div>
            <div className="p-4 bg-white border-t shrink-0">
                <Button onClick={() => setIsMapModalOpen(false)} className="w-full bg-slate-900 text-white">Close Map</Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* Destination Modal */}
      <Dialog open={isDestinationModalOpen} onOpenChange={setIsDestinationModalOpen}>
        <DialogContent className="w-[90%] rounded-2xl">
            <DialogHeader>
                <DialogTitle>Set Final Destination</DialogTitle>
                <DialogDescription>Select where to go after the last delivery.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
                <button onClick={() => handleSetDestination('company')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors text-left">
                    <div className="bg-blue-100 p-2 rounded-full"><Building2 className="w-5 h-5 text-blue-600" /></div>
                    <div>
                        <div className="font-bold text-slate-900">Company Depot</div>
                        <div className="text-xs text-slate-500">{companyAddress || "No address found"}</div>
                    </div>
                </button>
                <button onClick={() => handleSetDestination('driver')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors text-left">
                    <div className="bg-emerald-100 p-2 rounded-full"><Home className="w-5 h-5 text-emerald-600" /></div>
                    <div>
                        <div className="font-bold text-slate-900">My Address</div>
                        <div className="text-xs text-slate-500">{driverProfileAddress || "No address set"}</div>
                    </div>
                </button>
                <div className="p-4 bg-white border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2 font-bold text-slate-900"><MousePointerClick className="w-4 h-4" /> Custom Address</div>
                    <Input id="custom-addr" placeholder="Enter new address..." className="mb-2" onKeyDown={(e) => { if (e.key === 'Enter') handleSetDestination('custom', e.currentTarget.value); }} />
                    <Button size="sm" className="w-full bg-slate-900" onClick={() => { const input = document.getElementById('custom-addr') as HTMLInputElement; handleSetDestination('custom', input.value); }}>Set Custom Address</Button>
                </div>
            </div>
        </DialogContent>
      </Dialog>

      {/* Main Header (Sticky) */}
      <div className="shrink-0 bg-white z-10 border-b border-slate-100 shadow-sm">
        <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-medium">Welcome back,</span>
                <h1 className="font-extrabold text-xl text-slate-900">{currentUserName}</h1>
            </div>
        </div>
        <div className="px-4 pb-3 flex gap-2">
            {[1, 2].map(run => (
                <button 
                    key={run} 
                    onClick={() => setActiveRun(run)} 
                    className={`relative flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeRun === run ? "bg-slate-900 text-white shadow-md transform scale-[1.02]" : "bg-slate-100 text-slate-400"}`}
                >
                    {run === 1 ? "1st Run" : "2nd Run"} 
                    {(run === 1 ? hasNewInRun1 : hasNewInRun2) && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse shadow-sm" />
                    )}
                </button>
            ))}
        </div>
      </div>

      {/* Action Bar (Sticky) */}
      <div className="shrink-0 p-4 flex items-center justify-between bg-slate-50">
         <div className="flex items-center gap-2">
             {isEditing && (
                 <Button variant="outline" size="sm" onClick={handleAutoRoute} disabled={isAutoRouting} className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 text-xs font-bold h-9">
                     {isAutoRouting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                     Auto Route
                 </Button>
             )}
             {!isEditing && isStarted && (
                 <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full flex items-center gap-1 border border-emerald-100 animate-pulse">
                     <Navigation className="w-3 h-3" /> In Progress
                 </span>
             )}
         </div>

         <div className="flex gap-2">
             {isEditing ? (
                 <>
                    <Button size="sm" onClick={handleCancelOrder} variant="ghost" className="text-slate-500 h-9"><X className="w-4 h-4 mr-1" /> Cancel</Button>
                    <Button size="sm" onClick={handleSaveOrder} disabled={isSavingOrder} className="bg-blue-600 hover:bg-blue-700 text-white h-9 font-bold shadow-md shadow-blue-200 min-w-[80px]">
                        {isSavingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}
                    </Button>
                 </>
             ) : (
                 <>
                    {isStarted ? (
                        <Button size="sm" variant="outline" onClick={handleEditOrder} className="h-9 border-slate-300 text-slate-600"><Unlock className="w-3.5 h-3.5 mr-1.5" /> Edit Order</Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleEditOrder} className="h-9"><ArrowUpDown className="w-4 h-4 mr-1" /> Sort</Button>
                            <Button size="sm" onClick={handleStartRun} className="bg-slate-900 text-white h-9 font-bold px-4 shadow-lg shadow-slate-300"><Play className="w-4 h-4 mr-1 fill-current" /> Start</Button>
                        </div>
                    )}
                 </>
             )}
         </div>
      </div>

      {/* List Area (Scrollable with custom scrollbar) */}
      <div className="flex-1 min-h-0 px-4 space-y-3 pb-20 overflow-y-auto custom-scrollbar">
        {currentList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
                <Package className="w-12 h-12 mb-2 opacity-20" />
                <span className="text-sm font-medium">No deliveries for this run.</span>
            </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={currentList.map(d => d.id)} strategy={verticalListSortingStrategy}>
                {currentList.map((item, index) => {
                    const isActive = isStarted && !item.is_completed && activeItem?.id === item.id;
                    const isLocked = isStarted && !item.is_completed && !isActive && !isEditing;
                    const isDone = item.is_completed;
                    
                    return (
                        <SortableItem 
                            key={item.id} id={item.id} item={item} index={index}
                            isActive={isActive} isLocked={isLocked} isDone={isDone} isEditing={isEditing} 
                            isNew={item.delivery_order === 0} 
                            onComplete={() => handleStartComplete(item.id)}
                            onNavigate={() => handleNavigate(item.delivery_address)}
                            onCall={() => window.location.href = `tel:${item.phone}`}
                        />
                    );
                })}
            </SortableContext>
        </DndContext>

        {currentList.length > 0 && (
            <div className="mt-8 pt-4 border-t border-slate-200 opacity-90 pb-8">
                <div className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider flex items-center gap-1">
                    <Home className="w-3 h-3" /> Final Destination
                </div>
                <div onClick={() => setIsDestinationModalOpen(true)} className="bg-slate-100 p-4 rounded-xl flex justify-between items-center border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                    <div className="flex-1">
                        <div className="font-bold text-slate-700 text-sm">Return to Base</div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate pr-2">{returnAddress || "Tap to set destination..."}</div>
                    </div>
                    {returnAddress && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleNavigate(returnAddress); }} className="h-10 w-10 p-0 rounded-full border-slate-300 bg-white shadow-sm hover:bg-slate-50 shrink-0">
                            <Navigation className="w-4 h-4 text-blue-600" />
                        </Button>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}

// ✅ [수정] SortableItem: 드래그 핸들 분리하여 스크롤 가능하게 수정
function SortableItem({ id, item, index, isActive, isLocked, isDone, isEditing, isNew, onComplete, onNavigate, onCall }: any) {
    // 1. setActivatorNodeRef 추가 (핸들용 Ref)
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    if (isDone) {
        return (
            <div ref={setNodeRef} style={style} className="bg-slate-50 border border-slate-100 p-4 rounded-xl opacity-60 grayscale flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-slate-200 p-1.5 rounded-full"><Check className="w-4 h-4 text-slate-500" /></div>
                    <span className="text-slate-500 font-medium line-through decoration-slate-400">{item.invoice_to}</span>
                </div>
                <span className="text-xs font-bold text-slate-400">Completed</span>
            </div>
        );
    }

    if (isActive && !isEditing) {
        return (
            <div className="bg-white border-2 border-blue-600 shadow-xl shadow-blue-100 p-5 rounded-2xl transform scale-[1.02] transition-all relative overflow-hidden">
                <div className="absolute top-0 left-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-br-xl flex items-center gap-2">
                    Current Delivery
                    {isNew && <Badge className="bg-white text-blue-600 border border-blue-200 text-[9px] h-4 px-1">NEW</Badge>}
                </div>
                <div className="mt-4 mb-4">
                    <h3 className="text-2xl font-black text-slate-900">
                        <span className="text-blue-600 mr-2">{index + 1}.</span>
                        {item.invoice_to}
                    </h3>
                    <p className="text-slate-600 text-sm mt-1 flex items-start gap-1"><MapPin className="w-4 h-4 shrink-0 mt-0.5" /> {item.delivery_address}</p>
                    {item.memo && <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded-lg border border-amber-100">📝 {item.memo}</div>}
                </div>
                <div className="grid grid-cols-5 gap-3">
                    <Button onClick={onCall} variant="outline" className="col-span-1 h-12 rounded-xl border-slate-200"><Phone className="w-5 h-5 text-slate-600" /></Button>
                    <Button onClick={onNavigate} className="col-span-2 h-12 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 font-bold"><Navigation className="w-5 h-5 mr-2" /> Map</Button>
                    <Button onClick={onComplete} className="col-span-2 h-12 rounded-xl bg-slate-900 text-white font-bold shadow-lg shadow-slate-300"><Camera className="w-5 h-5 mr-2" /> Done</Button>
                </div>
            </div>
        );
    }

    return (
        // 2. 메인 div에서 listener 제거 및 touch-none 제거 (스크롤 가능하게)
        <div ref={setNodeRef} style={style} className={`bg-white p-4 rounded-xl border flex items-center justify-between ${isEditing ? "border-blue-200 shadow-sm" : "border-slate-100 opacity-70"}`}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isEditing ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"}`}>{index + 1}</div>
                <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                        {item.invoice_to}
                        {isNew && <Badge className="bg-emerald-500 text-[10px] h-5 px-1.5 hover:bg-emerald-600">NEW</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 truncate max-w-[200px] mb-1">{item.delivery_address}</div>
                </div>
            </div>
            
            {/* 3. 드래그 핸들 (아이콘)에만 listener 적용 (여기를 잡고 끌어야 순서 변경됨) */}
            {isEditing ? (
                <div 
                    ref={setActivatorNodeRef} 
                    {...attributes} 
                    {...listeners} 
                    className="p-2 touch-none cursor-grab active:cursor-grabbing"
                >
                    <ArrowUpDown className="w-5 h-5 text-blue-400" />
                </div>
            ) : (
                <div className="text-xs font-bold text-slate-300 px-2 py-1 rounded bg-slate-50">Next</div>
            )}
        </div>
    );
}