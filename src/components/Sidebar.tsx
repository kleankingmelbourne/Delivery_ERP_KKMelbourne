"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  CreditCard, 
  FileSearch, 
  FileSpreadsheet, 
  Package, 
  BarChart3, 
  UserCircle, 
  ClipboardList, 
  Settings,
  ChevronRight,
  List, Tag, Factory, ShoppingCart, ChevronDown,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Plus,
  PanelLeftClose, 
  PanelLeft,
  Truck,           
  MapPin,         
  Navigation,     
  TrendingUp,     
  Banknote,       
  Receipt,
  RefreshCw 
} from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"

// --- 메뉴 구성 데이터 ---
const menuItems = [
  { name: "DASHBOARD", href: "/", icon: LayoutDashboard },
  
  // CUSTOMER
  { 
    name: "CUSTOMER", 
    icon: Users,
    isSubmenu: true, 
    subItems: [
      { name: "CUSTOMER LIST", href: "/customer/list", icon: List },       
      { name: "CUSTOMER GROUP", href: "/customer/group", icon: Users }, 
    ]
  },

  // INVOICE
  { 
    name: "INVOICE", 
    icon: FileText,
    isSubmenu: true, 
    subItems: [
      { name: "INVOICE LIST", href: "/invoice", icon: List },       
      { name: "PAID", href: "/invoice/paid", icon: CheckCircle2 },  
      { name: "UNPAID", href: "/invoice/unpaid", icon: AlertCircle }, 
    ]
  },

  // PAYMENT
  { 
    name: "PAYMENT", 
    icon: CreditCard,
    isSubmenu: true, 
    subItems: [
      { name: "PAYMENT LIST", href: "/payment/list", icon: List },       
      { name: "CREDIT LIST", href: "/payment/credit", icon: Wallet },  
      { name: "RECEIVE PAYMENT", href: "/payment/new", icon: Plus }, 
    ]
  },

  // STATEMENT
  { 
    name: "STATEMENT", 
    icon: FileSearch,
    isSubmenu: true, 
    subItems: [
      { name: "STATEMENT LIST", href: "/statement/list", icon: List },
      { name: "AUTO STATEMENT", href: "/statement/auto", icon: RefreshCw },
    ]
  },

  { name: "QUOTATION", href: "/quotation", icon: FileSpreadsheet },

  // PRODUCT
  { 
    name: 'PRODUCT', 
    icon: Package, 
    isSubmenu: true, 
    subItems: [
      { name: 'PRODUCT LIST', href: '/product/list', icon: List },
      { name: 'CATEGORY LIST', href: '/product/categories', icon: Tag },
      { name: 'VENDOR LIST', href: '/product/vendors', icon: Factory },
      { name: 'PURCHASE ORDER', href: '/product/purchase', icon: ShoppingCart },
    ] 
  },

  // DELIVERY
  {
    name: "DELIVERY",
    icon: Truck,
    isSubmenu: true,
    subItems: [
      { name: "SET DELIVERY", href: "/delivery/set", icon: MapPin },
      { name: "DELIVERY ROUTE", href: "/delivery/route", icon: Navigation },
    ]
  },

  // REPORT
  { 
    name: "REPORT", 
    icon: BarChart3,
    isSubmenu: true,
    subItems: [
      { name: "SALES REPORT", href: "/report/sales", icon: TrendingUp },
      { name: "PAYMENT REPORT", href: "/report/payment", icon: Receipt },
      { name: "OUTSTANDING", href: "/report/outstanding", icon: Banknote },
    ]
  },

  { name: "STAFF", href: "/staff", icon: UserCircle },
  { name: "POST", href: "/post", icon: ClipboardList },
  
  // SETTING
  { 
    name: "SETTING", 
    icon: Settings, 
    isSubmenu: true, 
    subItems: [
      { name: "INFO SETTING", href: "/setting/info", icon: Settings },
      { name: "SALES INCHARGE", href: "/setting/sales", icon: UserCircle },
      { name: "DELIVERY INCHAGE", href: "/setting/delivery", icon: Truck },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  
  // 상태 관리
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})

  // 사이드바 접기/펴기
  const toggleSidebar = () => setIsCollapsed(prev => !prev)

  // 메뉴 펼치기/접기 (수정된 로직)
  const toggleMenu = (name: string) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      // 사이드바가 접혀있다가 펴질 때는 해당 메뉴만 엽니다.
      setOpenMenus({ [name]: true })
    } else {
      // 기존 상태(...prev)를 복사하지 않고, 클릭한 메뉴의 상태만 새로 설정합니다.
      // 이렇게 하면 클릭한 메뉴 외의 다른 메뉴들은 모두 닫히게 됩니다(undefined/false).
      setOpenMenus(prev => ({ [name]: !prev[name] }))
    }
  }

  return (
    <aside 
      className={cn(
        "bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 transition-all duration-300 ease-in-out z-50 shadow-sm",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* 1. 로고 및 헤더 영역 */}
      <div className={cn(
        "flex flex-col border-b border-slate-100 transition-all bg-slate-50/50",
        isCollapsed ? "items-center py-4 gap-4" : "items-center py-6 px-4 relative"
      )}>
        
        {/* 접기/펴기 버튼 */}
        <button 
          onClick={toggleSidebar}
          className={cn(
            "p-1.5 rounded-md text-slate-400 hover:bg-white hover:text-slate-900 transition-colors shadow-sm border border-transparent hover:border-slate-200",
            !isCollapsed && "absolute top-2 right-2"
          )}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>

        {/* 로고 이미지 */}
        <div className={cn("transition-all duration-300", isCollapsed ? "w-10 h-10" : "w-40 h-auto")}>
            <Image
                src="/images/logo.png"
                alt="Klean King Logo"
                width={isCollapsed ? 40 : 150} 
                height={isCollapsed ? 40 : 120} 
                className="rounded-lg object-contain mx-auto w-auto h-auto"
                priority 
            />
        </div>
      </div>

      {/* 2. 메뉴 리스트 영역 */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar overflow-x-hidden">
        
        {menuItems.map((item) => {
          const isSubmenuOpen = openMenus[item.name]
          const hasSubItems = item.isSubmenu && item.subItems
          const isActive = hasSubItems 
            ? item.subItems?.some(sub => pathname === sub.href)
            : pathname === item.href

          if (hasSubItems) {
            return (
              <div key={item.name} className="space-y-1">
                <button
                  suppressHydrationWarning
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                      "w-full flex items-center p-2.5 rounded-lg transition-all duration-200 group relative",
                      isCollapsed ? "justify-center" : "justify-between",
                    isActive 
                      ? "bg-slate-50 text-slate-900 font-bold" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                    <div className="flex items-center gap-3"> 
                      <item.icon className={cn(
                        "h-5 w-5 shrink-0 transition-colors", 
                        isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-900"
                      )} />
                      
                      {!isCollapsed && (
                        <span className="text-xs font-bold tracking-wide whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
                          {item.name}
                        </span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform font-bold shrink-0 text-slate-400", 
                        isSubmenuOpen ? "rotate-180" : ""
                      )} />
                    )}
                </button>

                {/* 서브메뉴 */}
                {!isCollapsed && isSubmenuOpen && (
                  <div className="ml-4 space-y-1 animate-in fade-in slide-in-from-top-1 border-l border-slate-200 pl-3 my-1">
                    {item.subItems?.map((sub) => (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        className={cn(
                          "flex items-center p-2 rounded-md text-[11px] font-medium transition-colors",
                          pathname === sub.href 
                            ? "bg-slate-900 text-white shadow-sm" 
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        )}
                      >
                        <sub.icon className={cn("w-3.5 h-3.5 mr-2 shrink-0", pathname === sub.href ? "text-blue-200" : "text-slate-400")} />
                        <span className="truncate">{sub.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          // 일반 메뉴
          return (
            <Link
              key={item.name}
              href={item.href || '#'}
              className={cn(
                "flex items-center p-2.5 rounded-lg transition-all duration-200 group relative",
                isCollapsed ? "justify-center" : "justify-between",
                isActive 
                  ? "bg-slate-900 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive ? "text-white" : "text-slate-400 group-hover:text-slate-900"
                )} />
                {!isCollapsed && (
                  <span className="text-xs font-bold tracking-wide whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
                    {item.name}
                  </span>
                )}
              </div>
              {!isCollapsed && isActive && <ChevronRight className="h-3 w-3 text-slate-400" />}
            </Link>
          )
        })}
      </nav>

      {/* 3. 하단 푸터 */}
      <div className="p-4 border-t border-slate-100 bg-white">
        {!isCollapsed ? (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">System Online</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
             <span className="relative flex h-2.5 w-2.5" title="System Online">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
          </div>
        )}
      </div>
    </aside>
  )
}