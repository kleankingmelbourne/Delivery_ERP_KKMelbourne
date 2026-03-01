import QuotationForm from "@/components/quotation/QuotationForm"; // 💡 저장하신 경로에 맞게 맞춰주세요.

export default function NewQuotationPage() {
  // 💡 quotationId 속성을 안 주면 폼 내부에서 알아서 "New 모드"로 동작합니다!
  return <QuotationForm />; 
}