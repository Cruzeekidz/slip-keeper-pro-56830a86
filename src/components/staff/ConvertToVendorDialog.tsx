import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { StaffProfile } from "@/hooks/useStaffData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStaff: StaffProfile[];
  onDone: () => void;
}

export function ConvertToVendorDialog({ open, onOpenChange, selectedStaff, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vendorType, setVendorType] = useState<"individual" | "company">("individual");
  const [deactivate, setDeactivate] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let success = 0;
      let skipped = 0;
      for (const s of selectedStaff) {
        // Check duplicate by tax_id or company_name
        const { data: existing } = await supabase
          .from("vendor_profiles")
          .select("id")
          .eq("user_id", user.id)
          .or(`company_name.eq.${s.staff_name}${s.tax_id ? `,tax_id.eq.${s.tax_id}` : ""}`)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertError } = await supabase.from("vendor_profiles").insert({
          user_id: user.id,
          company_name: s.staff_name,
          contact_name: s.nickname || s.staff_name,
          vendor_type: vendorType,
          tax_id: s.tax_id,
          phone: s.phone,
          email: s.email,
          bank_name: s.bank_name,
          bank_account: s.bank_account,
          address: s.address,
          line_user_id: s.line_user_id,
          tax_doc_url: s.id_card_url,
          is_active: true,
        });

        if (insertError) {
          console.error(insertError);
          continue;
        }

        if (deactivate) {
          await supabase.from("staff_profiles").update({ is_active: false }).eq("id", s.id);
        }
        success++;
      }

      queryClient.invalidateQueries({ queryKey: ["staff-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });

      toast({
        title: "แปลงสำเร็จ",
        description: `สร้างคู่ค้า ${success} รายการ${skipped > 0 ? ` • ข้าม ${skipped} (ซ้ำ)` : ""}`,
      });
      onDone();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>แปลงทีมงานเป็นคู่ค้า</DialogTitle>
          <DialogDescription>
            ระบบจะคัดลอกข้อมูล (ชื่อ, เลขผู้เสียภาษี, ธนาคาร, ที่อยู่) ไปสร้างเป็นคู่ค้าใหม่
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/30 max-h-32 overflow-y-auto">
            <div className="text-sm font-medium mb-1">รายชื่อที่เลือก ({selectedStaff.length})</div>
            <div className="text-sm text-muted-foreground">
              {selectedStaff.map((s) => s.staff_name).join(", ")}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">ประเภทคู่ค้า</Label>
            <RadioGroup value={vendorType} onValueChange={(v) => setVendorType(v as "individual" | "company")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="individual" id="r-ind" />
                <Label htmlFor="r-ind" className="font-normal cursor-pointer">บุคคลธรรมดา (Individual)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="company" id="r-com" />
                <Label htmlFor="r-com" className="font-normal cursor-pointer">นิติบุคคล (Company)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="deactivate" checked={deactivate} onCheckedChange={(c) => setDeactivate(!!c)} />
            <Label htmlFor="deactivate" className="font-normal cursor-pointer text-sm">
              ปิดสถานะทีมงานเดิม (Deactivate) หลังแปลงสำเร็จ
            </Label>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              ประวัติการจ่ายเงินทีมงานเดิม (staff_invoices) จะยังคงอยู่ • ระบบจะข้ามรายการที่มีคู่ค้าซ้ำ (ตามเลขภาษีหรือชื่อ)
            </AlertDescription>
          </Alert>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              ยกเลิก
            </Button>
            <Button onClick={handleConvert} disabled={loading || selectedStaff.length === 0}>
              {loading ? "กำลังแปลง..." : <>แปลง {selectedStaff.length} รายการ <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}