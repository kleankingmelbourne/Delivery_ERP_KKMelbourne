// src/components/providers/AuthProvider.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";

// 1. 담아둘 데이터의 모양(Type)을 정의합니다.
type AuthContextType = {
  user: any | null;
  profile: any | null;
  currentUserName: string;
  productUnits: any[];
};

// 2. 빈 그릇(Context)을 만듭니다.
const AuthContext = createContext<AuthContextType | null>(null);

// 3. 데이터를 채워서 하위 컴포넌트들에 뿌려주는 공급자(Provider) 컴포넌트입니다.
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
  // 이름 계산 로직을 여기서 한 번만 처리해 둡니다.
  const currentUserName = profile?.display_name || user?.email?.split('@')[0] || "Unknown";

  return (
    <AuthContext.Provider value={{ user, profile, currentUserName, productUnits }}>
      {children}
    </AuthContext.Provider>
  );
}

// 4. 어디서든 쉽게 꺼내 쓸 수 있도록 도와주는 커스텀 훅입니다.
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}