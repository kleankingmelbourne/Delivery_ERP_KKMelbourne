"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Image from "next/image"; // [NEW] 이미지 컴포넌트 추가
import { Loader2, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // 비밀번호 재설정용 State
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetSending, setIsResetSending] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({ 
        title: "Login Failed", 
        description: error.message, 
        variant: "destructive" 
      });
      setLoading(false);
    } else {
      toast({ title: "Login Successful", description: "Welcome back!" });
      router.push("/");
      router.refresh();
    }
  };

  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      toast({ title: "Error", description: "Please enter your email address.", variant: "destructive" });
      return;
    }

    setIsResetSending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "Email Sent", 
        description: "Check your inbox for the password reset link." 
      });
      setIsResetOpen(false);
      setResetEmail("");
    }

    setIsResetSending(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        {/* [UPDATE] flex-col items-center로 중앙 정렬 추가 */}
        <CardHeader className="space-y-1 flex flex-col items-center">
          
          {/* [NEW] 회사 로고 추가 */}
          <div className="relative w-96 h-32 mb-2"> 
            {/* 너비(w-48)와 높이(h-16)는 로고 비율에 맞춰 조절하세요 */}
            <Image
              src="/images/logo.png"
              alt="Company Logo"
              fill
              className="object-contain"
              priority
            />
          </div>

          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@example.com" 
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Button 
                    variant="link" 
                    className="p-0 h-auto text-xs text-blue-600 hover:text-blue-800"
                    type="button"
                    onClick={() => {
                        setResetEmail(email);
                        setIsResetOpen(true);
                    }}
                >
                    Forgot password?
                </Button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input 
                  id="password" 
                  type="password" 
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Reset Dialog */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input 
                id="reset-email" 
                type="email" 
                placeholder="name@example.com" 
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetOpen(false)}>Cancel</Button>
            <Button onClick={handleSendResetEmail} disabled={isResetSending} className="bg-slate-900">
              {isResetSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send Reset Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}