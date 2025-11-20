import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Send, UserCheck, Store } from "lucide-react";

interface Expense {
  id: string;
  amount: number;
  category: string;
  subcategory: string | null;
  project: string | null;
  description: string | null;
  expense_date: string;
  receipt_url: string | null;
  sender: string | null;
  receiver: string | null;
  merchant: string | null;
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
    subcategory: "",
    project: "",
    description: "",
    expense_date: "",
    sender: "",
    receiver: "",
    merchant: "",
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [receivers, setReceivers] = useState<string[]>([]);
  const [merchants, setMerchants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (expense) {
      setFormData({
        amount: expense.amount.toString(),
        category: expense.category,
        subcategory: expense.subcategory || "",
        project: expense.project || "",
        description: expense.description || "",
        expense_date: expense.expense_date,
        sender: expense.sender || "",
        receiver: expense.receiver || "",
        merchant: expense.merchant || "",
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

      const { data: subcategoryData } = await supabase
        .from('expenses')
        .select('subcategory')
        .order('subcategory');
      
      const uniqueSubcategories = [...new Set(subcategoryData?.map(item => item.subcategory).filter(Boolean) || [])] as string[];
      setSubcategories(uniqueSubcategories);

      const { data: projectData } = await supabase
        .from('expenses')
        .select('project')
        .order('project');
      
      const uniqueProjects = [...new Set(projectData?.map(item => item.project).filter(Boolean) || [])] as string[];
      setProjects(uniqueProjects);

      const { data: senderData } = await supabase
        .from('expenses')
        .select('sender')
        .order('sender');
      
      const uniqueSenders = [...new Set(senderData?.map(item => item.sender).filter(Boolean) || [])] as string[];
      setSenders(uniqueSenders);

      const { data: receiverData } = await supabase
        .from('expenses')
        .select('receiver')
        .order('receiver');
      
      const uniqueReceivers = [...new Set(receiverData?.map(item => item.receiver).filter(Boolean) || [])] as string[];
      setReceivers(uniqueReceivers);

      const { data: merchantData } = await supabase
        .from('expenses')
        .select('merchant')
        .order('merchant');
      
      const uniqueMerchants = [...new Set(merchantData?.map(item => item.merchant).filter(Boolean) || [])] as string[];
      setMerchants(uniqueMerchants);
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
          subcategory: formData.subcategory || null,
          project: formData.project || null,
          description: formData.description || null,
          expense_date: formData.expense_date,
          sender: formData.sender || null,
          receiver: formData.receiver || null,
          merchant: formData.merchant || null,
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
            <Label htmlFor="subcategory">ประเภทย่อย</Label>
            <Input
              id="subcategory"
              value={formData.subcategory}
              onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
              list="subcategories-list"
              placeholder="ระบุประเภทย่อย (ถ้ามี)"
            />
            <datalist id="subcategories-list">
              {subcategories.map((subcat) => (
                <option key={subcat} value={subcat} />
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
            <Label htmlFor="sender">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                <span>ผู้โอน</span>
              </div>
            </Label>
            <Input
              id="sender"
              value={formData.sender}
              onChange={(e) => setFormData({ ...formData, sender: e.target.value })}
              list="senders-list"
              placeholder="ระบุผู้โอน (ถ้ามี)"
            />
            <datalist id="senders-list">
              {senders.map((sender) => (
                <option key={sender} value={sender} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="receiver">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                <span>ผู้รับ</span>
              </div>
            </Label>
            <Input
              id="receiver"
              value={formData.receiver}
              onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
              list="receivers-list"
              placeholder="ระบุผู้รับ (ถ้ามี)"
            />
            <datalist id="receivers-list">
              {receivers.map((receiver) => (
                <option key={receiver} value={receiver} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="merchant">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                <span>ร้านค้า</span>
              </div>
            </Label>
            <Input
              id="merchant"
              value={formData.merchant}
              onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
              list="merchants-list"
              placeholder="ระบุร้านค้า (ถ้ามี)"
            />
            <datalist id="merchants-list">
              {merchants.map((merchant) => (
                <option key={merchant} value={merchant} />
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
