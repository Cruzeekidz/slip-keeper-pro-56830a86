import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Search, Filter, Receipt, Edit3, Trash2, Download, Eye, LayoutGrid, Table2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { ExpenseEditDialog } from "./expense-edit-dialog";

interface Expense {
  id: string;
  amount: number;
  category: string;
  project: string | null;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
  created_at: string;
}

export function ExpenseListReal() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
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
  }, [expenses, searchTerm, filterCategory, filterProject]);

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

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

    setFilteredExpenses(filtered);
  };

  const updateExpense = async (id: string, field: 'category' | 'project', value: string) => {
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

  const deleteExpense = async (id: string) => {
    if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "ลบสำเร็จ",
        description: "ลบรายการเรียบร้อยแล้ว",
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
          <SelectContent>
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
          <SelectContent>
            <SelectItem value="all">ทุกโปรเจ็ค</SelectItem>
            {uniqueProjects.map((project) => (
              <SelectItem key={project} value={project!}>
                {project}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">ไม่พบรายการ</p>
        </div>
      ) : viewMode === "card" ? (
        <div className="space-y-4">
          {filteredExpenses.map((expense) => (
            <Card key={expense.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-foreground">
                      {expense.description || "ค่าใช้จ่าย"}
                    </h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      expense.category === 'personal' 
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                    }`}>
                      {expense.category === 'personal' ? 'ส่วนตัว' : 'บริษัท'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(expense.expense_date), 'dd MMM yyyy', { locale: th })}
                    </div>
                    {expense.project && (
                      <span className="px-2 py-1 bg-muted rounded text-xs">
                        {expense.project === 'booth' ? 'บูธขายของ' :
                         expense.project === 'online' ? 'ขายออนไลน์' :
                         expense.project === 'event' ? 'ขายตั๋วกิจกรรม' : 'อื่นๆ'}
                      </span>
                    )}
                    {expense.receipt_url && (
                      <Receipt className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-red-600">
                    -฿{expense.amount.toLocaleString()}
                  </span>
                  
                  <div className="flex items-center gap-1">
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
                      onClick={() => deleteExpense(expense.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      title="ลบรายการ"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
                <TableHead className="w-[120px]">ประเภท</TableHead>
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
                        onClick={() => deleteExpense(expense.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        title="ลบรายการ"
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