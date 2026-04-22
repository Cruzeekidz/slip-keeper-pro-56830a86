import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAddClearance, type CashAdvance } from "@/hooks/useCashAdvances";

const fmt = (n: number) =>
  new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2 }).format(n);

export function ClearAdvanceDialog({
  advance,
  onClose,
}: {
  advance: CashAdvance | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const addClearance = useAddClearance();

  const [amount, setAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [hasFormalReceipt, setHasFormalReceipt] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const remain = advance
    ? Math.max(0, Number(advance.amount) - Number(advance.cleared_amount))
    : 0;

  useEffect(() => {
    if (advance) {
      setAmount(remain > 0 ? remain.toString() : "");
      setRefundAmount("0");
      setDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setHasFormalReceipt(true);
      setFile(null);
      setNotes("");
    }
  }, [advance, remain]);

  if (!advance) return null;

  const handleSubmit = async () => {
    const amt = parseFloat(amount) || 0;
    const refund = parseFloat(refundAmount) || 0;
    if (amt <= 0 && refund <= 0) {
      toast({ title: "กรุณาระบุยอดเคลียร์หรือยอดคืนเงิน", variant: "destructive" });
      return;
    }

    let receiptPath: string | null = null;
    if (file && user) {
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/cash-advance/clearance/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        receiptPath = path;
      } catch (e: any) {
        toast({ title: "อัปโหลดไฟล์ไม่สำเร็จ", description: e.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    await addClearance.mutateAsync({
      advance_id: advance.id,
      amount: amt,
      refund_amount: refund,
      clear_date: date,
      description: description.trim() || null,
      has_formal_receipt: hasFormalReceipt,
      receipt_url: hasFormalReceipt ? receiptPath : null,
      substitute_receipt_url: !hasFormalReceipt ? receiptPath : null,
      notes: notes.trim() || null,
    });
    onClose();
  };

  return (
    <Dialog open={!!advance} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เคลียร์เงินทดรอง</DialogTitle>
        </DialogHeader>
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">ผู้รับ:</span>{" "}
            <span className="font-medium">{advance.recipient_name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">ยอดทดรอง:</span> {fmt(Number(advance.amount))} ฿
            <span className="text-muted-foreground ml-3">เคลียร์แล้ว:</span>{" "}
            {fmt(Number(advance.cleared_amount))} ฿
          </div>
          <div className="font-bold text-amber-400">คงเหลือ: {fmt(remain)} ฿</div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>ยอดเคลียร์ (ใช้จริง) ฿</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>คืนเงิน (ถ้ามี) ฿</Label>
              <Input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>วันที่</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>รายการที่ใช้</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น ค่าน้ำมัน + กาแฟ"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="formal"
              checked={hasFormalReceipt}
              onCheckedChange={(v) => setHasFormalReceipt(!!v)}
            />
            <Label htmlFor="formal" className="cursor-pointer">
              มีใบเสร็จ/บิลทางการ
            </Label>
          </div>
          <div>
            <Label>{hasFormalReceipt ? "อัปโหลดบิล/ใบเสร็จ" : "อัปโหลด screenshot/หลักฐาน"}</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {!hasFormalReceipt && (
              <p className="text-xs text-muted-foreground mt-1">
                ระบบจะสร้าง 'ใบรับรองแทนใบเสร็จ' ภายหลัง
              </p>
            )}
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handleSubmit} disabled={addClearance.isPending || uploading}>
            {uploading ? "กำลังอัปโหลด..." : addClearance.isPending ? "กำลังบันทึก..." : "บันทึกการเคลียร์"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
