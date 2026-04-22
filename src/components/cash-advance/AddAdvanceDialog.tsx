import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStaffProfiles } from "@/hooks/useStaffData";
import { useCreateCashAdvance } from "@/hooks/useCashAdvances";
import { Combobox } from "@/components/ui/combobox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function AddAdvanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: staff = [] } = useStaffProfiles();
  const createAdvance = useCreateCashAdvance();

  const [staffId, setStaffId] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [purpose, setPurpose] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setStaffId("");
      setRecipientName("");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setPurpose("");
      setEventName("");
      setNotes("");
      setSlipFile(null);
    }
  }, [open]);

  const staffOptions = staff
    .filter((s) => s.is_active)
    .map((s) => ({
      value: s.id,
      label: s.nickname ? `${s.staff_name} (${s.nickname})` : s.staff_name,
    }));

  const handleStaffSelect = (id: string) => {
    setStaffId(id);
    const s = staff.find((x) => x.id === id);
    if (s) setRecipientName(s.staff_name);
  };

  const handleSubmit = async () => {
    if (!recipientName.trim()) {
      toast({ title: "กรุณาระบุผู้รับ", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "กรุณาระบุยอดเงิน", variant: "destructive" });
      return;
    }

    let slipUrl: string | null = null;
    if (slipFile && user) {
      setUploading(true);
      try {
        const ext = slipFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/cash-advance/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, slipFile, { upsert: false });
        if (upErr) throw upErr;
        slipUrl = path;
      } catch (e: any) {
        toast({ title: "อัปโหลดสลิปไม่สำเร็จ", description: e.message, variant: "destructive" });
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    await createAdvance.mutateAsync({
      recipient_name: recipientName.trim(),
      recipient_id: staffId || null,
      amount: amt,
      advance_date: date,
      purpose: purpose.trim() || null,
      event_name: eventName.trim() || null,
      payment_slip_url: slipUrl,
      notes: notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>โอนเงินทดรอง</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>เลือกทีมงาน (ถ้ามี)</Label>
            <Combobox
              options={staffOptions}
              value={staffId}
              onChange={handleStaffSelect}
              placeholder="ค้นหาทีมงาน..."
              emptyMessage="ไม่พบ"
            />
          </div>
          <div>
            <Label>ชื่อผู้รับ *</Label>
            <Input
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="เช่น ปิยนันท์"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>ยอดเงิน (฿) *</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>วันที่โอน</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>วัตถุประสงค์</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="เช่น ค่าน้ำมัน+เบ็ดเตล็ด"
            />
          </div>
          <div>
            <Label>งาน/อีเวนท์</Label>
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="เช่น Beat Active"
            />
          </div>
          <div>
            <Label>สลิปการโอน (ถ้ามี)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <Label>หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ข้อความเพิ่มเติม"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={handleSubmit} disabled={createAdvance.isPending || uploading}>
            {uploading ? "กำลังอัปโหลด..." : createAdvance.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
