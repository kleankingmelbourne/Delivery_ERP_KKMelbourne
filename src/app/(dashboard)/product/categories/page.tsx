"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { 
  Plus, Search, MoreHorizontal, Edit, Trash2, Loader2, 
  ChevronLeft, ChevronRight, ArrowUpDown, Tag, AlignLeft, Calendar
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function CategoryPage() {
  const supabase = createClient()

  // --- 상태 관리 ---
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // 모달 관련
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 테이블 관련
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)

  // 폼 데이터 (DB 컬럼: category_name, description)
  const initialFormState = {
    category_name: "",
    description: "",
  }
  const [formData, setFormData] = useState(initialFormState)

  // --- 1. 데이터 불러오기 ---
  const fetchCategories = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .order("created_at", { ascending: false }) // 최신순 정렬

    if (error) {
      console.error("Supabase Error:", error)
    } else {
      setCategories(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  // --- 2. 폼 핸들링 ---
  const openNewCategory = () => {
    setEditingCategory(null)
    setFormData(initialFormState)
    setIsModalOpen(true)
  }

  const openEditCategory = (item: any) => {
    setEditingCategory(item)
    setFormData({
      category_name: item.category_name || "",
      description: item.description || "",
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.category_name.trim()) {
      alert("Category Name is required.")
      return
    }

    setIsSaving(true)
    try {
      if (editingCategory) {
        // 수정 (Update)
        const { error } = await supabase
          .from("product_categories")
          .update(formData)
          .eq("id", editingCategory.id)
        if (error) throw error
      } else {
        // 신규 (Insert)
        const { error } = await supabase
          .from("product_categories")
          .insert(formData)
        if (error) throw error
      }

      await fetchCategories()
      setIsModalOpen(false)
      setEditingCategory(null)
    } catch (error: any) {
      alert("Error saving category: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} categories? This might affect products linked to them.`)) return

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .in("id", ids)

    if (error) {
      alert("Failed to delete: " + error.message)
    } else {
      setSelectedIds(new Set())
      fetchCategories()
    }
  }

  // --- 3. 정렬 및 필터링 로직 ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const processedData = useMemo(() => {
    // 1. 검색 필터
    let result = categories.filter((c) =>
      c.category_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    // 2. 정렬
    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key] || ""
        const valB = b[sortConfig.key] || ""
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0
      })
    }
    return result
  }, [categories, searchTerm, sortConfig])

  // 페이지네이션
  const totalPages = Math.ceil(processedData.length / itemsPerPage)
  const paginatedData = processedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // 체크박스 핸들러
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = paginatedData.map((c) => c.id)
      setSelectedIds(new Set([...Array.from(selectedIds), ...allIds]))
    } else {
      const newSet = new Set(selectedIds)
      paginatedData.forEach((c) => newSet.delete(c.id))
      setSelectedIds(newSet)
    }
  }

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen pb-20">
      
      {/* 1. 상단 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Category Management</h1>
          <p className="text-sm text-slate-500">Organize your products with categories.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.size})
            </Button>
          )}
          <Button onClick={openNewCategory} className="bg-slate-900">
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        </div>
      </div>

      {/* 2. 요약 카드 (옵션) */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Tag className="text-blue-600 w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Categories</p>
              <h3 className="text-2xl font-bold text-slate-800">{categories.length}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. 테이블 영역 */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* 필터 영역 */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search categories..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-slate-500">
            Showing {paginatedData.length} of {processedData.length}
          </div>
        </div>

        {/* 실제 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 w-[50px] text-center">
                  <Checkbox 
                    checked={paginatedData.length > 0 && paginatedData.every((c) => selectedIds.has(c.id))}
                    onCheckedChange={(c) => handleSelectAll(!!c)}
                  />
                </th>
                
                {/* Sortable: Category Name */}
                <th 
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('category_name')}
                >
                  <div className="flex items-center gap-1">
                    Category Name <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>

                {/* Sortable: Description */}
                <th 
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('description')}
                >
                  <div className="flex items-center gap-1">
                    Description <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>

                {/* Sortable: Created At */}
                <th 
                  className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Created <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>

                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="p-10 text-center text-slate-400">Loading categories...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={5} className="p-10 text-center text-slate-400">No categories found.</td></tr>
              ) : (
                paginatedData.map((category) => {
                  const isSelected = selectedIds.has(category.id)
                  return (
                    <tr key={category.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""}`}>
                      <td className="px-4 py-3 text-center">
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOne(category.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {category.category_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[300px] truncate">
                        {category.description || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {category.created_at ? new Date(category.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditCategory(category)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete([category.id])} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {processedData.length > itemsPerPage && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* 4. Add/Edit Category Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add New Category"}</DialogTitle>
            <DialogDescription>
              {editingCategory ? "Update the category details below." : "Create a new category for your products."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Category Name <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Tag className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="e.g. Beverages" 
                  className="pl-9"
                  value={formData.category_name}
                  onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Description</Label>
              <div className="relative">
                <AlignLeft className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Textarea 
                  placeholder="Optional description..." 
                  className="pl-9 min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 text-white">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingCategory ? "Update Category" : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}