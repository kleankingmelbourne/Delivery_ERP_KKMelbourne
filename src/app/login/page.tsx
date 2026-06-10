"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
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

function LoginContent() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams(); 

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [authError, setAuthError] = useState(""); 

  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetSending, setIsResetSending] = useState(false);

  const [resetStep, setStep] = useState<1 | 2>(1); // 1: 이메일 입력, 2: OTP 및 새 비밀번호 입력
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // 미들웨어에서 튕겨져 나왔을 경우의 방어 로직
  useEffect(() => {
    const handleUnauthorizedUser = async () => {
      const errorParam = searchParams.get("error");
      if (errorParam === "unauthorized") {
        await supabase.auth.signOut();
        setAuthError("Unauthorized access. Customers are not allowed to access the admin portal.");
        // 에러를 띄운 후, URL의 '?error=unauthorized' 꼬리표를 지워 무한 루프를 방지합니다.
        router.replace('/login');
      }
    };
    
    handleUnauthorizedUser();
  }, [searchParams, supabase.auth, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(""); 

    // 1. 로그인 시도
    const { data, error } = await supabase.auth.signInWithPassword({
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
      return;
    }

    // 🚀 [핵심 해결책: 입구 컷!] 
    // 로그인은 성공했지만, 화면을 넘기기 전에 신분증(Role)을 먼저 검사합니다!
    const userRole = data?.user?.user_metadata?.role?.toLowerCase();

    if (userRole === "customer") {
      // customer면 "Welcome" 안 띄우고 즉시 강제 로그아웃!
      await supabase.auth.signOut();
      toast({ title: "Login Failed", description: "Invalid Login Email !!!", variant: "destructive" });
      setLoading(false);
      return; // 여기서 함수를 끝내버려서 라우팅(화면 이동)을 막습니다.
    }

    // 2. customer가 아니면 정상적으로 입장!
    toast({ title: "Login Successful", description: "Welcome back!" });
    router.push("/");
    router.refresh();
  };

  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      toast({ title: "Error", description: "Please enter your email address.", variant: "destructive" });
      return;
    }

    setIsResetSending(true);

    // redirectTo 링크 방식 대신 OTP가 발송되도록 파라미터 축소
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ 
        title: "OTP Sent", 
        description: "Please check your email for the 8-digit OTP." 
      });
      // 성공하면 2단계(OTP 입력 화면)로 이동
      setStep(2); 
    }

    setIsResetSending(false);
  };

  const handleVerifyAndUpdatePassword = async () => {
    if (otp.length !== 8 || !newPassword) {
      toast({ title: "Error", description: "Please enter a valid 8-digit OTP and a new password.", variant: "destructive" });
      return;
    }

    setIsVerifying(true);

    // 1. OTP 번호가 맞는지 검증 (type은 반드시 'recovery'여야 합니다)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: resetEmail,
      token: otp,
      type: "recovery",
    });

    if (verifyError) {
      toast({ title: "Verification Failed", description: verifyError.message, variant: "destructive" });
      setIsVerifying(false);
      return;
    }

    // 2. 검증에 성공하면 즉시 비밀번호 업데이트
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      toast({ title: "Update Failed", description: updateError.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Password has been successfully reset!" });
      // 모든 것을 초기화하고 팝업 닫기
      setIsResetOpen(false);
      setStep(1);
      setOtp("");
      setNewPassword("");
      setResetEmail("");
    }
    
    setIsVerifying(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 flex flex-col items-center">
          
          <div className="relative w-96 h-32 mb-2"> 
            <Image
              src="/images/logo.png"
              alt="Company Logo"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
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
          {authError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm font-bold rounded-lg text-center shadow-sm animate-in fade-in duration-300">
              {authError}
            </div>
          )}

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

      <Dialog 
        open={isResetOpen} 
        onOpenChange={(open) => {
          setIsResetOpen(open);
          if (!open) setStep(1); // 창 닫을 때 1단계로 초기화
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              {resetStep === 1 
                ? "Enter your email address to receive an 8-digit OTP."
                : "Enter the 8-digit OTP sent to your email and your new password."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {resetStep === 1 ? (
              // [1단계] 이메일 입력 화면
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
            ) : (
              // [2단계] OTP 및 새 비밀번호 입력 화면
              <>
                <div className="grid gap-2">
                  <Label htmlFor="otp">8-Digit OTP</Label>
                  <Input 
                    id="otp" 
                    type="text" 
                    maxLength={8}
                    placeholder="12345678" 
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input 
                    id="new-password" 
                    type="password" 
                    placeholder="Enter new password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetOpen(false)}>Cancel</Button>
            
            {resetStep === 1 ? (
              <Button onClick={handleSendResetEmail} disabled={isResetSending} className="bg-slate-900">
                {isResetSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Send OTP"}
              </Button>
            ) : (
              <Button onClick={handleVerifyAndUpdatePassword} disabled={isVerifying} className="bg-slate-900">
                {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-slate-400 w-8 h-8" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}