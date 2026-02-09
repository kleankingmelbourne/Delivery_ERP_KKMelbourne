"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { 
  Truck, 
  Map as MapIcon, 
  LogOut,
  Bell
} from "lucide-react";

interface DriverLayoutProps {
  children: ReactNode;
}

export default function DriverLayout({ children }: DriverLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  // 로그아웃 처리
  const handleLogout = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
      await supabase.auth.signOut();
      router.push("/login");
    }
  };

  // ✅ 하단 메뉴 설정 (2개로 간소화)
  const menus = [
    { 
      href: "/driver/route", // 👈 My Route 탭
      label: "My Route", 
      icon: MapIcon 
    },
    { 
      href: "/driver/delivery", // 👈 Deliveries 탭 (현재 화면)
      label: "Deliveries", 
      icon: Truck 
    },
  ];

  return (
    // h-[100dvh]: 모바일 브라우저 높이 이슈 대응
    <div className="flex flex-col h-[100dvh] bg-slate-50 relative">
      
      {/* 1. 상단 헤더 (Mobile Header) */}
      <header className="bg-slate-900 text-white px-4 h-14 flex items-center justify-between sticky top-0 z-30 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-emerald-400" />
          <h1 className="font-bold text-lg tracking-tight">Driver App</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-1">
            <Bell className="w-5 h-5 text-slate-300" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-slate-900"></span>
          </button>
          <button onClick={handleLogout} className="p-1">
            <LogOut className="w-5 h-5 text-slate-300 hover:text-white" />
          </button>
        </div>
      </header>

      {/* 2. 메인 컨텐츠 영역 */}
      {/* pb-[70px]: 하단 탭바 높이만큼 여백 확보 */}
      <main className="flex-1 overflow-y-auto pb-[70px] scrollbar-hide relative">
        {children}
      </main>

      {/* 3. 하단 탭바 (Bottom Navigation) */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 h-[65px] flex justify-around items-center z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] pb-1">
        {menus.map((menu) => {
          const Icon = menu.icon;
          // 현재 경로가 해당 메뉴의 경로를 포함하면 활성화
          const isActive = pathname.startsWith(menu.href);
          
          return (
            <Link 
              key={menu.href} 
              href={menu.href}
              className={`flex flex-col items-center justify-center w-full h-full active:scale-95 transition-all duration-200 ${
                isActive ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {/* 아이콘: 활성화시 배경색과 진한 아이콘 */}
              <div className={`p-1.5 rounded-2xl mb-1 transition-all duration-300 ${
                isActive ? "bg-slate-100 text-blue-600 translate-y-[-2px]" : "bg-transparent"
              }`}>
                <Icon className={`w-6 h-6 ${isActive ? "stroke-[2.5px] fill-blue-100/50" : "stroke-[2px]"}`} />
              </div>
              
              {/* 라벨 */}
              <span className={`text-[10px] font-bold tracking-wide transition-colors ${
                isActive ? "text-blue-600" : "text-slate-400"
              }`}>
                {menu.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}