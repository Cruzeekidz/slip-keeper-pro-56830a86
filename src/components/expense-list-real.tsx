import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Search, Filter, Receipt, Edit3, Trash2, Download, Eye, LayoutGrid, Table2, ArrowUpDown, X, Send, UserCheck, Store, AlertTriangle, ArrowDownLeft, ArrowUpRight, FileText, CheckSquare, Loader2, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { ExpenseEditDialog } from "./expense-edit-dialog";
import { AttachInvoiceDialog } from "./attach-invoice-dialog";
import { ReceiptGallery } from "./receipt-gallery";
import { cn } from "@/lib/utils";
import {
  TransactionType, CategoryGroup,
  TRANSACTION_TYPES, CATEGORY_GROUPS,
  getTypeBadgeClass, formatTypeLabel,
  getSubcategoriesForType, getDefaultProjectTags, showProjectTag,
  TransactionDirection,
} from "@/lib/category-constants";

interface Expense {
  id: string;
  amount: number;
  category: string;
  subcategory: string | null;
  project: string | null;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
  merchant: string | null;
  sender: string | null;
  receiver: string | null;
  created_at: string;
  transaction_type: string | null;
  category_group: string | null;
  project_tag: string | null;
  confidence_score: number | null;
  needs_review: boolean | null;
  transaction_direction: string | null;
  payee_group: string | null;
  event_name: string | null;
  settled_batch_id: string | null;
}

// Query functions — fetch limited window for performance
const fetchExpensesWindow = async (params: { months: number; limit: number }): Promise<Expense[]> => {
  let q = supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false })
    .limit(params.limit);

  if (params.months > 0) {
    const from = new Date();
    from.setMonth(from.getMonth() - params.months);
    from.setHours(0, 0, 0, 0);
    q = q.gte('expense_date', from.toISOString().split('T')[0]);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

const fetchEventNamesList = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('event_registry')
    .select('event_name')
    .order('event_date', { ascending: false });
  if (error) throw error;
  return Array.from(new Set((data || []).map(e => e.event_name))).filter(Boolean);
};

type EntityFilter = "all" | "personal" | "main_biz" | "bcc_next" | "kukanang";

const ENTITY_FILTERS: { value: EntityFilter; label: string; icon: string }[] = [
  { value: "all", label: "ทั้งหมด", icon: "📊" },
  { value: "personal", label: "ส่วนตัว", icon: "👤" },
  { value: "main_biz", label: "ธุรกิจหลัก", icon: "🏢" },
  { value: "bcc_next", label: "BCC Next", icon: "🚀" },
  { value: "kukanang", label: "คู่ขนาน", icon: "🎯" },
];

function matchesEntity(e: Expense, entity: EntityFilter): boolean {
  if (entity === "all") return true;
  if (entity === "personal") return e.transaction_type === "PERSONAL";
  if (entity === "bcc_next") return e.transaction_type === "BUSINESS" && e.category_group === "ENTITY_BCC_NEXT";
  if (entity === "kukanang") return e.transaction_type === "BUSINESS" && e.category_group === "ENTITY_KUKANANG";
  if (entity === "main_biz") {
    if (e.transaction_type !== "BUSINESS") return false;
    return e.category_group !== "ENTITY_BCC_NEXT" && e.category_group !== "ENTITY_KUKANANG";
  }
  return true;
}

