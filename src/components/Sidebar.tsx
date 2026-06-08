"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/utils/supabase/client" 
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
  RefreshCw, 
  LogsIcon,
  UserX,
  FileClock,
  Megaphone,
  MessageCircle
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

  // ORDERS
  { name: "ORDERS", href: "/orders", icon: ClipboardList },

  // INVOICE
  { 
    name: "INVOICE", 
    icon: FileText,
    isSubmenu: true, 
    subItems: [
      { name: "TODAY", href: "/invoice/today", icon: FileClock },       
      { name: "INVOICE LIST", href: "/invoice", icon: List },       
      { name: "PAID", href: "/invoice/paid", icon: CheckCircle2 },  
      { name: "UNPAID", href: "/invoice/unpaid", icon: AlertCircle }, 
      { name: "AUTO INVOICE", href: "/invoice/auto-invoice", icon: RefreshCw }, 
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
      { name: "DELIVERY LOG", href: "/report/deliverylog", icon: LogsIcon },
      { name: "DORMANT REPORT", href: "/report/dormant", icon: UserX },

    ]
  },

  { name: "MESSAGES", href: "/messages", icon: MessageCircle },
  { name: "POSTS", href: "/posts", icon: Megaphone },
  { name: "STAFF", href: "/staff", icon: UserCircle },
  
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
  const supabase = createClient() 
  
  // 상태 관리
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  
  // 🚀 카운트 배지 상태들
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [pendingOrderCount, setPendingOrderCount] = useState(0) // 🚀 새 오더(Pending) 카운트

  useEffect(() => {
    // 1. 메시지 카운트 가져오기
    const fetchUnreadCount = async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true }) 
        .eq("sender_type", "customer")
        .eq("is_read", false)

      if (!error && count !== null) {
        setUnreadMsgCount(count)
      }
    }

    // 🚀 2. 새 주문(Pending) 카운트 가져오기
    const fetchPendingOrdersCount = async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true }) 
        .eq("status", "pending")

      if (!error && count !== null) {
        setPendingOrderCount(count)
      }
    }

    fetchUnreadCount()
    fetchPendingOrdersCount()

    // 3. 실시간 감시 채널 (메시지)
    const msgChannel = supabase
      .channel('admin-sidebar-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => fetchUnreadCount() 
      )
      .subscribe()

    // 🚀 4. 실시간 감시 채널 (오더)
    const orderChannel = supabase
      .channel('admin-sidebar-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchPendingOrdersCount() // 새 주문이 들어오거나 처리되면 바로 갱신!
      )
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(orderChannel)
    }
  }, [supabase])

  // 사이드바 접기/펴기
  const toggleSidebar = () => setIsCollapsed(prev => !prev)

  // 메뉴 펼치기/접기
  const toggleMenu = (name: string) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      setOpenMenus({ [name]: true })
    } else {
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
                
                {/* 아이콘 & 접혔을 때의 뱃지 영역 */}
                <div className="relative">
                  <item.icon className={cn(
                    "h-5 w-5 shrink-0 transition-colors",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-slate-900"
                  )} />
                  
                  {/* 사이드바가 접혀있을 때 아이콘 모서리에 띄우는 뱃지 (메시지) */}
                  {isCollapsed && item.name === "MESSAGES" && unreadMsgCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center bg-rose-500 text-white text-[9px] font-black rounded-full border border-white shadow-sm animate-in zoom-in">
                      {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                    </span>
                  )}

                  {/* 🚀 사이드바가 접혀있을 때 아이콘 모서리에 띄우는 뱃지 (오더) */}
                  {isCollapsed && item.name === "ORDERS" && pendingOrderCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center bg-amber-500 text-white text-[9px] font-black rounded-full border border-white shadow-sm animate-in zoom-in">
                      {pendingOrderCount > 99 ? '99+' : pendingOrderCount}
                    </span>
                  )}
                </div>

                {!isCollapsed && (
                  <span className="text-xs font-bold tracking-wide whitespace-nowrap animate-in fade-in slide-in-from-left-2 duration-200">
                    {item.name}
                  </span>
                )}
              </div>
              
              {/* 🚀 사이드바가 펼쳐져 있을 때 우측 끝에 띄우는 뱃지 모음 */}
              <div className="flex items-center">
                {!isCollapsed && item.name === "MESSAGES" && unreadMsgCount > 0 && (
                  <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center bg-rose-500 text-white text-[10px] font-black rounded-full shadow-sm ml-auto animate-in zoom-in">
                    {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                  </span>
                )}

                {/* 🚀 Orders 메뉴 전용 알람 뱃지 (Amber 컬러) */}
                {!isCollapsed && item.name === "ORDERS" && pendingOrderCount > 0 && (
                  <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center bg-amber-500 text-white text-[10px] font-black rounded-full shadow-sm ml-auto animate-in zoom-in">
                    {pendingOrderCount > 99 ? '99+' : pendingOrderCount}
                  </span>
                )}

                {/* 선택된 화살표 표시 (알람이 없는 메뉴이면서 Active 상태일 때만) */}
                {!isCollapsed && isActive && 
                 !(item.name === "MESSAGES" && unreadMsgCount > 0) && 
                 !(item.name === "ORDERS" && pendingOrderCount > 0) && (
                  <ChevronRight className="h-3 w-3 text-white opacity-80" />
                )}
              </div>
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