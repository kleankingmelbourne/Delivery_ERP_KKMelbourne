"use client";

import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  Calendar as CalendarIcon, Truck, MoreHorizontal, User, AlertCircle, Loader2, RefreshCw, XCircle, Download, Save, UserPlus, RotateCcw, CheckCircle2, BellRing, ListChecks 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DndContext, pointerWithin, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, defaultDropAnimationSideEffects, DragStartEvent, DragOverEvent, DropAnimation } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --- Types ---
interface InvoiceItem {
    quantity: number;
    unit: string;
    products: {        
        product_name: string;
        location: string | null; 
        vendor_product_id: string | null; 
    } | null;
}

interface Invoice {
  id: string;
  invoice_date: string;
  total_amount: number;
  driver_id: string | null;
  customer_id: string;
  customers: {
    name: string;
    in_charge_delivery: string | null;
  };
  invoice_items: InvoiceItem[]; 
  is_completed?: boolean;
  is_pickup?: boolean;
  delivery_run: number; 
  delivery_order: number;
}

interface DisplayInvoice extends Invoice {
  current_driver_id: string | null;
  current_run: number;
  is_new_arrival?: boolean;
}

interface Driver {
  id: string;
  display_name: string | null;
}

interface DriverColumnState {
    driver: Driver;
    run: number;
    columnId: string;
}

const getMelbourneDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: "Australia/Melbourne", 
    year: 'numeric', month: '2-digit', day: '2-digit' 
  };
  const formatter = new Intl.DateTimeFormat('en-CA', options); 
  return formatter.format(now);
};

