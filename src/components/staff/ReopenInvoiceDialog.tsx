import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Unlock } from "lucide-react";

interface Props {
  invoice: any | null;
  onClose: () => void;
}

const CONFIRM_WORD = "ยืนยัน";

export default function ReopenInvoiceDialog({ invoice, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const reset = () => {
    setReason("");
    setConfirmText("");
  };

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !user) throw new Error("ไม่มีข้อมูล");
      if (reason.trim().length < 10) throw new Error("กรุณากรอกเหตุผลอย่างน้อย 10 ตัวอักษร");
      if (confirmText.trim() !== CONFIRM_WORD) throw new Error(`กรุณาพิมพ์คำว่า "${CONFIRM_WORD}" เพื่อยืนยัน`);

      const oldData = { ...invoice };

      // 1. Find linked expenses (Gross + WHT) by payment_slip_url match or staff+date+amount
      const expensesToDelete: any[] = [];

      if (invoice.matched_expense_id) {
        const { data: e1 } = await supabase
          .from("expenses")
          .select("*")
          .eq("id", invoice.matched_expense_id)
          .maybeSingle();
        if (e1) expensesToDelete.push(e1);
      }

      // Find WHT liability expense (สรรพากร + invoice_number in memo_text)
      if (Number(invoice.wht_amount) > 0 && invoice.invoice_number) {
        const { data: whtExps } = await supabase
          .from("expenses")
          .select("*")
          .eq("user_id", invoice.user_id)
          .eq("category", "ภาษีหัก ณ ที่จ่าย")
          .ilike("memo_text", `%${invoice.invoice_number}%`)
          .is("settled_batch_id", null);
        if (whtExps) expensesToDelete.push(...whtExps);
      }

      // 2. Move to deleted_expenses + delete
      for (const exp of expensesToDelete) {
        await supabase.from("deleted_expenses").insert({
          original_expense_id: exp.id,
          user_id: exp.user_id,
          amount: exp.amount,
          category: exp.category,
          subcategory: exp.subcategory,
          description: exp.description,
          expense_date: exp.expense_date,
          expense_time: exp.expense_time,
          merchant: exp.merchant,
          sender: exp.sender,
          receiver: exp.receiver,
          transaction_id: exp.transaction_id,
          receipt_url: exp.receipt_url,
          transaction_type: exp.transaction_type,
          category_group: exp.category_group,
          project_tag: exp.project_tag,
          transaction_direction: exp.transaction_direction,
          payee_group: exp.payee_group,
          staff_name: exp.staff_name,
          days_worked: exp.days_worked,
          event_name: exp.event_name,
          memo_text: exp.memo_text,
          deleted_reason: `ย้อนกลับใบ ${invoice.invoice_number}: ${reason}`,
        });
        await supabase.from("expenses").delete().eq("id", exp.id);
      }

      // 3. Reset invoice to submitted
      const { error: updErr } = await supabase
        .from("staff_invoices")
        .update({
          status: "submitted",
          paid_at: null,
          payment_slip_url: null,
          matched_expense_id: null,
        })
        .eq("id", invoice.id);
      if (updErr) throw updErr;

      // 4. Audit log
      await supabase.from("staff_invoice_audit_log").insert({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        action: "reopen",
        old_status: "paid",
        new_status: "submitted",
        changed_by: user.id,
        changed_by_email: user.email,
        reason,
        old_data: oldData,
        new_data: { deleted_expense_count: expensesToDelete.length },
      });

      return expensesToDelete.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["staff-invoices"] });
      qc.invalidateQueries({ queryKey: ["payment-queue"] });
      toast.success("ย้อนกลับสำเร็จ", {
        description: `ลบรายการค่าใช้จ่ายที่เกี่ยวข้อง ${count} รายการ — แก้ไขและจ่ายใหม่ได้`,
      });
      reset();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    },
  });

  const open = !!invoice;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-warning" />
            ย้อนกลับใบจ่ายแล้ว
          </DialogTitle>
          <DialogDescription>
            ใบ <span className="font-mono font-medium">{invoice?.invoice_number}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="flex gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">คำเตือน</p>
                <ul className="list-disc ml-4 mt-1 text-xs space-y-0.5 text-muted-foreground">
                  <li>ระบบจะลบ <b>บันทึกค่าใช้จ่าย</b> และ <b>ภาษีค้างจ่าย</b> ที่สร้างไว้ตอนกดจ่าย</li>
                  <li>สถานะจะกลับเป็น <b>"ส่งแล้ว"</b> เพื่อให้แก้ไข WHT/ยอด แล้วจ่ายใหม่</li>
                  <li>การกระทำนี้จะถูกบันทึกใน Audit Log</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <Label>เหตุผล (อย่างน้อย 10 ตัวอักษร) *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลืมระบุ WHT 3% / สลิปยอดไม่ตรง / ต้องแก้ไขข้อมูลทีมงาน"
              rows={3}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{reason.trim().length}/10 ตัวอักษร</p>
          </div>

          <div>
            <Label>พิมพ์คำว่า <span className="font-mono text-destructive">"{CONFIRM_WORD}"</span> เพื่อยืนยัน *</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="mt-1"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { reset(); onClose(); }}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => reopenMutation.mutate()}
              disabled={
                reopenMutation.isPending ||
                reason.trim().length < 10 ||
                confirmText.trim() !== CONFIRM_WORD
              }
            >
              {reopenMutation.isPending ? "กำลังย้อนกลับ..." : "ยืนยันย้อนกลับ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
