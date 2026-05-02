import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Banknote, Save } from "lucide-react";
import {
  TransactionType, CategoryGroup, TransactionDirection,
  TRANSACTION_TYPES, CATEGORY_GROUPS, TRANSACTION_DIRECTIONS,
  getSubcategoriesForType, getDefaultProjectTags, showProjectTag,
} from "@/lib/category-constants";

const CashExpense = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    expense_date: today,
    expense_time: "",
    amount: "",
    description: "",
    merchant: "",
    receiver: "",
    transaction_type: "BUSINESS" as TransactionType,
    category_group: "GENERAL" as CategoryGroup | "",
    project_tag: "",
    subcategory: "",
    transaction_direction: "EXPENSE" as TransactionDirection,
    needs_review: false,
    memo_text: "",
    event_name: "",
    payee_group: "",
  });

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  const subcategories = getSubcategoriesForType(
    form.transaction_type || null,
    (form.category_group || null) as CategoryGroup | null,
    form.transaction_direction
  );

  const projectTagOptions = getDefaultProjectTags((form.category_group || null) as CategoryGroup | null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amountNum = parseFloat(form.amount);
    if (!amountNum || amountNum <= 0) {
      toast({ title: "กรอกจำนวนเงิน", description: "จำนวนเงินต้องมากกว่า 0", variant: "destructive" });
      return;
    }
    if (!form.expense_date) {
      toast({ title: "เลือกวันที่", variant: "destructive" });
      return;
    }
    if (!form.subcategory) {
      toast({ title: "เลือกหมวดย่อย", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const category = form.transaction_type === "BUSINESS"
        ? `BUSINESS > ${form.category_group || "GENERAL"}`
        : form.transaction_type;

      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        amount: amountNum,
        expense_date: form.expense_date,
        expense_time: form.expense_time || null,
        description: form.description.trim() || null,
        merchant: form.merchant.trim() || null,
        receiver: form.receiver.trim() || null,
        category,
        subcategory: form.subcategory || null,
        transaction_type: form.transaction_type,
        category_group: form.transaction_type === "BUSINESS" ? (form.category_group || null) : null,
        project_tag: form.project_tag.trim() || null,
        transaction_direction: form.transaction_direction,
        needs_review: form.needs_review,
        memo_text: form.memo_text.trim() || null,
        event_name: form.event_name.trim() || null,
        payee_group: form.payee_group.trim() || null,
        is_cash: true,
        receipt_url: null,
        confidence_score: 100,
      } as any);

      if (error) throw error;

      toast({ title: "บันทึกสำเร็จ", description: `บันทึกเงินสด ${amountNum.toLocaleString()} บาท` });
      // Reset minimal fields, keep date/category for fast entry
      setForm(prev => ({
        ...prev,
        amount: "",
        description: "",
        merchant: "",
        receiver: "",
        memo_text: "",
        event_name: "",
        payee_group: "",
      }));
    } catch (err: any) {
      console.error(err);
      toast({ title: "บันทึกไม่สำเร็จ", description: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-primary-foreground hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <Banknote className="h-7 w-7" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">บันทึกค่าใช้จ่ายเงินสด</h1>
              <p className="text-primary-foreground/80 text-sm">รายการที่ไม่มีสลิป จ่ายด้วยเงินสด</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>ฟอร์มกรอกรายการ</CardTitle>
            <CardDescription>กรอกข้อมูลครบถ้วนเพื่อบันทึกลงระบบ — ระบบจะติดป้าย "เงินสด" อัตโนมัติ</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Date / Time / Amount */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expense_date">วันที่ *</Label>
                  <Input
                    id="expense_date"
                    type="date"
                    value={form.expense_date}
                    onChange={e => setForm({ ...form, expense_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense_time">เวลา</Label>
                  <Input
                    id="expense_time"
                    type="time"
                    value={form.expense_time}
                    onChange={e => setForm({ ...form, expense_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">จำนวนเงิน (บาท) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              {/* Direction + Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ทิศทาง</Label>
                  <Select
                    value={form.transaction_direction}
                    onValueChange={v => setForm({ ...form, transaction_direction: v as TransactionDirection })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_DIRECTIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>ประเภท *</Label>
                  <Select
                    value={form.transaction_type}
                    onValueChange={v => setForm({
                      ...form,
                      transaction_type: v as TransactionType,
                      category_group: v === "BUSINESS" ? (form.category_group || "GENERAL") : "",
                      subcategory: "",
                      project_tag: "",
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Group (Business only) */}
              {form.transaction_type === "BUSINESS" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>กลุ่มธุรกิจ *</Label>
                    <Select
                      value={form.category_group}
                      onValueChange={v => setForm({ ...form, category_group: v as CategoryGroup, subcategory: "", project_tag: "" })}
                    >
                      <SelectTrigger><SelectValue placeholder="เลือกกลุ่ม" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_GROUPS.map(g => (
                          <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {showProjectTag(form.category_group as CategoryGroup) && (
                    <div className="space-y-2">
                      <Label>Project Tag (อีเวนท์/โครงการ)</Label>
                      <Combobox
                        options={projectTagOptions}
                        value={form.project_tag}
                        onValueChange={(v) => setForm({ ...form, project_tag: v })}
                        placeholder="เลือกหรือพิมพ์..."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Subcategory */}
              <div className="space-y-2">
                <Label>หมวดย่อย *</Label>
                <Select
                  value={form.subcategory}
                  onValueChange={v => setForm({ ...form, subcategory: v })}
                  disabled={subcategories.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="เลือกหมวดย่อย" /></SelectTrigger>
                  <SelectContent>
                    {subcategories.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">คำอธิบาย / รายละเอียด</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="เช่น ค่ากาแฟ, ค่าน้ำมันรถ, ค่าอาหารทีม..."
                  rows={2}
                />
              </div>

              {/* Merchant / Receiver */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="merchant">ร้านค้า / สถานที่</Label>
                  <Input
                    id="merchant"
                    value={form.merchant}
                    onChange={e => setForm({ ...form, merchant: e.target.value })}
                    placeholder="ชื่อร้าน / สถานที่"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiver">ผู้รับเงิน</Label>
                  <Input
                    id="receiver"
                    value={form.receiver}
                    onChange={e => setForm({ ...form, receiver: e.target.value })}
                    placeholder="ชื่อผู้รับเงิน"
                  />
                </div>
              </div>

              {/* Event / Payee group */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event_name">ชื่ออีเวนท์ (ถ้ามี)</Label>
                  <Input
                    id="event_name"
                    value={form.event_name}
                    onChange={e => setForm({ ...form, event_name: e.target.value })}
                    placeholder="เช่น Terminal21, KMT41"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payee_group">กลุ่มผู้รับเงิน</Label>
                  <Input
                    id="payee_group"
                    value={form.payee_group}
                    onChange={e => setForm({ ...form, payee_group: e.target.value })}
                    placeholder="เช่น Staff, Vendor"
                  />
                </div>
              </div>

              {/* Memo */}
              <div className="space-y-2">
                <Label htmlFor="memo_text">หมายเหตุภายใน</Label>
                <Textarea
                  id="memo_text"
                  value={form.memo_text}
                  onChange={e => setForm({ ...form, memo_text: e.target.value })}
                  placeholder="บันทึกเพิ่มเติม..."
                  rows={2}
                />
              </div>

              {/* Needs review */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="needs_review" className="font-medium">ทำเครื่องหมายว่ารอตรวจสอบ</Label>
                  <p className="text-xs text-muted-foreground">รายการจะปรากฏในหน้า Review Queue</p>
                </div>
                <Switch
                  id="needs_review"
                  checked={form.needs_review}
                  onCheckedChange={(checked) => setForm({ ...form, needs_review: checked })}
                />
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={submitting} className="flex-1">
                  <Save className="h-4 w-4 mr-2" />
                  {submitting ? "กำลังบันทึก..." : "บันทึกรายการเงินสด"}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate("/")}>
                  ยกเลิก
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CashExpense;