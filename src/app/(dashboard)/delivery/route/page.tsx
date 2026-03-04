"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import Script from "next/script"; 
import { 
  Calendar as CalendarIcon, Truck, Map as MapIcon, Navigation, 
  MapPin, CheckCircle2, User, Loader2, MapPin as WarehouseIcon, Radio,
  Box, X, Circle, FileText, Sparkles, Building2, Home, MousePointerClick, Save, RotateCcw, Edit2, Check, GripVertical, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Pdf Download / Print Import
import { printBulkPdf } from "@/utils/downloadPdf";

// DnD Kit Imports
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

// --- Types ---
interface Invoice {
  id: string;
  invoice_to: string;
  invoice_date: string;
  delivery_order: number;
  delivery_run: number;
  driver_id: string;
  is_completed: boolean;
  memo: string | null; 
  customers: {
    name: string;
    suburb: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    delivery_address: string | null;
    delivery_lat: number | null;
    delivery_lng: number | null;
  };
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  products?: {
    vendor_product_id: string | null;
  } | null;
}

interface DriverRouteInfo {
    driverId: string;
    driverName: string;
    run: number; 
    count: number;
    completedCount: number;
}

// 위치 정보 타입
interface LocationData {
    address: string;
    lat: number | null;
    lng: number | null;
    route_prefs?: any; 
}

const DEFAULT_LOCATION = { lat: -37.8197, lng: 145.1238 }; 

const getMelbourneDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: "Australia/Melbourne", year: 'numeric', month: '2-digit', day: '2-digit' 
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options); 
  return formatter.format(now);
};

