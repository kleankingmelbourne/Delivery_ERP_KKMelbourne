"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import Script from "next/script"; 
import { 
  Calendar as CalendarIcon, Truck, Map as MapIcon, Navigation, 
  MapPin, CheckCircle2, User, Loader2, MapPin as WarehouseIcon, Radio,
  Box, X, Circle, FileText, Sparkles, Building2, Home, MousePointerClick, 
  Save, RotateCcw, Edit2, Check, GripVertical, Printer, ChevronLeft, ChevronRight, ChevronDown,
  Key 
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
} from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  DragEndEvent,
  pointerWithin,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DropAnimation
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
interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  products?: {
    product_name?: string;
    location?: string | null;
    vendor_product_id: string | null;
  } | null;
}

interface Invoice {
  id: string;
  invoice_to: string;
  invoice_date: string;
  delivery_order: number;
  delivery_run: number;
  driver_id: string | null;
  customer_id: string;
  is_completed: boolean;
  is_pickup?: boolean;
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
    in_charge_delivery?: string | null;
    use_key?: boolean; 
  };
  invoice_items?: InvoiceItem[];
}

interface DisplayInvoice extends Invoice {
  current_driver_id: string | null;
  current_run: number;
  is_new_arrival?: boolean;
}

interface Driver {
  id: string;
  display_name: string | null;
}

interface DriverColumnState {
    driver: Driver;
    run: number;
    columnId: string;
}

// 🚀 심플하게 이름과 ID만 유지
interface KeyInvoiceInfo {
  id: string;
  name: string;
}

