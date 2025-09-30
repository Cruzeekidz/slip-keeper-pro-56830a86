import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Search, Filter, Receipt, Edit3, Trash2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { th } from "date-fns/locale";

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
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          ตัวกรอง
        </Button>
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
            <SelectItem value="personal">ค่าใช้จ่ายส่วนตัว</SelectItem>
            <SelectItem value="company">ค่าใช้จ่ายบริษัท</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger>
            <SelectValue placeholder="โปรเจ็ค" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกโปรเจ็ค</SelectItem>
            <SelectItem value="booth">บูธขายของ</SelectItem>
            <SelectItem value="online">ขายออนไลน์</SelectItem>
            <SelectItem value="event">ขายตั๋วกิจกรรม</SelectItem>
            <SelectItem value="other">อื่นๆ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Expense List */}
      <div className="space-y-4">
        {filteredExpenses.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">ไม่พบรายการ</p>
          </div>
        ) : (
          filteredExpenses.map((expense) => (
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadReceipt(expense.receipt_url!)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteExpense(expense.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </Card>
  );
}