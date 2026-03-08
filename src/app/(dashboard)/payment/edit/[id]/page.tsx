import PaymentForm from "@/components/payment/PaymentForm";

export default async function EditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params; // 파라미터 언래핑
  
  return <PaymentForm paymentId={resolvedParams.id} />;
}