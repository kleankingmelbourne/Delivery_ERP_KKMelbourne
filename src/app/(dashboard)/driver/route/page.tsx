"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker, TrafficLayer } from '@react-google-maps/api';
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
  
  // 복귀 장소가 실제로 존재하는지 여부 확인
  const [hasReturnDest, setHasReturnDest] = useState(false);

  // Google Maps API 로드
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  // 주소를 좌표로 변환하는 헬퍼 함수
  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
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
  }, []);

  // 실제 경로 요청 함수
  const requestDirections = useCallback((
    origin: google.maps.LatLngLiteral, 
    allWaypoints: google.maps.DirectionsWaypoint[], 
    returnDest: { lat: number; lng: number } | null
  ) => {
    if (!window.google) return;
    const directionsService = new window.google.maps.DirectionsService();

    let destination: google.maps.LatLngLiteral | string;
    let finalWaypoints: google.maps.DirectionsWaypoint[] = [];

    if (returnDest) {
      // ✅ [Case A] 복귀 장소 있음 -> 도착지를 복귀지로 설정
      destination = returnDest;
      finalWaypoints = allWaypoints; 
    } else {
      // [Case B] 복귀 장소 없음 -> 마지막 배송지가 도착지
      if (allWaypoints.length > 0) {
        const lastStop = allWaypoints[allWaypoints.length - 1];
        destination = lastStop.location as google.maps.LatLngLiteral;
        finalWaypoints = allWaypoints.slice(0, -1);
      } else {
        setLoading(false);
        return;
      }
    }

    directionsService.route({
      origin: origin,
      destination: destination,
      waypoints: finalWaypoints,
      optimizeWaypoints: false, // 이미 드라이버 화면에서 순서가 정해졌으므로 false
      travelMode: window.google.maps.TravelMode.DRIVING
    }, (result: any, status: any) => {
      if (status === window.google.maps.DirectionsStatus.OK) {
        setDirectionsResponse(result);
      }
      setLoading(false);
    });
  }, []);

  const fetchRouteData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // 1. 복귀 주소 (Return Address) 확인 및 좌표 변환
    let finalAddr = localStorage.getItem("returnAddress") || "";
    
    if (!finalAddr) {
      const { data: profile } = await supabase.from('profiles').select('address').eq('id', user.id).single();
      if (profile?.address) finalAddr = profile.address;
    }

    if (!finalAddr) {
      const { data: company } = await supabase.from('company_settings').select('address_line1, address_line2, state, suburb, postcode').maybeSingle();
      if (company) {
        finalAddr = [company.address_line1, company.address_line2, company.suburb, company.state, company.postcode].filter(p => p && p.trim() !== "").join(", ");
      }
    }

    let returnCoords: { lat: number; lng: number } | null = null;
    if (finalAddr) {
      returnCoords = await geocodeAddress(finalAddr);
    }
    setHasReturnDest(!!returnCoords);

    // 2. 배송 데이터 가져오기
    const today = getMelbourneDate();
    const { data, error } = await supabase
      .from('invoices')
      .select(`id, invoice_to, delivery_run, is_completed, delivery_order, customers(lat, lng, delivery_address, delivery_suburb, delivery_lat, delivery_lng)`)
      .eq('invoice_date', today)
      .eq('driver_id', user.id)
      .neq('delivery_run', 0)
      .order('delivery_order', { ascending: true });

    if (error || !data || data.length === 0) {
      setLoading(false);
      return;
    }

    // 3. 현재 작업 중인 Run 결정 (Run 1에 미완료가 있으면 1, 없으면 2)
    const run1Pending = data.some((i: any) => i.delivery_run === 1 && !i.is_completed);
    const targetRun = run1Pending ? 1 : 2;
    setCurrentRun(targetRun);

    const targetItems = data.filter((i: any) => i.delivery_run === targetRun);
    if (targetItems.length === 0) { setLoading(false); return; }

    // 4. 경유지(Waypoints) 조립
    const waypoints: google.maps.DirectionsWaypoint[] = [];
    const validLocations: google.maps.LatLngLiteral[] = [];

    targetItems.forEach((item: any) => {
      const cust = Array.isArray(item.customers) ? item.customers[0] : item.customers;
      if (!cust) return;

      const lat = cust.delivery_lat || cust.lat;
      const lng = cust.delivery_lng || cust.lng;

      if (lat && lng && lat !== 0 && lng !== 0) {
        const location = { lat, lng };
        waypoints.push({ location, stopover: true });
        validLocations.push(location);
      } else {
        // 좌표가 없으면 주소 텍스트로라도 추가 시도
        const addrText = `${cust.delivery_address || ''}, ${cust.delivery_suburb || ''}`.trim();
        if (addrText && addrText !== ",") {
          waypoints.push({ location: addrText, stopover: true });
        }
      }
    });

    if (waypoints.length === 0) { setLoading(false); return; }

    // 5. 출발지(Origin) 결정 및 경로 요청
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            requestDirections(origin, waypoints, returnCoords);
        },
        () => {
            // GPS 실패 혹은 타임아웃 시 즉시 첫 번째 배송지를 출발지로 사용
            const origin = typeof waypoints[0].location === 'string' 
            ? waypoints[0].location 
            : (waypoints[0].location as google.maps.LatLngLiteral);
            requestDirections(origin as any, waypoints.slice(1), returnCoords);
        },
        { 
            enableHighAccuracy: false, // 정확도를 낮추면 더 빨리 신호를 잡습니다.
            timeout: 2000,             // 2초만 기다리고 안 되면 바로 포기!
            maximumAge: 30000          // 30초 이내에 잡았던 위치 기록이 있다면 재사용
        }
    );
  }, [supabase, geocodeAddress, requestDirections]);

  useEffect(() => {
    if (isLoaded) {
      fetchRouteData();
    }
  }, [isLoaded, fetchRouteData]);

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
        {/* ✅ 실시간 교통 상황 레이어 추가 */}
        <TrafficLayer />
          <DirectionsRenderer 
            directions={directionsResponse} 
            options={{ suppressMarkers: true, preserveViewport: false }} 
          />
          
          {/* S: Start */}
          {directionsResponse.routes[0]?.legs[0]?.start_location && (
            <Marker 
              position={directionsResponse.routes[0].legs[0].start_location} 
              label={{ text: "S", color: "white", fontWeight: "bold" }} 
            />
          )}

          {/* Stops & F: Finish */}
          {directionsResponse.routes[0]?.legs.map((leg: any, idx: number) => {
            const isLastLeg = idx === directionsResponse.routes[0].legs.length - 1;
            
            // 복귀지가 있으면 마지막은 F, 없으면 마지막 배송지도 숫자
            let labelText = `${idx + 1}`;
            if (hasReturnDest && isLastLeg) {
              labelText = "F";
            }

            return (
              <Marker 
                key={idx} 
                position={leg.end_location} 
                label={{ text: labelText, color: "white", fontWeight: "bold" }} 
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