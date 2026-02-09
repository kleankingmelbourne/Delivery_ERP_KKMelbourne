"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { 
  Plus, Search, MoreHorizontal, Edit, Trash2, Loader2, 
  Truck, MapPin, Phone, Mail, ChevronLeft, ChevronRight, ArrowUpDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
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

// Server Action 임포트
import { getPlaceSuggestions, getPlaceDetails } from "@/app/actions/google-maps"

export default function VendorPage() {
  const supabase = createClient()

  // --- 상태 관리 ---
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)

  // 폼 데이터
  const initialFormState = {
    vendor_name: "",
    contact_person: "",
    mobile: "",
    email: "",
    tel: "",
    website: "",
    address: "", 
    state: "",
    suburb: "",
    postcode: "",
    note: "",
  }
  const [formData, setFormData] = useState(initialFormState)

  // --- Google Maps Autocomplete 관련 State ---
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);

  // [수정 1] 단순 입력 핸들러 (API 호출 제거)
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, address: e.target.value }));
    // 사용자가 타이핑을 시작하면 드롭다운을 열 준비를 합니다.
    if (e.target.value.length >= 3) {
      setShowSuggestions(true);
    }
  };

  // [수정 2] 디바운싱 useEffect (0.5초 대기 후 서버 요청)
  useEffect(() => {
    // 1. 드롭다운이 닫혀있거나, 주소가 짧으면 검색 안 함
    if (!showSuggestions || !formData.address || formData.address.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    // 2. 타이머 설정 (0.5초 디바운싱)
    const timer = setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        const suggestions = await getPlaceSuggestions(formData.address);
        setAddressSuggestions(suggestions);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500); // 500ms 딜레이

    // 3. 클린업 (사용자가 계속 타이핑하면 이전 타이머 취소)
    return () => clearTimeout(timer);
  }, [formData.address, showSuggestions]);


  // [수정 3] 주소 선택 핸들러
  const handleSelectAddress = async (placeId: string, description: string) => {
    // 선택 시 드롭다운을 닫아서 useEffect가 다시 발동하지 않도록 함
    setShowSuggestions(false); 
    setFormData(prev => ({ ...prev, address: description }));
    
    // 상세 주소 가져오기
    const details = await getPlaceDetails(placeId);
    if (details) {
        setFormData(prev => ({
            ...prev,
            address: details.address,
            suburb: details.suburb,
            state: details.state,
            postcode: details.postcode
        }));
    }
  };

  // --- 1. 데이터 불러오기 ---
  const fetchVendors = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("product_vendors")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supabase Error:", error)
    } else {
      setVendors(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchVendors()
  }, [])

  // --- 2. 폼 핸들링 ---
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const openNewVendor = () => {
    setEditingVendor(null)
    setFormData(initialFormState)
    setAddressSuggestions([])
    setIsModalOpen(true)
  }

  const openEditVendor = (item: any) => {
    setEditingVendor(item)
    setFormData({
        vendor_name: item.vendor_name || "",
        contact_person: item.contact_person || "",
        mobile: item.mobile || "",
        email: item.email || "",
        tel: item.tel || "",
        website: item.website || "",
        address: item.address || "", 
        state: item.state || "",
        suburb: item.suburb || "",
        postcode: item.postcode || "",
        note: item.note || "",
    })
    setAddressSuggestions([])
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!formData.vendor_name.trim()) {
      alert("Vendor Name is required.")
      return
    }

    setIsSaving(true)
    try {
      if (editingVendor) {
        const { error } = await supabase
          .from("product_vendors")
          .update(formData)
          .eq("id", editingVendor.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("product_vendors")
          .insert(formData)
        if (error) throw error
      }

      await fetchVendors()
      setIsModalOpen(false)
      setEditingVendor(null)
    } catch (error: any) {
      alert("Error saving vendor: " + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} vendors?`)) return

    const { error } = await supabase
      .from("product_vendors")
      .delete()
      .in("id", ids)

    if (error) {
      alert("Failed to delete: " + error.message)
    } else {
      setSelectedIds(new Set())
      fetchVendors()
    }
  }

  // --- 3. 정렬 및 필터링 ---
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const processedData = useMemo(() => {
    let result = vendors.filter((v) =>
      v.vendor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key] || ""
        const valB = b[sortConfig.key] || ""
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1
        return 0
      })
    }
    return result
  }, [vendors, searchTerm, sortConfig])

  const totalPages = Math.ceil(processedData.length / itemsPerPage)
  const paginatedData = processedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = paginatedData.map((v) => v.id)
      setSelectedIds(new Set([...Array.from(selectedIds), ...allIds]))
    } else {
      const newSet = new Set(selectedIds)
      paginatedData.forEach((v) => newSet.delete(v.id))
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
          <h1 className="text-2xl font-bold text-slate-900">Vendor Management</h1>
          <p className="text-sm text-slate-500">Manage your suppliers and contacts.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.size})
            </Button>
          )}
          <Button onClick={openNewVendor} className="bg-slate-900">
            <Plus className="w-4 h-4 mr-2" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* 2. 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Truck className="text-blue-600 w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Vendors</p>
              <h3 className="text-2xl font-bold text-slate-800">{vendors.length}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. 테이블 영역 */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search vendors..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-slate-500">
            Showing {paginatedData.length} of {processedData.length}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 w-[50px] text-center">
                  <Checkbox 
                    checked={paginatedData.length > 0 && paginatedData.every((v) => selectedIds.has(v.id))}
                    onCheckedChange={(c) => handleSelectAll(!!c)}
                  />
                </th>
                <th className="px-4 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('vendor_name')}>
                  <div className="flex items-center gap-1">Vendor Name <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-4 py-3">Contact Person</th>
                <th className="px-4 py-3">Contact Info</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-400">Loading vendors...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={6} className="p-10 text-center text-slate-400">No vendors found.</td></tr>
              ) : (
                paginatedData.map((vendor) => {
                  const isSelected = selectedIds.has(vendor.id)
                  return (
                    <tr key={vendor.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""}`}>
                      <td className="px-4 py-3 text-center">
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOne(vendor.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {vendor.vendor_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {vendor.contact_person || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {vendor.mobile && <div className="flex items-center gap-1"><Phone className="w-3 h-3"/> {vendor.mobile}</div>}
                        {vendor.email && <div className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3"/> {vendor.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {vendor.suburb && vendor.state ? `${vendor.suburb}, ${vendor.state}` : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditVendor(vendor)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete([vendor.id])} className="text-red-600">
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

      {/* 4. Vendor Modal (Wide Layout) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
            <DialogDescription>
              Enter supplier details below. Address fields are auto-filled by Google.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Vendor Name <span className="text-red-500">*</span></Label>
                    <Input value={formData.vendor_name} onChange={(e) => handleFormChange('vendor_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Contact Person</Label>
                    <Input value={formData.contact_person} onChange={(e) => handleFormChange('contact_person', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase">Website</Label>
                    <Input value={formData.website} onChange={(e) => handleFormChange('website', e.target.value)} placeholder="https://" />
                </div>
            </div>

            {/* Contact Info */}
            <div className="border p-4 rounded-xl bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" /> Contact Details
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Mobile</Label>
                        <Input value={formData.mobile} onChange={(e) => handleFormChange('mobile', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Tel</Label>
                        <Input value={formData.tel} onChange={(e) => handleFormChange('tel', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Email</Label>
                        <Input value={formData.email} onChange={(e) => handleFormChange('email', e.target.value)} />
                    </div>
                </div>
            </div>

            {/* Address Info (Server Action + Custom Dropdown + Debounce) */}
            <div className="border p-4 rounded-xl bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" /> Address (Auto-fill by Google)
                </h3>
                <div className="grid grid-cols-4 gap-4">
                    {/* Search Input */}
                    <div className="col-span-4 space-y-1.5 relative">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Search Address</Label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input 
                                placeholder="Start typing address..." 
                                className="pl-9 bg-white border-blue-200 focus:border-blue-500 transition-colors"
                                value={formData.address}
                                onChange={handleAddressChange} // [수정] 핸들러 변경
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                onFocus={() => formData.address && formData.address.length >= 3 && setShowSuggestions(true)}
                            />
                            {isSearchingAddress && (
                                <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />
                            )}
                        </div>
                        {/* Suggestions Dropdown */}
                        {showSuggestions && addressSuggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {addressSuggestions.map((prediction) => (
                                    <div
                                        key={prediction.place_id}
                                        className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                                        onMouseDown={() => handleSelectAddress(prediction.place_id, prediction.description)}
                                    >
                                        <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                        <span className="truncate">{prediction.description}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Read-Only Auto Filled Fields */}
                    <div className="col-span-1 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">State</Label>
                        <Input value={formData.state} readOnly className="bg-slate-100 text-slate-500" />
                    </div>

                    <div className="col-span-2 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Suburb</Label>
                        <Input value={formData.suburb} readOnly className="bg-slate-100 text-slate-500" />
                    </div>

                    <div className="col-span-1 space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Postcode</Label>
                        <Input value={formData.postcode} readOnly className="bg-slate-100 text-slate-500" />
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Notes</Label>
                <Textarea value={formData.note} onChange={(e) => handleFormChange('note', e.target.value)} className="min-h-[80px]" />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 text-white">
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}