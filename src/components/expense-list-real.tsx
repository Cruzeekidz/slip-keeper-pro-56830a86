import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Search, Filter, Receipt, Edit3, Trash2, Download, Eye, LayoutGrid, Table2, ArrowUpDown, X, Send, UserCheck, Store, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { ExpenseEditDialog } from "./expense-edit-dialog";
import { ReceiptGallery } from "./receipt-gallery";
import { cn } from "@/lib/utils";
import {
  TransactionType, CategoryGroup,
  TRANSACTION_TYPES, CATEGORY_GROUPS,
  getTypeBadgeClass, formatTypeLabel,
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
}

export function ExpenseListReal() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterReview, setFilterReview] = useState("all");
  const [filterSender, setFilterSender] = useState("all");
  const [filterReceiver, setFilterReceiver] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "upload-desc">("date-desc");
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<number>(-1);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const { toast } = useToast();

  useEffect(() => { fetchExpenses(); }, []);
  useEffect(() => { filterExpenses(); }, [expenses, searchTerm, filterType, filterGroup, filterReview, filterSender, filterReceiver, dateFrom, dateTo, sortBy]);

  // Realtime subscription for new expenses (e.g. from LINE webhook)
  useEffect(() => {
    const channel = supabase
      .channel('expenses-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => {
          fetchExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchExpenses = async () => {
    try {
      // Fetch all expenses - use range to bypass 1000 row default limit
      let allExpenses: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .range(from, from + pageSize - 1)
          .order('expense_date', { ascending: false });
        if (error) throw error;
        if (data && data.length > 0) {
          allExpenses = [...allExpenses, ...data];
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      setExpenses(allExpenses);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const uniqueSenders = useMemo(() => Array.from(new Set(expenses.map(e => e.sender).filter(Boolean))).sort(), [expenses]);
  const uniqueReceivers = useMemo(() => Array.from(new Set(expenses.map(e => e.receiver).filter(Boolean))).sort(), [expenses]);

  const filterExpenses = () => {
    let filtered = expenses;
    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.project_tag?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.merchant?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.receiver?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.payee_group?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (filterType !== "all") filtered = filtered.filter(e => e.transaction_type === filterType);
    if (filterGroup !== "all") filtered = filtered.filter(e => e.category_group === filterGroup);
    if (filterReview === "review") filtered = filtered.filter(e => e.needs_review);
    if (filterSender !== "all") filtered = filtered.filter(e => e.sender === filterSender);
    if (filterReceiver !== "all") filtered = filtered.filter(e => e.receiver === filterReceiver);
    if (dateFrom) filtered = filtered.filter(e => new Date(e.expense_date) >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => new Date(e.expense_date) <= dateTo);

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date-desc") return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
      if (sortBy === "date-asc") return new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setFilteredExpenses(sorted);
  };

  const deleteExpense = async (id: string, receiptUrl?: string | null) => {
    if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;
    try {
      if (receiptUrl) await supabase.storage.from('receipts').remove([receiptUrl]);
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "ลบสำเร็จ" });
      fetchExpenses();
    } catch (error) { toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }); }
  };

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

  if (loading) {
    return <Card className="p-6 bg-gradient-card shadow-elevated"><div className="text-center"><p className="text-muted-foreground">กำลังโหลดข้อมูล...</p></div></Card>;
  }

  const isIncome = (e: Expense) => e.transaction_direction === 'INCOME';

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-6">
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

      {/* Summary */}
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
        {(filterType !== "all" || filterGroup !== "all" || filterReview !== "all" || filterSender !== "all" || filterReceiver !== "all" || dateFrom || dateTo || searchTerm) && (
          <Button variant="outline" onClick={() => {
            setSearchTerm(""); setFilterType("all"); setFilterGroup("all"); setFilterReview("all"); setFilterSender("all"); setFilterReceiver("all"); setDateFrom(undefined); setDateTo(undefined);
          }}><X className="h-4 w-4 mr-2" />ล้างฟิลเตอร์</Button>
        )}
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-8"><p className="text-muted-foreground">ไม่พบรายการ</p></div>
      ) : viewMode === "card" ? (
        <div className="space-y-3">
          {filteredExpenses.map((expense, index) => (
            <Card key={expense.id} className={cn("hover:shadow-md transition-shadow", expense.needs_review && "ring-1 ring-warning/50")}>
              <div className="p-3 md:p-4 flex flex-col md:flex-row md:items-start gap-3 md:gap-4 border-b">
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
                  <Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id, expense.receipt_url)} className="h-8 w-8 p-0 text-destructive" title="ลบ"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ประเภทย่อย</TableHead>
                <TableHead>แท็ก</TableHead>
                <TableHead>กลุ่มผู้รับ</TableHead>
                <TableHead className="text-right">จำนวนเงิน</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => (
                <TableRow key={expense.id} className={cn(expense.needs_review && "bg-warning/5")}>
                  <TableCell className="text-sm">{format(new Date(expense.expense_date), "d MMM yy", { locale: th })}</TableCell>
                  <TableCell className="font-medium">{expense.description || expense.merchant || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", getTypeBadgeClass(expense.transaction_type as TransactionType, expense.category_group as CategoryGroup))}>
                      {expense.transaction_type || '-'}
                      {expense.category_group ? `/${expense.category_group}` : ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{expense.subcategory || "-"}</TableCell>
                  <TableCell className="text-sm">{expense.project_tag || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{expense.payee_group || "-"}</TableCell>
                  <TableCell className={cn("text-right font-semibold",
                    expense.transaction_type === 'TRANSFER' ? 'text-type-transfer' :
                    isIncome(expense) ? 'text-success' : 'text-expense'
                  )}>
                    {isIncome(expense) ? '+' : expense.transaction_type === 'TRANSFER' ? '↔' : '-'}฿{expense.amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {expense.needs_review && <AlertTriangle className="h-4 w-4 text-warning" />}
                    {isIncome(expense) && <ArrowDownLeft className="h-4 w-4 text-success" />}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingExpense(expense); setEditDialogOpen(true); }} className="h-8 w-8 p-0"><Edit3 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteExpense(expense.id, expense.receipt_url)} className="h-8 w-8 p-0 text-destructive"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ExpenseEditDialog expense={editingExpense} open={editDialogOpen} onOpenChange={setEditDialogOpen} onSuccess={fetchExpenses} />

      {galleryOpen && (
        <ReceiptGallery
          receipts={filteredExpenses.filter(e => e.receipt_url).map(e => ({ id: e.id, receipt_url: e.receipt_url!, description: e.description, expense_date: e.expense_date, amount: e.amount }))}
          initialIndex={viewingReceipt}
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
        />
      )}
    </Card>
  );
}
