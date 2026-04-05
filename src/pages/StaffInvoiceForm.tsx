import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, CheckCircle } from "lucide-react";
import ExpenseClaimSection, { type ExpenseClaimItem } from "@/components/staff/ExpenseClaimSection";
import SubstituteReceiptGenerator from "@/components/staff/SubstituteReceiptGenerator";

interface EventOption {
  id: string;
  event_name: string;
  event_date: string | null;
}

const StaffInvoiceForm = () => {
  const [searchParams] = useSearchParams();
  const staffId = searchParams.get("staff");
  const [staffName, setStaffName] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaimItem[]>([]);
  const [showSubstituteReceipt, setShowSubstituteReceipt] = useState(false);

  const [form, setForm] = useState({
    event_name: "",
    event_id: "",
    days_worked: 1,
    daily_rate: 0,
    work_start_date: "",
    work_end_date: "",
    notes: "",
  });

  const [whtMode] = useState<"inclusive" | "exclusive">("inclusive");

  const baseAmount = form.days_worked * form.daily_rate;
  const grossAmount = whtMode === "inclusive" ? baseAmount : Math.round(baseAmount / 0.97 * 100) / 100;
  const whtAmount = Math.round(grossAmount * 0.03 * 100) / 100;
  const netAmount = grossAmount - whtAmount;
  const expenseTotal = expenseClaims.reduce((s, i) => s + i.amount, 0);
  const grandTotal = netAmount + expenseTotal;

  useEffect(() => {
    if (!staffId) { setLoading(false); setError("ลิงก์ไม่ถูกต้อง"); return; }

    const fetchData = async () => {
      const { data, error: fetchError } = await supabase
        .from("staff_profiles")
        .select("staff_name, daily_rate, user_id")
        .eq("id", staffId)
        .eq("is_active", true)
        .maybeSingle();

      if (fetchError || !data) {
        setError("ไม่พบข้อมูลทีมงาน หรือลิงก์หมดอายุ");
        setLoading(false);
        return;
      }

      setStaffName(data.staff_name);
      setStaffUserId(data.user_id);
      setForm((f) => ({ ...f, daily_rate: data.daily_rate }));

      const { data: eventData } = await supabase
        .from("event_registry")
        .select("id, event_name, event_date")
        .eq("user_id", data.user_id)
        .eq("is_active", true)
        .order("event_date", { ascending: false });

      if (eventData) setEvents(eventData);
      setLoading(false);
    };
    fetchData();
  }, [staffId]);

  useEffect(() => {
    if (form.work_start_date && form.work_end_date) {
      const start = new Date(form.work_start_date);
      const end = new Date(form.work_end_date);
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setForm((f) => ({ ...f, days_worked: diff }));
    }
  }, [form.work_start_date, form.work_end_date]);

  const handleEventSelect = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    setForm((f) => ({ ...f, event_id: eventId, event_name: ev?.event_name || "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId || !staffUserId) return;
    setSubmitting(true);

    const invoiceNumber = `SI-${new Date().getFullYear() + 543}-${String(Date.now()).slice(-4)}`;

    // Insert staff invoice
    const { data: invoiceData, error: insertError } = await supabase.from("staff_invoices").insert({
      user_id: staffUserId,
      staff_id: staffId,
      invoice_number: invoiceNumber,
      event_id: form.event_id || null,
      event_name: form.event_name,
      days_worked: form.days_worked,
      daily_rate: form.daily_rate,
      gross_amount: grossAmount,
      wht_rate: 3,
      wht_amount: whtAmount,
      net_amount: netAmount,
      work_start_date: form.work_start_date || null,
      work_end_date: form.work_end_date || null,
      notes: form.notes || null,
      status: "submitted",
      submitted_via: "web",
      submitted_at: new Date().toISOString(),
    }).select("id").single();

    if (insertError) {
      setError("เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่");
      console.error(insertError);
      setSubmitting(false);
      return;
    }

    // Insert expense claims if any
    if (expenseClaims.length > 0 && invoiceData?.id) {
      const claims = expenseClaims.map((c) => ({
        user_id: staffUserId,
        staff_id: staffId,
        invoice_id: invoiceData.id,
        event_id: form.event_id || null,
        event_name: form.event_name,
        category: c.category,
        description: c.description,
        amount: c.amount,
        receipt_url: c.receipt_url || null,
        has_formal_receipt: c.has_formal_receipt,
        expense_date: c.expense_date || null,
        status: "submitted",
      }));

      const { error: claimError } = await supabase.from("staff_expense_claims").insert(claims);
      if (claimError) console.error("Expense claims error:", claimError);
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (error && !staffName) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold">ส่งใบเรียกเก็บเงินสำเร็จ!</h2>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>ยอดค่าแรงสุทธิ: <span className="font-bold text-foreground">{netAmount.toLocaleString()} บาท</span></p>
              {expenseTotal > 0 && (
                <p>ค่าใช้จ่ายอื่น: <span className="font-bold text-foreground">{expenseTotal.toLocaleString()} บาท</span></p>
              )}
              <p className="text-lg font-bold text-primary pt-2">รวมทั้งสิ้น: {grandTotal.toLocaleString()} บาท</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto pt-8 space-y-4">
        <Card>
          <CardHeader className="text-center">
            <FileText className="h-10 w-10 mx-auto text-primary mb-2" />
            <CardTitle>ฟอร์มเรียกเก็บค่าแรง</CardTitle>
            <CardDescription>ทีมงาน: {staffName}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Event selection */}
              <div>
                <Label>ชื่องาน / อีเวนท์ *</Label>
                {events.length > 0 ? (
                  <Select value={form.event_id} onValueChange={handleEventSelect}>
                    <SelectTrigger><SelectValue placeholder="เลือกอีเวนท์" /></SelectTrigger>
                    <SelectContent>
                      {events.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.event_name} {ev.event_date ? `(${ev.event_date})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} required placeholder="เช่น Mahanakhon Balance Bike" />
                )}
                {events.length > 0 && !form.event_id && (
                  <Input className="mt-2" value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} placeholder="หรือพิมพ์ชื่องานเอง" />
                )}
              </div>

              {/* Work dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>วันเริ่มงาน *</Label>
                  <Input type="date" value={form.work_start_date} onChange={(e) => setForm({ ...form, work_start_date: e.target.value })} required />
                </div>
                <div>
                  <Label>วันสิ้นสุดงาน *</Label>
                  <Input type="date" value={form.work_end_date} onChange={(e) => setForm({ ...form, work_end_date: e.target.value })} required />
                </div>
              </div>

              {/* Days & rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>จำนวนวันทำงาน *</Label>
                  <Input type="number" min={0.5} step={0.5} value={form.days_worked} onChange={(e) => setForm({ ...form, days_worked: Number(e.target.value) })} required />
                </div>
                <div>
                  <Label>ค่าแรง/วัน (บาท) *</Label>
                  <Input type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })} required />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>หมายเหตุ</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="รายละเอียดเพิ่มเติม" />
              </div>

              <Separator />

              {/* Expense claims section */}
              <ExpenseClaimSection
                items={expenseClaims}
                onChange={setExpenseClaims}
                staffId={staffId || ""}
              />

              {/* Substitute receipt button for items without receipts */}
              {expenseClaims.some((c) => !c.has_formal_receipt && c.amount > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowSubstituteReceipt(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  สร้างใบแทนใบเสร็จ (สำหรับรายการที่ไม่มีบิล)
                </Button>
              )}

              <Separator />

              {/* Summary */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>ค่าแรง ({form.days_worked} วัน × {form.daily_rate.toLocaleString()})</span>
                  <span>{baseAmount.toLocaleString()} บาท</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span>Gross (ค่าแรง)</span>
                  <span className="font-medium">{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>หัก ณ ที่จ่าย 3%</span>
                  <span>-{whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>ค่าแรงสุทธิ (Net)</span>
                  <span className="font-medium">{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                </div>

                {expenseTotal > 0 && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span>ค่าใช้จ่ายอื่น ({expenseClaims.length} รายการ)</span>
                      <span className="font-medium">{expenseTotal.toLocaleString()} บาท</span>
                    </div>
                  </>
                )}

                <Separator />
                <div className="flex justify-between text-lg font-bold text-primary">
                  <span>ยอดรวมทั้งสิ้น</span>
                  <span>{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                </div>
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}

              <Button type="submit" className="w-full" size="lg" disabled={submitting || !form.event_name}>
                {submitting ? "กำลังส่ง..." : "ส่งใบเรียกเก็บเงิน"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Substitute receipt dialog */}
      {showSubstituteReceipt && (
        <SubstituteReceiptGenerator
          open={showSubstituteReceipt}
          onClose={() => setShowSubstituteReceipt(false)}
          staffId={staffId || ""}
          staffUserId={staffUserId}
          defaultData={{
            description: expenseClaims.find((c) => !c.has_formal_receipt)?.description || "",
            amount: expenseClaims.filter((c) => !c.has_formal_receipt).reduce((s, c) => s + c.amount, 0),
            date: new Date().toISOString().split("T")[0],
            staffName,
            eventName: form.event_name,
          }}
        />
      )}
    </div>
  );
};

export default StaffInvoiceForm;
