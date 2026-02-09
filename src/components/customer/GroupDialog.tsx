"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { X, Loader2, Check, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface GroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  groupData?: any; // 수정 모드일 때 데이터 받기
}

const COLORS = [
  { name: "blue", class: "bg-blue-100 text-blue-700 border-blue-200" },
  { name: "purple", class: "bg-purple-100 text-purple-700 border-purple-200" },
  { name: "green", class: "bg-green-100 text-green-700 border-green-200" },
  { name: "amber", class: "bg-amber-100 text-amber-700 border-amber-200" },
  { name: "red", class: "bg-red-100 text-red-700 border-red-200" },
  { name: "slate", class: "bg-slate-100 text-slate-700 border-slate-200" },
];

export default function GroupDialog({ isOpen, onClose, onSuccess, groupData }: GroupDialogProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");
  const [discountRate, setDiscountRate] = useState(""); 

  // 다이얼로그 열릴 때 초기화 또는 데이터 채우기
  useEffect(() => {
    if (isOpen) {
      if (groupData) {
        // [수정 모드]
        setName(groupData.name);
        setDescription(groupData.description || "");
        setSelectedColor(groupData.color || "blue");
        setDiscountRate(groupData.discount_rate || "");
      } else {
        // [생성 모드]
        setName("");
        setDescription("");
        setSelectedColor("blue");
        setDiscountRate("");
      }
    }
  }, [isOpen, groupData]);

  const handleSubmit = async () => {
    if (!name.trim()) return alert("Group Name is required.");
    
    setLoading(true);

    const payload = {
      name: name.trim(),
      description,
      color: selectedColor,
      discount_rate: discountRate ? Number(discountRate) : 0,
    };

    let error;

    if (groupData?.id) {
      // Update (수정)
      const { error: updateError } = await supabase
        .from("customer_groups")
        .update(payload)
        .eq("id", groupData.id);
      error = updateError;
    } else {
      // Insert (생성)
      const { error: insertError } = await supabase
        .from("customer_groups")
        .insert(payload);
      error = insertError;
    }

    setLoading(false);

    if (error) {
      if (error.code === '23505') alert("Group name already exists.");
      else alert("Error: " + error.message);
    } else {
      alert(groupData ? "Group updated!" : "Group created!");
      onSuccess();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        
        {/* 헤더 */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">
            {groupData ? "Edit Group" : "Create New Group"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6">
          
          {/* 그룹 이름 */}
          <div className="space-y-2">
            <Label>Group Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP, Wholesale" />
          </div>

          {/* 할인율 */}
          <div className="space-y-2">
            <Label>Default Discount Rate (%)</Label>
            <div className="relative">
              <Input 
                type="number" 
                value={discountRate} 
                onChange={(e) => setDiscountRate(e.target.value)} 
                placeholder="0" 
                className="pl-9"
              />
              <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-500">
              * Used for group-wide pricing rules.
            </p>
          </div>

          {/* 뱃지 색상 선택 */}
          <div className="space-y-2">
            <Label>Badge Color</Label>
            <div className="flex gap-3">
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedColor(c.name)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${c.class} ${selectedColor === c.name ? "ring-2 ring-offset-2 ring-slate-400 border-transparent scale-110" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {selectedColor === c.name && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." className="resize-none h-24" />
          </div>
        </div>

        {/* 푸터 버튼 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-slate-900 hover:bg-slate-800">
            {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : (groupData ? "Save Changes" : "Create Group")}
          </Button>
        </div>
      </div>
    </div>
  );
}