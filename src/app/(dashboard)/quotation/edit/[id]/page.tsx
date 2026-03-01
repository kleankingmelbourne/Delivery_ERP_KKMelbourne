import QuotationForm from "@/components/quotation/QuotationForm";

// 💡 1. 함수 앞에 async를 붙이고, params의 타입을 Promise로 바꿉니다.
export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  
  // 💡 2. await를 사용해 캡슐(Promise)을 까서 실제 id 값을 꺼냅니다.
  const resolvedParams = await params;
  
  // 💡 3. 꺼낸 id를 폼에 전달합니다!
  return <QuotationForm quotationId={resolvedParams.id} />; 
}