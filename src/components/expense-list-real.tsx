import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar as CalendarIcon, Search, Filter, Receipt, Edit3, Trash2, Download, Eye, LayoutGrid, Table2, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { ExpenseEditDialog } from "./expense-edit-dialog";
import { cn } from "@/lib/utils";

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
}

export function ExpenseListReal() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "upload-desc" | "name-asc" | "name-desc">("date-desc");
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const { toast } = useToast();

  useEffect(() => {
    fetchExpenses();
  }, []);

  useEffect(() => {
    filterExpenses();
  }, [expenses, searchTerm, filterCategory, filterProject, dateFrom, dateTo, sortBy]);

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*');

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลดข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories and projects from expenses
  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(expenses.map(e => e.category))).sort();
  }, [expenses]);

  const uniqueProjects = useMemo(() => {
    return Array.from(new Set(expenses.map(e => e.project).filter(Boolean))).sort();
  }, [expenses]);

  const filterExpenses = () => {
    let filtered = expenses;

    if (searchTerm) {
      filtered = filtered.filter(expense =>
        expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        expense.project?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter(expense => expense.category === filterCategory);
    }

    if (filterProject !== "all") {
      filtered = filtered.filter(expense => expense.project === filterProject);
    }

    // Filter by date range
    if (dateFrom) {
      filtered = filtered.filter(expense => 
        new Date(expense.expense_date) >= dateFrom
      );
    }

    if (dateTo) {
      filtered = filtered.filter(expense => 
        new Date(expense.expense_date) <= dateTo
      );
    }

    // Sort expenses
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "date-desc") {
        return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
      } else if (sortBy === "date-asc") {
        return new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
      } else if (sortBy === "name-asc") {
        const nameA = (a.description || a.merchant || "").toLowerCase();
        const nameB = (b.description || b.merchant || "").toLowerCase();
        return nameA.localeCompare(nameB, 'th');
      } else if (sortBy === "name-desc") {
        const nameA = (a.description || a.merchant || "").toLowerCase();
        const nameB = (b.description || b.merchant || "").toLowerCase();
        return nameB.localeCompare(nameA, 'th');
      } else { // upload-desc
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredExpenses(sorted);
  };

  const updateExpense = async (id: string, field: 'category' | 'project' | 'subcategory', value: string) => {
    try {
      const updateValue = value === 'none' ? null : value;
      
      // Optimistically update local state
      setExpenses(prev => prev.map(exp => 
        exp.id === id ? { ...exp, [field]: updateValue } : exp
      ));

      const { error } = await supabase
        .from('expenses')
        .update({ [field]: updateValue })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "อัพเดทสำเร็จ",
        description: "แก้ไขรายการเรียบร้อยแล้ว",
      });
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถอัพเดทรายการได้",
        variant: "destructive",
      });
      // Revert on error
      fetchExpenses();
    }
  };

  const deleteExpense = async (id: string, receiptUrl?: string | null) => {
    if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;

    try {
      // Delete receipt from storage if exists
      if (receiptUrl) {
        const { error: storageError } = await supabase.storage
          .from('receipts')
          .remove([receiptUrl]);
        
        if (storageError) console.error('Error deleting receipt:', storageError);
      }

      // Delete expense record
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "ลบสำเร็จ",
        description: "ลบรายการและสลิปเรียบร้อยแล้ว",
      });

      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบรายการได้",
        variant: "destructive",
      });
    }
  };

  const deleteReceipt = async (id: string, receiptUrl: string) => {
    if (!confirm("คุณต้องการลบสลิปนี้ใช่หรือไม่? (รายการข้อมูลจะยังคงอยู่)")) return;

    try {
      // Delete receipt from storage
      const { error: storageError } = await supabase.storage
        .from('receipts')
        .remove([receiptUrl]);
      
      if (storageError) throw storageError;

      // Update expense to remove receipt_url
      const { error } = await supabase
        .from('expenses')
        .update({ receipt_url: null })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "ลบสลิปสำเร็จ",
        description: "ลบสลิปเรียบร้อยแล้ว",
      });

      fetchExpenses();
    } catch (error) {
      console.error('Error deleting receipt:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบสลิปได้",
        variant: "destructive",
      });
    }
  };

  const deleteAllReceipts = async () => {
    if (!confirm("คุณต้องการลบสลิปทั้งหมดใช่หรือไม่? (รายการข้อมูลจะยังคงอยู่)")) return;

    try {
      const receiptsToDelete = expenses
        .filter(e => e.receipt_url)
        .map(e => e.receipt_url!);

      if (receiptsToDelete.length === 0) {
        toast({
          title: "ไม่มีสลิป",
          description: "ไม่พบสลิปที่ต้องลบ",
          variant: "destructive",
        });
        return;
      }

      // Delete all receipts from storage
      const { error: storageError } = await supabase.storage
        .from('receipts')
        .remove(receiptsToDelete);
      
      if (storageError) throw storageError;

      // Update all expenses to remove receipt_url
      const { error } = await supabase
        .from('expenses')
        .update({ receipt_url: null })
        .in('receipt_url', receiptsToDelete);

      if (error) throw error;

      toast({
        title: "ลบสลิปสำเร็จ",
        description: `ลบสลิป ${receiptsToDelete.length} ไฟล์เรียบร้อยแล้ว`,
      });

      fetchExpenses();
    } catch (error) {
      console.error('Error deleting all receipts:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบสลิปได้",
        variant: "destructive",
      });
    }
  };

  const downloadAllReceipts = async () => {
    try {
      const receiptsToDownload = expenses.filter(e => e.receipt_url);

      if (receiptsToDownload.length === 0) {
        toast({
          title: "ไม่มีสลิป",
          description: "ไม่พบสลิปที่ต้องดาวน์โหลด",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "กำลังดาวน์โหลด",
        description: `กำลังดาวน์โหลดสลิป ${receiptsToDownload.length} ไฟล์...`,
      });

      // Download each receipt
      for (const expense of receiptsToDownload) {
        const { data, error } = await supabase.storage
          .from('receipts')
          .download(expense.receipt_url!);

        if (error) {
          console.error('Error downloading receipt:', error);
          continue;
        }

        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        const fileName = expense.receipt_url!.split('/').pop() || `receipt-${expense.id}`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Add delay to avoid overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast({
        title: "ดาวน์โหลดสำเร็จ",
        description: `ดาวน์โหลดสลิป ${receiptsToDownload.length} ไฟล์เรียบร้อยแล้ว`,
      });
    } catch (error) {
      console.error('Error downloading all receipts:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถดาวน์โหลดสลิปได้",
        variant: "destructive",
      });
    }
  };

  const viewReceipt = async (receiptUrl: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(receiptUrl, 3600); // 1 hour expiry

      if (error) throw error;

      setViewingReceipt(data.signedUrl);
      setReceiptDialogOpen(true);
    } catch (error) {
      console.error('Error viewing receipt:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถดูใบเสร็จได้",
        variant: "destructive",
      });
    }
  };

  const downloadReceipt = async (receiptUrl: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .download(receiptUrl);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${Date.now()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถดาวน์โหลดใบเสร็จได้",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-card shadow-elevated">
        <div className="text-center">
          <p className="text-muted-foreground">กำลังโหลดข้อมูล...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-gradient-card shadow-elevated">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">รายการเคลื่อนไหว</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadAllReceipts}
            title="ดาวน์โหลดสลิปทั้งหมด"
          >
            <Download className="h-4 w-4 mr-2" />
            ดาวน์โหลดสลิป
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={deleteAllReceipts}
            title="ลบสลิปทั้งหมด"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            ลบสลิปทั้งหมด
          </Button>
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("card")}
              className="rounded-none"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              การ์ด
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-none"
            >
              <Table2 className="h-4 w-4 mr-2" />
              ตาราง
            </Button>
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหารายการ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger>
            <SelectValue placeholder="ประเภท" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {uniqueCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger>
            <SelectValue placeholder="โปรเจ็ค" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="all">ทุกโปรเจ็ค</SelectItem>
            {uniqueProjects.map((project) => (
              <SelectItem key={project} value={project!}>
                {project}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger>
            <SelectValue placeholder="เรียงลำดับ" />
          </SelectTrigger>
          <SelectContent className="bg-background">
            <SelectItem value="date-desc">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-3 w-3" />
                <span>วันที่ (ใหม่-เก่า)</span>
              </div>
            </SelectItem>
            <SelectItem value="date-asc">
              <div className="flex items-center gap-2">
                <ArrowUp className="h-3 w-3" />
                <span>วันที่ (เก่า-ใหม่)</span>
              </div>
            </SelectItem>
            <SelectItem value="upload-desc">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-3 w-3" />
                <span>อัพโหลดล่าสุด</span>
              </div>
            </SelectItem>
            <SelectItem value="name-asc">
              <div className="flex items-center gap-2">
                <ArrowUp className="h-3 w-3" />
                <span>ชื่อรายการ (ก-ฮ)</span>
              </div>
            </SelectItem>
            <SelectItem value="name-desc">
              <div className="flex items-center gap-2">
                <ArrowDown className="h-3 w-3" />
                <span>ชื่อรายการ (ฮ-ก)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Date Range Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !dateFrom && !dateTo && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom || dateTo ? (
                <span className="truncate">
                  {dateFrom ? format(dateFrom, "d MMM", { locale: th }) : "..."} - {dateTo ? format(dateTo, "d MMM", { locale: th }) : "..."}
                </span>
              ) : (
                <span>ช่วงวันที่</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-3 bg-background" align="start">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">จาก</div>
                <Input
                  type="date"
                  value={dateFrom ? format(dateFrom, "yyyy-MM-dd") : ""}
                  onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">ถึง</div>
                <Input
                  type="date"
                  value={dateTo ? format(dateTo, "yyyy-MM-dd") : ""}
                  onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                  className="w-full"
                >
                  <X className="h-4 w-4 mr-2" />
                  ล้างวันที่
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">ไม่พบรายการ</p>
        </div>
      ) : viewMode === "card" ? (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => (
            <Card key={expense.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4 flex-wrap">
                {/* วันที่ */}
                <div className="text-sm text-muted-foreground w-24 shrink-0">
                  <span className="whitespace-nowrap">
                    {format(new Date(expense.expense_date), 'dd/MM/yy')}
                  </span>
                </div>

                {/* ยอดเงิน */}
                <div className="w-28 text-right shrink-0">
                  <span className="text-base font-semibold text-red-600">
                    -฿{expense.amount.toLocaleString()}
                  </span>
                </div>

                {/* ชื่อรายการ */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground truncate block">
                    {expense.description || "ค่าใช้จ่าย"}
                  </span>
                  {(expense.sender || expense.receiver || expense.merchant) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {expense.sender && <div>จาก: {expense.sender}</div>}
                      {expense.receiver && <div>ถึง: {expense.receiver}</div>}
                      {!expense.sender && !expense.receiver && expense.merchant && (
                        <div>ผู้รับเงิน: {expense.merchant}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* ประเภท - Dropdown */}
                <div className="w-28 shrink-0">
                  <Select
                    value={expense.category}
                    onValueChange={(value) => updateExpense(expense.id, 'category', value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="personal">ส่วนตัว</SelectItem>
                      <SelectItem value="company">บริษัท</SelectItem>
                      {uniqueCategories
                        .filter(cat => cat !== 'personal' && cat !== 'company')
                        .map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ประเภทย่อย - Input */}
                <div className="w-32 shrink-0">
                  <Input
                    value={expense.subcategory || ""}
                    onChange={(e) => updateExpense(expense.id, 'subcategory', e.target.value)}
                    placeholder="ประเภทย่อย"
                    className="h-8 text-xs"
                  />
                </div>

                {/* โปรเจค - Dropdown */}
                <div className="w-32 shrink-0">
                  <Select
                    value={expense.project || 'none'}
                    onValueChange={(value) => updateExpense(expense.id, 'project', value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="เลือกโปรเจค" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="none">-</SelectItem>
                      <SelectItem value="booth">บูธขายของ</SelectItem>
                      <SelectItem value="online">ขายออนไลน์</SelectItem>
                      <SelectItem value="event">ขายตั๋วกิจกรรม</SelectItem>
                      {uniqueProjects
                        .filter(proj => proj !== 'booth' && proj !== 'online' && proj !== 'event')
                        .map((project) => (
                          <SelectItem key={project} value={project!}>
                            {project}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* ปุ่มจัดการ */}
                <div className="flex items-center gap-1 shrink-0">
                  {expense.receipt_url && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewReceipt(expense.receipt_url!)}
                        className="h-8 w-8 p-0"
                        title="ดูใบเสร็จ"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadReceipt(expense.receipt_url!)}
                        className="h-8 w-8 p-0"
                        title="ดาวน์โหลดใบเสร็จ"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteReceipt(expense.id, expense.receipt_url!)}
                        className="h-8 w-8 p-0 hover:text-orange-600"
                        title="ลบเฉพาะสลิป"
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingExpense(expense);
                      setEditDialogOpen(true);
                    }}
                    className="h-8 w-8 p-0"
                    title="แก้ไขรายการ"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteExpense(expense.id, expense.receipt_url)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    title="ลบรายการและสลิป"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">วันที่</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead className="w-[140px]">ผู้รับเงิน</TableHead>
                <TableHead className="w-[120px]">ประเภท</TableHead>
                <TableHead className="w-[120px]">ประเภทย่อย</TableHead>
                <TableHead className="w-[150px]">โปรเจ็ค</TableHead>
                <TableHead className="text-right w-[120px]">จำนวนเงิน</TableHead>
                <TableHead className="w-[100px]">ใบเสร็จ</TableHead>
                <TableHead className="text-right w-[120px]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(new Date(expense.expense_date), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="font-medium">
                    {expense.description || "ค่าใช้จ่าย"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {expense.merchant || "-"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={expense.category}
                      onValueChange={(value) => updateExpense(expense.id, 'category', value)}
                    >
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="personal">ส่วนตัว</SelectItem>
                        <SelectItem value="company">บริษัท</SelectItem>
                        {uniqueCategories
                          .filter(cat => cat !== 'personal' && cat !== 'company')
                          .map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={expense.subcategory || ""}
                      onChange={(e) => updateExpense(expense.id, 'subcategory', e.target.value)}
                      placeholder="ใส่ประเภทย่อย"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={expense.project || 'none'}
                      onValueChange={(value) => updateExpense(expense.id, 'project', value)}
                    >
                      <SelectTrigger className="h-8 w-[150px]">
                        <SelectValue placeholder="เลือกโปรเจค" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">ยังไม่ระบุ</SelectItem>
                        <SelectItem value="booth">บูธขายของ</SelectItem>
                        <SelectItem value="online">ขายออนไลน์</SelectItem>
                        <SelectItem value="event">ขายตั๋วกิจกรรม</SelectItem>
                        {uniqueProjects
                          .filter(proj => proj !== 'booth' && proj !== 'online' && proj !== 'event')
                          .map((project) => (
                            <SelectItem key={project} value={project!}>
                              {project}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-red-600">
                    -฿{expense.amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {expense.receipt_url ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewReceipt(expense.receipt_url!)}
                          className="h-8 w-8 p-0"
                          title="ดูใบเสร็จ"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadReceipt(expense.receipt_url!)}
                          className="h-8 w-8 p-0"
                          title="ดาวน์โหลดใบเสร็จ"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteReceipt(expense.id, expense.receipt_url!)}
                          className="h-8 w-8 p-0 hover:text-orange-600"
                          title="ลบเฉพาะสลิป"
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingExpense(expense);
                          setEditDialogOpen(true);
                        }}
                        className="h-8 w-8 p-0"
                        title="แก้ไขรายการ"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteExpense(expense.id, expense.receipt_url)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        title="ลบรายการและสลิป"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ExpenseEditDialog
        expense={editingExpense}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchExpenses}
      />

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>ดูใบเสร็จ</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[75vh]">
            {viewingReceipt && (
              <img 
                src={viewingReceipt} 
                alt="Receipt" 
                className="w-full h-auto rounded-lg"
                onError={(e) => {
                  // If image fails to load, try rendering as PDF
                  const container = e.currentTarget.parentElement;
                  if (container) {
                    container.innerHTML = `<iframe src="${viewingReceipt}" class="w-full h-[600px] rounded-lg"></iframe>`;
                  }
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}