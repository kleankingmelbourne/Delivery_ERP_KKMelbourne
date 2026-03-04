"use client";

import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// 1. 담아둘 데이터의 모양(Type)을 정의합니다.
type AuthContextType = {
  user: any | null;
  profile: any | null;
  currentUserName: string;
  productUnits: any[];
  // ✅ [추가] 회사 위치 & 드라이버 본인 집 위치 전역 저장
  companyLocation: { lat: number; lng: number; address: string } | null;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ 
  children, 
  user, 
  profile,
  productUnits 
}: { 
  children: ReactNode; 
  user: any; 
  profile: any;
  productUnits: any[];
}) {
  const currentUserName = profile?.display_name || user?.email?.split('@')[0] || "Unknown";
  
  // ✅ 위치 상태 변수 2개 준비
  const [companyLocation, setCompanyLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);

  useEffect(() => {
    // 🚨 프로필이 있고, 드라이버 권한일 때만 좌표를 가져옴
    const isDriver = profile?.user_level?.toLowerCase() === 'driver' || profile?.role === 'driver';

    if (isDriver && user?.id) {
      const fetchLocations = async () => {
        const supabase = createClient();
        
        // 🚀 회사 설정과 기사 본인의 프로필에서 좌표를 동시에 가져옵니다. (0.1초 컷)
        const [compRes] = await Promise.all([
          supabase.from('company_settings').select('lat, lng, address_line1, address_line2, suburb, state, postcode').maybeSingle(),
        ]);

        // 1. 회사 좌표 저장
        if (compRes.data && compRes.data.lat && compRes.data.lng) {
          const fullAddress = [compRes.data.address_line1, compRes.data.address_line2, compRes.data.suburb, compRes.data.state, compRes.data.postcode]
            .filter(p => p && p.trim() !== "").join(", ");
          setCompanyLocation({ lat: compRes.data.lat, lng: compRes.data.lng, address: fullAddress });
        }
      };
      
      fetchLocations();
    }
  }, [profile, user]);

  return (
    <AuthContext.Provider value={{ user, profile, currentUserName, productUnits, companyLocation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}