export default function DeliveryRoutePage() {
  const supabase = createClient();
  const [isMounted, setIsMounted] = useState(false);

  // State
  const [selectedDate, setSelectedDate] = useState(getMelbourneDate());
  const [routeList, setRouteList] = useState<DriverRouteInfo[]>([]);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [originalInvoices, setOriginalInvoices] = useState<Invoice[]>([]); 
  const [loading, setLoading] = useState(false);

  // 회사 정보 및 기사 위치 캐싱 데이터
  const [companyLoc, setCompanyLoc] = useState<LocationData | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, LocationData>>({});

  const currentDriverId = selectedRouteKey ? selectedRouteKey.split('_')[0] : null;
  const driverLoc = currentDriverId ? driverLocations[currentDriverId] : null;

  // 출발지(Start)와 도착지(Final) 상태 분리 및 기본값 설정
  const [startDestType, setStartDestType] = useState<'company' | 'home' | 'custom'>('company');
  const [finalDestType, setFinalDestType] = useState<'company' | 'home' | 'custom'>('home');
  
  // Custom Address States
  const [customStart, setCustomStart] = useState("");
  const [isCustomStartSet, setIsCustomStartSet] = useState(false); 
  const [customFinal, setCustomFinal] = useState("");
  const [isCustomFinalSet, setIsCustomFinalSet] = useState(false); 
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRouteChanged, setIsRouteChanged] = useState(false);
  const [printingRouteKey, setPrintingRouteKey] = useState<string | null>(null);

  // Map
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [warehouseLocation, setWarehouseLocation] = useState(DEFAULT_LOCATION);
  const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Detail Dialog State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // ✅ [NEW] 실시간 통신 폭주 방지를 위한 디바운스 타이머 참조
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { 
      setIsMounted(true); 
      if (window.google && window.google.maps) setIsGoogleLoaded(true);
      fetchCompanySettings();
  }, []);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => setWarehouseLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => console.warn("Location access denied, using default.")
      );
    }
  }, []);

  const fetchCompanySettings = async () => {
      const { data } = await supabase.from('company_settings').select('address_line1, address_line2, suburb, state, postcode, lat, lng').maybeSingle();
      if (data) {
          const parts = [data.address_line1, data.address_line2, data.suburb, data.state, data.postcode].filter(p => p && p.trim() !== "");
          setCompanyLoc({ address: parts.join(", "), lat: data.lat, lng: data.lng });
      }
  };

  const fetchRoutes = async () => {
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from("invoices")
            .select(`driver_id, delivery_run, is_completed, profiles:driver_id ( display_name, address, lat, lng, route_prefs )`)
            .eq("invoice_date", selectedDate)
            .neq("status", "Paid")
            .is("is_pickup", false) 
            .not("driver_id", "is", null);

        if (error) throw error;

        const groups: Record<string, DriverRouteInfo> = {};
        const locMap: Record<string, LocationData> = {}; 

        data?.forEach((item: any) => {
            const dId = item.driver_id;
            const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
            const dName = profile?.display_name || "Unknown";
            
            if (!locMap[dId]) {
                locMap[dId] = {
                    address: profile?.address || "",
                    lat: profile?.lat || null,
                    lng: profile?.lng || null,
                    route_prefs: profile?.route_prefs || null
                };
            }

            const run = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
            const key = `${dId}_${run}`;
            if (!groups[key]) groups[key] = { driverId: dId, driverName: dName, run: run, count: 0, completedCount: 0 };
            groups[key].count += 1;
            if (item.is_completed) groups[key].completedCount += 1;
        });

        setDriverLocations(locMap);

        const sortedRoutes = Object.values(groups).sort((a, b) => {
            const nameCompare = a.driverName.localeCompare(b.driverName);
            if (nameCompare !== 0) return nameCompare;
            return a.run - b.run;
        });

        setRouteList(sortedRoutes);
        if (sortedRoutes.length > 0) {
            if (!selectedRouteKey || !groups[selectedRouteKey]) setSelectedRouteKey(`${sortedRoutes[0].driverId}_${sortedRoutes[0].run}`);
        } else {
            setSelectedRouteKey(null);
            setInvoices([]);
        }
    } catch (e) { console.error("Fetch Routes Error:", e); } finally { setLoading(false); }
  };

  const fetchInvoices = async () => {
      if (!selectedRouteKey) return;
      const [driverId, runStr] = selectedRouteKey.split('_');
      const run = parseInt(runStr);

      setLoading(true);
      setIsRouteChanged(false); 
      const { data, error } = await supabase
        .from("invoices")
        .select(`
            id, invoice_to, invoice_date, delivery_order, delivery_run, driver_id, is_completed, memo,
            customers ( name, suburb, address, lat, lng, delivery_address, delivery_lat, delivery_lng )
        `)
        .eq("invoice_date", selectedDate)
        .eq("driver_id", driverId)
        .neq("status", "Paid")
        .is("is_pickup", false) 
        .order("delivery_order", { ascending: true });

      if (data) {
          const filtered = (data as any[]).filter(item => {
              const itemRun = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
              return itemRun === run;
          });
          setInvoices(filtered);
          setOriginalInvoices(filtered); 
      }
      setLoading(false);
  };

  useEffect(() => {
      if (!currentDriverId) return;
      const prefs = driverLocations[currentDriverId]?.route_prefs;

      if (prefs) {
          setStartDestType(prefs.startDestType || 'company');
          setCustomStart(prefs.customStart || '');
          setIsCustomStartSet(prefs.isCustomStartSet || false);
          
          setFinalDestType(prefs.finalDestType || 'home');
          setCustomFinal(prefs.customFinal || '');
          setIsCustomFinalSet(prefs.isCustomFinalSet || false);
      } else {
          setStartDestType('company');
          setCustomStart('');
          setIsCustomStartSet(false);
          setFinalDestType('home');
          setCustomFinal('');
          setIsCustomFinalSet(false);
      }
  }, [currentDriverId, driverLocations]);

  const saveRoutePrefsToDB = async (updates: any) => {
      if (!currentDriverId) return;
      const currentPrefs = {
          startDestType, customStart, isCustomStartSet,
          finalDestType, customFinal, isCustomFinalSet
      };
      const finalPrefs = { ...currentPrefs, ...updates };

      setDriverLocations(prev => ({
          ...prev,
          [currentDriverId]: {
              ...prev[currentDriverId],
              route_prefs: finalPrefs
          }
      }));

      try {
          await supabase.from('profiles').update({ route_prefs: finalPrefs }).eq('id', currentDriverId);
      } catch(e) { console.error("Failed to save DB route prefs", e); }
  };

  const handlePrintRoute = async (e: React.MouseEvent, driverId: string, run: number) => {
    e.stopPropagation(); 
    const routeKey = `${driverId}_${run}`;
    
    if (selectedRouteKey === routeKey && isRouteChanged) {
        if (!confirm("You have unsaved sorting changes. Do you want to print the saved version from the database?")) return;
    }
    setPrintingRouteKey(routeKey);

    try {
        const { data, error } = await supabase
            .from("invoices")
            .select("id, delivery_run")
            .eq("invoice_date", selectedDate)
            .eq("driver_id", driverId)
            .neq("status", "Paid")
            .is("is_pickup", false)
            .order("delivery_order", { ascending: true });

        if (error) throw error;

        if (data) {
            const filtered = data.filter(item => {
                const itemRun = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
                return itemRun === run;
            });
            const invoiceIds = filtered.map(inv => inv.id);
            if (invoiceIds.length === 0) {
                alert("No invoices found to print for this route.");
                setPrintingRouteKey(null);
                return;
            }
            await printBulkPdf(invoiceIds);
        }
    } catch (err: any) {
        alert("Error printing invoices: " + err.message);
    } finally {
        setPrintingRouteKey(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
        setInvoices((items) => {
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over?.id);
            return arrayMove(items, oldIndex, newIndex);
        });
        setIsRouteChanged(true); 
    }
  };

  const resolveLocation = (type: 'company' | 'home' | 'custom', customText: string): { lat: number, lng: number } | string | null => {
      if (type === 'company' && companyLoc) {
          return (companyLoc.lat && companyLoc.lng) ? { lat: companyLoc.lat, lng: companyLoc.lng } : companyLoc.address;
      }
      if (type === 'home' && driverLoc) {
          return (driverLoc.lat && driverLoc.lng) ? { lat: driverLoc.lat, lng: driverLoc.lng } : driverLoc.address;
      }
      if (type === 'custom' && customText) {
          return customText;
      }
      return null;
  };

  const handleOptimizeRoute = () => {
      if (!window.google || !window.google.maps) return alert("Google Maps API not loaded yet.");
      if (invoices.length < 2) return alert("Need at least 2 stops to optimize.");

      const startLocation = resolveLocation(startDestType, customStart);
      const finalLocation = resolveLocation(finalDestType, customFinal);

      if (!startLocation) return alert("Please set a valid Start point.");
      if (!finalLocation) return alert("Please set a valid Final Destination.");

      setIsOptimizing(true);
      const ds = new window.google.maps.DirectionsService();
      
      const waypoints = invoices.map(inv => {
          const c = inv.customers;
          const lat = c.delivery_lat || c.lat;
          const lng = c.delivery_lng || c.lng;
          if (lat && lng) return { location: { lat, lng }, stopover: true };
          const addr = [c.delivery_address || c.address, c.suburb].filter(Boolean).join(", ");
          return addr ? { location: addr, stopover: true } : null;
      }).filter(Boolean);

      ds.route({
          origin: startLocation,
          destination: finalLocation,
          // @ts-ignore
          waypoints: waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          optimizeWaypoints: true 
      }, (res: any, status: any) => {
          setIsOptimizing(false);
          if (status === 'OK' && res.routes[0] && res.routes[0].waypoint_order) {
              const order = res.routes[0].waypoint_order; 
              const sortedInvoices = order.map((index: number) => invoices[index]);
              setInvoices(sortedInvoices);
              setIsRouteChanged(true); 
          } else {
              alert("Route optimization failed: " + status);
          }
      });
  };

  const handleSaveRoute = async () => {
      setIsOptimizing(true); 
      try {
          const updates = invoices.map((inv, index) => ({
              id: inv.id,
              delivery_order: index + 1
          }));
          await Promise.all(updates.map(u => supabase.from('invoices').update({ delivery_order: u.delivery_order }).eq('id', u.id)));
          setOriginalInvoices(invoices); 
          setIsRouteChanged(false); 
          alert("Route order saved successfully!");
      } catch (error: any) {
          alert("Save failed: " + error.message);
      } finally {
          setIsOptimizing(false);
      }
  };

  const handleRevert = () => {
      setInvoices(originalInvoices);
      setIsRouteChanged(false);
  };

  const handleInvoiceClick = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailOpen(true);
    setLoadingItems(true);
    
    const { data, error } = await supabase
      .from('invoice_items')
      .select('id, description, quantity, unit, products(vendor_product_id)')
      .eq('invoice_id', invoice.id);
      
    if (!error && data) {
        const formattedItems = data.map((item: any) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            products: Array.isArray(item.products) ? item.products[0] : item.products
        }));
        setInvoiceItems(formattedItems);
    } else {
        setInvoiceItems([]);
    }
    
    setLoadingItems(false);
  };

  useEffect(() => { fetchRoutes(); }, [selectedDate]);
  useEffect(() => { fetchInvoices(); }, [selectedRouteKey]);

  // ✅ [NEW] 실시간 통신 폭주를 막기 위한 Debounce 적용
  useEffect(() => {
    const channel = supabase.channel('route_view_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `invoice_date=eq.${selectedDate}` }, () => {
            
            // 50번의 알림이 와도, 마지막 알림 이후 0.5초 뒤에 딱 한 번만 데이터를 다시 가져옵니다.
            if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
            
            refreshTimeoutRef.current = setTimeout(() => {
                fetchRoutes();
                if (selectedRouteKey && !isRouteChanged) fetchInvoices(); 
            }, 500); // 500ms 딜레이
        })
        .subscribe();
        
    return () => { 
        supabase.removeChannel(channel); 
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [selectedDate, selectedRouteKey, isRouteChanged]);


  if (!isMounted) return null;

  const currentRouteInfo = routeList.find(r => `${r.driverId}_${r.run}` === selectedRouteKey);

  return (
    <>
    <Script 
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places,geometry&loading=async`}
        strategy="afterInteractive"
        onLoad={() => { setIsGoogleLoaded(true); }}
    />

    <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50/50">
      {/* Top Bar */}
      <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
            <Truck className="w-6 h-6 text-emerald-600" />
            Delivery Route
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 pl-3 border border-slate-200 h-9">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            <input 
              type="date" 
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none h-full w-32 cursor-pointer"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        <div>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsMapOpen(true)}
                disabled={invoices.length === 0}
                className="h-9 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-300 gap-2"
            >
                <MapIcon className="w-4 h-4" /> View Map
            </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">
              Active Routes ({routeList.length})
          </div>
          <div className="flex flex-col p-2 gap-1.5">
            {routeList.length === 0 && !loading && (
                <div className="text-center py-10 text-slate-400 text-xs">No deliveries found.</div>
            )}
            {routeList.map((route) => {
              const key = `${route.driverId}_${route.run}`;
              const isSelected = selectedRouteKey === key;
              const isDone = route.count > 0 && route.count === route.completedCount;
              const isPrinting = printingRouteKey === key;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedRouteKey(key)}
                  className={cn(
                    "flex items-center gap-3 p-3 text-left transition-all rounded-lg border",
                    isSelected 
                        ? "bg-emerald-50/80 border-emerald-200 shadow-sm" 
                        : "bg-white hover:bg-slate-50 border-transparent hover:border-slate-200"
                  )}
                >
                  <div className="relative">
                      <Avatar className="h-9 w-9 border border-white shadow-sm shrink-0">
                        <AvatarFallback className={cn("text-xs font-bold", isSelected ? "bg-emerald-200 text-emerald-800" : "bg-slate-100 text-slate-500")}>
                          {route.driverName.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {route.run === 2 && (
                          <span className="absolute -bottom-1 -right-1 bg-indigo-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white font-bold">2</span>
                      )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 truncate">
                              <span className={cn("font-bold text-sm truncate", isSelected ? "text-emerald-900" : "text-slate-700")}>
                                  {route.driverName}
                              </span>
                              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                          </div>
                          <div 
                              onClick={(e) => handlePrintRoute(e, route.driverId, route.run)}
                              className={cn(
                                  "p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
                                  isPrinting ? "bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                              )}
                              title="Print Route Invoices in Order"
                          >
                              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600"/> : <Printer className="w-3.5 h-3.5" />}
                          </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className={cn("text-[9px] px-1.5 h-4 rounded-sm font-normal", route.run === 2 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500")}>
                              {route.run === 1 ? "1st Run" : "2nd Run"}
                          </Badge>
                          <span className="text-[10px] text-slate-400 font-medium">
                              {route.completedCount} / {route.count} stops
                          </span>
                      </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto">
          {selectedRouteKey && currentRouteInfo ? (
            <div className="max-w-xl mx-auto space-y-4">
              
              {/* Header Info */}
              <div className="flex items-center justify-between">
                 <div>
                     <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                         {currentRouteInfo.driverName}
                         <span className={cn("text-xs px-2 py-0.5 rounded-full border", currentRouteInfo.run === 2 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>
                             {currentRouteInfo.run === 1 ? "1st Run" : "2nd Run"}
                         </span>
                     </h2>
                     <p className="text-xs text-slate-500 mt-1">
                         {isRouteChanged ? <span className="text-amber-600 font-bold">Unsaved changes - Click Save to apply</span> : "Sorted by saved sequence"}
                     </p>
                 </div>
                 <div className="text-right">
                     <div className="text-2xl font-black text-slate-800">{invoices.length}</div>
                     <div className="text-[10px] text-slate-400 uppercase font-bold">Stops</div>
                 </div>
              </div>

              {/* Optimization Controls */}
              {invoices.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      
                      {/* Start Location Selector */}
                      <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> Start Point</span>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                              <button onClick={() => { 
                                  setStartDestType('company'); setIsCustomStartSet(false); 
                                  saveRoutePrefsToDB({ startDestType: 'company', isCustomStartSet: false }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", startDestType === 'company' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Company</button>
                              
                              <button onClick={() => { 
                                  setStartDestType('home'); setIsCustomStartSet(false); 
                                  saveRoutePrefsToDB({ startDestType: 'home', isCustomStartSet: false }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", startDestType === 'home' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Home</button>
                              
                              <button onClick={() => { 
                                  setStartDestType('custom'); 
                                  saveRoutePrefsToDB({ startDestType: 'custom' }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", startDestType === 'custom' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Custom</button>
                          </div>
                      </div>
                      <div className="flex gap-2">
                          {startDestType === 'custom' ? (
                              <div className="flex-1 flex gap-2">
                                  <Input 
                                      placeholder="Enter start address..." 
                                      className={cn("h-9 text-xs transition-all", isCustomStartSet ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-white border-emerald-300")}
                                      value={customStart} 
                                      onChange={(e) => {
                                          setCustomStart(e.target.value);
                                          saveRoutePrefsToDB({ customStart: e.target.value });
                                      }}
                                      disabled={isCustomStartSet}
                                  />
                                  {isCustomStartSet ? (
                                      <Button size="sm" onClick={() => { 
                                          setIsCustomStartSet(false); 
                                          saveRoutePrefsToDB({ isCustomStartSet: false }); 
                                      }} className="h-9 bg-amber-500 hover:bg-amber-600 text-white text-xs px-3">Edit</Button>
                                  ) : (
                                      <Button size="sm" onClick={() => {
                                          if(customStart.trim()) { 
                                              setIsCustomStartSet(true); 
                                              saveRoutePrefsToDB({ isCustomStartSet: true, customStart: customStart.trim() }); 
                                          }
                                      }} className="h-9 bg-slate-800 text-xs px-3">Set</Button>
                                  )}
                              </div>
                          ) : (
                              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-md px-3 flex items-center text-xs text-slate-500 h-9 truncate">
                                  {startDestType === 'company' ? (companyLoc?.address || "No company address set") : (driverLoc?.address || "No driver address set")}
                              </div>
                          )}
                      </div>

                      {/* Final Destination Selector */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1"><Home className="w-3.5 h-3.5"/> Final Stop</span>
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                              <button onClick={() => { 
                                  setFinalDestType('company'); setIsCustomFinalSet(false); 
                                  saveRoutePrefsToDB({ finalDestType: 'company', isCustomFinalSet: false }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", finalDestType === 'company' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Company</button>
                              
                              <button onClick={() => { 
                                  setFinalDestType('home'); setIsCustomFinalSet(false); 
                                  saveRoutePrefsToDB({ finalDestType: 'home', isCustomFinalSet: false }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", finalDestType === 'home' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Home</button>
                              
                              <button onClick={() => { 
                                  setFinalDestType('custom'); 
                                  saveRoutePrefsToDB({ finalDestType: 'custom' }); 
                              }} className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all", finalDestType === 'custom' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>Custom</button>
                          </div>
                      </div>
                      <div className="flex gap-2">
                          {finalDestType === 'custom' ? (
                              <div className="flex-1 flex gap-2">
                                  <Input 
                                      placeholder="Enter final address..." 
                                      className={cn("h-9 text-xs transition-all", isCustomFinalSet ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-white border-emerald-300")}
                                      value={customFinal} 
                                      onChange={(e) => {
                                          setCustomFinal(e.target.value);
                                          saveRoutePrefsToDB({ customFinal: e.target.value });
                                      }}
                                      disabled={isCustomFinalSet}
                                  />
                                  {isCustomFinalSet ? (
                                      <Button size="sm" onClick={() => { 
                                          setIsCustomFinalSet(false); 
                                          saveRoutePrefsToDB({ isCustomFinalSet: false }); 
                                      }} className="h-9 bg-amber-500 hover:bg-amber-600 text-white text-xs px-3">Edit</Button>
                                  ) : (
                                      <Button size="sm" onClick={() => {
                                          if(customFinal.trim()) { 
                                              setIsCustomFinalSet(true); 
                                              saveRoutePrefsToDB({ isCustomFinalSet: true, customFinal: customFinal.trim() }); 
                                          }
                                      }} className="h-9 bg-slate-800 text-xs px-3">Set</Button>
                                  )}
                              </div>
                          ) : (
                              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-md px-3 flex items-center text-xs text-slate-500 h-9 truncate">
                                  {finalDestType === 'company' ? (companyLoc?.address || "No company address set") : (driverLoc?.address || "No driver address set")}
                              </div>
                          )}
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-4 border-t border-slate-100 flex gap-2">
                          {isRouteChanged ? (
                              <>
                                  <Button 
                                      onClick={handleSaveRoute} 
                                      disabled={isOptimizing} 
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 shadow-md shadow-emerald-100"
                                  >
                                      {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4 mr-2"/> Save New Order</>}
                                  </Button>
                                  <Button 
                                      variant="outline"
                                      onClick={handleRevert} 
                                      disabled={isOptimizing} 
                                      className="w-24 h-10 border-slate-300 text-slate-600"
                                  >
                                      <RotateCcw className="w-4 h-4 mr-1"/> Reset
                                  </Button>
                              </>
                          ) : (
                              <Button 
                                  onClick={handleOptimizeRoute} 
                                  disabled={isOptimizing} 
                                  className="w-full bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold h-10 shadow-sm"
                              >
                                  {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Sparkles className="w-4 h-4 mr-2 text-indigo-500"/>}
                                  Optimize & Sort Route
                              </Button>
                          )}
                      </div>
                  </div>
              )}

              {/* Invoice List (Draggable) */}
              <div className="space-y-3 pb-20">
                {invoices.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                        <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No invoices in this route.</p>
                    </div>
                )}
                
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext 
                        items={invoices.map(i => i.id)} 
                        strategy={verticalListSortingStrategy}
                    >
                        {invoices.map((invoice, index) => (
                            <SortableInvoiceCard 
                                key={invoice.id} 
                                invoice={invoice} 
                                index={index} 
                                onClick={() => handleInvoiceClick(invoice)} 
                            />
                        ))}
                    </SortableContext>
                </DndContext>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-300">
              <Truck className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-sm font-medium">Select a route to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Invoice Details Dialog */}
    <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-xl bg-white">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900">
                    <Box className="w-5 h-5 text-indigo-600"/>
                    Delivery Items
                </DialogTitle>
                <DialogDescription>
                    Order details for <span className="font-bold text-slate-900">{selectedInvoice?.invoice_to}</span>
                    <span className="ml-1 text-slate-400">(#{selectedInvoice?.id})</span>
                </DialogDescription>
            </DialogHeader>

            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto mt-2">
                {loadingItems ? (
                    <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin"/> Loading...
                    </div>
                ) : (
                    <table className="w-full text-sm text-left table-fixed">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3 w-[25%]">Item ID</th>
                                <th className="px-4 py-3 w-[50%]">Item Name</th>
                                <th className="px-4 py-3 w-[15%] text-center">Unit</th>
                                <th className="px-4 py-3 w-[10%] text-right">Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {invoiceItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500 truncate" title={item.products?.vendor_product_id || '-'}>
                                        {item.products?.vendor_product_id || '-'}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-700 truncate" title={item.description}>{item.description}</td>
                                    <td className="px-4 py-3 text-center text-slate-500 text-xs">{item.unit || '-'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-900">{item.quantity}</td>
                                </tr>
                            ))}
                            {invoiceItems.length === 0 && (
                                <tr><td colSpan={4} className="p-6 text-center text-slate-400 text-xs">No items found in this invoice.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            
            {selectedInvoice?.memo && (
                <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-md border border-amber-200 flex gap-2 items-start mt-2">
                    <FileText className="w-4 h-4 shrink-0"/>
                    <div>
                        <span className="font-bold block mb-0.5">Delivery Note:</span>
                        {selectedInvoice.memo}
                    </div>
                </div>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailOpen(false)} className="w-full">Close</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    {/* Map Dialog */}
    <RouteMapDialog 
        isOpen={isMapOpen} 
        onClose={() => setIsMapOpen(false)} 
        driverName={currentRouteInfo?.driverName || "Driver"}
        driverId={currentRouteInfo?.driverId} 
        invoices={invoices}
        startLocation={resolveLocation(startDestType, customStart)}
        finalLocation={resolveLocation(finalDestType, customFinal)} 
        isGoogleLoaded={isGoogleLoaded}
    />
    </>
  );
}

function SortableInvoiceCard({ invoice, index, onClick }: { invoice: Invoice, index: number, onClick: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: invoice.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : "auto",
        opacity: isDragging ? 0.8 : 1,
    };

    const isCompleted = invoice.is_completed;
    const isNew = invoice.delivery_order === 0 || invoice.delivery_order === null; 

    return (
        <Card 
            ref={setNodeRef} 
            style={style} 
            className={cn(
                "border shadow-sm transition-all relative group", 
                isCompleted ? "bg-slate-50/80 border-slate-200" : "bg-white border-slate-200",
                isDragging && "shadow-xl ring-2 ring-blue-500 scale-[1.02]"
            )}
        >
            <CardContent className="p-3 flex items-start gap-4">
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="mt-2 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1 rounded hover:bg-slate-100 touch-none"
                >
                    <GripVertical className="w-5 h-5" />
                </div>

                <div className="flex items-start gap-4 flex-1 cursor-pointer" onClick={onClick}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm border", isCompleted ? "bg-slate-200 text-slate-500 border-slate-300" : "bg-white text-slate-700 border-slate-200")}>
                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : (index + 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={cn("font-bold text-sm truncate flex items-center gap-2", isCompleted ? "text-slate-400 line-through" : "text-slate-800")}>
                                {invoice.customers?.name || invoice.invoice_to || "Unknown"}
                                {isNew && !isCompleted && (
                                    <Badge className="bg-emerald-500 text-white text-[9px] h-4 px-1.5 hover:bg-emerald-600">NEW</Badge>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                                {invoice.customers?.delivery_address || invoice.customers?.address || "No Address"}, {invoice.customers?.suburb}
                            </span>
                        </div>
                        {invoice.memo && (
                            <div className="mt-2 text-xs bg-amber-50 text-amber-700 p-2 rounded border border-amber-100 flex items-start gap-1.5">
                                <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70"/>
                                <span className="line-clamp-2 leading-tight">{invoice.memo}</span>
                            </div>
                        )}
                    </div>
                    {isCompleted ? <Badge variant="outline" className="text-[10px] bg-white text-slate-400 border-slate-200 h-fit">Completed</Badge> : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
                </div>
            </CardContent>
        </Card>
    );
}

function RouteMapDialog({ 
    isOpen, onClose, driverName, driverId, invoices, startLocation, finalLocation, isGoogleLoaded 
}: { 
    isOpen: boolean, onClose: () => void, driverName: string, driverId?: string, invoices: Invoice[], startLocation: any, finalLocation: any, isGoogleLoaded: boolean 
}) {
    const supabase = createClient();
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const directionsRenderer = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const driverMarkerRef = useRef<any>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(null);

    const isValidLocation = (loc: any) => {
        return loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && loc.lat !== 0 && loc.lng !== 0;
    };

    useEffect(() => {
        if (!isOpen) {
            mapInstance.current = null;
            directionsRenderer.current = null;
            markersRef.current = [];
            driverMarkerRef.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !driverId) return;
        const fetchInitialLocation = async () => {
             const { data } = await supabase.from('driver_locations').select('lat, lng').eq('driver_id', driverId).maybeSingle();
             if (data && isValidLocation(data)) setDriverLocation({ lat: data.lat, lng: data.lng });
             else setDriverLocation(null);
        };
        fetchInitialLocation();
        const channel = supabase.channel(`tracking_${driverId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, (payload: any) => {
                const newLoc = payload.new;
                if (newLoc && isValidLocation(newLoc)) setDriverLocation({ lat: newLoc.lat, lng: newLoc.lng });
                else setDriverLocation(null);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [isOpen, driverId]);

    useEffect(() => {
        if (!isOpen || !isGoogleLoaded || !window.google || !window.google.maps) return;

        const timer = setTimeout(() => {
            if (!mapRef.current) return; 

            if (!mapInstance.current) {
                mapInstance.current = new window.google.maps.Map(mapRef.current, {
                    center: DEFAULT_LOCATION,
                    zoom: 10,
                    disableDefaultUI: false,
                    streetViewControl: false,
                });
                directionsRenderer.current = new window.google.maps.DirectionsRenderer({
                    map: mapInstance.current,
                    suppressMarkers: true, 
                    preserveViewport: false,
                });
            }

            markersRef.current.forEach(m => m.setMap(null));
            markersRef.current = [];
            
            if (directionsRenderer.current) {
                directionsRenderer.current.setDirections({ routes: [] });
            }

            const finalOrigin = startLocation || DEFAULT_LOCATION;
            const finalDest = finalLocation || DEFAULT_LOCATION;

            const waypoints: any[] = [];
            
            invoices.forEach((inv, idx) => {
                const c = inv.customers;
                const lat = c.delivery_lat || c.lat;
                const lng = c.delivery_lng || c.lng;

                if (lat && lng && lat !== 0 && lng !== 0) {
                    const location = { lat, lng };
                    waypoints.push({ location: location, stopover: true });
                }
            });

            if (waypoints.length > 0) {
                const ds = new window.google.maps.DirectionsService();
                
                ds.route({
                    origin: finalOrigin,
                    destination: finalDest, 
                    // @ts-ignore
                    waypoints: waypoints,
                    travelMode: window.google.maps.TravelMode.DRIVING,
                    optimizeWaypoints: false 
                }, (res: any, status: any) => {
                    if (status === 'OK') {
                        if (directionsRenderer.current) directionsRenderer.current.setDirections(res);
                        
                        const route = res.routes[0];
                        if (route && route.legs.length > 0) {
                            
                            const startMarker = new window.google.maps.Marker({
                                position: route.legs[0].start_location,
                                map: mapInstance.current,
                                label: { text: "S", color: "white", fontWeight: "bold" },
                                title: "Start Point",
                                icon: {
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: "#10b981", 
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: "white",
                                }
                            });
                            markersRef.current.push(startMarker);

                            invoices.forEach((inv, idx) => {
                                if (route.legs[idx]) {
                                    const marker = new window.google.maps.Marker({
                                        position: route.legs[idx].end_location,
                                        map: mapInstance.current,
                                        label: { text: `${idx + 1}`, color: "white", fontWeight: "bold" },
                                        title: inv.customers?.name,
                                        opacity: inv.is_completed ? 0.5 : 1.0,
                                    });
                                    markersRef.current.push(marker);
                                }
                            });

                            const lastLeg = route.legs[route.legs.length - 1];
                            const finishMarker = new window.google.maps.Marker({
                                position: lastLeg.end_location,
                                map: mapInstance.current,
                                label: { text: "F", color: "white", fontWeight: "bold" },
                                title: "Final Destination",
                                icon: {
                                    path: window.google.maps.SymbolPath.CIRCLE,
                                    scale: 10,
                                    fillColor: "#10b981", 
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: "white",
                                }
                            });
                            markersRef.current.push(finishMarker);
                        }
                    }
                });
            } else {
                if (mapInstance.current) {
                    mapInstance.current.setCenter(DEFAULT_LOCATION);
                }
            }
        }, 300); 

        return () => clearTimeout(timer); 

    }, [isOpen, isGoogleLoaded, invoices, startLocation, finalLocation]); 

    useEffect(() => {
        if (!mapInstance.current || !window.google) return;
        if (!driverLocation) {
            if (driverMarkerRef.current) {
                driverMarkerRef.current.setMap(null);
                driverMarkerRef.current = null;
            }
            return;
        }
        if (!driverMarkerRef.current) {
            driverMarkerRef.current = new window.google.maps.Marker({
                position: driverLocation,
                map: mapInstance.current,
                icon: {
                    path: "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
                    fillColor: "#10b981", fillOpacity: 1, strokeWeight: 1, strokeColor: "#ffffff", scale: 1.5, anchor: new window.google.maps.Point(12, 12),
                },
                zIndex: 1000, title: driverName,
            });
        } else {
            if (driverMarkerRef.current.getMap() !== mapInstance.current) driverMarkerRef.current.setMap(mapInstance.current);
            driverMarkerRef.current.setPosition(driverLocation);
        }
    }, [driverLocation, isOpen]); 

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden bg-white">
                <DialogHeader className="p-4 border-b bg-slate-50 shrink-0 flex flex-row items-center justify-between space-y-0">
                    <div className="flex flex-col">
                        <DialogTitle className="flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-indigo-600"/>
                            Tracking: <span className="text-indigo-900">{driverName}</span>
                            {driverLocation && <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-600 border-emerald-200 animate-pulse">Live</Badge>}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500 mt-1">
                            {invoices.length} stops in this route
                        </DialogDescription>
                    </div>
                    <Button size="sm" onClick={onClose} className="h-8 text-xs bg-slate-900 text-white">Close Map</Button>
                </DialogHeader>
                <div className="flex-1 relative w-full h-full bg-slate-100">
                    <div ref={mapRef} className="absolute inset-0 w-full h-full" />
                    {!isGoogleLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-50">
                            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}