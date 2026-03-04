"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker, TrafficLayer } from '@react-google-maps/api';
import { Loader2, MapPin } from "lucide-react"; // 사용하지 않는 Flag, Home 아이콘 제거
import { useAuth } from "@/components/providers/AuthProvider";

const LIBRARIES: ("places" | "geometry" | "routes")[] = ["places", "geometry", "routes"];

const getMelbourneDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: "Australia/Melbourne", year: 'numeric', month: '2-digit', day: '2-digit' 
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options); 
  return formatter.format(now);
};

export default function DriverRoutePage() {
  const supabase = createClient();
  const { user, companyLocation } = useAuth() as any; 
  
  const [loading, setLoading] = useState(true);
  const [currentRun, setCurrentRun] = useState(1);
  const [dbProfile, setDbProfile] = useState<any>(null);
  
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  const getPointLocation = useCallback((type: string, customText: string, profile: any) => {
    if (type === 'company') {
      return companyLocation?.lat && companyLocation?.lng 
        ? { lat: companyLocation.lat, lng: companyLocation.lng } 
        : companyLocation?.address;
    }
    if (type === 'driver') {
      return profile?.lat && profile?.lng 
        ? { lat: profile.lat, lng: profile.lng } 
        : profile?.address;
    }
    return customText;
  }, [companyLocation]);

  const fetchRouteData = useCallback(async () => {
    if (!user || !window.google) return;
    setLoading(true);

    try {
      const { data: profile } = await supabase.from('profiles').select('address, lat, lng, route_prefs').eq('id', user.id).single();
      setDbProfile(profile);

      const prefs = profile?.route_prefs || {};
      let startPoint = getPointLocation(prefs.startPointType || 'company', prefs.customStartAddr, profile);
      let finalPoint = getPointLocation(prefs.finalDestType || 'company', prefs.customFinalAddr, profile);

      const today = getMelbourneDate();
      const { data: invoices } = await supabase
        .from('invoices')
        .select(`id, delivery_run, is_completed, delivery_order, customers(lat, lng, delivery_address, delivery_suburb, delivery_lat, delivery_lng)`)
        .eq('invoice_date', today)
        .eq('driver_id', user.id)
        .neq('delivery_run', 0)
        .order('delivery_order', { ascending: true });

      if (!invoices || invoices.length === 0) {
        setLoading(false);
        return;
      }

      const run1Pending = invoices.some((i: any) => i.delivery_run === 1 && !i.is_completed);
      const targetRun = run1Pending ? 1 : 2;
      setCurrentRun(targetRun);

      const targetItems = invoices.filter((i: any) => i.delivery_run === targetRun);
      
      const allDeliveryStops = targetItems.map((item: any) => {
        const cust = Array.isArray(item.customers) ? item.customers[0] : item.customers;
        const lat = cust?.delivery_lat || cust?.lat;
        const lng = cust?.delivery_lng || cust?.lng;
        
        const location = (lat && lng && lat !== 0) 
            ? { lat, lng } 
            : `${cust?.delivery_address || ''}, ${cust?.delivery_suburb || ''}`;
        
        return { location, stopover: true };
      });

      if (allDeliveryStops.length === 0) { setLoading(false); return; }

      let routeOrigin = startPoint || allDeliveryStops[0].location;
      let routeDestination = finalPoint || allDeliveryStops[allDeliveryStops.length - 1].location;
      let routeWaypoints = [...allDeliveryStops];

      if (!startPoint) routeWaypoints.shift();
      if (!finalPoint && routeWaypoints.length > 0) routeWaypoints.pop();

      const ds = new google.maps.DirectionsService();
      ds.route({
        origin: routeOrigin,
        destination: routeDestination,
        waypoints: routeWaypoints,
        optimizeWaypoints: false, 
        travelMode: google.maps.TravelMode.DRIVING
      }, (result, status) => {
        if (status === 'OK') {
            setDirectionsResponse(result);
        } else {
            console.error("Directions request failed due to " + status);
        }
        setLoading(false);
      });

    } catch (error) {
      console.error("Route calculation error:", error);
      setLoading(false);
    }
  }, [user, supabase, getPointLocation]);

  useEffect(() => {
    if (isLoaded && user) {
      fetchRouteData();
    }
  }, [isLoaded, user, fetchRouteData]);

  if (!isLoaded) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-slate-400" /></div>;

  return (
    <div className="h-[calc(100vh-65px)] w-full relative flex flex-col">
      {/* 🚨 상단 요약 바(Start, Final, Run) 완전히 삭제됨 */}

      <div className="flex-1 relative">
        {directionsResponse ? (
          <GoogleMap
            center={{ lat: -37.8136, lng: 144.9631 }}
            zoom={11}
            mapContainerStyle={{ width: '100%', height: '100%' }}
            options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
          >
            <TrafficLayer />
            
            <DirectionsRenderer 
              directions={directionsResponse} 
              options={{ suppressMarkers: true, preserveViewport: false }} 
            />
            
            {/* S: Start Marker */}
            {directionsResponse.routes[0]?.legs[0]?.start_location && (
              <Marker 
                position={directionsResponse.routes[0].legs[0].start_location} 
                label={{ text: "S", color: "white", fontWeight: "bold" }} 
              />
            )}

            {/* Stops & F: Finish Markers */}
            {directionsResponse.routes[0]?.legs.map((leg: any, idx: number) => {
              const isLastLeg = idx === directionsResponse.routes[0].legs.length - 1;
              const hasFinalPrefs = !!dbProfile?.route_prefs?.finalDestType;

              return (
                <Marker 
                  key={idx} 
                  position={leg.end_location} 
                  label={{ 
                    text: (isLastLeg && hasFinalPrefs) ? "F" : `${idx + 1}`, 
                    color: "white", 
                    fontWeight: "bold" 
                  }} 
                />
              );
            })}
          </GoogleMap>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50 p-6 text-center">
            {loading ? (
              <>
                <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                <span className="text-sm font-medium">Drawing your optimized route...</span>
              </>
            ) : (
              <>
                <MapPin className="w-10 h-10 mb-2 opacity-20" />
                <span className="text-sm font-medium leading-relaxed">
                  No active deliveries found for today.<br/>Please check your delivery list.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}