import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Send, UserCheck, Store, AlertTriangle } from "lucide-react";
import {
  TransactionType, CategoryGroup, TransactionDirection,
  TRANSACTION_TYPES, CATEGORY_GROUPS, TRANSACTION_DIRECTIONS,
  getSubcategoriesForType, getDefaultProjectTags, showProjectTag as shouldShowProjectTag,
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
  sender: string | null;
  receiver: string | null;
  merchant: string | null;
  transaction_type?: string | null;
  category_group?: string | null;
  project_tag?: string | null;
  confidence_score?: number | null;
  needs_review?: boolean;
  transaction_direction?: string | null;
  payee_group?: string | null;
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
    transaction_type: "" as TransactionType | "",
    category_group: "" as CategoryGroup | "",
    project_tag: "",
    needs_review: false,
    transaction_direction: "EXPENSE" as TransactionDirection,
    payee_group: "",
  });
  const [senders, setSenders] = useState<string[]>([]);
  const [receivers, setReceivers] = useState<string[]>([]);
  const [merchants, setMerchants] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [existingSubcategories, setExistingSubcategories] = useState<string[]>([]);
  const [payeeGroups, setPayeeGroups] = useState<{ pattern: string; name: string }[]>([]);
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
        transaction_type: (expense.transaction_type as TransactionType) || "",
        category_group: (expense.category_group as CategoryGroup) || "",
        project_tag: expense.project_tag || "",
        needs_review: expense.needs_review || false,
        transaction_direction: (expense.transaction_direction as TransactionDirection) || "EXPENSE",
        payee_group: expense.payee_group || "",
      });
    }
  }, [expense]);

  useEffect(() => { fetchSuggestions(); }, []);

  const fetchSuggestions = async () => {
    try {
      const [senderRes, receiverRes, merchantRes, tagRes, subcatRes, pgRes] = await Promise.all([
        supabase.from('expenses').select('sender').not('sender', 'is', null),
        supabase.from('expenses').select('receiver').not('receiver', 'is', null),
        supabase.from('expenses').select('merchant').not('merchant', 'is', null),
        supabase.from('expenses').select('project_tag').not('project_tag', 'is', null),
        supabase.from('expenses').select('subcategory').not('subcategory', 'is', null),
        supabase.from('payee_groups').select('payee_pattern, group_name'),
      ]);
      setSenders([...new Set(senderRes.data?.map(i => i.sender).filter(Boolean) || [])] as string[]);
      setReceivers([...new Set(receiverRes.data?.map(i => i.receiver).filter(Boolean) || [])] as string[]);
      setMerchants([...new Set(merchantRes.data?.map(i => i.merchant).filter(Boolean) || [])] as string[]);
      setExistingTags([...new Set(tagRes.data?.map(i => i.project_tag).filter(Boolean) || [])] as string[]);
      setExistingSubcategories([...new Set(subcatRes.data?.map(i => i.subcategory).filter(Boolean) || [])] as string[]);
      setPayeeGroups(pgRes.data?.map(i => ({ pattern: i.payee_pattern, name: i.group_name })) || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  // Auto-suggest payee group when merchant/receiver changes
  useEffect(() => {
    const payee = formData.merchant || formData.receiver;
    if (payee && payeeGroups.length > 0 && !formData.payee_group) {
      const match = payeeGroups.find(pg => pg.pattern === payee);
      if (match) {
        setFormData(prev => ({ ...prev, payee_group: match.name }));
      }
    }
  }, [formData.merchant, formData.receiver, payeeGroups]);

  const direction = formData.transaction_direction || 'EXPENSE';
  const defaultSubcats = getSubcategoriesForType(
    formData.transaction_type as TransactionType || null,
    formData.category_group as CategoryGroup || null,
    direction
  );
  // Merge with existing custom subcategories
  const allSubcategories = [...new Set([...defaultSubcats, ...existingSubcategories])];

  const projectTags = [
    ...getDefaultProjectTags(formData.category_group as CategoryGroup || null),
    ...existingTags.filter(t => !getDefaultProjectTags(formData.category_group as CategoryGroup || null).includes(t)),
  ];

  const showGroup = formData.transaction_type === 'BUSINESS';
  const showTag = showGroup && shouldShowProjectTag(formData.category_group as CategoryGroup || null);
  const showDirection = true;

  const existingPayeeGroupNames = [...new Set(payeeGroups.map(p => p.name))];

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
          transaction_type: formData.transaction_type || null,
          category_group: formData.category_group || null,
          project_tag: formData.project_tag || null,
          needs_review: false,
          transaction_direction: formData.transaction_direction,
          payee_group: formData.payee_group || null,
        })
        .eq('id', expense.id);

      if (error) throw error;

      // Save payee group if new
      if (formData.payee_group && (formData.merchant || formData.receiver)) {
        const payee = formData.merchant || formData.receiver;
        const existing = payeeGroups.find(p => p.pattern === payee);
        if (!existing || existing.name !== formData.payee_group) {
          const userId = (await supabase.auth.getUser()).data.user?.id;
          if (userId) {
            await supabase.from('payee_groups').upsert({
              user_id: userId,
              payee_pattern: payee,
              group_name: formData.payee_group,
            }, { onConflict: 'user_id,payee_pattern' });
          }
        }
      }

      toast({ title: "แก้ไขสำเร็จ", description: "บันทึกข้อมูลเรียบร้อยแล้ว" });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกข้อมูลได้", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            แก้ไขรายการ
            {formData.needs_review && (
              <span className="text-warning flex items-center gap-1 text-sm font-normal">
                <AlertTriangle className="h-4 w-4" />
                ต้องตรวจสอบ
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Direction toggle */}
          {showDirection && (
            <div>
              <Label>ทิศทาง (รายรับ/รายจ่าย)</Label>
              <Select
                value={formData.transaction_direction}
                onValueChange={(v) => setFormData({ ...formData, transaction_direction: v as TransactionDirection, subcategory: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_DIRECTIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Transaction Type */}
          <div>
            <Label>ประเภทธุรกรรม</Label>
            <Select
              value={formData.transaction_type}
              onValueChange={(v) => setFormData({ ...formData, transaction_type: v as TransactionType, category_group: "", subcategory: "", project_tag: "", transaction_direction: "EXPENSE" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="เลือกประเภท" />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Group (BUSINESS only) */}
          {showGroup && (
            <div>
              <Label>กลุ่ม</Label>
              <Select
                value={formData.category_group}
                onValueChange={(v) => setFormData({ ...formData, category_group: v as CategoryGroup, subcategory: "", project_tag: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือกกลุ่ม" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_GROUPS.map(g => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Project Tag - Combobox */}
          {showTag && (
            <div>
              <Label>แท็กโปรเจค</Label>
              <Combobox
                options={projectTags}
                value={formData.project_tag}
                onValueChange={(v) => setFormData({ ...formData, project_tag: v })}
                placeholder="เลือกหรือพิมพ์แท็ก"
              />
            </div>
          )}

          {/* Subcategory - Combobox */}
          {defaultSubcats.length > 0 && (
            <div>
              <Label>ประเภทย่อย</Label>
              <Combobox
                options={allSubcategories}
                value={formData.subcategory}
                onValueChange={(v) => setFormData({ ...formData, subcategory: v })}
                placeholder="เลือกหรือพิมพ์ประเภทย่อย"
              />
            </div>
          )}

          <div>
            <Label htmlFor="amount">จำนวนเงิน (บาท)</Label>
            <Input id="amount" type="number" step="0.01" value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
          </div>

          <div>
            <Label htmlFor="expense_date">วันที่</Label>
            <div className="relative">
              <Input id="expense_date" type="date" value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })} required />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <Label htmlFor="sender"><div className="flex items-center gap-2"><Send className="h-4 w-4" /><span>ผู้โอน</span></div></Label>
            <Input id="sender" value={formData.sender} onChange={(e) => setFormData({ ...formData, sender: e.target.value })}
              list="senders-list" placeholder="ระบุผู้โอน (ถ้ามี)" />
            <datalist id="senders-list">{senders.map(s => <option key={s} value={s} />)}</datalist>
          </div>

          <div>
            <Label htmlFor="receiver"><div className="flex items-center gap-2"><UserCheck className="h-4 w-4" /><span>ผู้รับ</span></div></Label>
            <Input id="receiver" value={formData.receiver} onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
              list="receivers-list" placeholder="ระบุผู้รับ (ถ้ามี)" />
            <datalist id="receivers-list">{receivers.map(r => <option key={r} value={r} />)}</datalist>
          </div>

          <div>
            <Label htmlFor="merchant"><div className="flex items-center gap-2"><Store className="h-4 w-4" /><span>ร้านค้า</span></div></Label>
            <Input id="merchant" value={formData.merchant} onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
              list="merchants-list" placeholder="ระบุร้านค้า (ถ้ามี)" />
            <datalist id="merchants-list">{merchants.map(m => <option key={m} value={m} />)}</datalist>
          </div>

          {/* Payee Group - Combobox */}
          <div>
            <Label>กลุ่มผู้รับเงิน (Payee Group)</Label>
            <Combobox
              options={existingPayeeGroupNames}
              value={formData.payee_group}
              onValueChange={(v) => setFormData({ ...formData, payee_group: v })}
              placeholder="เช่น บัตรเครดิต, Marketing Agency"
            />
          </div>

          <div>
            <Label htmlFor="description">รายละเอียด</Label>
            <Textarea id="description" value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>ยกเลิก</Button>
            <Button type="submit" disabled={loading}>{loading ? "กำลังบันทึก..." : "บันทึก"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
