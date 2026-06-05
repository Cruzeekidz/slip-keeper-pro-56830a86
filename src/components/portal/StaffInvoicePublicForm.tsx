import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, CheckCircle, Search, Pencil, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface StaffOption {
  id: string;
  staff_name: string;
  daily_rate: number;
  user_id: string;
}

interface EventOption {
  id: string;
  event_name: string;
  event_date: string | null;
}

const StaffInvoicePublicForm = ({ ownerId: ownerIdProp }: { ownerId?: string }) => {
  const fallbackParams = new URLSearchParams(window.location.search);
  const ownerParam = ownerIdProp || fallbackParams.get("owner");
  const staffParam = fallbackParams.get("staff");

  const [step, setStep] = useState<"search" | "form" | "submitted">(staffParam ? "form" : "search");
  const [phone, setPhone] = useState("");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [eventMode, setEventMode] = useState<"select" | "type">("select");
  const [showErrors, setShowErrors] = useState(false);

  const eventFieldRef = useRef<HTMLDivElement>(null);
  const dailyRateRef = useRef<HTMLInputElement>(null);
  const dateFieldRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    event_name: "",
    event_id: "",
    days_worked: 1,
    daily_rate: 0,
    work_start_date: "",
    work_end_date: "",
    notes: "",
  });

  const [whtMode, setWhtMode] = useState<"inclusive" | "exclusive" | "none">("inclusive");

  const baseAmount = form.days_worked * form.daily_rate;
  const grossAmount = whtMode === "exclusive" ? Math.round(baseAmount / 0.97 * 100) / 100 : baseAmount;
  const whtRate = whtMode === "none" ? 0 : 3;
  const whtAmount = whtMode === "none" ? 0 : Math.round(grossAmount * 0.03 * 100) / 100;
  const netAmount = grossAmount - whtAmount;

  // If staff param is provided, load directly
  useEffect(() => {
    if (!staffParam) return;
    const loadStaff = async () => {
      setLoading(true);
      const { data } = await (supabase
        .from("staff_profiles_public" as any)
        .select("id, staff_name, daily_rate, user_id")
        .eq("id", staffParam)
        .eq("is_active", true) as any)
        .maybeSingle();
      if (data) {
        setSelectedStaff(data);
        setForm((f) => ({ ...f, daily_rate: data.daily_rate }));
        await loadEvents(data.user_id);
        setStep("form");
      } else {
        setError("ไม่พบข้อมูลทีมงาน");
      }
      setLoading(false);
    };
    loadStaff();
  }, [staffParam]);

  const loadEvents = async (userId: string) => {
    // กรองเฉพาะอีเวนท์ที่อยู่ในช่วง 3 เดือนย้อนหลัง ถึงอนาคต (รวมที่ยังไม่มีวันที่)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoffDate = threeMonthsAgo.toISOString().split("T")[0];

    const { data } = await supabase
      .from("event_registry")
      .select("id, event_name, event_date")
      .eq("user_id", userId)
      .eq("is_active", true)
      .or(`event_date.gte.${cutoffDate},event_date.is.null`)
      .order("event_date", { ascending: false, nullsFirst: false });
    if (data) {
      setEvents(data);
      // ถ้าไม่มี event ในระบบ → switch เป็น type mode ทันที (UX ลื่น)
      if (data.length === 0) setEventMode("type");
    } else {
      setEventMode("type");
    }
  };

  const handleSearch = async () => {
    if (!phone || phone.length < 9) {
      setError("กรุณากรอกเบอร์โทรที่ถูกต้อง");
      return;
    }
    setLoading(true);
    setError("");
    const query = (supabase
      .from("staff_profiles_public" as any)
      .select("id, staff_name, daily_rate, user_id")
      .eq("is_active", true)
      .ilike("phone", `%${phone.replace(/-/g, "").slice(-4)}%`) as any);

    const { data } = ownerParam ? await query.eq("user_id", ownerParam) : await query;
    if (data && data.length > 0) {
      setStaffList(data);
    } else {
      setError("ไม่พบข้อมูล กรุณาลงทะเบียนก่อน");
    }
    setLoading(false);
  };

  const selectStaff = async (staff: StaffOption) => {
    setSelectedStaff(staff);
    setForm((f) => ({ ...f, daily_rate: staff.daily_rate }));
    await loadEvents(staff.user_id);
    setStep("form");
  };

  // Auto-calculate days
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

  // Validation
  const errors = {
    event_name: !form.event_name.trim() ? "กรุณาเลือกหรือพิมพ์ชื่องาน" : "",
    daily_rate: form.daily_rate <= 0 ? "ค่าแรง/วัน ต้องมากกว่า 0" : "",
    days_worked: form.days_worked <= 0 ? "จำนวนวันต้องมากกว่า 0" : "",
    work_dates: (() => {
      if (!form.work_start_date || !form.work_end_date) return "กรุณาเลือกวันเริ่มและวันสิ้นสุด";
      if (new Date(form.work_start_date) > new Date(form.work_end_date)) return "วันเริ่มต้องไม่หลังวันสิ้นสุด";
      const currentYear = new Date().getFullYear();
      const startYear = new Date(form.work_start_date).getFullYear();
      const endYear = new Date(form.work_end_date).getFullYear();
      if (startYear < 2015 || startYear > currentYear + 1) return `ปีของวันเริ่มต้องอยู่ระหว่าง 2015–${currentYear + 1}`;
      if (endYear < 2015 || endYear > currentYear + 1) return `ปีของวันสิ้นสุดต้องอยู่ระหว่าง 2015–${currentYear + 1}`;
      return "";
    })(),
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const scrollToFirstError = () => {
    if (errors.event_name) {
      eventFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (errors.work_dates) {
      dateFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (errors.daily_rate || errors.days_worked) {
      dailyRateRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      dailyRateRef.current?.focus();
    }
  };

  const translateDbError = (msg: string): string => {
    if (/year|date|expense_date/i.test(msg)) return "วันที่ไม่ถูกต้อง กรุณาตรวจสอบ";
    if (/duplicate|unique/i.test(msg)) return "มีรายการซ้ำในระบบ";
    if (/permission|policy|RLS/i.test(msg)) return "ไม่มีสิทธิ์ส่งข้อมูล กรุณาติดต่อผู้ดูแล";
    return "เกิดข้อผิดพลาด: " + msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;

    setShowErrors(true);
    if (hasErrors) {
      toast.error("กรุณาตรวจสอบข้อมูลที่ยังไม่ครบถ้วน");
      scrollToFirstError();
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // ถ้าผู้ใช้พิมพ์ชื่อ event เอง (ไม่ได้เลือกจาก dropdown) → สร้างเข้า event_registry เพื่อให้คนต่อไปเห็น
      let finalEventId: string | null = form.event_id || null;
      if (!finalEventId && form.event_name.trim()) {
        const trimmedName = form.event_name.trim();
        // ตรวจซ้ำใน list ปัจจุบันก่อน (case-insensitive)
        const existing = events.find(
          (ev) => ev.event_name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (existing) {
          finalEventId = existing.id;
        } else {
          // สร้างใหม่
          const projectTag = `EVT-MANUAL-${Date.now().toString().slice(-8)}`;
          const { data: newEvent } = await supabase
            .from("event_registry")
            .insert({
              user_id: selectedStaff.user_id,
              event_name: trimmedName,
              project_tag: projectTag,
              event_date: form.work_start_date || null,
              is_active: true,
            })
            .select("id")
            .single();
          if (newEvent) finalEventId = newEvent.id;
        }
      }

      const invoiceNumber = `SI-${new Date().getFullYear() + 543}-${String(Date.now()).slice(-4)}`;

      const { error: insertError } = await supabase.from("staff_invoices").insert({
        user_id: selectedStaff.user_id,
        staff_id: selectedStaff.id,
        invoice_number: invoiceNumber,
        event_id: finalEventId,
        event_name: form.event_name.trim(),
        days_worked: form.days_worked,
        daily_rate: form.daily_rate,
        gross_amount: grossAmount,
        wht_rate: whtRate,
        wht_amount: whtAmount,
        net_amount: netAmount,
        work_start_date: form.work_start_date || null,
        work_end_date: form.work_end_date || null,
        notes: form.notes || null,
        status: "submitted",
        submitted_via: "web",
        submitted_at: new Date().toISOString(),
      });

      if (insertError) {
        const friendly = translateDbError(insertError.message);
        setError(friendly);
        toast.error(friendly);
        console.error(insertError);
      } else {
        toast.success("ส่งใบเรียกเก็บเงินสำเร็จ");
        setStep("submitted");
        supabase.functions.invoke("notify-admin-invoice-submitted", {
          body: {
            owner_user_id: selectedStaff.user_id,
            staff_name: selectedStaff.staff_name,
            invoice_number: invoiceNumber,
            event_name: form.event_name.trim(),
            gross_amount: grossAmount,
            wht_amount: whtAmount,
            net_amount: netAmount,
            grand_total: netAmount,
            submitted_via: "portal",
          },
        }).catch((e) => console.error("notify admin failed:", e));
      }
    } catch (err: any) {
      const friendly = translateDbError(err?.message || "");
      setError(friendly);
      toast.error(friendly);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="pt-6 text-center"><p className="text-muted-foreground">กำลังโหลด...</p></CardContent></Card>
    );
  }

  if (step === "submitted") {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">ส่งใบเรียกเก็บเงินสำเร็จ!</h2>
          <p className="text-muted-foreground">
            ยอดสุทธิที่จะได้รับ: <span className="font-bold text-foreground">{netAmount.toLocaleString()} บาท</span>
          </p>
          <p className="text-sm text-muted-foreground">(หลังหัก ณ ที่จ่าย 3%)</p>
        </CardContent>
      </Card>
    );
  }

  if (step === "search") {
    return (
      <Card>
        <CardHeader className="text-center">
          <Search className="h-10 w-10 mx-auto text-blue-500 mb-2" />
          <CardTitle>ค้นหาข้อมูลทีมงาน</CardTitle>
          <CardDescription>กรอกเบอร์โทรเพื่อค้นหาข้อมูลของคุณ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>เบอร์โทรศัพท์</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button onClick={handleSearch} className="w-full" disabled={loading}>
            ค้นหา
          </Button>

          {staffList.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-sm font-medium">เลือกชื่อของคุณ:</p>
              {staffList.map((s) => (
                <Card key={s.id} className="cursor-pointer hover:border-primary" onClick={() => selectStaff(s)}>
                  <CardContent className="py-3 flex justify-between items-center">
                    <span className="font-medium">{s.staff_name}</span>
                    <span className="text-sm text-muted-foreground">{s.daily_rate.toLocaleString()} บาท/วัน</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Form view
  const showEventErr = showErrors && errors.event_name;
  const showRateErr = showErrors && errors.daily_rate;
  const showDaysErr = showErrors && errors.days_worked;
  const showDateErr = showErrors && errors.work_dates;

  return (
    <Card>
      <CardHeader className="text-center">
        <FileText className="h-10 w-10 mx-auto text-primary mb-2" />
        <CardTitle>ฟอร์มเรียกเก็บค่าแรง</CardTitle>
        <CardDescription>ทีมงาน: {selectedStaff?.staff_name}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div ref={eventFieldRef}>
            <div className="flex items-center justify-between">
              <Label>ชื่องาน / อีเวนท์ *</Label>
              {events.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setEventMode(eventMode === "select" ? "type" : "select");
                    setForm((f) => ({ ...f, event_id: "", event_name: "" }));
                  }}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {eventMode === "select" ? "พิมพ์ชื่อเอง" : "เลือกจากรายการ"}
                </Button>
              )}
            </div>

            {eventMode === "select" && events.length > 0 ? (
              <Select value={form.event_id} onValueChange={handleEventSelect}>
                <SelectTrigger className={showEventErr ? "border-destructive" : ""}>
                  <SelectValue placeholder="เลือกอีเวนท์" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.event_name} {ev.event_date ? `(${ev.event_date})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={form.event_name}
                onChange={(e) => setForm({ ...form, event_name: e.target.value, event_id: "" })}
                placeholder="พิมพ์ชื่องาน เช่น Tooniverse 2026"
                className={showEventErr ? "border-destructive" : ""}
              />
            )}

            {showEventErr ? (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {errors.event_name}
              </p>
            ) : (
              eventMode === "type" && events.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ชื่องานใหม่จะถูกบันทึกให้คนต่อไปเลือกได้
                </p>
              )
            )}
          </div>

          <div ref={dateFieldRef} className="grid grid-cols-2 gap-3">
            <div>
              <Label>วันเริ่มงาน *</Label>
              <Input
                type="date"
                value={form.work_start_date}
                onChange={(e) => setForm({ ...form, work_start_date: e.target.value })}
                className={showDateErr ? "border-destructive" : ""}
              />
            </div>
            <div>
              <Label>วันสิ้นสุดงาน *</Label>
              <Input
                type="date"
                value={form.work_end_date}
                onChange={(e) => setForm({ ...form, work_end_date: e.target.value })}
                className={showDateErr ? "border-destructive" : ""}
              />
            </div>
            {showDateErr && (
              <p className="col-span-2 text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {errors.work_dates}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>จำนวนวันทำงาน *</Label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={form.days_worked}
                onChange={(e) => setForm({ ...form, days_worked: Number(e.target.value) })}
                className={showDaysErr ? "border-destructive" : ""}
              />
              {showDaysErr && (
                <p className="text-xs text-destructive mt-1">{errors.days_worked}</p>
              )}
            </div>
            <div>
              <Label>ค่าแรง/วัน (บาท) *</Label>
              <Input
                ref={dailyRateRef}
                type="number"
                value={form.daily_rate}
                onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })}
                className={showRateErr ? "border-destructive" : ""}
              />
              {showRateErr && (
                <p className="text-xs text-destructive mt-1">{errors.daily_rate}</p>
              )}
            </div>
          </div>
              <div>
                <Label>รูปแบบหัก ณ ที่จ่าย</Label>
                <RadioGroup value={whtMode} onValueChange={(v) => setWhtMode(v as "inclusive" | "exclusive" | "none")} className="flex flex-wrap gap-3 mt-1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="inclusive" id="wht-inc-pub" />
                    <Label htmlFor="wht-inc-pub" className="font-normal">รวมแล้ว 3%</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="exclusive" id="wht-exc-pub" />
                    <Label htmlFor="wht-exc-pub" className="font-normal">ไม่รวม (Net)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="wht-none-pub" />
                    <Label htmlFor="wht-none-pub" className="font-normal">ไม่หัก ณ ที่จ่าย</Label>
                  </div>
                </RadioGroup>
                {whtMode === "exclusive" && (
                  <p className="text-xs text-muted-foreground mt-1">ค่าแรง/วัน คือยอดสุทธิที่ทีมงานได้รับ ระบบจะคำนวณ Gross = {form.daily_rate}/0.97</p>
                )}
                {whtMode === "none" && (
                  <p className="text-xs text-muted-foreground mt-1">ไม่มีการหักภาษี ณ ที่จ่าย — Net = Gross</p>
                )}
              </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="รายละเอียดเพิ่มเติม" />
          </div>

          <Separator />

          <div className="bg-muted rounded-lg p-4 space-y-2">
            {whtMode === "exclusive" && (
              <div className="flex justify-between text-muted-foreground text-sm">
                <span>ค่าแรงสุทธิ ({form.days_worked} วัน × {form.daily_rate.toLocaleString()})</span>
                <span>{baseAmount.toLocaleString()} บาท</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span>บันทึกค่าใช้จ่าย (Gross)</span>
              <span className="font-medium">{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
            </div>
            {whtMode !== "none" ? (
              <>
                <div className="flex justify-between text-destructive">
                  <span>หัก ณ ที่จ่าย 3%</span>
                  <span>-{whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>(นำส่งสรรพากรสิ้นเดือน)</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>ไม่หัก ณ ที่จ่าย</span>
                <span>Net = Gross</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-lg font-bold text-primary">
              <span>ยอดโอนจริง (Net)</span>
              <span>{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {showErrors && hasErrors && (
            <p className="text-xs text-destructive text-center">
              ยังมีข้อมูลที่ต้องแก้ไข กรุณาตรวจสอบช่องที่มีกรอบสีแดง
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? "กำลังส่ง..." : "ส่งใบเรียกเก็บเงิน"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default StaffInvoicePublicForm;
