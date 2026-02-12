"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  DollarSign, Truck, CreditCard, TrendingUp, Loader2, AlertCircle, FileText
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell
} from 'recharts';

// --- Chart Wrapper (유지) ---
const ChartWrapper = ({ height = 300, children }: { height?: number, children: (size: { width: number, height: number }) => React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      if (width > 0) setSize({ width, height });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [height]);

  return (
    <div ref={containerRef} style={{ width: '100%', height }} className="min-w-0">
      {size.width > 0 ? children(size) : (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      )}
    </div>
  );
};

// --- Helper: Date ---
const getMelbourneDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: "Australia/Melbourne", 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  };
  // 포맷을 YYYY-MM-DD로 맞추기 위한 로직
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState("");

  const [stats, setStats] = useState({
    todayRevenue: 0,
    overdueAmount: 0, 
    totalOutstanding: 0, 
    unpaidCount: 0,
    deliveryTotal: 0,
    deliveryCompleted: 0
  });

  const [monthlyChartData, setMonthlyChartData] = useState<any[]>([]);
  const [weeklyChartData, setWeeklyChartData] = useState<any[]>([]);

  useEffect(() => {
    setTodayDate(getMelbourneDate());
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = getMelbourneDate();
      
      // 🚀 핵심 변경: Promise.all로 4개의 요청을 병렬(동시) 실행
      // 1. 오늘 매출 & 배송
      // 2. 미납금 전체
      // 3. 월별 차트 데이터 (RPC 호출 - DB에서 계산됨)
      // 4. 주별 차트 데이터 (RPC 호출 - DB에서 계산됨)
      
      const [todayRes, unpaidRes, monthlyRes, weeklyRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('total_amount, is_completed')
          .eq('invoice_date', today),
        
        supabase
          .from('invoices')
          .select('total_amount, paid_amount, due_date')
          .neq('status', 'Paid'),

        supabase.rpc('get_monthly_revenue'), // SQL 함수 호출

        supabase.rpc('get_weekly_revenue')   // SQL 함수 호출
      ]);

      // --- 1. KPI 계산 (여전히 클라이언트에서 빠름) ---
      let todayRev = 0;
      let delTotal = 0;
      let delCompleted = 0;

      if (todayRes.data) {
        todayRes.data.forEach(inv => {
            todayRev += inv.total_amount;
            delTotal++;
            if (inv.is_completed) delCompleted++;
        });
      }

      let totalOut = 0;
      let overdueOut = 0;
      let unpaidCnt = 0;

      if (unpaidRes.data) {
          unpaidCnt = unpaidRes.data.length;
          unpaidRes.data.forEach(inv => {
              const remaining = inv.total_amount - (inv.paid_amount || 0);
              totalOut += remaining;
              
              if (inv.due_date && inv.due_date < today) {
                  overdueOut += remaining;
              }
          });
      }

      // --- 2. Chart 데이터 가공 (이제 루프 없이 매핑만 하면 됨) ---
      
      // 월별 차트 포맷팅
      const formattedMonthly = (monthlyRes.data || []).map((item: any) => {
          const [y, m] = item.period.split('-');
          // 로컬 타임존 이슈 방지를 위해 날짜 객체 생성 방식 조정
          const dateStr = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
          return {
              name: dateStr,
              total: item.total
          };
      });

      // 주별 차트 포맷팅 (데이터가 적으므로 바로 사용)
      const formattedWeekly = (weeklyRes.data || []).map((item: any) => ({
        name: item.period, // 필요시 포맷팅 변경 가능 (예: MM-DD)
        total: item.total
      }));

      // State 업데이트
      setMonthlyChartData(formattedMonthly);
      setWeeklyChartData(formattedWeekly);

      setStats({
        todayRevenue: todayRev,
        overdueAmount: overdueOut,
        totalOutstanding: totalOut,
        unpaidCount: unpaidCnt,
        deliveryTotal: delTotal,
        deliveryCompleted: delCompleted
      });

    } catch (e) {
      console.error("Dashboard Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
      return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="w-10 h-10 text-slate-300 animate-spin"/></div>;
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between space-y-2">
        <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
            <p className="text-slate-500">Overview for {todayDate}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/invoice/new">
            <Button className="bg-slate-900 hover:bg-slate-800 shadow-sm">
                <FileText className="mr-2 h-4 w-4" /> New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Today's Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">${stats.todayRevenue.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1 flex items-center">
               {stats.todayRevenue > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500 mr-1" /> : null}
               Daily Sales
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-red-50/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-red-700">Overdue Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">${stats.overdueAmount.toLocaleString()}</div>
            <p className="text-xs text-red-600/80 mt-1 font-medium">Past Due Date</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Outstanding</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">${stats.totalOutstanding.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">
                <span className="font-bold text-slate-700">{stats.unpaidCount}</span> invoices pending
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Today's Delivery</CardTitle>
            <Truck className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
                {stats.deliveryCompleted} / {stats.deliveryTotal}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mt-2">
                <div 
                    className="bg-purple-600 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${stats.deliveryTotal > 0 ? (stats.deliveryCompleted / stats.deliveryTotal) * 100 : 0}%` }}
                ></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        
        {/* Left Chart: 12 Month Revenue */}
        <Card className="col-span-4 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>12 Month Revenue</CardTitle>
            <CardDescription>Monthly revenue trend for the last year</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartWrapper height={300}>
              {({ width, height }) => (
                <BarChart width={width} height={height} data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `$${value/1000}k`} 
                  />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40}>
                    {monthlyChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === monthlyChartData.length - 1 ? '#2563eb' : '#93c5fd'} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartWrapper>
          </CardContent>
        </Card>

        {/* Right Chart: 8 Weeks Revenue */}
        <Card className="col-span-3 border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>8 Weeks Revenue</CardTitle>
            <CardDescription>Weekly sales performance</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartWrapper height={300}>
              {({ width, height }) => (
                <BarChart width={width} height={height} data={weeklyChartData} layout="vertical" margin={{ left: 0, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#64748b" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                    width={80} // 날짜가 잘리지 않도록 너비 조정
                  />
                  <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Revenue']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20}>
                    {weeklyChartData.map((entry, index) => (
                      <Cell key={`cell-w-${index}`} fill={index === weeklyChartData.length - 1 ? '#059669' : '#6ee7b7'} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartWrapper>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}