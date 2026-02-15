"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import Script from "next/script"; 
import { 
  Calendar as CalendarIcon, Truck, Map as MapIcon, Navigation, 
  MapPin, CheckCircle2, User, Loader2, MapPin as WarehouseIcon, Radio,
  Box, X, Circle, FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
}

interface DriverRouteInfo {
    driverId: string;
    driverName: string;
    run: number; // 1 or 2
    count: number;
    completedCount: number;
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

declare global {
  interface Window {
    google: any;
  }
}

export default function DeliveryRoutePage() {
  const supabase = createClient();
  const [isMounted, setIsMounted] = useState(false);

  // State
  const [selectedDate, setSelectedDate] = useState(getMelbourneDate());
  const [routeList, setRouteList] = useState<DriverRouteInfo[]>([]);
  
  // Selected Route Key (Format: "driverId_run")
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Map
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false); // Google API 로드 상태 관리
  const [warehouseLocation, setWarehouseLocation] = useState(DEFAULT_LOCATION);
  const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Detail Dialog State
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => { 
      setIsMounted(true); 
      // [FIX] 컴포넌트 마운트 시 이미 google 객체가 있는지 확인
      if (window.google && window.google.maps) {
          setIsGoogleLoaded(true);
      }
  }, []);

  // Get User Location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => setWarehouseLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => console.warn("Location access denied, using default.")
      );
    }
  }, []);

  // 1. Fetch Drivers & Runs (Grouped)
  const fetchRoutes = async () => {
    setLoading(true);
    try {
        const { data, error } = await supabase
            .from("invoices")
            .select(`
                driver_id, delivery_run, is_completed,
                profiles:driver_id ( display_name )
            `)
            .eq("invoice_date", selectedDate)
            .neq("status", "Paid")
            .is("is_pickup", false) 
            .not("driver_id", "is", null);

        if (error) throw error;

        const groups: Record<string, DriverRouteInfo> = {};

        data?.forEach((item: any) => {
            const dId = item.driver_id;
            const dName = item.profiles?.display_name || "Unknown";
            const run = (item.delivery_run === 0 || item.delivery_run === null) ? 1 : item.delivery_run;
            
            const key = `${dId}_${run}`;

            if (!groups[key]) {
                groups[key] = {
                    driverId: dId,
                    driverName: dName,
                    run: run,
                    count: 0,
                    completedCount: 0
                };
            }
            groups[key].count += 1;
            if (item.is_completed) groups[key].completedCount += 1;
        });

        const sortedRoutes = Object.values(groups).sort((a, b) => {
            const nameCompare = a.driverName.localeCompare(b.driverName);
            if (nameCompare !== 0) return nameCompare;
            return a.run - b.run;
        });

        setRouteList(sortedRoutes);

        if (sortedRoutes.length > 0) {
            if (!selectedRouteKey || !groups[selectedRouteKey]) {
                setSelectedRouteKey(`${sortedRoutes[0].driverId}_${sortedRoutes[0].run}`);
            }
        } else {
            setSelectedRouteKey(null);
            setInvoices([]);
        }

    } catch (e) {
        console.error("Fetch Routes Error:", e);
    } finally {
        setLoading(false);
    }
  };

  // 2. Fetch Invoices for Selected Route (Sorted by delivery_order)
  const fetchInvoices = async () => {
      if (!selectedRouteKey) return;
      
      const [driverId, runStr] = selectedRouteKey.split('_');
      const run = parseInt(runStr);

      setLoading(true);
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
      }
      setLoading(false);
  };

  const handleInvoiceClick = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailOpen(true);
    setLoadingItems(true);

    const { data, error } = await supabase
        .from('invoice_items')
        .select('id, description, quantity, unit')
        .eq('invoice_id', invoice.id);

    if (!error && data) {
        setInvoiceItems(data);
    } else {
        setInvoiceItems([]);
    }
    setLoadingItems(false);
  };

  useEffect(() => { fetchRoutes(); }, [selectedDate]);
  useEffect(() => { fetchInvoices(); }, [selectedRouteKey]);

  useEffect(() => {
    const channel = supabase.channel('route_view_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `invoice_date=eq.${selectedDate}` }, () => {
            console.log("Change detected, refreshing...");
            fetchRoutes();
            if (selectedRouteKey) fetchInvoices(); 
        })
        .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, selectedRouteKey]);


  if (!isMounted) return null;

  const currentRouteInfo = routeList.find(r => `${r.driverId}_${r.run}` === selectedRouteKey);

  return (
    <>
    <Script 
        src={`https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places,geometry&loading=async`}
        strategy="afterInteractive"
        onLoad={() => {
            // [FIX] onLoad 이벤트에서도 상태 업데이트 (onReady 대신 onLoad 사용 권장)
            setIsGoogleLoaded(true);
            console.log("Google Maps API Loaded via Script");
        }}
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
                          <span className={cn("font-bold text-sm truncate", isSelected ? "text-emerald-900" : "text-slate-700")}>
                              {route.driverName}
                          </span>
                          {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className={cn("text-[9px] px-1.5 h-4 rounded-sm font-normal", route.run === 2 ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500")}>
                              {route.run === 1 ? "1st Run" : "2nd Run"}
                          </Badge>
                          <span className="text-[10px] text-slate-400 font-medium">
                              {route.completedCount} / {route.count}
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
              <div className="flex items-center justify-between mb-4">
                 <div>
                     <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                         {currentRouteInfo.driverName}
                         <span className={cn("text-xs px-2 py-0.5 rounded-full border", currentRouteInfo.run === 2 ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>
                             {currentRouteInfo.run === 1 ? "1st Run" : "2nd Run"}
                         </span>
                     </h2>
                     <p className="text-xs text-slate-500 mt-1">Sorted by driver's saved sequence</p>
                 </div>
                 <div className="text-right">
                     <div className="text-2xl font-black text-slate-800">{invoices.length}</div>
                     <div className="text-[10px] text-slate-400 uppercase font-bold">Stops</div>
                 </div>
              </div>

              <div className="space-y-3 pb-20">
                {invoices.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                        <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No invoices in this route.</p>
                    </div>
                )}
                {invoices.map((invoice, index) => {
                  const isCompleted = invoice.is_completed;
                  return (
                    <Card key={invoice.id} onClick={() => handleInvoiceClick(invoice)} className={cn("border shadow-sm transition-all cursor-pointer hover:shadow-md hover:border-slate-300 active:scale-[0.99]", isCompleted ? "bg-slate-50/80 border-slate-200" : "bg-white border-slate-200")}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-4">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 shadow-sm border", isCompleted ? "bg-slate-200 text-slate-500 border-slate-300" : "bg-white text-slate-700 border-slate-200")}>
                              {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : (index + 1)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={cn("font-bold text-sm truncate", isCompleted ? "text-slate-400 line-through" : "text-slate-800")}>
                                        {invoice.customers?.name || invoice.invoice_to || "Unknown"}
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
                })}
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
        <DialogContent className="max-w-md bg-white">
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
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3">Item</th>
                                <th className="px-4 py-3 text-center">Unit</th>
                                <th className="px-4 py-3 text-right">Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {invoiceItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-3 font-medium text-slate-700">{item.description}</td>
                                    <td className="px-4 py-3 text-center text-slate-500 text-xs">{item.unit || '-'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-900">{item.quantity}</td>
                                </tr>
                            ))}
                            {invoiceItems.length === 0 && (
                                <tr><td colSpan={3} className="p-6 text-center text-slate-400 text-xs">No items found in this invoice.</td></tr>
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

    {/* Map Dialog Component */}
    <RouteMapDialog 
        isOpen={isMapOpen} 
        onClose={() => setIsMapOpen(false)} 
        driverName={currentRouteInfo?.driverName || "Driver"}
        driverId={currentRouteInfo?.driverId} 
        invoices={invoices}
        warehouseLocation={warehouseLocation}
        isGoogleLoaded={isGoogleLoaded}
    />
    </>
  );
}

// 4. Map Dialog Component (Coordinate-based Routing & Driver Tracking with Validation)
function RouteMapDialog({ 
    isOpen, onClose, driverName, driverId, invoices, warehouseLocation, isGoogleLoaded 
}: { 
    isOpen: boolean, onClose: () => void, driverName: string, driverId?: string, invoices: Invoice[], warehouseLocation: any, isGoogleLoaded: boolean 
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

    // 1. [초기화 로직] 다이얼로그가 닫히면 지도 객체를 '반드시' 삭제 (Reset)
    useEffect(() => {
        if (!isOpen) {
            mapInstance.current = null;
            directionsRenderer.current = null;
            markersRef.current = [];
            driverMarkerRef.current = null;
        }
    }, [isOpen]);

    // 2. 드라이버 위치 구독
    useEffect(() => {
        if (!isOpen || !driverId) return;

        const fetchInitialLocation = async () => {
             const { data } = await supabase.from('driver_locations').select('lat, lng').eq('driver_id', driverId).maybeSingle();
             if (data && isValidLocation(data)) {
                 setDriverLocation({ lat: data.lat, lng: data.lng });
             } else {
                 setDriverLocation(null);
             }
        };
        fetchInitialLocation();

        const channel = supabase.channel(`tracking_${driverId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, (payload: any) => {
                const newLoc = payload.new;
                if (newLoc && isValidLocation(newLoc)) {
                    setDriverLocation({ lat: newLoc.lat, lng: newLoc.lng });
                } else {
                    setDriverLocation(null);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [isOpen, driverId]);

    // 3. 지도 및 경로 그리기 (타이밍 이슈 해결)
    useEffect(() => {
        if (!isOpen || !isGoogleLoaded || !window.google || !window.google.maps) return;

        // [핵심 수정] 다이얼로그가 열리고 DOM(div)이 생성될 때까지 0.1초 기다림
        const timer = setTimeout(() => {
            if (!mapRef.current) return; // 아직 div가 없으면 중단

            // 3-1. 지도 객체 생성 (없을 때만 새로 만듦)
            if (!mapInstance.current) {
                mapInstance.current = new window.google.maps.Map(mapRef.current, {
                    center: warehouseLocation,
                    zoom: 12,
                    disableDefaultUI: false,
                    streetViewControl: false,
                });
                directionsRenderer.current = new window.google.maps.DirectionsRenderer({
                    map: mapInstance.current,
                    suppressMarkers: true, 
                    preserveViewport: false,
                });
            }

            // 3-2. 마커 및 경로 초기화 (지도가 이미 있어도 내용은 다시 그림)
            markersRef.current.forEach(m => m.setMap(null));
            markersRef.current = [];
            
            // directionsRenderer가 혹시 null일 수 있으므로 체크
            if (directionsRenderer.current) {
                directionsRenderer.current.setDirections({ routes: [] });
            }

            const waypoints: any[] = [];
            invoices.forEach((inv, idx) => {
                const c = inv.customers;
                const lat = c.delivery_lat || c.lat;
                const lng = c.delivery_lng || c.lng;

                if (lat && lng && lat !== 0 && lng !== 0) {
                    const location = { lat, lng };
                    const marker = new window.google.maps.Marker({
                        position: location,
                        map: mapInstance.current,
                        label: { text: `${idx + 1}`, color: "white", fontWeight: "bold" },
                        title: c.name,
                        opacity: inv.is_completed ? 0.5 : 1.0,
                    });
                    markersRef.current.push(marker);
                    waypoints.push({ location: location, stopover: true });
                }
            });

            // 3-3. 경로 요청
            if (waypoints.length > 0) {
                if (waypoints.length > 23) {
                     const bounds = new window.google.maps.LatLngBounds();
                     waypoints.forEach(wp => bounds.extend(wp.location));
                     bounds.extend(warehouseLocation);
                     if (mapInstance.current) mapInstance.current.fitBounds(bounds);
                } else {
                    const ds = new window.google.maps.DirectionsService();
                    ds.route({
                        origin: warehouseLocation,
                        destination: warehouseLocation, 
                        // @ts-ignore
                        waypoints: waypoints,
                        travelMode: window.google.maps.TravelMode.DRIVING,
                        optimizeWaypoints: false 
                    }, (res: any, status: any) => {
                        if (status === 'OK') {
                            if (directionsRenderer.current) directionsRenderer.current.setDirections(res);
                        } else {
                            console.error("Directions Request failed:", status);
                        }
                    });
                }
            } else {
                if (mapInstance.current) {
                    mapInstance.current.setCenter(warehouseLocation);
                    mapInstance.current.setZoom(12);
                }
            }
        }, 100); // 0.1초 지연 실행

        return () => clearTimeout(timer); // 클린업

    }, [isOpen, isGoogleLoaded, invoices, warehouseLocation]); 

    // 4. 드라이버 마커 업데이트
    useEffect(() => {
        // 지도가 아직 안 만들어졌으면(null) 실행 안 함
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
                    fillColor: "#10b981", 
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: "#ffffff",
                    scale: 1.5,
                    anchor: new window.google.maps.Point(12, 12),
                },
                zIndex: 1000,
                title: driverName,
            });
        } else {
            // [중요] 지도가 재성성되었다면 마커도 새 지도에 다시 붙여야 함
            if (driverMarkerRef.current.getMap() !== mapInstance.current) {
                driverMarkerRef.current.setMap(mapInstance.current);
            }
            driverMarkerRef.current.setPosition(driverLocation);
        }
    }, [driverLocation, isOpen]); // isOpen이 바뀌어서 지도가 새로 그려지면 마커도 다시 그려야 함

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-white">
                <DialogHeader className="p-4 border-b bg-slate-50 shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <Navigation className="w-5 h-5 text-indigo-600"/>
                        Tracking: <span className="text-indigo-900">{driverName}</span>
                        {driverLocation && (
                            <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-600 border-emerald-200 animate-pulse">Live</Badge>
                        )}
                    </DialogTitle>
                    <DialogDescription className="hidden">
                        Real-time delivery route map for {driverName}
                    </DialogDescription>
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