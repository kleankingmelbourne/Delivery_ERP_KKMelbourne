"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Megaphone, Plus, Calendar, Clock, Loader2, Trash2, Edit, ImagePlus
} from "lucide-react"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

// 🚀 TypeScript의 깐깐한 문법 검사를 이 줄에서만 무시하도록 설정합니다.
// @ts-ignore
import 'react-quill-new/dist/quill.snow.css'; 
import dynamic from 'next/dynamic';
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export default function AdminPostsPage() {
  const supabase = createClient();
  const { toast } = useToast();

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // 🚀 에디터 상단 메뉴(툴바) 설정: 글자크기, 색상, 형광펜 등
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      [{ 'size': ['small', false, 'large', 'huge'] }], // 글자 크기
      ['bold', 'italic', 'underline', 'strike'],       // 굵기, 기울임, 밑줄, 취소선
      [{ 'color': [] }, { 'background': [] }],         // 🎨 글자색 & 형광펜(배경색)
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],    // 번호 매기기, 점 매기기
      ['clean']                                        // 서식 지우기
    ],
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setPosts(data);
    setLoading(false);
  };

  const handleEditClick = (post: any) => {
    setEditingId(post.id);
    setTitle(post.title);
    setContent(post.content);
    setIsPublished(post.is_published);
    setStartDate(post.start_date || "");
    setEndDate(post.end_date || "");
    setIsModalOpen(true);
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    // 에디터가 비어있으면 '<p><br></p>' 값이 들어가므로 예외처리
    if (!title || !content || content === '<p><br></p>') {
      toast({ title: "Error", description: "Title and content are required.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    
    const postData = {
      title,
      content,
      is_published: isPublished,
      start_date: isPublished && startDate ? startDate : null,
      end_date: isPublished && endDate ? endDate : null,
    };

    let saveError;
    if (editingId) {
      const { error } = await supabase.from("posts").update(postData).eq("id", editingId);
      saveError = error;
    } else {
      const { error } = await supabase.from("posts").insert([postData]);
      saveError = error;
    }

    setIsSubmitting(false);

    if (saveError) {
      toast({ title: "Error", description: saveError.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: editingId ? "Post updated successfully!" : "Post created successfully!" });
      setIsModalOpen(false);
      resetForm();
      fetchPosts(); 
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (!error) {
      toast({ title: "Deleted", description: "Post deleted successfully." });
      fetchPosts();
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setIsPublished(false);
    setStartDate("");
    setEndDate("");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    // 💡 스토리지 버킷 이름 확인! (새로 만드신 이름으로 수정하셨다면 여기서도 수정해주세요)
    const { error: uploadError } = await supabase.storage.from('post-image').upload(filePath, file);

    if (uploadError) {
      toast({ title: "Upload Failed", description: uploadError.message, variant: "destructive" });
      setIsUploadingImage(false);
      return;
    }

    const { data } = supabase.storage.from('post-image').getPublicUrl(filePath);
    
    // 🚀 마크다운 대신 실제 HTML <img> 태그를 삽입합니다!
    setContent((prev) => prev + `<p><img src="${data.publicUrl}" alt="uploaded image" style="max-width: 100%; border-radius: 8px;" /></p>`);
    setIsUploadingImage(false);
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getPostStatus = (post: any) => {
    if (!post.is_published) return { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200" };
    const today = new Date().toISOString().split('T')[0]; 
    if (post.start_date && post.start_date > today) return { label: "Scheduled", color: "bg-blue-50 text-blue-700 border-blue-200" };
    if (post.end_date && post.end_date < today) return { label: "Expired", color: "bg-red-50 text-red-700 border-red-200" };
    return { label: "Active", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-indigo-600" /> Announcements & Posts
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage news and updates shown to your customers.</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => { resetForm(); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Create New Post
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 w-1/3">Title</th>
              <th className="px-6 py-4">Visibility Period</th>
              <th className="px-6 py-4">Created</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="p-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
            ) : posts.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-slate-500 font-medium">No posts created yet.</td></tr>
            ) : (
              posts.map((post) => {
                const status = getPostStatus(post);
                return (
                  <tr key={post.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4"><Badge variant="outline" className={status.color}>{status.label}</Badge></td>
                    <td className="px-6 py-4 font-bold text-slate-900 line-clamp-2">{post.title}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {post.start_date || post.end_date ? `${formatDate(post.start_date)} ~ ${formatDate(post.end_date)}` : "Always Visible"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{formatDate(post.created_at)}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button variant="ghost" size="icon" className="text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => handleEditClick(post)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(post.id)}><Trash2 className="w-4 h-4" /></Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsModalOpen(open); }}>
        <DialogContent className="sm:max-w-[700px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900">{editingId ? "Edit Post" : "Create New Post"}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSavePost} className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Title</label>
              <Input placeholder="e.g. New Summer Collection Arrived!" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">Content</label>
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                <Button 
                  type="button" variant="outline" size="sm" className="h-8 text-xs font-bold"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />}
                  Insert Custom Image
                </Button>
              </div>
              
              {/* 🚀 textarea 대신 ReactQuill 컴포넌트 사용! */}
              <div className="bg-white rounded-xl overflow-hidden border border-slate-200">
                <ReactQuill 
                  theme="snow" 
                  value={content} 
                  onChange={setContent} 
                  modules={quillModules}
                  className="min-h-[200px]"
                />
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-4 p-4 rounded-xl border transition-all ${isPublished ? 'bg-slate-50 border-indigo-100' : 'bg-white border-slate-100'}`}>
              <div className="col-span-2 flex items-center gap-3 pb-2 border-b border-slate-100">
                <input 
                  type="checkbox" id="published" checked={isPublished} 
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsPublished(checked);
                    if (!checked) { setStartDate(""); setEndDate(""); }
                  }} 
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <label htmlFor="published" className="text-sm font-bold text-slate-900 cursor-pointer">Publish to Customers</label>
                  <p className="text-xs text-slate-500">Uncheck to keep this as a draft.</p>
                </div>
              </div>
              <div className="space-y-1.5 pt-2">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isPublished ? 'text-slate-700' : 'text-slate-400'}`}><Calendar className="w-3.5 h-3.5"/> Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!isPublished} className={`text-sm transition-all ${!isPublished ? 'bg-slate-50 cursor-not-allowed opacity-60' : ''}`} />
              </div>
              <div className="space-y-1.5 pt-2">
                <label className={`text-xs font-bold flex items-center gap-1.5 ${isPublished ? 'text-slate-700' : 'text-slate-400'}`}><Clock className="w-3.5 h-3.5"/> End Date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!isPublished} className={`text-sm transition-all ${!isPublished ? 'bg-slate-50 cursor-not-allowed opacity-60' : ''}`} />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingId ? "Update Post" : "Save Post"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}