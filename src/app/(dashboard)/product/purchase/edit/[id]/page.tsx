import PurchaseOrderForm from "@/components/purchase-order/PurchaseOrderForm";

// 💡 1. async 추가, params를 Promise로 타입 지정
export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  
  // 💡 2. await로 파라미터 캡슐 열기
  const resolvedParams = await params;
  
  // 💡 3. 꺼낸 id를 orderId로 넘겨주면 "Edit 모드"로 동작합니다!
  return <PurchaseOrderForm orderId={resolvedParams.id} />; 
}