export function ExpenseListReal({ editId }: { editId?: string | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // UI state
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [cashCreditTab, setCashCreditTab] = useState<"cash" | "credit">("cash");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterReview, setFilterReview] = useState("all");
  const [filterSender, setFilterSender] = useState("all");
  const [filterReceiver, setFilterReceiver] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterEvent, setFilterEvent] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "upload-desc">("date-desc");
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [attachInvoiceExpense, setAttachInvoiceExpense] = useState<Expense | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<number>(-1);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

  // Multi-select / bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkFields, setBulkFields] = useState({
    transaction_type: false,
    category_group: false,
    subcategory: false,
    project_tag: false,
    event_name: false,
    merchant: false,
    payee_group: false,
  });
  const [bulkValues, setBulkValues] = useState({
    transaction_type: "" as TransactionType | "",
    category_group: "" as CategoryGroup | "",
    subcategory: "",
    project_tag: "",
    event_name: "",
    merchant: "",
    payee_group: "",
  });

  // Data window settings (default = current month, 100 rows)
  const [windowMonths, setWindowMonths] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(100);

  // Data queries
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses', windowMonths, pageSize],
    queryFn: () => fetchExpensesWindow({ months: windowMonths, limit: pageSize }),
  });

  const { data: eventNames = [] } = useQuery({
    queryKey: ['event-registry-names'],
    queryFn: fetchEventNamesList,
  });

  // Realtime subscription → invalidate queries
  useEffect(() => {
    const channel = supabase
      .channel('expenses-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['expenses'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Mutations
  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, updateData }: { id: string; updateData: Record<string, any> }) => {
      const { error } = await supabase.from('expenses').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, updateData }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['expenses'] });
      const previous = queryClient.getQueryData<Expense[]>(['expenses']);
      queryClient.setQueryData<Expense[]>(['expenses'], (old) =>
        (old || []).map(e => e.id === id ? { ...e, ...updateData } : e)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['expenses'], context.previous);
      }
      toast({ title: "บันทึกไม่สำเร็จ", variant: "destructive" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async ({ id, receiptUrl }: { id: string; receiptUrl?: string | null }) => {
      if (receiptUrl) await supabase.storage.from('receipts').remove([receiptUrl]);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: "ลบสำเร็จ" });
    },
    onError: () => {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  // Inline update handler
  const inlineUpdate = useCallback((id: string, field: string, value: string | null, extraFields?: Record<string, any>) => {
    const updateData: Record<string, any> = { [field]: value || null, ...extraFields };
    setEditingCell(null);
    updateExpenseMutation.mutate({ id, updateData });
  }, [updateExpenseMutation]);

  // Delete handler
  const deleteExpense = useCallback((id: string, receiptUrl?: string | null) => {
    if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;
    deleteExpenseMutation.mutate({ id, receiptUrl });
  }, [deleteExpenseMutation]);

  // Dynamic options from existing data
  const dynamicSubcategories = useMemo(() => {
    const existing = new Set(expenses.map(e => e.subcategory).filter(Boolean) as string[]);
    return Array.from(existing).sort();
  }, [expenses]);

  const dynamicProjectTags = useMemo(() => {
    const existing = new Set(expenses.map(e => e.project_tag).filter(Boolean) as string[]);
    return Array.from(existing).sort();
  }, [expenses]);

  const dynamicPayeeGroups = useMemo(() => {
    const existing = new Set(expenses.map(e => e.payee_group).filter(Boolean) as string[]);
    return Array.from(existing).sort();
  }, [expenses]);

  const uniqueSenders = useMemo(() => Array.from(new Set(expenses.map(e => e.sender).filter(Boolean))).sort(), [expenses]);
  const uniqueReceivers = useMemo(() => Array.from(new Set(expenses.map(e => e.receiver).filter(Boolean))).sort(), [expenses]);

  const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (!e.expense_date) return;
      const d = new Date(e.expense_date);
      if (isNaN(d.getTime())) return;
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort().reverse();
  }, [expenses]);
  const uniqueEvents = useMemo(
    () => Array.from(new Set(expenses.map(e => e.event_name).filter(Boolean) as string[])).sort(),
    [expenses]
  );

  // WHT stats for credit tab — only unsettled items
  const whtStats = useMemo(() => {
    const whtItems = expenses.filter(e => e.category === "ภาษีหัก ณ ที่จ่าย" && !e.settled_batch_id);
    const settledItems = expenses.filter(e => e.category === "ภาษีหัก ณ ที่จ่าย" && e.settled_batch_id);
    return {
      count: whtItems.length,
      total: whtItems.reduce((s, e) => s + e.amount, 0),
      settledCount: settledItems.length,
      settledTotal: settledItems.reduce((s, e) => s + e.amount, 0),
    };
  }, [expenses]);

  // Filtering + sorting as useMemo (no more setState)
  // Entity counts for badge display
  const entityCounts = useMemo(() => {
    const cashExpenses = expenses.filter(e => e.category !== "ภาษีหัก ณ ที่จ่าย");
    return {
      all: cashExpenses.length,
      personal: cashExpenses.filter(e => matchesEntity(e, "personal")).length,
      main_biz: cashExpenses.filter(e => matchesEntity(e, "main_biz")).length,
      bcc_next: cashExpenses.filter(e => matchesEntity(e, "bcc_next")).length,
      kukanang: cashExpenses.filter(e => matchesEntity(e, "kukanang")).length,
    };
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    let filtered = expenses;

    // Entity filter (applied before cash/credit)
    if (entityFilter !== "all") {
      filtered = filtered.filter(e => matchesEntity(e, entityFilter));
    }

    // Cash/Credit tab filter
    if (cashCreditTab === "cash") {
      filtered = filtered.filter(e => e.category !== "ภาษีหัก ณ ที่จ่าย");
    } else {
      filtered = filtered.filter(e => e.category === "ภาษีหัก ณ ที่จ่าย" && !e.settled_batch_id);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.description?.toLowerCase().includes(term) ||
        e.project_tag?.toLowerCase().includes(term) ||
        e.merchant?.toLowerCase().includes(term) ||
        e.receiver?.toLowerCase().includes(term) ||
        e.payee_group?.toLowerCase().includes(term)
      );
    }
    if (filterType !== "all") filtered = filtered.filter(e => e.transaction_type === filterType);
    if (filterGroup !== "all") filtered = filtered.filter(e => e.category_group === filterGroup);
    if (filterReview === "review") filtered = filtered.filter(e => e.needs_review);
    if (filterSender !== "all") filtered = filtered.filter(e => e.sender === filterSender);
    if (filterReceiver !== "all") filtered = filtered.filter(e => e.receiver === filterReceiver);
    if (filterMonth !== "all") {
      filtered = filtered.filter(e => {
        if (!e.expense_date) return false;
        const d = new Date(e.expense_date);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return ym === filterMonth;
      });
    }
    if (filterEvent !== "all") filtered = filtered.filter(e => e.event_name === filterEvent);
    if (dateFrom) filtered = filtered.filter(e => new Date(e.expense_date) >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => new Date(e.expense_date) <= dateTo);

    return [...filtered].sort((a, b) => {
      if (sortBy === "date-desc") return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
      if (sortBy === "date-asc") return new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [expenses, entityFilter, cashCreditTab, searchTerm, filterType, filterGroup, filterReview, filterSender, filterReceiver, filterMonth, filterEvent, dateFrom, dateTo, sortBy]);

  // Auto-open edit dialog when editId is provided
  useEffect(() => {
    if (editId && expenses.length > 0) {
      const target = expenses.find(e => e.id === editId);
      if (target) {
        setEditingExpense(target);
        setEditDialogOpen(true);
      }
    }
  }, [editId, expenses]);

  const needsReviewCount = useMemo(() => expenses.filter(e => e.needs_review).length, [expenses]);

  const summaryStats = useMemo(() => {
    const nonTransfer = filteredExpenses.filter(e => e.transaction_type !== 'TRANSFER');
    const expenseItems = nonTransfer.filter(e => e.transaction_direction !== 'INCOME');
    const incomeItems = nonTransfer.filter(e => e.transaction_direction === 'INCOME');
    const totalExpense = expenseItems.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomeItems.reduce((sum, e) => sum + e.amount, 0);
    const transferTotal = filteredExpenses.filter(e => e.transaction_type === 'TRANSFER').reduce((sum, e) => sum + e.amount, 0);
    return { totalExpense, totalIncome, transferTotal, count: filteredExpenses.length };
  }, [filteredExpenses]);

  const viewReceipt = (expenseId: string) => {
    const receiptsOnly = filteredExpenses.filter(e => e.receipt_url);
    const idx = receiptsOnly.findIndex(e => e.id === expenseId);
    setViewingReceipt(idx >= 0 ? idx : 0);
    setGalleryOpen(true);
  };

  const downloadReceipt = async (receiptUrl: string) => {
    try {
      const { data, error } = await supabase.storage.from('receipts').download(receiptUrl);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = `receipt-${Date.now()}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (error) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
  };

  if (isLoading) {
    return <Card className="p-6 bg-gradient-card shadow-elevated"><div className="text-center"><p className="text-muted-foreground">กำลังโหลดข้อมูล...</p></div></Card>;
  }

  const isIncome = (e: Expense) => e.transaction_direction === 'INCOME';

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
  };

  const handleBulkApply = async () => {
    if (selectedIds.size === 0) return;
    const update: Record<string, any> = {};
    if (bulkFields.transaction_type && bulkValues.transaction_type) {
      update.transaction_type = bulkValues.transaction_type;
      const grp = bulkFields.category_group ? bulkValues.category_group : null;
      update.category = bulkValues.transaction_type === 'BUSINESS' && grp
        ? `BUSINESS > ${grp}` : bulkValues.transaction_type;
    }
    if (bulkFields.category_group) update.category_group = bulkValues.category_group || null;
    if (bulkFields.subcategory) update.subcategory = bulkValues.subcategory || null;
    if (bulkFields.project_tag) update.project_tag = bulkValues.project_tag || null;
    if (bulkFields.event_name) update.event_name = bulkValues.event_name || null;
    if (bulkFields.merchant) update.merchant = bulkValues.merchant || null;
    if (bulkFields.payee_group) update.payee_group = bulkValues.payee_group || null;

    if (Object.keys(update).length === 0) {
      toast({ title: "ไม่มีฟิลด์ที่เลือก", description: "กรุณาติ๊กฟิลด์ที่ต้องการแก้ไข", variant: "destructive" });
      return;
    }
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('expenses').update(update).in('id', ids);
    setBulkSaving(false);
    if (error) {
      toast({ title: "บันทึกไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "อัปเดตสำเร็จ", description: `แก้ไข ${ids.length} รายการแล้ว` });
    setBulkOpen(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`ลบ ${selectedIds.size} รายการที่เลือก?`)) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('expenses').delete().in('id', ids);
    setBulkSaving(false);
    if (error) {
      toast({ title: "ลบไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ลบสำเร็จ", description: `ลบ ${ids.length} รายการแล้ว` });
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const bulkSubcatOptions = [
    ...getSubcategoriesForType(bulkValues.transaction_type || null, (bulkValues.category_group || null) as CategoryGroup | null),
    ...dynamicSubcategories,
  ];

  const handleBulkConfirmOk = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from('expenses')
      .update({ needs_review: false, confidence_score: 100 })
      .in('id', ids);
    setBulkSaving(false);
    if (error) {
      toast({ title: "ยืนยันไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "ยืนยัน OK แล้ว", description: `${ids.length} รายการ ไม่ต้องตรวจสอบ` });
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };
  const bulkTagOptions = [
    ...getDefaultProjectTags((bulkValues.category_group || null) as CategoryGroup | null),
    ...dynamicProjectTags,
  ];

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">รายการเคลื่อนไหว</h2>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            <Button variant={viewMode === "card" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("card")} className="rounded-none">
              <LayoutGrid className="h-4 w-4 mr-2" />การ์ด
            </Button>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("table")} className="rounded-none">
              <Table2 className="h-4 w-4 mr-2" />ตาราง
            </Button>
          </div>
        </div>
      </div>

      {/* Entity Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {ENTITY_FILTERS.map((ef) => (
          <Button
            key={ef.value}
            variant={entityFilter === ef.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setEntityFilter(ef.value);
              // Reset type/group filters when switching entity
              setFilterType("all");
              setFilterGroup("all");
            }}
            className={cn(
              "whitespace-nowrap shrink-0",
              entityFilter === ef.value && "shadow-sm"
            )}
          >
            <span className="mr-1.5">{ef.icon}</span>
            {ef.label}
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
              {entityCounts[ef.value]}
            </Badge>
          </Button>
        ))}
      </div>

      <Tabs value={cashCreditTab} onValueChange={(v) => setCashCreditTab(v as "cash" | "credit")} className="mb-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cash">💵 เงินสด</TabsTrigger>
          <TabsTrigger value="credit">📋 เครดิต WHT ({whtStats.count})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary */}
      {cashCreditTab === "cash" ? (
        <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">รายจ่ายจริง</div>
            <div className="font-bold text-expense">฿{summaryStats.totalExpense.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">รายรับ</div>
            <div className="font-bold text-success">฿{summaryStats.totalIncome.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">โอนเงิน</div>
            <div className="font-bold text-type-transfer">฿{summaryStats.transferTotal.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">จำนวน</div>
            <div className="font-bold">{summaryStats.count} รายการ</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">รอนำส่ง</div>
            <div className="font-bold">{whtStats.count} รายการ</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">ยอดค้างจ่าย</div>
            <div className="font-bold text-amber-600">฿{whtStats.total.toLocaleString()}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground">นำส่งแล้ว</div>
            <div className="font-bold text-emerald-600">฿{whtStats.settledTotal.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ค้นหา..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger><SelectValue placeholder="ประเภท" /></SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterType === 'BUSINESS' && (
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger><SelectValue placeholder="กลุ่ม" /></SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">ทุกกลุ่ม</SelectItem>
              {CATEGORY_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterReview} onValueChange={setFilterReview}>
          <SelectTrigger><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="review">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-warning" />
                ต้องตรวจสอบ ({needsReviewCount})
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReceiver} onValueChange={setFilterReceiver}>
          <SelectTrigger><SelectValue placeholder="ผู้รับ" /></SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="all">ทุกผู้รับ</SelectItem>
            {uniqueReceivers.map(r => <SelectItem key={r!} value={r!}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger><SelectValue placeholder="เดือน" /></SelectTrigger>
          <SelectContent className="bg-background max-h-64">
            <SelectItem value="all">ทุกเดือน</SelectItem>
            {uniqueMonths.map(ym => {
              const [y, m] = ym.split("-");
              const label = `${THAI_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
              return <SelectItem key={ym} value={ym}>{label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger><SelectValue placeholder="อีเวนท์" /></SelectTrigger>
          <SelectContent className="bg-background max-h-64">
            <SelectItem value="all">ทุกอีเวนท์</SelectItem>
            {uniqueEvents.map(ev => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Sort & Date Filter */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="เรียงลำดับ" /></SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="date-desc">วันที่ (ใหม่-เก่า)</SelectItem>
            <SelectItem value="date-asc">วันที่ (เก่า-ใหม่)</SelectItem>
            <SelectItem value="upload-desc">อัพโหลดล่าสุด</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal", !dateFrom && !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom || dateTo ? `${dateFrom ? format(dateFrom, "d MMM", { locale: th }) : "..."} - ${dateTo ? format(dateTo, "d MMM", { locale: th }) : "..."}` : "ช่วงวันที่"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-3 bg-background" align="start">
            <div className="space-y-3">
              <div><div className="text-xs text-muted-foreground mb-1">จาก</div>
                <Input type="date" value={dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""} onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : undefined)} /></div>
              <div><div className="text-xs text-muted-foreground mb-1">ถึง</div>
                <Input type="date" value={dateTo ? format(dateTo, "yyyy-MM-dd") : ""} onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value) : undefined)} /></div>
            </div>
          </PopoverContent>
        </Popover>
        {(filterType !== "all" || filterGroup !== "all" || filterReview !== "all" || filterSender !== "all" || filterReceiver !== "all" || filterMonth !== "all" || filterEvent !== "all" || dateFrom || dateTo || searchTerm) && (
          <Button variant="outline" onClick={() => {
            setSearchTerm(""); setFilterType("all"); setFilterGroup("all"); setFilterReview("all"); setFilterSender("all"); setFilterReceiver("all"); setFilterMonth("all"); setFilterEvent("all"); setDateFrom(undefined); setDateTo(undefined);
          }}><X className="h-4 w-4 mr-2" />ล้างฟิลเตอร์</Button>
        )}
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-8"><p className="text-muted-foreground">ไม่พบรายการ</p></div>
      ) : viewMode === "card" ? (
        <div className="space-y-3">
          {/* Multi-select toolbar */}
          <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 flex-wrap">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === filteredExpenses.length}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm font-medium">เลือก {selectedIds.size}/{filteredExpenses.length}</span>
            <Button size="sm" variant="default" disabled={selectedIds.size === 0} onClick={() => setBulkOpen(true)}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> แก้ไขหลายรายการ
            </Button>
            <Button size="sm" variant="secondary" disabled={selectedIds.size === 0 || bulkSaving} onClick={handleBulkConfirmOk} title="ยืนยันว่าจัดกลุ่มถูกแล้ว ไม่ต้องตรวจสอบ">
              <CheckSquare className="h-3.5 w-3.5 mr-1" /> ยืนยัน OK (ไม่แก้)
            </Button>
            <Button size="sm" variant="destructive" disabled={selectedIds.size === 0 || bulkSaving} onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> ลบที่เลือก
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" /> ยกเลิก
              </Button>
            )}
          </div>
          {filteredExpenses.map((expense, index) => (
            <Card key={expense.id} className={cn("hover:shadow-md transition-shadow", expense.needs_review && "ring-1 ring-warning/50")}>
              <div className="p-3 md:p-4 flex flex-col md:flex-row md:items-start gap-3 md:gap-4 border-b">
                <div className="md:pt-1 shrink-0">
                  <Checkbox
                    checked={selectedIds.has(expense.id)}
                    onCheckedChange={() => toggleSelect(expense.id)}
                  />
                </div>
                <div className="flex items-center justify-between md:contents">
                  <div className="shrink-0 flex items-center gap-1.5 md:w-24">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs md:text-sm">{format(new Date(expense.expense_date), "d MMM yy", { locale: th })}</span>
                  </div>
                  <div className="shrink-0 md:w-32">
                    <span className={cn("font-bold text-base md:text-lg",
                      expense.transaction_type === 'TRANSFER' ? 'text-type-transfer' :
                      isIncome(expense) ? 'text-success' : 'text-expense'
                    )}>
                      {expense.transaction_type === 'TRANSFER' ? '↔' : isIncome(expense) ? '+' : '-'}฿{expense.amount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-foreground text-sm md:text-base">{expense.description || "ค่าใช้จ่าย"}</span>
                    {isIncome(expense) && (
                      <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                        <ArrowDownLeft className="h-3 w-3 mr-1" />รายรับ
                      </Badge>
                    )}
                    <Badge variant="outline" className={cn("text-xs", getTypeBadgeClass(expense.transaction_type as TransactionType, expense.category_group as CategoryGroup))}>
                      {formatTypeLabel(expense.transaction_type as TransactionType, expense.category_group as CategoryGroup, expense.project_tag)}
                    </Badge>
                    {expense.subcategory && (
                      <Badge variant="secondary" className="text-xs">{expense.subcategory}</Badge>
                    )}
                    {expense.needs_review && (
                      <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                        <AlertTriangle className="h-3 w-3 mr-1" />ตรวจสอบ
                      </Badge>
                    )}
                  </div>
                  {(expense.sender || expense.receiver || expense.merchant) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {expense.sender && <div className="flex items-center gap-1"><Send className="h-3 w-3" />จาก: {expense.sender}</div>}
                      {expense.receiver && <div className="flex items-center gap-1"><UserCheck className="h-3 w-3" />ถึง: {expense.receiver}</div>}
                      {!expense.sender && !expense.receiver && expense.merchant && (
                        <div className="flex items-center gap-1"><Store className="h-3 w-3" />ผู้รับเงิน: {expense.merchant}</div>
                      )}
                      {expense.payee_group && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          กลุ่ม: {expense.payee_group}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {expense.receipt_url && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => viewReceipt(expense.id)} className="h-8 w-8 p-0" title="ดูสลิป"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => downloadReceipt(expense.receipt_url!)} className="h-8 w-8 p-0" title="ดาวน์โหลด"><Download className="h-4 w-4" /></Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setEditingExpense(expense); setEditDialogOpen(true); }} className="h-8 w-8 p-0" title="แก้ไข"><Edit3 className="h-4 w-4" /></Button>
                  {expense.transaction_type !== 'TRANSFER' && (
                    <Button variant="ghost" size="sm" onClick={() => setAttachInvoiceExpense(expense)} className="h-8 w-8 p-0 text-primary" title="แนบบิล/ใบกำกับภาษี"><FileText className="h-4 w-4" /></Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id, expense.receipt_url)} className="h-8 w-8 p-0 text-destructive" title="ลบ"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* Multi-select toolbar (table) */}
          <div className="flex items-center gap-2 p-2 mb-2 rounded-lg border bg-muted/30 flex-wrap">
            <span className="text-sm font-medium">เลือก {selectedIds.size}/{filteredExpenses.length}</span>
            <Button size="sm" variant="default" disabled={selectedIds.size === 0} onClick={() => setBulkOpen(true)}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> แก้ไขหลายรายการ
            </Button>
            <Button size="sm" variant="secondary" disabled={selectedIds.size === 0 || bulkSaving} onClick={handleBulkConfirmOk} title="ยืนยันว่าจัดกลุ่มถูกแล้ว ไม่ต้องตรวจสอบ">
              <CheckSquare className="h-3.5 w-3.5 mr-1" /> ยืนยัน OK (ไม่แก้)
            </Button>
            <Button size="sm" variant="destructive" disabled={selectedIds.size === 0 || bulkSaving} onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> ลบที่เลือก
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                <X className="h-3.5 w-3.5 mr-1" /> ยกเลิก
              </Button>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size > 0 && selectedIds.size === filteredExpenses.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[90px]">วันที่</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead className="w-[140px]">ประเภท</TableHead>
                <TableHead className="w-[130px]">กลุ่ม</TableHead>
                <TableHead className="w-[140px]">ประเภทย่อย</TableHead>
                <TableHead className="w-[160px]">แท็ก/อีเวนท์</TableHead>
                <TableHead className="w-[140px]">ชื่ออีเวนท์</TableHead>
                <TableHead className="w-[130px]">กลุ่มผู้รับ</TableHead>
                <TableHead className="text-right w-[110px]">จำนวนเงิน</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => {
                const isEditing = (field: string) => editingCell?.id === expense.id && editingCell?.field === field;
                const subcatOptions = [
                  ...getSubcategoriesForType(
                    expense.transaction_type as TransactionType,
                    expense.category_group as CategoryGroup,
                    (expense.transaction_direction as TransactionDirection) || 'EXPENSE'
                  ),
                  ...dynamicSubcategories.filter(s => !getSubcategoriesForType(
                    expense.transaction_type as TransactionType,
                    expense.category_group as CategoryGroup
                  ).includes(s))
                ];
                const tagOptions = [
                  ...getDefaultProjectTags(expense.category_group as CategoryGroup),
                  ...dynamicProjectTags.filter(t => !getDefaultProjectTags(expense.category_group as CategoryGroup).includes(t))
                ];

                return (
                  <TableRow key={expense.id} className={cn(expense.needs_review && "bg-warning/5")}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(expense.id)}
                        onCheckedChange={() => toggleSelect(expense.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(expense.expense_date), "d MMM yy", { locale: th })}</TableCell>
                    <TableCell className="font-medium text-sm">{expense.description || expense.merchant || "-"}</TableCell>
                    
                    {/* ประเภท */}
                    <TableCell>
                      {isEditing('transaction_type') ? (
                        <Select
                          defaultValue={expense.transaction_type || ''}
                          onValueChange={(v) => inlineUpdate(expense.id, 'transaction_type', v, v !== 'BUSINESS' ? { category_group: null } : {})}
                          open
                          onOpenChange={(o) => !o && setEditingCell(null)}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-background">
                            {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <button onClick={() => setEditingCell({ id: expense.id, field: 'transaction_type' })} className="w-full text-left">
                          <Badge variant="outline" className={cn("text-xs cursor-pointer hover:opacity-80", getTypeBadgeClass(expense.transaction_type as TransactionType, expense.category_group as CategoryGroup))}>
                            {TRANSACTION_TYPES.find(t => t.value === expense.transaction_type)?.label || '-'}
                          </Badge>
                        </button>
                      )}
                    </TableCell>

                    {/* กลุ่ม */}
                    <TableCell>
                      {expense.transaction_type === 'BUSINESS' ? (
                        isEditing('category_group') ? (
                          <Select
                            defaultValue={expense.category_group || ''}
                            onValueChange={(v) => inlineUpdate(expense.id, 'category_group', v)}
                            open
                            onOpenChange={(o) => !o && setEditingCell(null)}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-background">
                              {CATEGORY_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <button onClick={() => setEditingCell({ id: expense.id, field: 'category_group' })} className="w-full text-left">
                            <Badge variant="secondary" className="text-xs cursor-pointer hover:opacity-80">
                              {CATEGORY_GROUPS.find(g => g.value === expense.category_group)?.label || '-'}
                            </Badge>
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* ประเภทย่อย */}
                    <TableCell>
                      {isEditing('subcategory') ? (
                        <div className="min-w-[120px]">
                          <Combobox
                            options={subcatOptions}
                            value={expense.subcategory || ''}
                            onValueChange={(v) => inlineUpdate(expense.id, 'subcategory', v)}
                            placeholder="เลือก..."
                          />
                        </div>
                      ) : (
                        <button onClick={() => setEditingCell({ id: expense.id, field: 'subcategory' })} className="w-full text-left text-sm hover:text-primary cursor-pointer">
                          {expense.subcategory || <span className="text-muted-foreground">-</span>}
                        </button>
                      )}
                    </TableCell>

                    {/* แท็ก/อีเวนท์ */}
                    <TableCell>
                      {isEditing('project_tag') ? (
                        <div className="min-w-[140px]">
                          <Combobox
                            options={tagOptions}
                            value={expense.project_tag || ''}
                            onValueChange={(v) => inlineUpdate(expense.id, 'project_tag', v)}
                            placeholder="เลือกแท็ก..."
                          />
                        </div>
                      ) : (
                        <button onClick={() => setEditingCell({ id: expense.id, field: 'project_tag' })} className="w-full text-left text-sm hover:text-primary cursor-pointer truncate max-w-[150px]">
                          {expense.project_tag || <span className="text-muted-foreground">-</span>}
                        </button>
                      )}
                    </TableCell>

                    {/* ชื่ออีเวนท์ */}
                    <TableCell>
                      {isEditing('event_name') ? (
                        <div className="min-w-[130px]">
                          <Combobox
                            options={eventNames}
                            value={expense.event_name || ''}
                            onValueChange={(v) => inlineUpdate(expense.id, 'event_name', v)}
                            placeholder="เลือกอีเวนท์..."
                          />
                        </div>
                      ) : (
                        <button onClick={() => setEditingCell({ id: expense.id, field: 'event_name' })} className="w-full text-left text-sm hover:text-primary cursor-pointer truncate max-w-[130px]">
                          {expense.event_name || <span className="text-muted-foreground">-</span>}
                        </button>
                      )}
                    </TableCell>

                    {/* กลุ่มผู้รับ */}
                    <TableCell>
                      {isEditing('payee_group') ? (
                        <div className="min-w-[120px]">
                          <Combobox
                            options={dynamicPayeeGroups}
                            value={expense.payee_group || ''}
                            onValueChange={(v) => inlineUpdate(expense.id, 'payee_group', v)}
                            placeholder="เลือกกลุ่ม..."
                          />
                        </div>
                      ) : (
                        <button onClick={() => setEditingCell({ id: expense.id, field: 'payee_group' })} className="w-full text-left text-sm text-muted-foreground hover:text-primary cursor-pointer">
                          {expense.payee_group || <span>-</span>}
                        </button>
                      )}
                    </TableCell>

                    <TableCell className={cn("text-right font-semibold",
                      expense.transaction_type === 'TRANSFER' ? 'text-type-transfer' :
                      isIncome(expense) ? 'text-success' : 'text-expense'
                    )}>
                      {isIncome(expense) ? '+' : expense.transaction_type === 'TRANSFER' ? '↔' : '-'}฿{expense.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {expense.needs_review && <AlertTriangle className="h-3 w-3 text-warning" />}
                        {expense.receipt_url && (
                          <Button variant="ghost" size="sm" onClick={() => viewReceipt(expense.id)} className="h-7 w-7 p-0" title="ดูสลิป"><Eye className="h-3 w-3" /></Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setEditingExpense(expense); setEditDialogOpen(true); }} className="h-7 w-7 p-0" title="แก้ไข"><Edit3 className="h-3 w-3" /></Button>
                        {expense.transaction_type !== 'TRANSFER' && (
                          <Button variant="ghost" size="sm" onClick={() => setAttachInvoiceExpense(expense)} className="h-7 w-7 p-0 text-primary" title="แนบบิล/ใบกำกับภาษี"><FileText className="h-3 w-3" /></Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id, expense.receipt_url)} className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ExpenseEditDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
      />

      <AttachInvoiceDialog
        expense={attachInvoiceExpense}
        open={!!attachInvoiceExpense}
        onOpenChange={(o) => { if (!o) setAttachInvoiceExpense(null); }}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
      />

      {galleryOpen && (
        <ReceiptGallery
          receipts={filteredExpenses.filter(e => e.receipt_url).map(e => ({ id: e.id, receipt_url: e.receipt_url!, description: e.description, expense_date: e.expense_date, amount: e.amount }))}
          initialIndex={viewingReceipt}
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
        />
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขหลายรายการพร้อมกัน</DialogTitle>
            <DialogDescription>
              จะอัปเดต {selectedIds.size} รายการที่เลือก — ติ๊กเฉพาะฟิลด์ที่ต้องการเปลี่ยน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.transaction_type} onCheckedChange={v => setBulkFields(f => ({ ...f, transaction_type: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, transaction_type: !f.transaction_type }))}>ประเภทธุรกรรม</Label>
              </div>
              {bulkFields.transaction_type && (
                <Select value={bulkValues.transaction_type} onValueChange={v => setBulkValues(s => ({ ...s, transaction_type: v as TransactionType, category_group: "", project_tag: "" }))}>
                  <SelectTrigger><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
                  <SelectContent className="bg-background">
                    {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.category_group} onCheckedChange={v => setBulkFields(f => ({ ...f, category_group: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, category_group: !f.category_group }))}>กลุ่มหมวด</Label>
              </div>
              {bulkFields.category_group && (
                <Select value={bulkValues.category_group} onValueChange={v => setBulkValues(s => ({ ...s, category_group: v as CategoryGroup, project_tag: "" }))}>
                  <SelectTrigger><SelectValue placeholder="เลือกกลุ่ม" /></SelectTrigger>
                  <SelectContent className="bg-background">
                    {CATEGORY_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.subcategory} onCheckedChange={v => setBulkFields(f => ({ ...f, subcategory: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, subcategory: !f.subcategory }))}>ประเภทย่อย</Label>
              </div>
              {bulkFields.subcategory && (
                <Combobox options={bulkSubcatOptions} value={bulkValues.subcategory} onValueChange={v => setBulkValues(s => ({ ...s, subcategory: v }))} placeholder="เลือกหรือพิมพ์" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.project_tag} onCheckedChange={v => setBulkFields(f => ({ ...f, project_tag: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, project_tag: !f.project_tag }))}>แท็กโปรเจกต์</Label>
              </div>
              {bulkFields.project_tag && (
                <Combobox options={bulkTagOptions} value={bulkValues.project_tag} onValueChange={v => setBulkValues(s => ({ ...s, project_tag: v }))} placeholder="เลือกหรือพิมพ์" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.event_name} onCheckedChange={v => setBulkFields(f => ({ ...f, event_name: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, event_name: !f.event_name }))}>ชื่ออีเวนท์</Label>
              </div>
              {bulkFields.event_name && (
                <Combobox options={eventNames} value={bulkValues.event_name} onValueChange={v => setBulkValues(s => ({ ...s, event_name: v }))} placeholder="เลือกหรือพิมพ์" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.merchant} onCheckedChange={v => setBulkFields(f => ({ ...f, merchant: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, merchant: !f.merchant }))}>ร้านค้า / ผู้รับเงิน</Label>
              </div>
              {bulkFields.merchant && (
                <Input value={bulkValues.merchant} onChange={e => setBulkValues(s => ({ ...s, merchant: e.target.value }))} placeholder="ชื่อร้านค้า" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox checked={bulkFields.payee_group} onCheckedChange={v => setBulkFields(f => ({ ...f, payee_group: !!v }))} />
                <Label className="cursor-pointer" onClick={() => setBulkFields(f => ({ ...f, payee_group: !f.payee_group }))}>กลุ่มผู้รับเงิน</Label>
              </div>
              {bulkFields.payee_group && (
                <Combobox options={dynamicPayeeGroups} value={bulkValues.payee_group} onValueChange={v => setBulkValues(s => ({ ...s, payee_group: v }))} placeholder="เลือกหรือพิมพ์" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>ยกเลิก</Button>
            <Button onClick={handleBulkApply} disabled={bulkSaving}>
              {bulkSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckSquare className="h-4 w-4 mr-2" />}
              บันทึก {selectedIds.size} รายการ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
