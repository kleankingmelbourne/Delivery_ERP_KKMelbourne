// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  // 접속하자마자 로그인 페이지로 강제 이동시킵니다.
  redirect("/login"); 
}