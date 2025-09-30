import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "lucide-react";

interface Expense {
  id: string;
  amount: number;
  category: string;
  project: string | null;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
}

interface ExpenseEditDialogProps {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ExpenseEditDialog({ expense, open, onOpenChange, onSuccess }: ExpenseEditDialogProps) {
  const [formData, setFormData] = useState({
    amount: "",
    category: "",
    project: "",
    description: "",
    expense_date: "",
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (expense) {
      setFormData({
        amount: expense.amount.toString(),
        category: expense.category,
        project: expense.project || "",
        description: expense.description || "",
        expense_date: expense.expense_date,
      });
    }
  }, [expense]);

  useEffect(() => {
    fetchCategoriesAndProjects();
  }, []);

  const fetchCategoriesAndProjects = async () => {
    try {
      const { data: categoryData } = await supabase
        .from('expenses')
        .select('category')
        .order('category');
      
      const uniqueCategories = [...new Set(categoryData?.map(item => item.category).filter(Boolean) || [])];
      setCategories(uniqueCategories);

      const { data: projectData } = await supabase
        .from('expenses')
        .select('project')
        .order('project');
      
      const uniqueProjects = [...new Set(projectData?.map(item => item.project).filter(Boolean) || [])] as string[];
      setProjects(uniqueProjects);
    } catch (error) {
      console.error('Error fetching categories and projects:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          amount: parseFloat(formData.amount),
          category: formData.category,
          project: formData.project || null,
          description: formData.description || null,
          expense_date: formData.expense_date,
        })
        .eq('id', expense.id);

      if (error) throw error;

      toast({
        title: "แก้ไขสำเร็จ",
        description: "บันทึกข้อมูลเรียบร้อยแล้ว",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถบันทึกข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>แก้ไขรายการ</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="category">ประเภท</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              list="categories-list"
              required
            />
            <datalist id="categories-list">
              {categories.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="project">โปรเจ็ค</Label>
            <Input
              id="project"
              value={formData.project}
              onChange={(e) => setFormData({ ...formData, project: e.target.value })}
              list="projects-list"
            />
            <datalist id="projects-list">
              {projects.map((proj) => (
                <option key={proj} value={proj} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="expense_date">วันที่</Label>
            <div className="relative">
              <Input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <Label htmlFor="description">รายละเอียด</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
