"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMap, DirectionsRenderer, Marker, TrafficLayer, InfoWindow, useJsApiLoader } from '@react-google-maps/api'; 
import { 
  Phone, Check, Navigation, Package, Camera, X, Loader2, 
  ArrowUpDown, Play, Unlock, Save, Home, 
  Sparkles, Building2, MousePointerClick, Flag, Circle,
  MessageSquareText, MapPin, ListOrdered, Map as MapIcon, RefreshCw, ImageIcon
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
  customer_id: string; 
  invoice_to: string;
  contact_name?: string; 
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

const PIN_SVG_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z";
const DEFAULT_CENTER = { lat: -37.8136, lng: 144.9631 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const MAP_OPTIONS = { zoomControl: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false };
const DIR_OPTIONS = { suppressMarkers: true, preserveViewport: false };

export default function DriverDashboardPage() {
  const supabase = createClient();
  const { user, profile, currentUserName: authUserName, companyLocation } = useAuth() as any;

  useEffect(() => {
      const originalWarn = console.warn;
      console.warn = (...args) => {
          if (typeof args[0] === 'string' && (
              args[0].includes('google.maps.DirectionsService is deprecated') || 
              args[0].includes('google.maps.DirectionsRenderer is deprecated') || 
              args[0].includes('google.maps.Marker is deprecated')
          )) {
              return; 
          }
          originalWarn.apply(console, args);
      };
      return () => { console.warn = originalWarn; }; 
  }, []);

  const [libraries] = useState<("places" | "geometry" | "routes")[]>(["places", "geometry", "routes"]);
  const { isLoaded } = useJsApiLoader({
      id: 'google-map-script',
      googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      libraries: libraries
  });

  const [activeTab, setActiveTab] = useState<'list' | 'map'>('list');
  const [dbProfile, setDbProfile] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [originalDeliveries, setOriginalDeliveries] = useState<DeliveryItem[]>([]); 
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false); 
  
  const [activeRun, setActiveRun] = useState<number>(1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("Driver");

  const [runStates, setRunStates] = useState<{ [key: number]: RunState }>({
      1: { isStarted: false, isEditing: false },
      2: { isStarted: false, isEditing: false }
  });

  const [startDestType, setStartDestType] = useState<'company' | 'home' | 'custom'>('company');
  const [finalDestType, setFinalDestType] = useState<'company' | 'home' | 'custom'>('company');
  const [customStart, setCustomStart] = useState("");
  const [customFinal, setCustomFinal] = useState("");

  const [isDestModalOpen, setIsDestModalOpen] = useState(false); 
  const [modalTarget, setModalTarget] = useState<'start' | 'final'>('final');

  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isAutoRouting, setIsAutoRouting] = useState(false); 
  const [updatingLocationId, setUpdatingLocationId] = useState<string | null>(null);

  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [isMapDrawing, setIsMapDrawing] = useState(false);
  const lastDrawnHash = useRef<string>("");

  const [isPhotoOptionModalOpen, setIsPhotoOptionModalOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [dailyMemo, setDailyMemo] = useState(""); 
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [memoText, setMemoText] = useState(""); 
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [selectedInvoiceForItems, setSelectedInvoiceForItems] = useState<{id: string, name: string} | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [isItemsLoading, setIsItemsLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; 
      if (file) {
          addTimestampToImage(file).then(stamped => { 
              setSelectedFile(stamped); 
              setPreviewUrl(URL.createObjectURL(stamped)); 
          });
      }
      e.target.value = '';
  };

  useEffect(() => {
    if (isMemoModalOpen) { 
        const timer = setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const length = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(length, length);
                textareaRef.current.scrollTop = textareaRef.current.scrollHeight; 
            }
        }, 150);
        return () => clearTimeout(timer);
    }
  }, [isMemoModalOpen]);

  const currentRunState = runStates[activeRun];
  const isStarted = currentRunState?.isStarted || false;
  const isEditing = currentRunState?.isEditing || false;

  const currentList = deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) === activeRun);
  const activeItem = currentList.find(d => !d.is_completed);

  const handleSetPoint = (type: 'company' | 'home' | 'custom') => {
    if (modalTarget === 'start') {
        setStartDestType(type);
        saveRoutePrefs(type, finalDestType, customStart, customFinal);
    } else {
        setFinalDestType(type);
        saveRoutePrefs(startDestType, type, customStart, customFinal);
    }
    setIsDestModalOpen(false);
  };

  const saveRoutePrefs = async (newStartType: string, newFinalType: string, newStartAddr: string, newFinalAddr: string) => {
    if (!user) return;
    const prefs = { ...(dbProfile?.route_prefs || {}), startDestType: newStartType, finalDestType: newFinalType, customStart: newStartAddr, customFinal: newFinalAddr };
    setDbProfile((prev: any) => ({ ...prev, route_prefs: prefs })); 
    await supabase.from('profiles').update({ route_prefs: prefs }).eq('id', user.id);
  };

  const updateRunState = (run: number, updates: Partial<RunState>) => setRunStates(prev => ({ ...prev, [run]: { ...prev[run], ...updates } }));

  const sortDeliveries = (items: DeliveryItem[]) => {
      const newItems = items.filter(d => d.delivery_order === 0);
      const savedItems = items.filter(d => d.delivery_order > 0).sort((a, b) => a.delivery_order - b.delivery_order);
      return [...newItems, ...savedItems];
  };

  const getSafeHomeAddress = useCallback(() => {
    return dbProfile?.address || "Address not set";
  }, [dbProfile]);

  const fetchDeliveryData = useCallback(async (isSilent = false) => {
      if (!user) return;
      if (!isSilent) setLoading(true);
      else setIsBackgroundSyncing(true);
      try {
          const { data: profileFromDb } = await supabase.from('profiles').select('address, lat, lng, route_prefs').eq('id', user.id).single();
          if (profileFromDb) {
              setDbProfile(profileFromDb);
              if (profileFromDb.route_prefs) {
                  const prefs = profileFromDb.route_prefs;
                  setStartDestType(prefs.startDestType || 'company');
                  setFinalDestType(prefs.finalDestType || 'company');
                  setCustomStart(prefs.customStart || "");
                  setCustomFinal(prefs.customFinal || "");
              }
          }
          setCurrentUserId(user.id);
          setCurrentUserName(authUserName);
          const today = getMelbourneDate();
          
          const { data: invoiceData } = await supabase.from('invoices').select(`
              id, invoice_to, status, is_completed, delivery_run, delivery_order, driver_id, invoice_date, customer_id,
              customers ( contact_name, mobile, delivery_address, delivery_state, delivery_suburb, delivery_postcode, delivery_lat, delivery_lng, lat, lng )
          `).eq('invoice_date', today).eq('driver_id', user.id).neq('delivery_run', 0).order('delivery_order', { ascending: true });
          
          const { data: memoData } = await supabase.from('delivery_memos').select('content').eq('driver_id', user.id).eq('memo_date', today).maybeSingle();
          if (memoData) setDailyMemo(memoData.content || "");
          
          if (invoiceData) {
              const rawItems = invoiceData.map((item: any) => {
                  const c = Array.isArray(item.customers) ? item.customers[0] : item.customers;
                  return {
                      id: item.id, 
                      customer_id: item.customer_id, 
                      invoice_to: item.invoice_to, 
                      contact_name: c?.contact_name || "",
                      delivery_address: `${c?.delivery_address || ''}, ${c?.delivery_suburb || ''}`.replace(/^, /, ""),
                      phone: c?.mobile || "", 
                      status: item.status, 
                      is_completed: item.is_completed,
                      delivery_run: item.delivery_run != null ? Number(item.delivery_run) : 1, 
                      delivery_order: item.delivery_order != null ? Number(item.delivery_order) : 0,
                      lat: c?.delivery_lat || c?.lat, 
                      lng: c?.delivery_lng || c?.lng
                  } as DeliveryItem;
              });
              const sortedItems = sortDeliveries(rawItems);
              setDeliveries(sortedItems); setOriginalDeliveries(sortedItems);
              
              setRunStates(prev => ({
                  1: { 
                      isStarted: prev[1]?.isStarted || sortedItems.some(d => d.delivery_run === 1 && d.is_completed), 
                      isEditing: prev[1]?.isEditing || false 
                  },
                  2: { 
                      isStarted: prev[2]?.isStarted || sortedItems.some(d => d.delivery_run === 2 && d.is_completed), 
                      isEditing: prev[2]?.isEditing || false 
                  }
              }));
          }
      } catch (error) { console.error("Fetch Data Error:", error); } finally { 
          if (!isSilent) setLoading(false); else setIsBackgroundSyncing(false);
      }
  }, [user, authUserName, supabase]);

  useEffect(() => {
      if (!user) return;
      fetchDeliveryData(false);

      let timeoutId: NodeJS.Timeout;

      const handleRealtimeUpdate = () => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
              fetchDeliveryData(true);
          }, 300);
      };

      const channel = supabase.channel('realtime-driver-page-data')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, handleRealtimeUpdate)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_memos' }, handleRealtimeUpdate)
          .subscribe();

      return () => { 
          clearTimeout(timeoutId);
          supabase.removeChannel(channel); 
      };
  }, [user, fetchDeliveryData, supabase]);

  const handleOpenItemMemo = async (invoiceTo: string) => {
      if (!user) return;
      
      const today = getMelbourneDate();
      const { data } = await supabase
          .from('delivery_memos')
          .select('content')
          .eq('driver_id', user.id)
          .eq('memo_date', today)
          .maybeSingle();
          
      const latestMemo = data?.content || "";
      setDailyMemo(latestMemo);
      
      const newText = latestMemo.includes(`[${invoiceTo}]`) 
          ? latestMemo 
          : (latestMemo.trim() ? `${latestMemo}\n\n[${invoiceTo}] ` : `[${invoiceTo}] `);
          
      setMemoText(newText);
      setIsMemoModalOpen(true);
  };

  const handleOpenItems = async (invoiceId: string, invoiceTo: string) => {
      setSelectedInvoiceForItems({ id: invoiceId, name: invoiceTo });
      setInvoiceItems([]);
      setIsItemsModalOpen(true);
      setIsItemsLoading(true);

      try {
          const { data, error } = await supabase
              .from('invoice_items')
              .select('*')
              .eq('invoice_id', invoiceId);
              
          if (data && !error) {
              setInvoiceItems(data);
          }
      } catch (error) {
          console.error("Failed to load items", error);
      } finally {
          setIsItemsLoading(false);
      }
  };

  const getPointLocation = useCallback((type: string, customText: string) => {
      const drvLoc = dbProfile?.lat && dbProfile?.lng ? { lat: dbProfile.lat, lng: dbProfile.lng } : null;
      if (type === 'company') return companyLocation ? { lat: companyLocation.lat, lng: companyLocation.lng } : companyLocation?.address;
      if (type === 'home') return drvLoc ? drvLoc : getSafeHomeAddress();
      return customText;
  }, [companyLocation, dbProfile, getSafeHomeAddress]);

  const drawMapRoute = useCallback(() => {
      if (!isLoaded || !window.google || currentList.length === 0) {
          setDirectionsResponse(null);
          return;
      }
      
      const validItems = currentList.filter(item => (item.lat && item.lng) || (item.delivery_address && item.delivery_address.trim().length > 0));
      if (validItems.length === 0) {
          setDirectionsResponse(null);
          return;
      }

      setIsMapDrawing(true);
      const startLoc = getPointLocation(startDestType, customStart);
      const finalLoc = getPointLocation(finalDestType, customFinal);
      const waypoints = validItems.map(item => ({ location: (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : item.delivery_address, stopover: true }));
      
      const ds = new window.google.maps.DirectionsService();
      ds.route({
          origin: startLoc || DEFAULT_CENTER, 
          destination: finalLoc || DEFAULT_CENTER,
          waypoints: waypoints, 
          optimizeWaypoints: false, 
          avoidTolls: true, 
          travelMode: window.google.maps.TravelMode.DRIVING
      }, (result: any, status: any) => {
          if (status === 'OK') setDirectionsResponse(result);
          setIsMapDrawing(false);
      });
  }, [isLoaded, currentList, startDestType, finalDestType, customStart, customFinal, getPointLocation]);

  useEffect(() => {
      if (activeTab === 'map' && isLoaded) {
          const currentHash = JSON.stringify(currentList.map(d => d.id + d.is_completed + d.lat + d.lng)) + startDestType + finalDestType + customStart + customFinal;
          if (currentHash !== lastDrawnHash.current) { drawMapRoute(); lastDrawnHash.current = currentHash; }
      }
  }, [activeTab, isLoaded, currentList, startDestType, finalDestType, customStart, customFinal, drawMapRoute]);

  const handleAutoRoute = async () => {
      const validItems = currentList.filter(item => (item.lat && item.lng) || (item.delivery_address && item.delivery_address.trim().length > 0));
      const invalidItems = currentList.filter(item => !((item.lat && item.lng) || (item.delivery_address && item.delivery_address.trim().length > 0)));

      if (validItems.length < 2) return alert("최소 2개의 유효한 배송지가 필요합니다.");
      
      setIsAutoRouting(true);
      const startLoc = getPointLocation(startDestType, customStart);
      const finalLoc = getPointLocation(finalDestType, customFinal);
      const waypoints = validItems.map(item => ({ location: (item.lat && item.lng) ? { lat: item.lat, lng: item.lng } : item.delivery_address, stopover: true }));
      
      const ds = new window.google.maps.DirectionsService();
      ds.route({ 
          origin: startLoc, 
          destination: finalLoc, 
          waypoints, 
          optimizeWaypoints: true, 
          avoidTolls: true, 
          travelMode: window.google.maps.TravelMode.DRIVING 
      }, (res: any, status: any) => {
          if (status === 'OK') {
              const optimizedList = res.routes[0].waypoint_order.map((i: number) => validItems[i]);
              const merged = [...deliveries.filter(d => (d.delivery_run === 0 ? 1 : d.delivery_run) !== activeRun), ...optimizedList, ...invalidItems];
              setDeliveries(merged); updateRunState(activeRun, { isEditing: true });
          }
          setIsAutoRouting(false);
      });
  };

  const handleUpdateLocation = async (invoiceId: string, customerId: string) => {
      if (!navigator.geolocation) return alert("Geolocation not supported.");
      if (!confirm("Save current GPS as delivery spot?")) return;
      setUpdatingLocationId(invoiceId); 
      navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          try {
              await supabase.from('customers').update({ delivery_lat: latitude, delivery_lng: longitude }).eq('id', customerId);
              setDeliveries(prev => prev.map(d => d.id === invoiceId ? { ...d, lat: latitude, lng: longitude } : d));
          } catch (e) {} finally { setUpdatingLocationId(null); }
      }, () => setUpdatingLocationId(null), { enableHighAccuracy: true });
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
        await supabase.from('invoices').upsert(upsertData, { onConflict: 'id' });
        updateRunState(activeRun, { isEditing: false, isStarted: false }); 
        setOriginalDeliveries(deliveries);
    } finally { setIsSavingOrder(false); }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile || !targetId) return;

    const currentTargetId = targetId;
    const currentFile = selectedFile;
    const customerName = deliveries.find(d => d.id === currentTargetId)?.invoice_to || "Unknown";

    setDeliveries(prev => prev.map(d => d.id === currentTargetId ? { ...d, is_completed: true } : d));
    setPreviewUrl(null);
    setSelectedFile(null);
    setTargetId(null);

    setIsUploading(true);
    
    try {
        const compressedFile = await imageCompression(currentFile, { 
            maxSizeMB: 0.7, 
            maxWidthOrHeight: 1280, 
            useWebWorker: true, 
            initialQuality: 0.6 
        });

        const fileName = `${currentTargetId}_${Date.now()}.jpg`;
        
        const { error: uploadError } = await supabase.storage
            .from('delivery-proofs')
            .upload(fileName, compressedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('delivery-proofs').getPublicUrl(fileName);

        const { error: dbError } = await supabase
            .from('invoices')
            .update({ is_completed: true, proof_url: publicUrl })
            .eq('id', currentTargetId);

        if (dbError) throw dbError;

        console.log(`Success: ${customerName}`);

    } catch (error: any) {
        console.error("Background task failed:", error);
        alert(`⚠️ Upload Failed for [${customerName}].\nPlease check internet.`);
        setDeliveries(prev => prev.map(d => d.id === currentTargetId ? { ...d, is_completed: false } : d));
    } finally {
        setIsUploading(false);
    }
  };

  const handleSaveMemo = async () => {
    if (!user) return;
    setIsSavingMemo(true);
    try {
        const today = getMelbourneDate();
        const { data: existing } = await supabase.from('delivery_memos').select('id').eq('driver_id', user.id).eq('memo_date', today).maybeSingle();
        if (existing) await supabase.from('delivery_memos').update({ content: memoText }).eq('id', existing.id);
        else await supabase.from('delivery_memos').insert({ driver_id: user.id, memo_date: today, content: memoText });
        setDailyMemo(memoText); setIsMemoModalOpen(false);
    } catch (error: any) { alert("Failed to save memo"); } finally { setIsSavingMemo(false); }
  };

  let listOrderCounter = 1;
  const listWithLabels = currentList.map((item) => {
      const isZeroOrder = item.delivery_order === 0;
      const displayNumber = isEditing 
          ? (isZeroOrder ? "!" : String(item.delivery_order)) 
          : (isZeroOrder ? "!" : String(listOrderCounter++));
      return { ...item, displayNumber, isZeroOrder };
  });

  const mapRoutableItems = listWithLabels.filter(item => (item.lat && item.lng) || (item.delivery_address && item.delivery_address.trim().length > 0));

  return (
    <>
      <style>{`.gm-ui-hover-effect { display: none !important; }`}</style>
      <div className="w-full h-full flex justify-center bg-slate-200">
        <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden shadow-2xl">
          
          <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} className="hidden" onChange={handleFileChange} />
          <input type="file" accept="image/*" ref={galleryInputRef} className="hidden" onChange={handleFileChange} />
          
          {previewUrl && (
            <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-200 h-[100dvh]">
                <div className="shrink-0 flex justify-between items-center p-4 text-white">
                    <h3 className="font-bold text-lg">Proof of Delivery</h3>
                    <button onClick={() => setPreviewUrl(null)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4 relative">
                    <img src={previewUrl} alt="Proof" className="w-full h-full object-contain drop-shadow-2xl" />
                </div>
                <div className="shrink-0 p-4 bg-slate-900 pb-safe sm:pb-8">
                    <button 
                        onClick={handleConfirmUpload} 
                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-lg shadow-lg"
                    >
                        <Check className="w-6 h-6" /> Complete & Return
                    </button>
                </div>
            </div>
          )}

          <div className="shrink-0 bg-white z-20 border-b border-slate-100 shadow-sm relative">
            <div className="flex items-center justify-between p-4 pb-2 max-w-4xl mx-auto w-full">
                <div className="flex items-center gap-2">
                    <h1 className="font-extrabold text-xl text-slate-900 truncate max-w-[200px]">{currentUserName}</h1>
                    {(isBackgroundSyncing || isUploading) && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
                </div>
            </div>
            <div className="px-4 pb-3 flex gap-2 max-w-4xl mx-auto w-full">
                {[1, 2].map(run => (
                    <button key={run} onClick={() => setActiveRun(run)} className={cn("flex-1 py-2.5 rounded-xl text-sm font-bold transition-all", activeRun === run ? "bg-slate-900 text-white shadow-md" : "bg-slate-100 text-slate-400 hover:bg-slate-200")}>{run === 1 ? "1st Run" : "2nd Run"}</button>
                ))}
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50">
              <div className={cn("absolute inset-0 flex flex-col overflow-hidden bg-slate-50 transition-opacity duration-200", activeTab === 'list' ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none")}>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
                      <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-3 max-w-4xl mx-auto w-full">
                              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-1 shadow-sm cursor-pointer hover:bg-slate-50" onClick={() => { setModalTarget('start'); setIsDestModalOpen(true); }}><div className="flex items-center gap-2"><Flag className="w-3 h-3 text-blue-600" /><span className="text-[10px] font-bold text-slate-400 uppercase">Start</span></div><div className="text-xs font-bold text-slate-700 truncate">{startDestType === 'company' ? 'Company' : startDestType === 'home' ? 'Home' : 'Custom'}</div></div>
                              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-col gap-1 shadow-sm cursor-pointer hover:bg-slate-50" onClick={() => { setModalTarget('final'); setIsDestModalOpen(true); }}><div className="flex items-center gap-2"><Home className="w-3 h-3 text-emerald-600" /><span className="text-[10px] font-bold text-slate-400 uppercase">Final</span></div><div className="text-xs font-bold text-slate-700 truncate">{finalDestType === 'company' ? 'Company' : finalDestType === 'home' ? 'Home' : 'Custom'}</div></div>
                          </div>
                      </div>
                      <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 max-w-4xl mx-auto w-full">
                          <div className="flex items-center gap-2">
                              {isEditing ? <Button variant="outline" size="sm" onClick={handleAutoRoute} disabled={isAutoRouting} className="bg-white text-blue-600 border-blue-200 text-xs font-bold h-9">{isAutoRouting ? <Loader2 className="animate-spin w-3.5 h-3.5 mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Auto Route</Button> : <Button variant="outline" size="sm" onClick={() => updateRunState(activeRun, { isEditing: true })} className="bg-white text-slate-600 border-slate-200 text-xs font-bold h-9 shadow-sm"><Unlock className="w-3.5 h-3.5 mr-1.5" /> Edit Order</Button>}
                          </div>
                          <div className="flex gap-2">
                              {isEditing ? <><Button size="sm" onClick={() => { setDeliveries(originalDeliveries); updateRunState(activeRun, { isEditing: false }); }} variant="ghost" className="h-9 text-xs">Cancel</Button><Button size="sm" onClick={handleSaveOrder} disabled={isSavingOrder} className="bg-blue-600 text-white h-9 font-bold px-4 shadow-md">{isSavingOrder ? <Loader2 className="animate-spin" /> : <><Save className="w-4 h-4 mr-1"/> Save</>}</Button></> : !isStarted && <Button size="sm" onClick={() => updateRunState(activeRun, { isStarted: true })} className="bg-slate-900 text-white h-9 font-bold px-6 shadow-lg"><Play className="w-4 h-4 mr-1.5 fill-current" /> Start Delivery</Button>}
                          </div>
                      </div>
                      <div className="px-4 space-y-3 mt-2 max-w-4xl mx-auto w-full">
                          {loading ? <div className="p-10 text-center text-slate-400">Loading...</div> : (
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                  <SortableContext items={listWithLabels.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                      {listWithLabels.map((item, index) => {
                                          return <SortableItem 
                                            key={item.id} 
                                            id={item.id} 
                                            item={item} 
                                            index={index} 
                                            isActive={isStarted && !item.is_completed && activeItem?.id === item.id} 
                                            isDone={item.is_completed} 
                                            isEditing={isEditing} 
                                            dailyMemo={dailyMemo} 
                                            isUpdatingLocation={updatingLocationId === item.id} 
                                            displayNumber={item.displayNumber} 
                                            isNewItem={item.isZeroOrder} 
                                            onComplete={() => { 
                                                setTargetId(item.id); 
                                                setIsPhotoOptionModalOpen(true); 
                                            }} 
                                            onNavigate={() => {
                                                window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.delivery_address)}`;
                                            }} 
                                            onCall={() => item.phone && (window.location.href = `tel:${item.phone}`)} 
                                            onMemo={() => handleOpenItemMemo(item.invoice_to)} 
                                            onOpenItems={() => handleOpenItems(item.id, item.invoice_to)}
                                            onUpdateLocation={() => handleUpdateLocation(item.id, item.customer_id)} 
                                          />;
                                      })}
                                  </SortableContext>
                              </DndContext>
                          )}
                      </div>
                  </div>
              </div>

              {/* 🗺️ MAP VIEW */}
              <div className={cn("absolute inset-0 bg-slate-100 z-0 transition-opacity duration-200", activeTab === 'map' ? "opacity-100 z-10" : "opacity-0 pointer-events-none")}>
                  {isMapDrawing && <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm"><Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-3" /><div className="font-bold text-slate-700">Updating Route...</div></div>}
                  {directionsResponse ? (
                      <GoogleMap center={DEFAULT_CENTER} zoom={11} mapContainerStyle={MAP_CONTAINER_STYLE} options={MAP_OPTIONS} onClick={() => setActiveMarkerId(null)}>
                          <TrafficLayer />
                          <DirectionsRenderer directions={directionsResponse} options={DIR_OPTIONS} />
                          
                          {/* 🚀 시작점(S) 마커 수정: 빨간 물방울 */}
                          {directionsResponse.routes?.[0]?.legs?.[0]?.start_location && (
                              <Marker 
                                  position={directionsResponse.routes[0].legs[0].start_location} 
                                  label={{ text: "S", color: "white", fontWeight: "bold", fontSize: "13px" }} 
                                  icon={{ 
                                      path: PIN_SVG_PATH, 
                                      fillColor: "#ef4444", 
                                      fillOpacity: 1, 
                                      strokeWeight: 1.5, 
                                      strokeColor: "#991b1b", 
                                      scale: 2, 
                                      anchor: new window.google.maps.Point(12, 24), 
                                      labelOrigin: new window.google.maps.Point(12, 10) 
                                  }} 
                              />
                          )}
                          
                          {/* 경유지 배송 마커들 */}
                          {directionsResponse.routes?.[0]?.legs && mapRoutableItems.map((inv, idx: number) => {
                              const leg = directionsResponse.routes[0].legs[idx];
                              if (!leg) return null;

                              return (
                                  <Marker 
                                    key={inv.id} 
                                    position={leg.end_location} 
                                    label={{ 
                                        text: String(inv.displayNumber), 
                                        color: 'white', 
                                        fontWeight: 'bold',
                                        fontSize: '13px'
                                    }}
                                    icon={{
                                        path: PIN_SVG_PATH,
                                        fillColor: inv.isZeroOrder ? "#ef4444" : "#e11d48", 
                                        fillOpacity: 1,
                                        strokeWeight: 1.5,
                                        strokeColor: "#991b1b",
                                        scale: 2,
                                        anchor: new window.google.maps.Point(12, 24),
                                        labelOrigin: new window.google.maps.Point(12, 10)
                                    }}
                                    opacity={inv.is_completed ? 0.4 : 1.0} 
                                    onClick={() => setActiveMarkerId(inv.id)}
                                  >
                                      {activeMarkerId === inv.id && (
                                          <InfoWindow 
                                            position={leg.end_location} 
                                            onCloseClick={() => setActiveMarkerId(null)} 
                                            options={{ disableAutoPan: true, pixelOffset: new window.google.maps.Size(0, -30) }}
                                          >
                                              <div style={{ padding: '4px 8px', fontFamily: 'sans-serif', maxWidth: '200px' }}>
                                                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>{inv.invoice_to}</div>
                                              </div>
                                          </InfoWindow>
                                      )}
                                  </Marker>
                              );
                          })}
                          
                          {/* 🚀 도착점(F) 마커 수정: 빨간 물방울 */}
                          {directionsResponse.routes?.[0]?.legs && directionsResponse.routes[0].legs.length > 0 && (
                              <Marker 
                                  position={directionsResponse.routes[0].legs[directionsResponse.routes[0].legs.length - 1].end_location} 
                                  label={{ text: "F", color: "white", fontWeight: "bold", fontSize: "13px" }} 
                                  icon={{ 
                                      path: PIN_SVG_PATH, 
                                      fillColor: "#ef4444", 
                                      fillOpacity: 1, 
                                      strokeWeight: 1.5, 
                                      strokeColor: "#991b1b", 
                                      scale: 2, 
                                      anchor: new window.google.maps.Point(12, 24), 
                                      labelOrigin: new window.google.maps.Point(12, 10) 
                                  }} 
                              />
                          )}
                      </GoogleMap>
                  ) : <div className="flex flex-col items-center justify-center h-full text-slate-400"><MapIcon className="w-10 h-10 mb-2 opacity-20" /><span className="text-sm font-medium">No map data.</span></div>}
              </div>
          </div>

          <div className="shrink-0 h-[68px] w-full bg-white border-t border-slate-200 flex items-center justify-around px-4 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] pb-safe max-w-4xl mx-auto">
              <button onClick={() => setActiveTab('list')} className={cn("flex flex-col items-center justify-center w-full h-full gap-1 transition-colors", activeTab === 'list' ? "text-slate-900" : "text-slate-400")}><div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'list' && "bg-slate-100")}><ListOrdered className="w-6 h-6" /></div><span className="text-[10px] font-bold">Deliveries</span></button>
              <button onClick={() => setActiveTab('map')} className={cn("flex flex-col items-center justify-center w-full h-full gap-1 transition-colors", activeTab === 'map' ? "text-blue-600" : "text-slate-400")}><div className={cn("p-1.5 rounded-xl transition-all", activeTab === 'map' && "bg-blue-50")}><MapIcon className="w-6 h-6" /></div><span className="text-[10px] font-bold">Route Map</span></button>
          </div>
        </div>
      </div>

      <Dialog open={isPhotoOptionModalOpen} onOpenChange={setIsPhotoOptionModalOpen}>
          <DialogContent className="w-[90%] rounded-3xl max-w-sm p-6 bg-white border-slate-100 shadow-2xl">
              <DialogHeader className="mb-2">
                  <DialogTitle className="text-center text-xl font-black text-slate-800">Proof of Delivery</DialogTitle>
                  <DialogDescription className="text-center text-slate-500">How would you like to attach the photo?</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 mt-4">
                  <Button className="h-16 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[16px] rounded-2xl flex items-center justify-center gap-3 shadow-lg" onClick={() => { setIsPhotoOptionModalOpen(false); cameraInputRef.current?.click(); }}>
                      <Camera className="w-6 h-6 text-emerald-400" /> Take a Photo
                  </Button>
                  <Button variant="outline" className="h-16 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[16px] rounded-2xl flex items-center justify-center gap-3 shadow-sm" onClick={() => { setIsPhotoOptionModalOpen(false); galleryInputRef.current?.click(); }}>
                      <ImageIcon className="w-6 h-6 text-blue-500" /> Choose from Gallery
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={isMemoModalOpen} onOpenChange={setIsMemoModalOpen}>
        <DialogContent className="!max-w-[100vw] !w-screen !h-[100dvh] !max-h-[100dvh] !m-0 !p-0 !rounded-none !border-none bg-slate-50 flex flex-col sm:!max-w-[100vw] sm:!rounded-none sm:!p-0 [&>button]:hidden z-[100]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="p-4 bg-white border-b border-slate-200 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-xl font-black text-slate-800 m-0">Daily Log</DialogTitle>
            <DialogDescription className="hidden">Edit delivery memo</DialogDescription>
            <button onClick={() => setIsMemoModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-5 h-5" /></button>
          </DialogHeader>
          <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative">
            <div className="flex-1 relative flex flex-col min-h-0">
              {isSavingMemo && (<div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-xl"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>)}
              <Textarea ref={textareaRef} value={memoText} onChange={(e) => setMemoText(e.target.value)} autoFocus onFocus={(e) => { const val = e.currentTarget.value; e.currentTarget.value = ""; e.currentTarget.value = val; e.currentTarget.scrollTop = e.currentTarget.scrollHeight; }} className="flex-1 w-full h-full p-4 resize-none text-[15px] leading-relaxed border-slate-200 shadow-sm rounded-xl bg-white focus-visible:ring-2 focus-visible:ring-blue-500" placeholder="Enter notes..." />
            </div>
          </div>
          <div className="p-4 bg-white border-t border-slate-200 shrink-0 pb-safe">
            <Button className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg" onClick={handleSaveMemo} disabled={isSavingMemo}>{isSavingMemo ? <Loader2 className="animate-spin w-6 h-6" /> : "Save Notes"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isItemsModalOpen} onOpenChange={setIsItemsModalOpen}>
          <DialogContent className="!max-w-[100vw] !w-screen !h-[100dvh] !max-h-[100dvh] !m-0 !p-0 !rounded-none !border-none bg-slate-50 flex flex-col sm:!max-w-[100vw] sm:!rounded-none sm:!p-0 [&>button]:hidden z-[100]">
              <DialogHeader className="p-4 bg-white border-b border-slate-200 shrink-0 flex flex-row items-start justify-between">
                  <div className="flex flex-col items-start text-left">
                      <DialogTitle className="text-xl font-black text-slate-800 m-0 leading-tight">Delivery Items</DialogTitle>
                      <span className="text-sm font-medium text-blue-600 mt-1">{selectedInvoiceForItems?.name}</span>
                  </div>
                  <DialogDescription className="hidden">View items</DialogDescription>
                  <button onClick={() => setIsItemsModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-5 h-5" /></button>
              </DialogHeader>
              <div className="flex-1 p-4 overflow-y-auto relative pb-safe">
                  {isItemsLoading ? (<div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-600" /></div>) : invoiceItems.length > 0 ? (
                      <div className="space-y-3">
                          {invoiceItems.map((item, idx: number) => {
                              const itemName = item.item_name || item.product_name || item.description || `Item #${idx + 1}`;
                              const itemQty = item.quantity || item.qty || 1;
                              return (
                                  <div key={item.id || idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-3"><div className="bg-blue-50 p-2 rounded-lg text-blue-600 shrink-0"><Package className="w-5 h-5" /></div><span className="font-bold text-slate-700 text-[15px]">{itemName}</span></div>
                                      <div className="shrink-0 bg-slate-100 px-3 py-1.5 rounded-lg"><span className="font-black text-slate-800">x {itemQty}</span></div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : (<div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3"><Package className="w-16 h-16 opacity-20" /><p className="font-medium">No items found.</p></div>)}
              </div>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isDestModalOpen} onOpenChange={setIsDestModalOpen}>
          <DialogContent className="w-[90%] rounded-2xl max-w-md">
              <DialogHeader><DialogTitle>Set Point</DialogTitle><DialogDescription className="hidden">Map Point</DialogDescription></DialogHeader>
              <div className="space-y-3 py-4">
                  <button onClick={() => handleSetPoint('company')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border rounded-xl"><Building2 className="w-5 h-5 text-blue-600" /><div className="text-left font-bold text-sm">Company Depot</div></button>
                  <button onClick={() => handleSetPoint('home')} className="w-full flex items-center gap-3 p-4 bg-slate-50 border rounded-xl"><Home className="w-5 h-5 text-emerald-600" /><div className="text-left font-bold text-sm">Home Address</div></button>
                  <div className="p-4 bg-white border rounded-xl space-y-2">
                      <div className="flex items-center gap-2 font-bold text-sm"><MousePointerClick className="w-4 h-4" /> Custom</div>
                      <Input value={modalTarget === 'start' ? customStart : customFinal} onChange={e => modalTarget === 'start' ? setCustomStart(e.target.value) : setCustomFinal(e.target.value)} placeholder="Address" className="h-9 text-xs" />
                      <Button size="sm" className="w-full bg-slate-900 h-8 text-xs font-bold" onClick={() => handleSetPoint('custom')}>Apply</Button>
                  </div>
              </div>
          </DialogContent>
      </Dialog>
    </>
  );
}

function SortableItem({ id, item, index, isActive, isDone, isEditing, dailyMemo, isUpdatingLocation, displayNumber, isNewItem, onComplete, onNavigate, onCall, onMemo, onOpenItems, onUpdateLocation }: any) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const hasMemo = dailyMemo && dailyMemo.includes(`[${item.invoice_to}]`);

    if (isDone) return ( 
        <div ref={setNodeRef} style={style} className="bg-slate-50 border p-4 rounded-xl opacity-60 flex items-center justify-between">
            <div className="flex items-center gap-3 grayscale"><div className="bg-slate-200 p-1.5 rounded-full"><Check className="w-4 h-4 text-slate-500" /></div><span className="text-slate-500 font-medium line-through text-sm">{isNewItem ? "! " : ""}{item.invoice_to}</span></div>
            <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={onOpenItems} className="h-8 w-8 text-slate-400 p-0 hover:bg-slate-200"><Package className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={onMemo} className="h-8 w-8 text-slate-400 p-0 hover:bg-slate-200"><MessageSquareText className={cn("w-4 h-4", hasMemo && "text-blue-500 fill-blue-100")} /></Button>
            </div>
        </div> 
    );

    if (isActive && !isEditing) return (
        <div ref={setNodeRef} style={style} className={cn("bg-white border-2 shadow-xl p-5 rounded-2xl transform scale-[1.02] relative animate-in zoom-in-95 duration-300", isNewItem ? "border-rose-500" : "border-blue-600")}>
            <div className={cn("absolute top-0 left-0 text-white text-[10px] font-bold px-3 py-1 rounded-br-xl uppercase", isNewItem ? "bg-rose-500" : "bg-blue-600")}>Current</div>
            <div className="mt-4 flex items-center justify-between"><h3 className="text-2xl font-black"><span className={isNewItem ? "text-rose-500 mr-1" : ""}>{displayNumber}{isNewItem ? "" : ". "}</span>{item.invoice_to}</h3><div className="flex items-center gap-2"><Button size="icon" variant="ghost" onClick={onOpenItems} className="h-10 w-10 rounded-full text-slate-400 hover:bg-slate-100"><Package className="w-5 h-5" /></Button><Button size="icon" variant="ghost" onClick={onMemo} className={cn("h-10 w-10 rounded-full", hasMemo ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-100")}><MessageSquareText className={cn("w-5 h-5", hasMemo && "fill-blue-200")} /></Button></div></div>
            <p className="text-slate-600 text-sm mt-1 leading-tight"><span className="font-semibold text-slate-800">CONTACT: </span><span className="font-normal">{item.contact_name || ""}</span><span className="mx-1.5 text-slate-300">|</span><span>{item.delivery_address}</span></p>
            <div className="mt-5 grid grid-cols-6 gap-2"><Button onClick={onCall} variant="outline" className="col-span-1 h-14 border-slate-200 p-0"><Phone className="w-6 h-6 text-slate-600"/></Button><Button onClick={onUpdateLocation} disabled={isUpdatingLocation} variant="outline" className="col-span-1 h-14 border-emerald-200 bg-emerald-50 p-0"><MapPin className="w-6 h-6 text-emerald-600"/></Button><Button onClick={onNavigate} className="col-span-2 h-14 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 border-none shadow-none"><Navigation className="w-5 h-5 mr-1" /> Map</Button><Button onClick={onComplete} className="col-span-2 h-14 bg-slate-900 text-white font-bold hover:bg-slate-800 shadow-lg"><Camera className="w-5 h-5 mr-1" /> Done</Button></div>
        </div>
    );

    return (
        <div ref={setNodeRef} style={style} className={cn("bg-white p-4 rounded-xl border flex items-center justify-between shadow-sm transition-all", isEditing ? "border-blue-200 ring-2 ring-blue-50" : (isNewItem ? "border-rose-200 shadow-rose-100/50" : "opacity-70 border-slate-100"))}>
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors", isNewItem ? (isEditing ? "bg-rose-100 text-rose-600" : "bg-rose-500 text-white animate-pulse") : (isEditing ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400"))}>{displayNumber}</div>
                <div className="overflow-hidden pr-2 flex-1">
                    <div className="font-bold text-slate-800 text-sm truncate">{item.invoice_to}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5"><span className="font-semibold text-slate-500">CONTACT: </span><span className="font-normal text-slate-500">{item.contact_name || ""}</span><span className="mx-1.5 text-slate-300">|</span><span>{item.delivery_address}</span></div>
                </div>
            </div>
            <div className="flex items-center gap-1">
                {!isEditing && <Button size="icon" variant="ghost" onClick={onOpenItems} className="h-8 w-8 text-slate-400 p-0 hover:bg-slate-100"><Package className="w-4 h-4" /></Button>}
                {!isEditing && <Button size="icon" variant="ghost" onClick={onMemo} className="h-8 w-8 text-slate-400 p-0 hover:bg-slate-100"><MessageSquareText className={cn("w-4 h-4", hasMemo && "text-blue-500 fill-blue-100")} /></Button>}
                {isEditing ? <div {...attributes} {...listeners} className="p-2 touch-none cursor-grab active:cursor-grabbing"><ArrowUpDown className="w-5 h-5 text-blue-400" /></div> : null}
            </div>
        </div>
    );
}