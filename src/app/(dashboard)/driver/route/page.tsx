"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { Loader2, MapPin } from "lucide-react";

// [중요] 라이브러리 배열 상수화 (재렌더링 방지)
const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

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
  const [loading, setLoading] = useState(true);
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [currentRun, setCurrentRun] = useState(1);
  const [debugMsg, setDebugMsg] = useState(""); // 디버깅용 메시지

  // Google Maps API 로드
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script', // 다른 페이지와 ID 통일
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  useEffect(() => {
    if (isLoaded) {
        fetchRouteData();
    }
  }, [isLoaded]);

  // 주소를 좌표로 변환
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
      if (!window.google || !window.google.maps) return null;
      const geocoder = new window.google.maps.Geocoder();
      return new Promise((resolve) => {
          geocoder.geocode({ address: address }, (results: any, status: any) => {
              if (status === 'OK' && results[0]) {
                  resolve({
                      lat: results[0].geometry.location.lat(),
                      lng: results[0].geometry.location.lng()
                  });
              } else {
                  console.warn(`Geocoding failed for "${address}": ${status}`);
                  resolve(null);
              }
          });
      });
  };

  const fetchRouteData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // ---------------------------------------------------------
    // 1. 복귀 주소 (Return Address) 확인
    // ---------------------------------------------------------
    let finalAddr = "";
    
    // 1순위: 로컬 스토리지
    const saved = localStorage.getItem("returnAddress");
    if (saved) finalAddr = saved;
    
    // 2순위: 프로필
    if (!finalAddr) {
        const { data: profile } = await supabase.from('profiles').select('address').eq('id', user.id).single();
        if (profile?.address) finalAddr = profile.address;
    }

    // 3순위: 회사 설정
    if (!finalAddr) {
        const { data: company } = await supabase
            .from('company_settings')
            .select('address_line1, address_line2, state, suburb, postcode')
            .maybeSingle();
        
        if (company) {
            const parts = [
                company.address_line1, company.address_line2, company.suburb, company.state, company.postcode
            ].filter(p => p && p.trim() !== "");
            finalAddr = parts.join(", ");
        }
    }

    // 좌표 변환
    let returnCoords: { lat: number; lng: number } | null = null;
    if (finalAddr) {
        returnCoords = await geocodeAddress(finalAddr);
        console.log("📍 Final Destination Found:", finalAddr, returnCoords);
    } else {
        console.log("⚠️ No Final Destination found. Route will end at last delivery.");
    }

    // ---------------------------------------------------------
    // 2. 배송 데이터 (좌표 포함)
    // ---------------------------------------------------------
    const today = getMelbourneDate();
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_to, delivery_run, is_completed, delivery_order, 
        customers(lat, lng, delivery_lat, delivery_lng)
      `)
      .eq('invoice_date', today)
      .eq('driver_id', user.id)
      .neq('delivery_run', 0)
      .order('delivery_order', { ascending: true });

    if (error) {
        console.error("Route Fetch Error:", error);
        setLoading(false);
        return;
    }

    if (data && data.length > 0) {
      const run1Pending = data.some((i: any) => i.delivery_run === 1 && !i.is_completed);
      const targetRun = run1Pending ? 1 : 2;
      setCurrentRun(targetRun);

      const targetItems = data.filter((i: any) => i.delivery_run === targetRun);
      
      if (targetItems.length > 0) {
          calculateRoute(targetItems, returnCoords);
      } else {
          setLoading(false);
      }
    } else {
        setLoading(false);
    }
  };

  const calculateRoute = (items: any[], returnDest: { lat: number; lng: number } | null) => {
      if (!isLoaded || !window.google) return;

      // 1. 배송지 Waypoints 생성
      const waypoints: google.maps.DirectionsWaypoint[] = [];
      const validLocations: { lat: number; lng: number }[] = [];

      items.forEach((item: any) => {
          const cust = Array.isArray(item.customers) ? item.customers[0] : item.customers;
          if (!cust) return;

          const lat = cust.delivery_lat || cust.lat;
          const lng = cust.delivery_lng || cust.lng;

          if (lat && lng && lat !== 0 && lng !== 0) {
              const location = { lat, lng };
              waypoints.push({ location, stopover: true });
              validLocations.push(location);
          }
      });

      if (waypoints.length === 0) {
          setLoading(false);
          return;
      }

      // 2. 출발지 설정 및 경로 요청
      navigator.geolocation.getCurrentPosition((pos) => {
          const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          requestDirections(origin, waypoints, returnDest);
      }, (err) => {
          console.warn("Geolocation failed, using first stop as start", err);
          if (validLocations.length > 0) {
              // 위치 권한 없으면 첫 배송지에서 시작 (Waypoints 목록에서 첫 번째 제거)
              const newOrigin = validLocations[0];
              const newWaypoints = waypoints.slice(1);
              requestDirections(newOrigin, newWaypoints, returnDest);
          } else {
              setLoading(false);
          }
      });
  };

  // ✅ [핵심 수정] 도착지 및 경유지 설정 로직 강화
  const requestDirections = (
      origin: google.maps.LatLngLiteral, 
      allWaypoints: google.maps.DirectionsWaypoint[], 
      returnDest: { lat: number; lng: number } | null
  ) => {
      const directionsService = new window.google.maps.DirectionsService();

      let destination: google.maps.LatLngLiteral | undefined;
      let finalWaypoints: google.maps.DirectionsWaypoint[] = [];

      if (returnDest) {
          // [CASE A] 복귀 주소가 있는 경우 (창고로 복귀)
          // Waypoints: 모든 배송지 (순서대로)
          // Destination: 복귀 주소
          destination = returnDest;
          finalWaypoints = allWaypoints; 
          console.log("🚗 Route Mode: Return to Base");
      } else {
          // [CASE B] 복귀 주소가 없는 경우 (마지막 배송지에서 종료)
          // Waypoints: 마지막 배송지를 제외한 나머지
          // Destination: 마지막 배송지
          if (allWaypoints.length > 0) {
              const lastStop = allWaypoints[allWaypoints.length - 1];
              destination = lastStop.location as google.maps.LatLngLiteral;
              finalWaypoints = allWaypoints.slice(0, -1);
          }
          console.log("🚛 Route Mode: One-way Trip (No Return Address)");
      }

      if (!destination) {
          console.error("Destination undefined");
          setLoading(false);
          return;
      }

      directionsService.route({
          origin: origin,
          destination: destination,
          waypoints: finalWaypoints,
          optimizeWaypoints: false, // 배송 순서 유지
          travelMode: window.google.maps.TravelMode.DRIVING
      }, (result: any, status: any) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
              setDirectionsResponse(result);
          } else {
              console.error("Maps Directions Error:", status);
          }
          setLoading(false);
      });
  }

  if (!isLoaded) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-slate-400" /></div>;

  return (
    <div className="h-[calc(100vh-130px)] w-full relative"> 
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md text-sm font-bold text-slate-800 border border-slate-200">
          Route for {currentRun === 1 ? "1st Run" : "2nd Run"}
      </div>

      {directionsResponse ? (
          <GoogleMap
              center={{ lat: -37.8136, lng: 144.9631 }}
              zoom={10}
              mapContainerStyle={{ width: '100%', height: '100%' }}
              options={{ zoomControl: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
          >
              <DirectionsRenderer 
                  directions={directionsResponse} 
                  options={{ 
                      suppressMarkers: true, 
                      preserveViewport: false 
                  }} 
              />
              
              {/* S: Start */}
              {directionsResponse.routes[0]?.legs[0]?.start_location && (
                  <Marker 
                    position={directionsResponse.routes[0].legs[0].start_location} 
                    label={{ text: "S", color: "white", fontWeight: "bold" }} 
                  />
              )}

              {/* 1, 2, 3... Stops (경유지 & 도착지) */}
              {directionsResponse.routes[0]?.legs.map((leg: any, idx: number) => {
                  const isLastLeg = idx === directionsResponse.routes[0].legs.length - 1;
                  
                  // 마지막 지점(도착지) -> F (Final)
                  if (isLastLeg) {
                      return (
                          <Marker 
                            key="final"
                            position={leg.end_location} 
                            label={{ text: "F", color: "white", fontWeight: "bold" }} 
                          />
                      );
                  }

                  // 중간 경유지들 -> 숫자
                  return (
                      <Marker 
                        key={idx} 
                        position={leg.end_location} 
                        label={{ text: `${idx + 1}`, color: "white", fontWeight: "bold" }} 
                      />
                  );
              })}
          </GoogleMap>
      ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50">
              {loading ? (
                  <>
                    <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                    <span className="text-sm font-medium">Calculating route...</span>
                  </>
              ) : (
                  <>
                    <MapPin className="w-10 h-10 mb-2 opacity-20" />
                    <span className="text-sm font-medium">No active route found.</span>
                  </>
              )}
          </div>
      )}
    </div>
  );
}