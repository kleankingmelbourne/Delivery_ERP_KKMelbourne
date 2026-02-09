import { redirect } from "next/navigation";

export default function PaymentPage() {
  // /payment 로 접속하면 자동으로 /payment/list 로 이동
  redirect("/payment/list");
}