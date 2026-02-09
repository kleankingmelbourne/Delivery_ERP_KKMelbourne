"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function UpdatePasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. 유효성 검사
    if (password.length < 6) {
      toast({ title: "Invalid Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Mismatch", description: "Passwords do not match.", variant: "destructive" });
      return;
    }

    setLoading(true);

    // 2. Supabase 비밀번호 업데이트 호출
    // (재설정 링크를 타고 왔다면 이미 세션이 활성화된 상태입니다)
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
    } else {
      toast({ 
        title: "Success", 
        description: "Your password has been updated successfully." 
      });
      
      // 3. 성공 후 대시보드로 이동
      setTimeout(() => {
        router.push("/"); 
      }, 1000);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 bg-slate-100 p-3 rounded-full w-fit">
            <Lock className="w-6 h-6 text-slate-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
          <CardDescription>
            Please enter your new password below.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            
            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  id="password" 
                  type="password" 
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <CheckCircle2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  id="confirm-password" 
                  type="password" 
                  className="pl-9"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}