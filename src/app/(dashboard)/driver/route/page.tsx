"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';
import { Loader2, MapPin } from "lucide-react";

declare var google: any;

const LIBRARIES: ("places" | "geometry" | "drawing" | "visualization")[] = ["places"];

const getMelbourneDate = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
};

export default function DriverRoutePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [directionsResponse, setDirectionsResponse] = useState<any>(null);
  const [currentRun, setCurrentRun] = useState(1);
  const [returnAddress, setReturnAddress] = useState("");

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES
  });

  // ✅ 맵이 로드되면 데이터 가져오기 시작
  useEffect(() => {
    if (isLoaded) {
        fetchRouteData();
    }
  }, [isLoaded]);

  const fetchRouteData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // ---------------------------------------------------------
    // 1. 복귀 주소 (Return Address) 가져오기 - 우선순위 로직 수정됨
    // ---------------------------------------------------------
    let finalAddr = "";

    // 1순위: 로컬 스토리지 (방금 앱에서 선택한 값)
    const saved = localStorage.getItem("returnAddress");
    if (saved) {
        finalAddr = saved;
    } 
    
    // 2순위: 로컬에 없으면 드라이버 프로필 (DB)
    if (!finalAddr) {
        const { data: profile } = await supabase.from('profiles').select('address').eq('id', user.id).single();
        if (profile?.address) finalAddr = profile.address;
    }

    // 3순위: 프로필도 없으면 회사 주소 (DB)
    if (!finalAddr) {
        const { data: company } = await supabase
            .from('company_settings') // ✅ 복수형(settings)으로 수정됨
            .select('address_line1, address_line2, state, suburb, postcode')
            .maybeSingle();
        
        if (company) {
            const parts = [
                company.address_line1, 
                company.address_line2, 
                company.suburb, 
                company.state, 
                company.postcode
            ].filter(p => p && p.trim() !== "");
            finalAddr = parts.join(", ");
        }
    }

    // 최종 결정된 주소 설정
    if (finalAddr) setReturnAddress(finalAddr);

    // ---------------------------------------------------------
    // 2. 배송 데이터 가져오기
    // ---------------------------------------------------------
    const today = getMelbourneDate();
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, 
        invoice_to, 
        delivery_run, 
        is_completed, 
        delivery_order, 
        customers(delivery_address, delivery_suburb, delivery_state, delivery_postcode)
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
      // 주소 조합
      const items = data.map((item: any) => {
          const cust = Array.isArray(item.customers) ? item.customers[0] : item.customers;
          const fullAddress = cust 
            ? `${cust.delivery_address || ''}, ${cust.delivery_suburb || ''} ${cust.delivery_state || ''} ${cust.delivery_postcode || ''}`.trim()
            : "";
          // 쉼표 제거 등 포맷팅
          const cleanAddress = fullAddress.replace(/^, /, "").replace(/, $/, "");
          return { ...item, address: cleanAddress || "Unknown Address" };
      });

      // 1차(Run 1) 미완료 건이 있으면 1차, 다 했으면 2차
      const run1Pending = items.some((i: any) => i.delivery_run === 1 && !i.is_completed);
      const targetRun = run1Pending ? 1 : 2;
      setCurrentRun(targetRun);

      const targetItems = items.filter((i: any) => i.delivery_run === targetRun);
      
      if (targetItems.length > 0) {
          calculateRoute(targetItems, finalAddr);
      } else {
          setLoading(false); // 해당 Run에 배송 건 없음
      }
    } else {
        setLoading(false); // 오늘 배송 없음
    }
  };

  const calculateRoute = (items: any[], finalDest: string) => {
      // 구글 맵 로딩 체크
      if (!isLoaded || items.length === 0) {
          setLoading(false);
          return;
      }

      const directionsService = new google.maps.DirectionsService();
      
      const waypoints = items.map(item => ({
          location: item.address,
          stopover: true
      }));

      // 출발지: 현재 위치 (실패 시 첫 배송지)
      navigator.geolocation.getCurrentPosition((pos) => {
          const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          requestDirections(directionsService, origin, waypoints, finalDest);
      }, (err) => {
          console.warn("Geolocation failed", err);
          // 위치 권한 없으면 리스트 첫번째를 시작점으로
          requestDirections(directionsService, waypoints[0].location, waypoints.slice(1), finalDest);
      });
  };

  const requestDirections = (service: any, origin: any, waypoints: any[], finalDest: string) => {
      // 도착지가 없으면(설정 안됨) 마지막 배송지가 도착지가 됨
      const destination = finalDest || waypoints[waypoints.length -1].location;

      service.route({
          origin: origin,
          destination: destination,
          waypoints: waypoints, 
          optimizeWaypoints: false, // 보이는 순서 그대로
          travelMode: google.maps.TravelMode.DRIVING
      }, (result: any, status: any) => {
          if (status === google.maps.DirectionsStatus.OK) {
              setDirectionsResponse(result);
          } else {
              console.error("Maps Error:", status);
              // alert("Could not load route map."); // 필요시 주석 해제
          }
          setLoading(false); // 로딩 종료
      });
  }

  if (!isLoaded) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-8 h-8 text-slate-400" /></div>;

  return (
    <div className="h-[calc(100vh-130px)] w-full relative"> 
      {/* 상단 Run 정보 배지 */}
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
                  options={{ suppressMarkers: true }} 
              />
              
              {/* S: Start */}
              {directionsResponse.routes[0]?.legs[0]?.start_location && (
                  <Marker 
                    position={directionsResponse.routes[0].legs[0].start_location} 
                    label={{ text: "S", color: "white", fontWeight: "bold" }} 
                  />
              )}

              {/* 1, 2, 3... Stops */}
              {directionsResponse.routes[0]?.legs.slice(0, -1).map((leg: any, idx: number) => (
                  <Marker 
                    key={idx} 
                    position={leg.end_location} 
                    label={{ text: `${idx + 1}`, color: "white", fontWeight: "bold" }} 
                  />
              ))}

              {/* F: Finish */}
              <Marker 
                position={directionsResponse.routes[0].legs[directionsResponse.routes[0].legs.length - 1].end_location} 
                label={{ text: "F", color: "white", fontWeight: "bold" }} 
              />

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