interface DriverRouteInfo {
    driverId: string;
    driverName: string;
    run: number; 
    count: number;
    completedCount: number;
    newCount: number; 
    keyInvoices: KeyInvoiceInfo[]; 
}

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

  const [companyLoc, setCompanyLoc] = useState<LocationData | null>(null);
  const [driverLocations, setDriverLocations] = useState<Record<string, LocationData>>({});

  const currentDriverId = selectedRouteKey ? selectedRouteKey.split('_')[0] : null;
  const driverLoc = currentDriverId ? driverLocations[currentDriverId] : null;

  const [startDestType, setStartDestType] = useState<'company' | 'home' | 'custom'>('company');
  const [finalDestType, setFinalDestType] = useState<'company' | 'home' | 'custom'>('home');
  
  const [customStart, setCustomStart] = useState("");
  const [isCustomStartSet, setIsCustomStartSet] = useState(false); 
  const [customFinal, setCustomFinal] = useState("");
  const [isCustomFinalSet, setIsCustomFinalSet] = useState(false); 
  
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [isRouteChanged, setIsRouteChanged] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle'); 

  const [printingRouteKey, setPrintingRouteKey] = useState<string | null>(null);

  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [warehouseLocation, setWarehouseLocation] = useState(DEFAULT_LOCATION);
  const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Detail Dialog State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // 🚀 열쇠 모달 상태
  const [isKeyDialogOpen, setIsKeyDialogOpen] = useState(false);
  const [keyDialogData, setKeyDialogData] = useState<{driverName: string, invoices: KeyInvoiceInfo[]} | null>(null);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

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
            .select(`id, driver_id, delivery_run, delivery_order, is_completed, customers ( name, use_key ), profiles:driver_id ( display_name, address, lat, lng, route_prefs )`)
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
            const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers;
            
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
            
            if (!groups[key]) groups[key] = { driverId: dId, driverName: dName, run: run, count: 0, completedCount: 0, newCount: 0, keyInvoices: [] };
            
            groups[key].count += 1;
            
            if (item.is_completed) {
                groups[key].completedCount += 1;
            }
            
            if (item.delivery_order === 0 || item.delivery_order === null) {
                groups[key].newCount += 1;
            }

            if (customer?.use_key) {
                groups[key].keyInvoices.push({
                    id: item.id,
                    name: customer.name || "Unknown",
                });
            }
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
      setSaveStatus('idle'); 
      
      const { data, error } = await supabase
        .from("invoices")
        .select(`
            id, invoice_to, invoice_date, delivery_order, delivery_run, driver_id, is_completed, memo,
            customers ( name, suburb, address, lat, lng, delivery_address, delivery_lat, delivery_lng, use_key )
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

        if (!error && data) {
            const filtered = data.filter(item => {
                const itemRun = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
                return itemRun === run;
            });
            const invoiceIds = filtered.map(inv => inv.id);
            if (invoiceIds.length > 0) await printBulkPdf(invoiceIds);
        }
    } catch (err: any) { alert("Error printing invoices: " + err.message); } 
    finally { setPrintingRouteKey(null); }
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
        setSaveStatus('idle'); 
    }
  };

  const resolveLocation = (type: 'company' | 'home' | 'custom', customText: string): { lat: number, lng: number } | string | null => {
      if (type === 'company' && companyLoc) return (companyLoc.lat && companyLoc.lng) ? { lat: companyLoc.lat, lng: companyLoc.lng } : companyLoc.address;
      if (type === 'home' && driverLoc) return (driverLoc.lat && driverLoc.lng) ? { lat: driverLoc.lat, lng: driverLoc.lng } : driverLoc.address;
      if (type === 'custom' && customText) return customText;
      return null;
  };

  const handleOptimizeRoute = () => {
      if (!window.google || !window.google.maps) return alert("Google Maps API not loaded yet.");
      if (invoices.length < 2) return alert("Need at least 2 stops to optimize.");

      const startLocation = resolveLocation(startDestType, customStart);
      const finalLocation = resolveLocation(finalDestType, customFinal);

      if (!startLocation || !finalLocation) return alert("Please set a valid Start and Final Destination.");

      setIsOptimizing(true);
      const ds = new window.google.maps.DirectionsService();
      
      const validInvoices: Invoice[] = [];
      const invalidInvoices: Invoice[] = [];
      const waypoints: any[] = [];

      invoices.forEach(inv => {
          const c = inv.customers;
          const lat = c.delivery_lat || c.lat;
          const lng = c.delivery_lng || c.lng;
          const addressStr = [c.delivery_address || c.address, c.suburb].filter(Boolean).join(", ").trim();

          if (lat && lng && lat !== 0 && lng !== 0) {
              validInvoices.push(inv);
              waypoints.push({ location: { lat, lng }, stopover: true });
          } else if (addressStr.length > 0) {
              validInvoices.push(inv);
              waypoints.push({ location: addressStr, stopover: true });
          } else {
              invalidInvoices.push(inv);
          }
      });

      if (validInvoices.length === 0) {
          setIsOptimizing(false);
          return alert("No valid addresses found to optimize.");
      }

      ds.route({
          origin: startLocation,
          destination: finalLocation,
          // @ts-ignore
          waypoints: waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          avoidTolls: true, 
          optimizeWaypoints: true 
      }, (res: any, status: any) => {
          setIsOptimizing(false);
          if (status === 'OK' && res.routes[0]) {
              const order = res.routes[0].waypoint_order; 
              const sortedValidInvoices = order.map((index: number) => validInvoices[index]);
              
              setInvoices([...sortedValidInvoices, ...invalidInvoices]);
              setIsRouteChanged(true); 
              setSaveStatus('idle'); 
              
              if (invalidInvoices.length > 0) {
                  alert(`${invalidInvoices.length} stop(s) skipped due to missing address.\nThey have been placed at the end of the route.`);
              }
          } else { 
              alert("Route optimization failed: " + status); 
          }
      });
  };

  const handleSaveRoute = async () => {
      setIsSaving(true); 
      try {
          const updates = invoices.map((inv, index) => ({ id: inv.id, delivery_order: index + 1 }));
          await Promise.all(updates.map(u => supabase.from('invoices').update({ delivery_order: u.delivery_order }).eq('id', u.id)));
          
          const savedInvoices = invoices.map((inv, index) => ({ ...inv, delivery_order: index + 1 }));
          setInvoices(savedInvoices);
          setOriginalInvoices(savedInvoices); 
          setIsRouteChanged(false); 
          setSaveStatus('saved'); 
          
          fetchRoutes(); 
      } catch (error: any) { alert("Save failed: " + error.message); } 
      finally { setIsSaving(false); }
  };

  const handleRevert = () => { setInvoices(originalInvoices); setIsRouteChanged(false); };

  const fetchInvoiceItems = useCallback(async (index: number) => {
    if (index < 0 || index >= invoices.length) return;
    
    setLoadingItems(true);
    setCheckedItems(new Set()); 

    const invoice = invoices[index];
    const { data, error } = await supabase
      .from('invoice_items')
      .select('id, description, quantity, unit, products(vendor_product_id)')
      .eq('invoice_id', invoice.id);
      
    if (!error && data) {
        setInvoiceItems(data.map((item: any) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            products: Array.isArray(item.products) ? item.products[0] : item.products
        })));
    } else { setInvoiceItems([]); }
    setLoadingItems(false);
  }, [invoices, supabase]);

  const handleInvoiceClick = (index: number) => {
    setCurrentIndex(index);
    setIsDetailOpen(true);
    fetchInvoiceItems(index);
  };

  const handlePrev = () => {
      if (currentIndex > 0) {
          const nextIdx = currentIndex - 1;
          setCurrentIndex(nextIdx);
          fetchInvoiceItems(nextIdx);
      }
  };

  const handleNext = () => {
      if (currentIndex < invoices.length - 1) {
          const nextIdx = currentIndex + 1;
          setCurrentIndex(nextIdx);
          fetchInvoiceItems(nextIdx);
      }
  };

  const toggleItemCheck = (itemId: string) => {
      setCheckedItems((prev) => {
          const next = new Set(prev);
          if (next.has(itemId)) {
              next.delete(itemId);
          } else {
              next.add(itemId);
          }
          return next;
      });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      setTouchStartX(e.clientX);
      setTouchStartY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (touchStartX === null || touchStartY === null) return;
      const deltaX = touchStartX - e.clientX;
      const deltaY = touchStartY - e.clientY;

      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 0) {
              handleNext(); 
          } else {
              handlePrev(); 
          }
      }
      setTouchStartX(null);
      setTouchStartY(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isDetailOpen) return;
        if (e.key === 'ArrowLeft') handlePrev();
        if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailOpen, currentIndex, invoices.length]);

  useEffect(() => { fetchRoutes(); }, [selectedDate]);
  useEffect(() => { fetchInvoices(); }, [selectedRouteKey]);

  useEffect(() => {
    const channel = supabase.channel('route_view_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `invoice_date=eq.${selectedDate}` }, () => {
            if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = setTimeout(() => {
                fetchRoutes();
                if (selectedRouteKey && !isRouteChanged) fetchInvoices(); 
            }, 500);
        }).subscribe();
    return () => { supabase.removeChannel(channel); if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current); };
  }, [selectedDate, selectedRouteKey, isRouteChanged]);

  if (!isMounted) return null;

  const currentRouteInfo = routeList.find(r => `${r.driverId}_${r.run}` === selectedRouteKey);
  const activeInvoice = currentIndex !== -1 ? invoices[currentIndex] : null;

  const isOptimized = invoices.length > 0 && invoices.some(inv => inv.delivery_order > 0);

  let currentStopNumber = 1;

  return (
    <>
    <Script 
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places,geometry&loading=async`}
        strategy="afterInteractive"
        onLoad={() => { setIsGoogleLoaded(true); }}
    />

    <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50/50">
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
        <Button variant="outline" size="sm" onClick={() => setIsMapOpen(true)} disabled={invoices.length === 0} className="h-9 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-300 gap-2"><MapIcon className="w-4 h-4" /> View Map</Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 border-b border-slate-100">Active Routes ({routeList.length})</div>
          <div className="flex flex-col p-2 gap-1.5">
            {routeList.map((route) => {
              const key = `${route.driverId}_${route.run}`;
              const isSelected = selectedRouteKey === key;
              const isDone = route.count > 0 && route.count === route.completedCount;
              
              return (
                <button key={key} onClick={() => setSelectedRouteKey(key)} className={cn("flex items-center gap-3 p-3 text-left transition-all rounded-lg border", isSelected ? "bg-emerald-50/80 border-emerald-200 shadow-sm" : "bg-white hover:bg-slate-50 border-transparent hover:border-slate-200")}>
                  <div className="relative">
                      <Avatar className="h-9 w-9 border border-white shadow-sm shrink-0"><AvatarFallback className={cn("text-xs font-bold", isSelected ? "bg-emerald-200 text-emerald-800" : "bg-slate-100 text-slate-500")}>{route.driverName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                      {route.run === 2 && (<span className="absolute -bottom-1 -right-1 bg-indigo-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full border-2 border-white font-bold">2</span>)}
                  </div>
                  <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 truncate pr-1">
                              <span className={cn("font-bold text-sm truncate", isSelected ? "text-emerald-900" : "text-slate-700")}>{route.driverName}</span>
                              {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                              
                              {/* 🚀 열쇠 카운트 뱃지 표시 */}
                              {route.keyInvoices.length > 0 && (
                                  <div
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          setKeyDialogData({ driverName: route.driverName, invoices: route.keyInvoices });
                                          setIsKeyDialogOpen(true);
                                      }}
                                      className="flex items-center gap-0.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold hover:bg-amber-200 transition-colors shrink-0 cursor-pointer"
                                      title="View keys required"
                                  >
                                      <Key className="w-3 h-3" />
                                      {route.keyInvoices.length}
                                  </div>
                              )}
                          </div>
                          <div onClick={(e) => handlePrintRoute(e, route.driverId, route.run)} className={cn("p-1.5 rounded-md transition-colors cursor-pointer shrink-0", printingRouteKey === key ? "bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50")}>{printingRouteKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600"/> : <Printer className="w-3.5 h-3.5" />}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className={cn("text-[9px] px-1.5 h-4 rounded-sm font-normal", route.run === 2 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500")}>
                              {route.run === 1 ? "1st Run" : "2nd Run"}
                          </Badge>
                          <span className="text-[10px] text-slate-400 font-medium">{route.completedCount} / {route.count} stops</span>
                          
                          {route.newCount > 0 && (
                              <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[8px] px-1 h-3.5 rounded-sm">
                                  {route.newCount} NEW
                              </Badge>
                          )}
                      </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto">
          {selectedRouteKey && currentRouteInfo ? (
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                  <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{currentRouteInfo.driverName}<span className={cn("text-xs px-2 py-0.5 rounded-full border", currentRouteInfo.run === 2 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>{currentRouteInfo.run === 1 ? "1st Run" : "2nd Run"}</span></h2><p className="text-xs text-slate-500 mt-1">{isRouteChanged ? <span className="text-amber-600 font-bold">Unsaved changes - Click Save to apply</span> : "Sorted by saved sequence"}</p></div>
                  <div className="text-right"><div className="text-2xl font-black text-slate-800">{invoices.length}</div><div className="text-[10px] text-slate-400 uppercase font-bold">Stops</div></div>
              </div>

              {invoices.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1 w-20 shrink-0">
                              <MapPin className="w-3.5 h-3.5"/> Start
                          </span>
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="outline" className="h-8 text-xs px-2 w-24 justify-between text-slate-600 bg-slate-50">
                                      {startDestType.charAt(0).toUpperCase() + startDestType.slice(1)} <ChevronDown className="w-3 h-3 opacity-50"/>
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                  <DropdownMenuItem onClick={() => { setStartDestType('company'); setIsCustomStartSet(false); saveRoutePrefsToDB({ startDestType: 'company', isCustomStartSet: false }); }}>Company</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setStartDestType('home'); setIsCustomStartSet(false); saveRoutePrefsToDB({ startDestType: 'home', isCustomStartSet: false }); }}>Home</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setStartDestType('custom'); saveRoutePrefsToDB({ startDestType: 'custom' }); }}>Custom</DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                          {startDestType === 'custom' ? (
                              <div className="flex-1 flex gap-2">
                                  <Input placeholder="Start address..." className={cn("h-8 text-xs", isCustomStartSet ? "bg-slate-100 text-slate-500" : "bg-white border-emerald-300")} value={customStart} onChange={(e) => { setCustomStart(e.target.value); saveRoutePrefsToDB({ customStart: e.target.value }); }} disabled={isCustomStartSet}/>
                                  {isCustomStartSet ? (
                                      <Button size="sm" onClick={() => { setIsCustomStartSet(false); saveRoutePrefsToDB({ isCustomStartSet: false }); }} className="h-8 bg-amber-500 text-white text-xs px-3">Edit</Button>
                                  ) : (
                                      <Button size="sm" onClick={() => { if(customStart.trim()) { setIsCustomStartSet(true); saveRoutePrefsToDB({ isCustomStartSet: true, customStart: customStart.trim() }); } }} className="h-8 bg-slate-800 text-white text-xs px-3">Set</Button>
                                  )}
                              </div>
                          ) : (
                              <span className="text-xs text-slate-500 truncate flex-1" title={startDestType === 'company' ? companyLoc?.address : driverLoc?.address}>{startDestType === 'company' ? (companyLoc?.address || "No company address set") : (driverLoc?.address || "No driver address set")}</span>
                          )}
                      </div>

                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1 w-20 shrink-0">
                              <Home className="w-3.5 h-3.5"/> Final
                          </span>
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="outline" className="h-8 text-xs px-2 w-24 justify-between text-slate-600 bg-slate-50">
                                      {finalDestType.charAt(0).toUpperCase() + finalDestType.slice(1)} <ChevronDown className="w-3 h-3 opacity-50"/>
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                  <DropdownMenuItem onClick={() => { setFinalDestType('company'); setIsCustomFinalSet(false); saveRoutePrefsToDB({ finalDestType: 'company', isCustomFinalSet: false }); }}>Company</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setFinalDestType('home'); setIsCustomFinalSet(false); saveRoutePrefsToDB({ finalDestType: 'home', isCustomFinalSet: false }); }}>Home</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setFinalDestType('custom'); saveRoutePrefsToDB({ finalDestType: 'custom' }); }}>Custom</DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                          {finalDestType === 'custom' ? (
                              <div className="flex-1 flex gap-2">
                                  <Input placeholder="Final address..." className={cn("h-8 text-xs", isCustomFinalSet ? "bg-slate-100 text-slate-500" : "bg-white border-emerald-300")} value={customFinal} onChange={(e) => { setCustomFinal(e.target.value); saveRoutePrefsToDB({ customFinal: e.target.value }); }} disabled={isCustomFinalSet}/>
                                  {isCustomFinalSet ? (
                                      <Button size="sm" onClick={() => { setIsCustomFinalSet(false); saveRoutePrefsToDB({ isCustomFinalSet: false }); }} className="h-8 bg-amber-500 text-white text-xs px-3">Edit</Button>
                                  ) : (
                                      <Button size="sm" onClick={() => { if(customFinal.trim()) { setIsCustomFinalSet(true); saveRoutePrefsToDB({ isCustomFinalSet: true, customFinal: customFinal.trim() }); } }} className="h-8 bg-slate-800 text-white text-xs px-3">Set</Button>
                                  )}
                              </div>
                          ) : (
                              <span className="text-xs text-slate-500 truncate flex-1" title={finalDestType === 'company' ? companyLoc?.address : driverLoc?.address}>{finalDestType === 'company' ? (companyLoc?.address || "No company address set") : (driverLoc?.address || "No driver address set")}</span>
                          )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex gap-2 items-center">
                          {isRouteChanged ? (
                              <>
                                  <Button 
                                      onClick={handleSaveRoute} 
                                      disabled={isOptimizing} 
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 shadow-md text-xs"
                                  >
                                      {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-3.5 h-3.5 mr-2"/> Save New Order</>}
                                  </Button>
                                  <Button 
                                      variant="outline" 
                                      onClick={handleRevert} 
                                      disabled={isOptimizing} 
                                      className="w-20 h-9 border-slate-300 text-slate-600 text-xs"
                                  >
                                      <RotateCcw className="w-3.5 h-3.5 mr-1"/> Reset
                                  </Button>
                              </>
                          ) : (
                              isOptimized ? (
                                  <div className="flex-1 flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-md px-3 h-9">
                                      <div className="flex items-center text-emerald-700 font-bold text-xs">
                                          <CheckCircle2 className="w-4 h-4 mr-1.5" /> OPTIMIZED
                                      </div>
                                      <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={handleOptimizeRoute} 
                                          disabled={isOptimizing} 
                                          className="h-6 px-2 text-[10px] font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-100 bg-white"
                                      >
                                          {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3 mr-1"/>}
                                          Re-Optimize
                                      </Button>
                                  </div>
                              ) : (
                                  <Button 
                                      onClick={handleOptimizeRoute} 
                                      disabled={isOptimizing} 
                                      className="w-full bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold h-9 shadow-sm text-xs"
                                  >
                                      {isOptimizing ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Sparkles className="w-3.5 h-3.5 mr-2 text-indigo-500"/>} 
                                      Optimize & Sort Route
                                  </Button>
                              )
                          )}
                      </div>
                  </div>
              )}

              <div className="space-y-3 pb-20">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={invoices.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        {invoices.map((invoice, index) => {
                            const isNewInDB = invoice.delivery_order === 0 || invoice.delivery_order === null;
                            let displayNum: number | null = null;
                            
                            if (isRouteChanged) {
                                displayNum = index + 1;
                            } else {
                                if (isNewInDB) {
                                    displayNum = null; 
                                } else {
                                    displayNum = currentStopNumber++;
                                }
                            }

                            return (
                                <SortableInvoiceCard 
                                    key={invoice.id} 
                                    invoice={invoice} 
                                    displayNum={displayNum} 
                                    isNewInDB={isNewInDB}
                                    onClick={() => handleInvoiceClick(index)} 
                                />
                            );
                        })}
                    </SortableContext>
                </DndContext>
              </div>
            </div>
          ) : (<div className="flex flex-col items-center justify-center h-full text-slate-300"><Truck className="w-16 h-16 mb-4 opacity-10" /><p className="text-sm font-medium">Select a route to view details</p></div>)}
        </div>
      </div>

      {/* 🚀 [수정] 열쇠 필요 고객 모달 (심플하게 이름만 표시) */}
      <Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
          <DialogContent className="sm:max-w-md bg-white p-0 overflow-hidden rounded-2xl shadow-xl">
              <DialogHeader className="bg-amber-50 border-b border-amber-100 p-4">
                  <DialogTitle className="flex items-center gap-2 text-amber-900 font-black text-lg">
                      <Key className="w-5 h-5 text-amber-600" />
                      Keys Required ({keyDialogData?.invoices.length || 0})
                  </DialogTitle>
                  <DialogDescription className="text-amber-700/80 font-medium">
                      {keyDialogData?.driverName} Route
                  </DialogDescription>
              </DialogHeader>
              <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2 bg-slate-50/50">
                  {keyDialogData?.invoices.map((inv, idx) => (
                      <div key={inv.id} className="flex items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-amber-300 transition-colors">
                          <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                                  {idx + 1}
                              </div>
                              <span className="font-bold text-slate-800 text-[15px]">
                                {inv.name || "Unknown"}
                              </span>
                          </div>
                      </div>
                  ))}
                  {keyDialogData?.invoices.length === 0 && (
                      <div className="text-center text-slate-400 py-10">No keys required for this route.</div>
                  )}
              </div>
              <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                  <Button variant="outline" onClick={() => setIsKeyDialogOpen(false)} className="bg-white hover:bg-slate-100">Close</Button>
              </div>
          </DialogContent>
      </Dialog>

    </div>

    <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent 
            className="!max-w-full !w-screen !h-[100dvh] !m-0 !p-0 !rounded-none !border-none bg-white flex flex-col shadow-none select-none [&>button]:hidden"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
        >
            <DialogHeader className="p-6 border-b flex flex-row items-center justify-between shrink-0 space-y-0 bg-slate-50 relative">
                <div className="text-center flex-1">
                    <DialogTitle className="flex items-center justify-center gap-3 text-2xl font-black text-slate-900">
                        <Box className="w-7 h-7 text-indigo-600"/>
                        STOPS: {currentIndex + 1} / {invoices.length}
                    </DialogTitle>
                    <DialogDescription className="text-lg mt-1 font-medium text-slate-500">
                        Delivery to: <span className="text-slate-900 font-bold">{activeInvoice?.invoice_to}</span>
                        <span className="ml-2 text-slate-400 font-mono text-sm">(Inv #{activeInvoice?.id})</span>
                    </DialogDescription>
                </div>
                
                <Button variant="ghost" size="icon" onClick={() => setIsDetailOpen(false)} className="absolute right-6 top-6 h-12 w-12 hover:bg-red-50 hover:text-red-500 transition-colors rounded-full z-50">
                    <X className="w-8 h-8" />
                </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100/30 cursor-grab active:cursor-grabbing">
                <div className="w-full mx-auto space-y-6 pb-20">
                    <div className="text-center text-sm font-bold text-slate-400 animate-pulse">
                        ⟵ Swipe Left or Right to navigate ⟶
                    </div>
                    
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        {loadingItems ? (
                            <div className="p-32 text-center text-slate-400 text-xl flex flex-col items-center gap-4">
                                <Loader2 className="w-12 h-12 animate-spin text-indigo-500"/> 
                                <p className="animate-pulse font-medium">Loading item list...</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-900 text-white font-bold text-[13px] uppercase">
                                    <tr>
                                        <th className="px-4 py-3 w-[15%]">Vendor ID</th>
                                        <th className="px-4 py-3 w-auto">Item Description</th>
                                        <th className="px-4 py-3 w-[1%] whitespace-nowrap text-center">Unit</th>
                                        <th className="px-4 py-3 w-[1%] whitespace-nowrap text-right">QTY</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white">
                                    {invoiceItems.map((item, idx: number) => {
                                        const isChecked = checkedItems.has(item.id);
                                        const unitLower = (item.unit || '').toLowerCase();
                                        
                                        const isCtn = unitLower.includes('ctn') || unitLower.includes('carton');
                                        const isPack = unitLower.includes('pack') || unitLower.includes('pkt');

                                        return (
                                            <tr 
                                                key={item.id} 
                                                onClick={() => toggleItemCheck(item.id)} 
                                                className={cn(
                                                    "transition-all cursor-pointer text-[13px] border-b border-white",
                                                    isChecked ? "bg-slate-50 opacity-60 grayscale" : 
                                                    isCtn ? "bg-blue-50 hover:bg-blue-100" : 
                                                    isPack ? "bg-amber-50 hover:bg-amber-100" : 
                                                    "bg-white hover:bg-slate-50"
                                                )}
                                            >
                                                <td className={cn(
                                                    "px-4 py-3 font-mono transition-all", 
                                                    isChecked ? "text-slate-400 line-through decoration-red-500 decoration-2" : 
                                                    isCtn ? "text-blue-700" : isPack ? "text-amber-700" : "text-slate-500"
                                                )}>
                                                    {item.products?.vendor_product_id || '-'}
                                                </td>
                                                <td className={cn(
                                                    "px-4 py-3 font-bold transition-all", 
                                                    isChecked ? "text-slate-400 line-through decoration-red-500 decoration-2" : 
                                                    isCtn ? "text-blue-900" : isPack ? "text-amber-900" : "text-slate-800"
                                                )}>
                                                    {item.description}
                                                </td>
                                                <td className={cn(
                                                    "px-4 py-3 text-center font-bold whitespace-nowrap transition-all", 
                                                    isChecked ? "text-slate-400 line-through decoration-red-500 decoration-2" : 
                                                    isCtn ? "text-blue-700" : isPack ? "text-amber-700" : "text-slate-600"
                                                )}>
                                                    {item.unit || '-'}
                                                </td>
                                                <td className={cn(
                                                    "px-4 py-3 text-right font-black whitespace-nowrap transition-all text-base", 
                                                    isChecked ? "text-red-400 line-through decoration-red-500 decoration-2" : 
                                                    isCtn ? "text-blue-700" : isPack ? "text-amber-700" : "text-indigo-600"
                                                )}>
                                                    {item.quantity}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {invoiceItems.length === 0 && (
                                        <tr><td colSpan={4} className="p-10 text-center text-slate-400 text-[13px]">No items found in this invoice.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                    
                    {activeInvoice?.memo && (
                        <div className="bg-amber-100 text-amber-950 p-6 rounded-xl border-2 border-amber-300 flex gap-4 items-start shadow-sm">
                            <div className="bg-amber-500 p-2 rounded-full text-white shadow-sm">
                                <FileText className="w-6 h-6"/>
                            </div>
                            <div>
                                <span className="font-black text-lg block mb-1 uppercase tracking-tight">Delivery Special Note</span>
                                <p className="text-base font-medium">{activeInvoice.memo}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DialogContent>
    </Dialog>

    <RouteMapDialog isOpen={isMapOpen} onClose={() => setIsMapOpen(false)} driverName={currentRouteInfo?.driverName || "Driver"} driverId={currentRouteInfo?.driverId} invoices={invoices} startLocation={resolveLocation(startDestType, customStart)} finalLocation={resolveLocation(finalDestType, customFinal)} isGoogleLoaded={isGoogleLoaded} isRouteChanged={isRouteChanged} />
    </>
  );
}

function SortableInvoiceCard({ invoice, displayNum, isNewInDB, onClick }: { invoice: Invoice, displayNum: number | null, isNewInDB: boolean, onClick: () => void }) {
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
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm border", 
                        isCompleted ? "bg-slate-200 text-slate-500 border-slate-300" : 
                        displayNum === null ? "bg-amber-100 text-amber-600 border-amber-300" : "bg-white text-slate-700 border-slate-200")}>
                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : (displayNum !== null ? displayNum : "!")}
                    </div>
                    
                    <div className="flex-1 min-w-0 py-1">
                        <div className="flex items-center gap-2">
                            <span className={cn("font-bold text-sm truncate flex items-center gap-1.5", isCompleted ? "text-slate-400 line-through" : "text-slate-800")}>
                                {invoice.customers?.name || invoice.invoice_to || "Unknown"}
                                
                                {/* 🚀 [수정] 툴팁 에러 해결: span 으로 감싸기 */}
                                {invoice.customers?.use_key && (
                                    <span title="Physical Key Required" className="flex shrink-0">
                                        <Key className="w-3.5 h-3.5 text-amber-500" />
                                    </span>
                                )}
                                
                                {isNewInDB && !isCompleted && (
                                    <Badge className="bg-amber-500 text-white text-[9px] h-4 px-1.5 hover:bg-amber-600">NEW</Badge>
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
    isOpen, onClose, driverName, driverId, invoices, startLocation, finalLocation, isGoogleLoaded, isRouteChanged 
}: { 
    isOpen: boolean, onClose: () => void, driverName: string, driverId?: string, invoices: Invoice[], startLocation: any, finalLocation: any, isGoogleLoaded: boolean, isRouteChanged: boolean 
}) {
    const supabase = createClient();
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const directionsRenderer = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const infoWindowRef = useRef<any>(null); 
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
            infoWindowRef.current = null;
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

            if (!infoWindowRef.current) {
                infoWindowRef.current = new window.google.maps.InfoWindow();
            }

            markersRef.current.forEach(m => m.setMap(null));
            markersRef.current = [];
            
            if (directionsRenderer.current) {
                directionsRenderer.current.setDirections({ routes: [] });
            }

            const finalOrigin = startLocation || DEFAULT_LOCATION;
            const finalDest = finalLocation || DEFAULT_LOCATION;

            const waypoints: any[] = [];
            const validInvoices: Invoice[] = [];
            
            invoices.forEach((inv, idx) => {
                const c = inv.customers;
                const lat = c.delivery_lat || c.lat;
                const lng = c.delivery_lng || c.lng;
                const addressStr = [c.delivery_address || c.address, c.suburb].filter(Boolean).join(", ").trim();

                if (lat && lng && lat !== 0 && lng !== 0) {
                    validInvoices.push(inv);
                    waypoints.push({ location: { lat, lng }, stopover: true });
                } else if (addressStr.length > 0) {
                    validInvoices.push(inv);
                    waypoints.push({ location: addressStr, stopover: true });
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
                    avoidTolls: true, 
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

                            validInvoices.forEach((inv, idx) => {
                                if (route.legs[idx]) {
                                    const isInvNew = inv.delivery_order === 0 || inv.delivery_order === null;
                                    let displayLabel = "N";
                                    
                                    if (isRouteChanged) {
                                        displayLabel = (idx + 1).toString();
                                    } else {
                                        if (!isInvNew) {
                                            let count = 0;
                                            for (let i = 0; i <= idx; i++) {
                                                if (validInvoices[i].delivery_order > 0) count++;
                                            }
                                            displayLabel = count.toString();
                                        }
                                    }

                                    const marker = new window.google.maps.Marker({
                                        position: route.legs[idx].end_location,
                                        map: mapInstance.current,
                                        label: { text: displayLabel, color: "white", fontWeight: "bold" },
                                        title: inv.customers?.name,
                                        opacity: inv.is_completed ? 0.5 : 1.0,
                                    });
                                    markersRef.current.push(marker);

                                    marker.addListener("click", () => {
                                        if (infoWindowRef.current) {
                                            const content = `
                                                <div style="padding: 2px 4px; font-family: sans-serif; max-width: 200px;">
                                                    <div style="font-weight: bold; font-size: 14px; color: #1e293b; margin-bottom: 2px;">
                                                        ${inv.customers?.name || "Unknown Customer"}
                                                    </div>
                                                    <div style="font-size: 11px; color: #64748b;">
                                                        Stop ${displayLabel} ${inv.is_completed ? '<span style="color:#10b981;font-weight:bold;">(Completed)</span>' : ''}
                                                    </div>
                                                </div>
                                            `;
                                            infoWindowRef.current.setContent(content);
                                            infoWindowRef.current.open(mapInstance.current, marker);
                                        }
                                    });
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

    }, [isOpen, isGoogleLoaded, invoices, startLocation, finalLocation, isRouteChanged]); 

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
            <DialogContent className="!max-w-[100vw] !w-screen !h-[100dvh] !m-0 !p-0 !rounded-none !border-none bg-white flex flex-col shadow-none select-none [&>button]:hidden">
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
                    <Button size="icon" variant="ghost" onClick={onClose} className="h-10 w-10 hover:bg-slate-200"><X className="w-5 h-5"/></Button>
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