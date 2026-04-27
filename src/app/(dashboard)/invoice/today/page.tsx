"use client";

import React, { useEffect } from "react";

import InvoiceTable from "@/components/invoice/InvoiceTable"; // 기존 인보이스 테이블 파일 경로

export default function TodayInvoicePage() {
  // 💡 Today 메뉴를 클릭해서 들어올 때마다, 예전 검색 기록을 지우고 
  // 무조건 '오늘 날짜'로 초기화해서 보여주도록 세션을 날려줍니다.
  useEffect(() => {
    sessionStorage.removeItem("invoiceFilters_TODAY");
  }, []);

  return (
    <div className="animate-in fade-in duration-500">
      <InvoiceTable 
        filterStatus="TODAY" 
        title="Today's All Invoices" 
      />
    </div>
  );
}