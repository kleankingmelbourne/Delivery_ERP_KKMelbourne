import PurchaseOrderForm from "@/components/purchase-order/PurchaseOrderForm"; 

export default function NewPurchaseOrderPage() {
  // 💡 orderId를 넘겨주지 않으면 알아서 "New 모드"로 동작합니다!
  return <PurchaseOrderForm />; 
}