export default function SetDeliveryPage() {
  const supabase = createClient();
  const [isMounted, setIsMounted] = useState(false);

  // State
  const [selectedDate, setSelectedDate] = useState(getMelbourneDate());
  
  const [localInvoices, setLocalInvoices] = useState<DisplayInvoice[]>([]);
  const [originalInvoicesMap, setOriginalInvoicesMap] = useState<Map<string, DisplayInvoice>>(new Map());

  const [visibleColumns, setVisibleColumns] = useState<DriverColumnState[]>([]);
  const [allStaff, setAllStaff] = useState<Driver[]>([]);
  const [qualifiedStaff, setQualifiedStaff] = useState<Driver[]>([]); 
  
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isApplyingDefaults, setIsApplyingDefaults] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newArrivalCount, setNewArrivalCount] = useState(0);

  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { setIsMounted(true); }, []);

  // ------------------------------------------------------------------
  // Realtime Subscription
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!selectedDate) return;
    const channel = supabase.channel(`delivery-updates-${Date.now()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, async (payload) => {
         const currentDate = selectedDateRef.current;
         const newRecord = payload.new as any;
         const eventType = payload.eventType;
         if (eventType === 'DELETE' || !newRecord) return;
         if (!newRecord.invoice_date || !String(newRecord.invoice_date).includes(currentDate)) return;

         if (eventType === 'UPDATE') {
             if (newRecord.is_pickup === true) { setLocalInvoices(prev => prev.filter(inv => inv.id !== newRecord.id)); return; }
             
             setLocalInvoices(prev => prev.map(inv => {
               if (inv.id === newRecord.id) {
                   const dbRun = newRecord.delivery_run ?? 0;
                   const isNew = (dbRun === 0);
                   const displayRun = dbRun === 0 ? 1 : dbRun;
                   
                   const updatedInv = { 
                       ...inv, 
                       is_completed: newRecord.is_completed, 
                       driver_id: newRecord.driver_id, 
                       delivery_run: dbRun, 
                       delivery_order: newRecord.delivery_order, 
                       current_driver_id: newRecord.is_completed ? newRecord.driver_id : inv.current_driver_id, 
                       current_run: newRecord.is_completed ? displayRun : inv.current_run, 
                       is_new_arrival: isNew 
                   };
                   
                   setOriginalInvoicesMap(prevMap => new Map(prevMap).set(updatedInv.id, updatedInv));
                   return updatedInv;
               }
               return inv;
             }));
         }
         if (eventType === 'INSERT') {
             if (newRecord.is_pickup === true) return;
             const { data: fetchedInvoice, error } = await supabase.from("invoices").select(`id, invoice_date, created_at, total_amount, driver_id, customer_id, is_completed, is_pickup, delivery_run, delivery_order, customers ( name, in_charge_delivery ), invoice_items ( quantity, unit, products ( product_name, location, vendor_product_id ) )`).eq("id", newRecord.id).single();
             if (error || !fetchedInvoice) return;
             if (!fetchedInvoice.invoice_date || !String(fetchedInvoice.invoice_date).includes(currentDate)) return;
             
             const dbRun = fetchedInvoice.delivery_run ?? 0;
             const isNew = (dbRun === 0);
             const displayRun = dbRun === 0 ? 1 : dbRun;
             
             const newDisplayInvoice: DisplayInvoice = { 
                 ...(fetchedInvoice as any), 
                 delivery_run: dbRun, 
                 customers: Array.isArray(fetchedInvoice.customers) ? fetchedInvoice.customers[0] : fetchedInvoice.customers, 
                 current_driver_id: fetchedInvoice.driver_id, 
                 current_run: displayRun, 
                 is_new_arrival: isNew 
             } as unknown as DisplayInvoice;
             
             setLocalInvoices(prev => { 
                 if (prev.some(i => i.id === newDisplayInvoice.id)) return prev; 
                 setOriginalInvoicesMap(prevMap => new Map(prevMap).set(newDisplayInvoice.id, newDisplayInvoice));
                 return [...prev, newDisplayInvoice]; 
             });
             
             if (isNew) { setNewArrivalCount(prev => prev + 1); setHasChanges(true); }
         }
       }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate]);


  // ------------------------------------------------------------------
  // Data Fetching
  // ------------------------------------------------------------------
  const fetchData = async () => {
    setLoading(true); setHasChanges(false); setNewArrivalCount(0); 
    try {
      const { data: allProfileData } = await supabase.from("profiles").select("id, display_name").eq("status", "active").order("display_name");
      if (allProfileData) setAllStaff(allProfileData);

      // 🚀 [수정] .neq("status", "Paid") 조건을 삭제하여 Paid(결제완료) 상태여도 불러오도록 수정함!
      const { data: invoiceData, error: invoiceError } = await supabase.from("invoices").select(`id, invoice_date, created_at, total_amount, driver_id, customer_id, is_completed, is_pickup, delivery_run, delivery_order, customers ( name, in_charge_delivery ), invoice_items ( quantity, unit, products ( product_name, location, vendor_product_id ) )`).eq("invoice_date", selectedDate).is("is_pickup", false).order("id");
      if (invoiceError) throw invoiceError;

      const rawInvoices = (invoiceData as any[]).filter(inv => inv.is_pickup !== true);
      const invoices: Invoice[] = rawInvoices.map(inv => ({ ...inv, delivery_run: inv.delivery_run ?? 0, delivery_order: inv.delivery_order ?? 0, customers: Array.isArray(inv.customers) ? inv.customers[0] : inv.customers })) as unknown as Invoice[];

      const { data: defaultDriverData } = await supabase.from("customers").select("in_charge_delivery").not("in_charge_delivery", "is", null);
      const defaultIds = new Set(defaultDriverData?.map(d => d.in_charge_delivery));
      const qualified = (allProfileData || []).filter(staff => defaultIds.has(staff.id));
      setQualifiedStaff(qualified);

      const initialColumns: DriverColumnState[] = [];
      const usedKeys = new Set<string>();
      invoices.forEach(inv => {
          if (inv.driver_id) {
              const runFromDB = inv.delivery_run;
              const displayRun = runFromDB === 0 ? 1 : runFromDB;
              const key = `${inv.driver_id}_${displayRun}`;
              if (!usedKeys.has(key)) {
                  const driverInfo = allProfileData?.find(p => p.id === inv.driver_id);
                  if (driverInfo) { initialColumns.push({ driver: driverInfo, run: displayRun, columnId: key }); usedKeys.add(key); }
              }
          }
      });
      setVisibleColumns(initialColumns.sort((a,b) => a.driver.display_name!.localeCompare(b.driver.display_name!) || a.run - b.run));

      let newCount = 0;
      const initialMap = new Map<string, DisplayInvoice>(); 
      
      const initializedInvoices = invoices.map((inv) => {
        const isNew = (inv.delivery_run === 0);
        const displayRun = inv.delivery_run === 0 ? 1 : inv.delivery_run;
        if (isNew) newCount++;
        
        const displayInv = { 
            ...inv, 
            current_driver_id: inv.driver_id, 
            current_run: displayRun, 
            is_new_arrival: isNew 
        };
        initialMap.set(inv.id, displayInv);
        return displayInv;
      });

      setLocalInvoices(initializedInvoices);
      setOriginalInvoicesMap(initialMap); 
      setNewArrivalCount(newCount); 
      if (newCount > 0) setHasChanges(true);
    } catch (e: any) { console.error("Fetch Error:", e.message); } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [selectedDate]);


  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  
  const toggleColumnSelection = (columnId: string) => {
      setSelectedColumns(prev => {
          const newSet = new Set(prev);
          if (newSet.has(columnId)) newSet.delete(columnId);
          else newSet.add(columnId);
          return newSet;
      });
  };

  const handleGeneratePickingList = () => {
    if (selectedColumns.size === 0) return alert("Please select drivers first.");

    const targetInvoices = localInvoices.filter(inv => {
        if (!inv.current_driver_id) return false;
        const colKey = `${inv.current_driver_id}_${inv.current_run}`;
        return selectedColumns.has(colKey);
    });

    if (targetInvoices.length === 0) return alert("No invoices found in selected drivers.");

    const combinedItems: Record<string, { name: string, location: string, unit: string, qty: number, vendorProductId: string }> = {};

    targetInvoices.forEach(inv => {
        if (inv.invoice_items) {
            inv.invoice_items.forEach(item => {
                const qty = Number(item.quantity) || 0;
                
                // 수량이 0 이하인 경우 (마이너스 수량) 피킹 리스트에서 완전히 무시!
                if (qty <= 0) return;

                const name = item.products?.product_name || "Unknown Item";
                const location = item.products?.location || "";
                const vendorProductId = item.products?.vendor_product_id || ""; 
                
                let rawUnit = item.unit || "Pack"; 
                if (rawUnit.toLowerCase().includes('ctn') || rawUnit.toLowerCase().includes('box') || rawUnit.toLowerCase().includes('carton')) {
                    rawUnit = "CTN";
                } else {
                    rawUnit = "PACK";
                }

                const uniqueKey = `${name}_${rawUnit}`;

                if (!combinedItems[uniqueKey]) {
                    combinedItems[uniqueKey] = { name, location, unit: rawUnit, qty: 0, vendorProductId };
                } else {
                    if (!combinedItems[uniqueKey].location && location) {
                        combinedItems[uniqueKey].location = location;
                    }
                }
                combinedItems[uniqueKey].qty += qty;
            });
        }
    });

    const sortedList = Object.values(combinedItems).sort((a, b) => {
        if (!a.location && !b.location) return a.name.localeCompare(b.name);
        if (!a.location) return 1;
        if (!b.location) return -1;
        return a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' });
    });

    const totalInvoices = targetInvoices.length;
    const generatedTime = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    const driverNamesSet = new Set<string>();
    selectedColumns.forEach(colId => {
         const col = visibleColumns.find(c => c.columnId === colId);
         if (col && col.driver.display_name) driverNamesSet.add(col.driver.display_name);
    });
    const driverTitle = Array.from(driverNamesSet).join(', ');

    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) return;

    const itemsHtml = sortedList.map((item, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
            <td class="col-loc" style="mso-number-format:'@'">${item.location || '-'}</td>
            <td class="col-unit">${item.unit}</td>
            <td class="col-qty">${item.qty}</td>
            <td class="col-id" style="mso-number-format:'@'">${item.vendorProductId || '-'}</td>
            <td class="col-name" title="${item.name}">${item.name}</td>
        </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Picking List - ${driverTitle}</title>
          <script src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"></script>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 12px; background: #fff; color: #000; }
            .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            
            .action-bar { text-align: right; margin-bottom: 15px; display: flex; justify-content: flex-end; gap: 8px; }
            .btn { padding: 6px 12px; border: 1px solid #000; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px; display: inline-flex; align-items: center; transition: background 0.2s; color: #000; background: #fff; }
            .btn:hover { background: #f0f0f0; }
            
            .meta-line { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                font-size: 14px; 
                font-weight: bold; 
                color: #000; 
                margin-bottom: 15px; 
                border: 1px solid #000; 
                padding: 10px 15px; 
                background: #f9f9f9; 
            }
            
            .driver-name { font-size: 16px; }
            .meta-info { font-size: 14px; }

            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-top: 10px; 
                border: 1px solid #000; 
                color: #000; 
                table-layout: fixed; 
            }
            
            th, td { 
                padding: 4px 6px; 
                text-align: left; 
                border: 1px solid #000; 
                color: #000; 
                font-size: 12px; 
                line-height: 1.3;
                white-space: nowrap; 
                overflow: hidden;    
                text-overflow: ellipsis; 
            }
            th { background: #eee; font-weight: bold; }
            
            tr.even { background-color: #fcfcfc; }
            
            .col-loc { width: 10%; font-weight: bold; text-align: center; }
            .col-unit { width: 8%; text-align: center; font-weight: bold; }
            .col-qty { width: 8%; text-align: center; font-weight: bold; font-size: 13px; } 
            .col-id { width: 18%; font-family: monospace; font-size: 12px; font-weight: bold; }
            .col-name { width: 56%; font-weight: bold; }
            
            @media print {
                body { background: white; padding: 0; color: #000; }
                .container { box-shadow: none; padding: 0; max-width: 100%; border: none; }
                .action-bar { display: none; }
                .meta-line { border: 1px solid #000; background: none; }
                th { background: none !important; }
            }
          </style>
          <script>
            function exportToExcel() {
                var originalTable = document.getElementById("pickingTable");
                var tableClone = originalTable.cloneNode(true);
                
                var titleRow = tableClone.insertRow(0);
                var titleCell = titleRow.insertCell(0);
                titleCell.colSpan = 5;
                titleCell.innerText = "${driverTitle} - Picking List";
                
                var dateRow = tableClone.insertRow(1);
                var dateCell = dateRow.insertCell(0);
                dateCell.colSpan = 5;
                dateCell.innerText = "Date: ${selectedDate} | Invoices: ${totalInvoices} | Time: ${generatedTime}";

                var emptyRow = tableClone.insertRow(2);
                emptyRow.insertCell(0).colSpan = 5;

                var wb = XLSX.utils.table_to_book(tableClone, {sheet: "Picking List"});
                var ws = wb.Sheets["Picking List"];

                var range = XLSX.utils.decode_range(ws['!ref']);
                
                var borderStyle = {
                    top: { style: "thin", color: { rgb: "000000" } },
                    bottom: { style: "thin", color: { rgb: "000000" } },
                    left: { style: "thin", color: { rgb: "000000" } },
                    right: { style: "thin", color: { rgb: "000000" } }
                };

                for(var R = 3; R <= range.e.r; ++R) {
                    for(var C = range.s.c; C <= range.e.c; ++C) {
                        var cell_address = {c:C, r:R};
                        var cell_ref = XLSX.utils.encode_cell(cell_address);
                        
                        if(!ws[cell_ref]) ws[cell_ref] = { t: "s", v: "", s: {} };
                        if(!ws[cell_ref].s) ws[cell_ref].s = {};
                        ws[cell_ref].s.border = borderStyle;
                        
                        if (R === 3) {
                            ws[cell_ref].s.font = { bold: true };
                            ws[cell_ref].s.fill = { fgColor: { rgb: "EEEEEE" } };
                            ws[cell_ref].s.alignment = { horizontal: "center", vertical: "center" };
                        } else {
                            if(C === 1 || C === 2) {
                                ws[cell_ref].s.alignment = { horizontal: "center" };
                            }
                        }
                    }
                }

                var titleRef = XLSX.utils.encode_cell({c:0, r:0});
                if(ws[titleRef]) {
                    if(!ws[titleRef].s) ws[titleRef].s = {};
                    ws[titleRef].s.font = { bold: true, sz: 16 };
                    ws[titleRef].s.alignment = { horizontal: "center" };
                }
                var metaRef = XLSX.utils.encode_cell({c:0, r:1});
                if(ws[metaRef]) {
                    if(!ws[metaRef].s) ws[metaRef].s = {};
                    ws[metaRef].s.alignment = { horizontal: "center" };
                }

                XLSX.writeFile(wb, "Picking_List_${selectedDate}.xlsx");
            }
          </script>
        </head>
        <body>
          <div class="container">
              <div class="action-bar">
                  <button class="btn" onclick="window.print()">🖨️ Print</button>
                  <button class="btn" onclick="exportToExcel()">📊 Excel</button>
              </div>

              <div class="meta-line">
                 <div class="driver-name">🚚 ${driverTitle}</div>
                 <div class="meta-info">Date: ${selectedDate} &nbsp;|&nbsp; Invoices: ${totalInvoices} &nbsp;|&nbsp; Time: ${generatedTime}</div>
              </div>
              
              <table id="pickingTable">
                <thead>
                  <tr>
                    <th class="col-loc">Location</th>
                    <th class="col-unit">Unit</th>
                    <th class="col-qty">Qty</th>
                    <th class="col-id">ID</th> 
                    <th class="col-name">Product Name</th>
                  </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
              </table>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportRunSheet = () => {
    if (localInvoices.length === 0) return alert("No data.");
    const unassignedInvoices = localInvoices.filter(i => !i.current_driver_id);
    interface ExportColumn { header: string; customers: string[]; }
    const columns: ExportColumn[] = [];
    if (unassignedInvoices.length > 0) columns.push({ header: "Unassigned", customers: unassignedInvoices.map(i => i.customers.name) });
    visibleColumns.forEach(col => {
      const colTitle = `${col.driver.display_name} (${col.run === 1 ? 'AM' : 'PM'})`;
      const driverInvoices = localInvoices.filter(i => i.current_driver_id === col.driver.id && i.current_run === col.run);
      if (driverInvoices.length > 0) columns.push({ header: colTitle, customers: driverInvoices.map(i => i.customers.name) });
    });
    if (columns.length === 0) return alert("No assigned data.");
    const maxRows = Math.max(...columns.map(c => c.customers.length));
    let csvContent = `Date: ${selectedDate}\n\n`; 
    const headers = columns.map(c => `"${c.header}","Customer"`).join(",,");
    csvContent += headers + "\n";
    for (let i = 0; i < maxRows; i++) {
      const rowParts = columns.map(col => { const val = col.customers[i]; return val ? `"${col.header}","${val}"` : `"" , ""`; });
      csvContent += rowParts.join(",,") + "\n";
    }
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Run_Sheet_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddDriver = (driverId: string) => {
    const driverToAdd = allStaff.find(s => s.id === driverId);
    if (!driverToAdd) return;
    const existingColumns = visibleColumns.filter(c => c.driver.id === driverId);
    const hasRun1 = existingColumns.some(c => c.run === 1);
    const hasRun2 = existingColumns.some(c => c.run === 2);
    if (!hasRun1) {
        const newCol: DriverColumnState = { driver: driverToAdd, run: 1, columnId: `${driverId}_1` };
        setVisibleColumns(prev => {
            if (hasRun2) { const idx = prev.findIndex(c => c.columnId === `${driverId}_2`); const newArr = [...prev]; newArr.splice(idx, 0, newCol); return newArr; }
            return [...prev, newCol];
        });
    } else if (!hasRun2) {
        const newCol: DriverColumnState = { driver: driverToAdd, run: 2, columnId: `${driverId}_2` };
        setVisibleColumns(prev => {
            const idx = prev.findIndex(c => c.columnId === `${driverId}_1`);
            if (idx !== -1) { const newArr = [...prev]; newArr.splice(idx + 1, 0, newCol); return newArr; }
            return [...prev, newCol];
        });
    } else { alert(`${driverToAdd.display_name} is already assigned for Run 1 & 2.`); }
  };

  const handleLocalMove = (invoiceId: string, targetColumnId: string | null) => {
    setLocalInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId && inv.is_completed) return inv;
      if (inv.id === invoiceId) {
          if (!targetColumnId) return { 
              ...inv, 
              current_driver_id: null, 
              current_run: 1, 
              is_new_arrival: true,
              delivery_order: 0 
          }; 
          
          const lastUnderscoreIndex = targetColumnId.lastIndexOf('_');
          const driverId = targetColumnId.substring(0, lastUnderscoreIndex);
          const runStr = targetColumnId.substring(lastUnderscoreIndex + 1);
          
          return { 
              ...inv, 
              current_driver_id: driverId, 
              current_run: parseInt(runStr) || 1,
              is_new_arrival: false, 
              delivery_order: 0 
          };
      }
      return inv;
    }));
    setHasChanges(true);
  };

  const handleResetDefaults = () => {
    if (!confirm("This will reset unassigned invoices to their default drivers. Continue?")) return;
    setIsApplyingDefaults(true);
    let driversAdded = false;
    let newColumns = [...visibleColumns];
    const existingColumnKeys = new Set(visibleColumns.map(c => c.columnId));
    
    const updatedInvoices = localInvoices.map(inv => {
      if (inv.is_completed || inv.current_driver_id) return inv;
      const defaultDriverId = inv.customers.in_charge_delivery;
      if (defaultDriverId) {
        const targetColumnKey = `${defaultDriverId}_1`;
        if (!existingColumnKeys.has(targetColumnKey)) {
            const driverInfo = allStaff.find(s => s.id === defaultDriverId);
            if (driverInfo) { newColumns.push({ driver: driverInfo, run: 1, columnId: targetColumnKey }); existingColumnKeys.add(targetColumnKey); driversAdded = true; }
        }
        return { 
            ...inv, 
            current_driver_id: defaultDriverId, 
            current_run: 1, 
            is_new_arrival: false,
            delivery_order: 0 
        };
      }
      return inv;
    });

    setLocalInvoices(updatedInvoices);
    if (driversAdded) setVisibleColumns(newColumns);
    setHasChanges(true);
    setIsApplyingDefaults(false);
  };

  const handleSaveChanges = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    try {
      const changedInvoices = localInvoices.filter(localInv => {
          const original = originalInvoicesMap.get(localInv.id);
          if (!original) return true; 

          const isDriverChanged = localInv.current_driver_id !== original.current_driver_id;
          const isRunChanged = localInv.current_run !== original.current_run;
          const isNewStatusChanged = localInv.is_new_arrival && !!localInv.current_driver_id;

          return isDriverChanged || isRunChanged || isNewStatusChanged;
      });

      if (changedInvoices.length === 0) {
          setHasChanges(false);
          setIsSaving(false);
          return;
      }

      const updates = changedInvoices.map(inv => {
        const original = originalInvoicesMap.get(inv.id);
        const runToSave = inv.current_driver_id ? (inv.current_run || 1) : 0;
        
        let orderToSave = inv.delivery_order;
        
        if (
            (original && inv.current_driver_id !== original.current_driver_id) || 
            (original && !original.current_driver_id && inv.current_driver_id)    
        ) {
            orderToSave = 0;
        }

        return supabase.from("invoices").update({ 
            driver_id: inv.current_driver_id, 
            delivery_run: runToSave,
            delivery_order: orderToSave 
        }).eq("id", inv.id);
      });

      await Promise.all(updates);
      setHasChanges(false);

      const newMap = new Map(originalInvoicesMap);
      const updatedLocalInvoices = localInvoices.map(inv => {
          const isChanged = changedInvoices.some(c => c.id === inv.id);
          const isAssigned = !!inv.current_driver_id;
          
          let updatedOrder = inv.delivery_order;
          if (isChanged) {
              const original = originalInvoicesMap.get(inv.id);
              if ((original && inv.current_driver_id !== original.current_driver_id) || (original && !original.current_driver_id && inv.current_driver_id)) {
                  updatedOrder = 0;
              }
          }

          const updatedInv = { 
              ...inv, 
              is_new_arrival: !isAssigned, 
              delivery_run: isAssigned ? (inv.current_run || 1) : 0,
              delivery_order: updatedOrder
          };
          
          newMap.set(updatedInv.id, updatedInv);
          return updatedInv;
      });

      setLocalInvoices(updatedLocalInvoices);
      setOriginalInvoicesMap(newMap);
      
      const newCount = updatedLocalInvoices.filter(i => i.is_new_arrival).length;
      setNewArrivalCount(newCount);

    } catch (e: any) { alert("Error saving: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };
  
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeInvoice = localInvoices.find(i => i.id === activeId);
    if (!activeInvoice || activeInvoice.is_completed) return;
    
    let targetDriverId: string | null = null;
    let targetRun = 1;
    
    const overInvoice = localInvoices.find(i => i.id === overId);
    if (overInvoice) { 
        targetDriverId = overInvoice.current_driver_id; 
        targetRun = overInvoice.current_run; 
    } else if (overId === "unassigned") { 
        targetDriverId = null; 
        targetRun = 1; 
    } else { 
        const targetCol = visibleColumns.find(c => c.columnId === overId); 
        if (targetCol) { 
            targetDriverId = targetCol.driver.id; 
            targetRun = targetCol.run; 
        } 
    }
    
    if (activeInvoice.current_driver_id !== targetDriverId || activeInvoice.current_run !== targetRun) {
      setLocalInvoices(prev => prev.map(inv => { 
          if (inv.id === activeId) return { 
              ...inv, 
              current_driver_id: targetDriverId, 
              current_run: targetRun,
              delivery_order: 0 
          }; 
          return inv; 
      }));
      setHasChanges(true);
    }
  };

  const handleDragEnd = () => { setActiveId(null); };
  const dropAnimation: DropAnimation = { sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) };
  const groupedInvoices: Record<string, DisplayInvoice[]> = { unassigned: [], ...Object.fromEntries(visibleColumns.map(c => [c.columnId, []])) };
  
  localInvoices.forEach(inv => { 
      if (inv.current_driver_id) { 
          const key = `${inv.current_driver_id}_${inv.current_run}`; 
          if (groupedInvoices[key]) groupedInvoices[key].push(inv); 
          else groupedInvoices["unassigned"].push(inv); 
      } else { 
          groupedInvoices["unassigned"].push(inv); 
      } 
  });
  
  const availableToAdd = allStaff.map(staff => { const count = visibleColumns.filter(c => c.driver.id === staff.id).length; return { ...staff, count }; }).filter(s => s.count < 2);
  const activeInvoice = activeId ? localInvoices.find(i => i.id === activeId) : null;

  if (!isMounted) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-slate-50/50">
        <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-10 shadow-sm">
            <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                <Truck className="w-5 h-5 text-emerald-600" />
                Set Delivery
            </div>
            <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1 pl-2 border border-slate-200 h-8">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                <input type="date" className="bg-transparent text-xs font-bold text-slate-700 outline-none w-28 cursor-pointer" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            </div>

            <div className="flex items-center gap-2">
            
            {newArrivalCount > 0 && (
                <div className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1 rounded-full shadow-lg shadow-blue-200 animate-bounce mr-2 transition-all cursor-default">
                    <BellRing className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{newArrivalCount} New!</span>
                </div>
            )}

            {selectedColumns.size > 0 && (
                <Button onClick={handleGeneratePickingList} className="h-8 text-xs px-3 font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <ListChecks className="w-3.5 h-3.5 mr-1.5" />
                    Picking List ({selectedColumns.size})
                </Button>
            )}

            {hasChanges && (
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md animate-pulse border border-amber-200">
                Unsaved Changes
                </span>
            )}
            
            <Button onClick={handleResetDefaults} disabled={isApplyingDefaults} className="h-8 text-xs px-3 font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300 shadow-sm">
                {isApplyingDefaults ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                Reset
            </Button>

            <Button onClick={handleSaveChanges} disabled={!hasChanges || isSaving} className={cn("h-8 text-xs font-bold transition-all gap-1.5", hasChanges ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md" : "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200")}>
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportRunSheet} className="h-8 px-2 text-slate-600">
                <Download className="w-3.5 h-3.5" /> 
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="h-8 w-8 p-0">
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> 
            </Button>
            </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="flex h-full gap-3 min-w-max items-start">
            <DroppableColumn 
                id="unassigned" title="Unassigned" items={groupedInvoices["unassigned"]} columns={visibleColumns} onMove={handleLocalMove} type="unassigned" selectedColumns={selectedColumns} onToggle={toggleColumnSelection} 
            />
            {visibleColumns.map(col => (
              <DroppableColumn 
                key={col.columnId} id={col.columnId} title={col.driver.display_name || "Unknown"} subTitle={col.run === 1 ? "1st Run" : "2nd Run"} items={groupedInvoices[col.columnId] || []} columns={visibleColumns} onMove={handleLocalMove} type="driver" run={col.run} selectedColumns={selectedColumns} onToggle={toggleColumnSelection} 
            />
            ))}
            <div className="shrink-0 pt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-full flex flex-col gap-2 items-center justify-center border-dashed border-2 border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 w-20 py-4 transition-all">
                      <div className="bg-slate-100 p-2 rounded-full group-hover:bg-emerald-100 transition-colors"><UserPlus className="w-5 h-5" /></div>
                      <span className="text-[10px] font-bold text-center leading-tight">Add<br/>Driver</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Add Driver (Max 2 Runs)</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableToAdd.length > 0 ? (
                    availableToAdd.map(staff => (
                      <DropdownMenuItem key={staff.id} onClick={() => handleAddDriver(staff.id)}>
                        <User className="w-4 h-4 mr-2 text-slate-400" />
                        <span className="flex-1">{staff.display_name}</span>
                        {staff.count === 1 && <Badge variant="secondary" className="text-[9px] h-4">2nd</Badge>}
                      </DropdownMenuItem>
                    ))
                  ) : (<div className="p-2 text-xs text-slate-400 text-center">All staff added (x2)</div>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
            {activeInvoice ? (
                <div className="opacity-90 rotate-2 cursor-grabbing">
                    <SlimInvoiceCard invoice={activeInvoice} columns={visibleColumns} currentColumnId={activeInvoice.current_driver_id ? `${activeInvoice.current_driver_id}_${activeInvoice.current_run}` : "unassigned"} onMove={() => {}} isOverlay />
                </div>
            ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

function DroppableColumn({ 
    id, title, subTitle, items, columns, onMove, type, run, selectedColumns, onToggle 
}: { 
    id: string, title: string, subTitle?: string, items: DisplayInvoice[], columns: DriverColumnState[], onMove: any, type: "unassigned" | "driver", run?: number,
    selectedColumns: Set<string>, onToggle: (id: string) => void
}) {
  const { setNodeRef } = useSortable({ id: id, data: { type: 'container' } });
  const totalAmount = items.reduce((sum, inv) => sum + inv.total_amount, 0);
  const isChecked = selectedColumns.has(id);

  return (
    <div ref={setNodeRef} className={cn("w-56 flex flex-col h-full rounded-lg border shrink-0 transition-colors", type === "unassigned" ? "bg-slate-100/80 border-slate-200/60" : "bg-white border-slate-200 shadow-sm")}>
      <div className={cn("px-2 py-1.5 border-b rounded-t-lg min-h-[44px]", type === "unassigned" ? "border-slate-200 bg-white/40" : "border-slate-100 bg-slate-50")}>
        <div className="flex items-center justify-between h-full gap-1">
          <div className="flex items-center gap-1.5 overflow-hidden">
              {type === "unassigned" ? (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <input type="checkbox" checked={isChecked} onChange={() => onToggle(id)} className="w-3.5 h-3.5 cursor-pointer accent-emerald-600" />
                  </div>
              )}
              
              {type === "driver" && (
                  <div className="relative shrink-0 mt-0.5">
                      <Avatar className="h-6 w-6 border border-white shadow-sm shrink-0">
                          <AvatarFallback className={cn("text-[10px] font-bold", run === 2 ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700")}>{title.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {run === 2 && (<div className="absolute -bottom-1 -right-1 bg-indigo-500 text-white text-[9px] w-3.5 h-3.5 flex items-center justify-center rounded-full border border-white">2</div>)}
                  </div>
              )}

            <div className="flex flex-col truncate ml-1 justify-center">
                <span className="font-bold text-slate-800 text-xs truncate leading-tight" title={title}>{title}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {subTitle && <span className="text-[9px] text-slate-500 font-medium leading-none">{subTitle}</span>}
                  {type === "driver" && (
                      <span className="text-[9px] font-black text-emerald-600 leading-none">
                          ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                  )}
                </div>
            </div>
          </div>
          <div className="flex items-start shrink-0 h-full pt-0.5">
              <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 rounded-full shadow-sm">{items.length}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-0.5 space-y-[1px] custom-scrollbar min-h-[100px]">
        <SortableContext id={id} items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(inv => <SortableItem key={inv.id} invoice={inv} columns={columns} currentColumnId={id} onMove={onMove} />)}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 opacity-50">
              {type === "unassigned" ? <span className="text-[10px]">Empty</span> : <Truck className="w-5 h-5 opacity-20" />}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableItem(props: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.invoice.id, disabled: props.invoice.is_completed });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none"><SlimInvoiceCard {...props} /></div>;
}

function SlimInvoiceCard({ invoice, columns, currentColumnId, onMove, isOverlay = false }: { invoice: DisplayInvoice; columns: DriverColumnState[]; currentColumnId: string; onMove: (id: string, colId: string | null) => void; isOverlay?: boolean; }) {
  const isCompleted = invoice.is_completed; 
  const isNew = invoice.is_new_arrival;

  return (
    <div className={cn("relative flex items-center justify-between w-full bg-white border-b border-slate-100 px-2 py-1.5 min-h-[38px] select-none transition-all duration-500", isOverlay && "shadow-lg ring-1 ring-emerald-500 z-50 rounded-sm bg-white", !isOverlay && isCompleted && "bg-slate-100/80 text-slate-400 pointer-events-none", !isOverlay && !isCompleted && "hover:bg-blue-50/50 transition-colors group", isNew && "bg-blue-100/80 ring-2 ring-inset ring-blue-400 border-blue-400")}>
      
      <div className="flex-1 flex flex-col justify-center overflow-hidden pr-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate text-xs font-bold leading-tight", isCompleted ? "text-slate-400 line-through" : "text-slate-700")} title={invoice.customers?.name}>
            {invoice.customers?.name || "Unknown"}
          </span>
          {isNew && (<span className="shrink-0 inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold bg-blue-500 text-white animate-pulse">NEW</span>)}
        </div>
        
        <span className={cn("text-[9px] leading-tight font-medium mt-0.5", isCompleted ? "text-slate-300" : "text-emerald-600")}>
          ${invoice.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
        </span>
      </div>

      {!isOverlay && !isCompleted && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity p-0" onPointerDown={(e) => e.stopPropagation()}>
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-[10px] text-slate-400 uppercase font-bold py-1">Move to...</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {currentColumnId !== "unassigned" && (
              <DropdownMenuItem onClick={() => onMove(invoice.id, null)} className="text-red-600 text-xs font-bold">
                <XCircle className="w-3 h-3 mr-2" /> Unassign
              </DropdownMenuItem>
            )}
            {columns.map(col => {
              if (col.columnId === currentColumnId) return null;
              return (
                <DropdownMenuItem key={col.columnId} onClick={() => onMove(invoice.id, col.columnId)} className="text-xs">
                  <User className="w-3 h-3 mr-2 text-slate-400" />
                  {col.driver.display_name} {col.run === 2 && "(2nd)"}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}