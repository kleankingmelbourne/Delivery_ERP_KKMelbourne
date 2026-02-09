import { Construction } from "lucide-react";

export default function PostPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 animate-in fade-in zoom-in-95 duration-500">
      
      {/* 아이콘 */}
      <div className="bg-slate-50 p-6 rounded-full mb-6 shadow-sm border border-slate-100">
        <Construction className="w-16 h-16 text-slate-300" />
      </div>

      {/* 메인 텍스트 */}
      <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter uppercase opacity-10">
        Coming Soon
      </h1>

      {/* 서브 텍스트 */}
      <p className="mt-4 text-slate-500 font-medium text-lg">
        This feature is currently under construction.
      </p>
      
    </div>
  );
}