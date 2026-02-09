"use client"

import { usePathname } from "next/navigation"

export default function Breadcrumb() {
  const pathname = usePathname() // 현재 경로 (예: /customers)
  
  // 경로에서 첫 번째 단어를 추출하고 대문자로 변환
  // '/' 일 경우 'DASHBOARD'로 표시
  const segments = pathname.split('/').filter(Boolean)
  const currentPage = segments.length > 0 ? segments[segments.length - 1] : "DASHBOARD"

  return (
    <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest transition-all">
      Pages / <span className="text-slate-900">{currentPage.replace(/-/g, ' ')}</span>
    </h2>
  )
}