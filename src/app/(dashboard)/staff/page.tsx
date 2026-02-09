"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Plus, Search, Trash2, Edit, Loader2, X, Shield, Phone, Mail, Lock, ChevronLeft, ChevronRight, MapPin, Eye, Send 
} from "lucide-react"; // [NEW] Send 아이콘 추가
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// [NEW] sendPasswordResetEmailAction 추가
import { deleteStaffAction, saveStaffAction, sendPasswordResetEmailAction } from "./actions";

// ... (USER_LEVELS, INITIAL_FORM_DATA 등 기존 코드 유지) ...
const USER_LEVELS = ["ADMIN", "MANAGER", "STAFF", "DRIVER"];

const INITIAL_FORM_DATA = {
  display_name: "",
  email: "",
  phone_number: "",
  address: "", 
  birth_date: "",
  user_level: "STAFF",
  login_permit: true,
  status: "active",
  password: "", 
};

export default function StaffPage() {
  // ... (기존 State들 유지) ...
  const supabase = createClient();
  const { toast } = useToast();

  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserLevel, setCurrentUserLevel] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<string>("10");

  const [isDeleting, setIsDeleting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // [NEW] 메일 발송 로딩 상태
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // ... (useEffect, fetchCurrentUser, fetchStaff, filteredStaff, paginatedStaff 등 기존 로직 유지) ...
  useEffect(() => {
    fetchStaff();
    fetchCurrentUser();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, itemsPerPage]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase.from('profiles').select('user_level').eq('id', user.id).single();
      if (data) setCurrentUserLevel(data.user_level);
    }
  };

  const fetchStaff = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (!error) setStaffList(data || []);
    setLoading(false);
  };

  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => 
      staff.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staff.phone_number?.includes(searchTerm)
    );
  }, [staffList, searchTerm]);

  const paginatedStaff = useMemo(() => {
    if (itemsPerPage === "all") return filteredStaff;
    const size = parseInt(itemsPerPage);
    const start = (currentPage - 1) * size;
    return filteredStaff.slice(start, start + size);
  }, [filteredStaff, currentPage, itemsPerPage]);

  const totalPages = itemsPerPage === "all" ? 1 : Math.ceil(filteredStaff.length / parseInt(itemsPerPage));

  // --- Handlers (Select, BulkDelete 등 기존 유지) ---
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(filteredStaff.map((s) => s.id)); else setSelectedIds([]);
  };
  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]); else setSelectedIds(prev => prev.filter(item => item !== id));
  };

  const handleBulkDelete = async () => {
    if (currentUserLevel !== 'ADMIN') return;
    if (!confirm(`Delete ${selectedIds.length} staff permanently?`)) return;
    setIsDeleting(true);
    const result = await deleteStaffAction(selectedIds);
    if (result.success) {
      toast({ title: "Deleted", description: "Staff deleted successfully." });
      await fetchStaff();
      setSelectedIds([]);
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setIsDeleting(false);
  };

  // [NEW] 비밀번호 재설정 메일 발송 핸들러
  const handleSendResetEmail = async () => {
    if (!formData.email) return;
    if (!confirm(`Send password reset email to ${formData.email}?`)) return;

    setIsSendingEmail(true);
    const result = await sendPasswordResetEmailAction(formData.email);
    
    if (result.success) {
      toast({ title: "Email Sent", description: result.message });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setIsSendingEmail(false);
  };

  const handleOpenModal = (staff: any = null) => {
    setEditingId(staff ? staff.id : null);
    setFormData(staff ? {
        display_name: staff.display_name || "",
        email: staff.email || "",
        phone_number: staff.phone_number || "",
        address: staff.address || "", 
        birth_date: staff.birth_date || "",
        user_level: staff.user_level || "STAFF",
        login_permit: staff.login_permit ?? true,
        status: staff.status || "active",
        password: "", 
    } : INITIAL_FORM_DATA);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.email || !formData.display_name) {
      alert("Name and Email are required."); return;
    }
    if ((!editingId || formData.password) && formData.password.length < 6) {
        alert("Password must be at least 6 characters."); return;
    }
    if (!editingId && !formData.password) {
      alert("Password is required for new staff."); return;
    }

    setIsSaving(true);
    const result = await saveStaffAction(formData, !!editingId, editingId || undefined);
    if (result.success) {
      toast({ title: "Success", description: result.message });
      setIsModalOpen(false);
      fetchStaff();
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const hasEditPermission = (targetId: string) => currentUserLevel === 'ADMIN' || currentUserId === targetId;
  const isReadOnly = editingId ? !hasEditPermission(editingId) : false;
  const isAdmin = currentUserLevel === 'ADMIN';

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Management</h1>
          <p className="text-sm text-slate-500">Manage your employees. (Admins can create/delete/manage permissions)</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && isAdmin && (
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete ({selectedIds.length})
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => handleOpenModal(null)} className="bg-slate-900 hover:bg-slate-800 shadow-md">
              <Plus className="w-4 h-4 mr-2" /> Add Staff
            </Button>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap font-medium">Rows:</span>
            <Select value={itemsPerPage} onValueChange={(val) => setItemsPerPage(val)}>
                <SelectTrigger className="h-9 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
            </Select>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Search..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        {selectedIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="text-slate-500"><X className="w-4 h-4 mr-2" /> Clear Selection</Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
            <tr>
              <th className="px-4 py-4 w-10 text-center">
                {isAdmin && <Checkbox checked={filteredStaff.length > 0 && selectedIds.length === filteredStaff.length} onCheckedChange={(c) => handleSelectAll(!!c)} />}
              </th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Level</th>
              <th className="px-6 py-4 text-center">Login</th>
              <th className="px-6 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="p-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
            ) : (
              paginatedStaff.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4 text-center">
                    {isAdmin && <Checkbox checked={selectedIds.includes(staff.id)} onCheckedChange={(c) => handleSelectRow(staff.id, !!c)} />}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={staff.status === 'active' ? 'default' : 'secondary'} className={staff.status === 'active' ? "bg-emerald-500 hover:bg-emerald-600" : ""}>{staff.status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-bold text-slate-900">{staff.display_name} {currentUserId === staff.id && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50">Me</Badge>}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600 mb-1"><Mail className="w-3 h-3"/> {staff.email}</div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs"><Phone className="w-3 h-3"/> {staff.phone_number || "-"}</div>
                  </td>
                  <td className="px-6 py-4"><div className="flex items-center gap-1 font-medium text-slate-700"><Shield className="w-3.5 h-3.5 text-slate-400" /> {staff.user_level}</div></td>
                  <td className="px-6 py-4 text-center">
                    <div className={`inline-flex w-2.5 h-2.5 rounded-full ${staff.login_permit ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenModal(staff)}>
                        {hasEditPermission(staff.id) ? (
                             <Edit className="w-4 h-4 text-slate-500 hover:text-slate-900"/>
                        ) : (
                             <Eye className="w-4 h-4 text-slate-400 hover:text-blue-600"/>
                        )}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <div className="flex items-center justify-end px-4 py-3 bg-white border-t border-slate-100">
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 mr-2">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="w-4 h-4" /></Button>
            </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? (isReadOnly ? "View Staff Profile" : "Edit Staff Profile") : "Create New Staff"}</DialogTitle>
            <DialogDescription>
              {editingId 
                ? (isReadOnly ? "You are viewing staff details. (Read-Only)" : "Update details.") 
                : "Create a new staff account."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Name</Label>
              <Input className="col-span-3" value={formData.display_name} onChange={(e) => setFormData({...formData, display_name: e.target.value})} disabled={isReadOnly}/>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Email</Label>
              <Input className="col-span-3" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} disabled={isReadOnly || (!!editingId && !isAdmin)} />
            </div>
            
            {/* Password Section */}
            {!isReadOnly && (
                <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Password</Label>
                <div className="col-span-3 space-y-2">
                    {/* 비밀번호 입력창 */}
                    <div className="relative">
                        <Input 
                            type="password" 
                            placeholder={editingId ? "Enter new password to change" : "Required"}
                            value={formData.password} 
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                        />
                        <Lock className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                    </div>
                    
                    {/* [NEW] 메일 발송 버튼 및 안내 문구 */}
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400 ml-1 flex items-center gap-1">
                            * Min 6 chars required
                        </p>
                        {editingId && isAdmin && (
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-6 text-[10px] px-2 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={handleSendResetEmail}
                                disabled={isSendingEmail}
                            >
                                {isSendingEmail ? <Loader2 className="w-3 h-3 animate-spin"/> : <Send className="w-3 h-3"/>}
                                Send Reset Email
                            </Button>
                        )}
                    </div>
                </div>
                </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Mobile</Label>
              <Input className="col-span-3" value={formData.phone_number} onChange={(e) => setFormData({...formData, phone_number: e.target.value})} disabled={isReadOnly}/>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Date of Birth</Label>
              <Input className="col-span-3" type="date" value={formData.birth_date} onChange={(e) => setFormData({...formData, birth_date: e.target.value})} disabled={isReadOnly}/>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Address</Label>
              <Input className="col-span-3" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="Full address" disabled={isReadOnly}/>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Level</Label>
              <div className="col-span-3">
                <Select value={formData.user_level} onValueChange={(val) => setFormData({...formData, user_level: val})} disabled={isReadOnly || !isAdmin}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select level" /></SelectTrigger>
                  <SelectContent>{USER_LEVELS.map(level => (<SelectItem key={level} value={level}>{level}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Login</Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch id="login-mode" checked={formData.login_permit} onCheckedChange={(checked) => setFormData({...formData, login_permit: checked})} disabled={isReadOnly || !isAdmin}/>
                <Label htmlFor="login-mode" className="text-slate-500 font-normal">{formData.login_permit ? "Allowed" : "Blocked"}</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                {isReadOnly ? "Close" : "Cancel"}
            </Button>
            {!isReadOnly && (
                <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null} 
                {editingId ? "Save Changes" : "Create Staff"}
                </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}