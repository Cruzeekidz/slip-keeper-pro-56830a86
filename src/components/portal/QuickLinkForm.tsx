import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle, Link2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuickLinkFormProps {
  lineUserId?: string | null;
  lineDisplayName?: string | null;
  ownerId?: string;
}

type Candidate = { id: string; staff_name?: string; nickname?: string; company_name?: string };

const QuickLinkForm = ({ lineUserId, ownerId: ownerIdProp }: QuickLinkFormProps) => {
  const { toast } = useToast();
  const ownerId = ownerIdProp || new URLSearchParams(window.location.search).get("owner") || "";
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linked, setLinked] = useState<{ kind: "staff" | "vendor"; name: string } | null>(null);
  const [candidates, setCandidates] = useState<{ kind: "staff" | "vendor"; list: Candidate[] } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSelectCandidate = async (candidate: Candidate, kind: "staff" | "vendor") => {
    setSubmitting(true);
    try {
      const rpcName = kind === "staff" ? "link_staff_line_id" : "link_vendor_line_id";
      const params: any = kind === "staff"
        ? { p_owner: ownerId, p_phone: phone, p_line_user_id: lineUserId, p_staff_id: candidate.id }
        : { p_owner: ownerId, p_phone: phone, p_tax_id: taxId, p_line_user_id: lineUserId, p_vendor_id: candidate.id };
      const { data, error } = await supabase.rpc(rpcName as any, params);
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === "linked" || status === "already_linked") {
        setLinked({ kind, name: candidate.staff_name || candidate.company_name || "—" });
        setCandidates(null);
      } else {
        toast({ title: "ไม่สามารถเชื่อมได้", description: status, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotFound(false);
    if (!ownerId || !UUID_REGEX.test(ownerId)) {
      toast({ title: "ลิงก์ไม่ถูกต้อง", variant: "destructive" });
      return;
    }
    if (!phone && !taxId) {
      toast({ title: "กรุณากรอกเบอร์โทรหรือเลขผู้เสียภาษี", variant: "destructive" });
      return;
    }
    if (phone) {
      const digits = phone.replace(/[^0-9]/g, "");
      if (digits.length !== 10 || !digits.startsWith("0")) {
        toast({
          title: "เบอร์โทรไม่ถูกต้อง",
          description: "ต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0 (เช่น 0812345678)",
          variant: "destructive",
        });
        return;
      }
    }
    if (taxId) {
      const digits = taxId.replace(/[^0-9]/g, "");
      if (digits.length !== 13) {
        toast({
          title: "เลขผู้เสียภาษีไม่ถูกต้อง",
          description: "ต้องเป็นตัวเลข 13 หลัก",
          variant: "destructive",
        });
        return;
      }
    }
    setSubmitting(true);
    try {
      // ลองทีมงานก่อน (เบอร์โทร)
      let foundAny = false;
      if (phone) {
        const { data } = await supabase.rpc("link_staff_line_id", {
          p_owner: ownerId,
          p_phone: phone,
          p_line_user_id: lineUserId || "",
        });
        const status = (data as any)?.status;
        if (status === "linked" || status === "already_linked") {
          const p = (data as any).profile;
          setLinked({ kind: "staff", name: `${p.staff_name}${p.nickname ? ` (${p.nickname})` : ""}` });
          setSubmitting(false);
          return;
        }
        if (status === "multiple") {
          setCandidates({ kind: "staff", list: (data as any).candidates || [] });
          setSubmitting(false);
          return;
        }
        if (status === "needs_line_login") {
          toast({
            title: "พบโปรไฟล์แล้ว แต่ยังไม่ได้รับ LINE ID",
            description: "กรุณาเปิดหน้านี้จาก Rich Menu ในแอป LINE อีกครั้ง หรือกดอนุญาตเมื่อ LINE ขอสิทธิ์โปรไฟล์",
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
        if (status !== "not_found" && status !== "invalid_phone") foundAny = true;
      }

      // ลองคู่ค้า (tax_id หรือ phone)
      const { data: vendorData } = await supabase.rpc("link_vendor_line_id", {
        p_owner: ownerId,
        p_phone: phone,
        p_tax_id: taxId,
        p_line_user_id: lineUserId || "",
      });
      const vStatus = (vendorData as any)?.status;
      if (vStatus === "linked" || vStatus === "already_linked") {
        const p = (vendorData as any).profile;
        setLinked({ kind: "vendor", name: p.company_name });
        setSubmitting(false);
        return;
      }
      if (vStatus === "multiple") {
        setCandidates({ kind: "vendor", list: (vendorData as any).candidates || [] });
        setSubmitting(false);
        return;
      }
      if (vStatus === "needs_line_login") {
        toast({
          title: "พบโปรไฟล์แล้ว แต่ยังไม่ได้รับ LINE ID",
          description: "กรุณาเปิดหน้านี้จาก Rich Menu ในแอป LINE อีกครั้ง หรือกดอนุญาตเมื่อ LINE ขอสิทธิ์โปรไฟล์",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      if (!foundAny) setNotFound(true);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (!ownerId || !UUID_REGEX.test(ownerId)) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">ลิงก์ไม่ถูกต้อง</h2>
          <p className="text-muted-foreground">กรุณาเข้าผ่านปุ่มใน Rich Menu ของบอท LINE</p>
        </CardContent>
      </Card>
    );
  }

  if (linked) {
    return (
      <Card>
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">เชื่อม LINE สำเร็จ!</h2>
          <p className="text-muted-foreground">
            บัญชี LINE ของคุณถูกผูกกับ{linked.kind === "staff" ? "ทีมงาน" : "คู่ค้า"} <strong>{linked.name}</strong> เรียบร้อยแล้ว
          </p>
          <p className="text-sm text-muted-foreground">
            ครั้งต่อไปที่มีการโอนเงินหรือแจ้งเตือนจากระบบ คุณจะได้รับข้อความผ่าน LINE ทันที
          </p>
        </CardContent>
      </Card>
    );
  }

  if (candidates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>พบหลายรายการที่ตรงกัน</CardTitle>
          <CardDescription>กรุณาเลือกชื่อของคุณเพื่อยืนยัน</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidates.list.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              className="w-full justify-start h-auto py-3"
              disabled={submitting}
              onClick={() => handleSelectCandidate(c, candidates.kind)}
            >
              {c.staff_name || c.company_name}
              {c.nickname ? <span className="ml-2 text-muted-foreground">({c.nickname})</span> : null}
            </Button>
          ))}
          <Button variant="ghost" className="w-full" onClick={() => setCandidates(null)} disabled={submitting}>
            ยกเลิก
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle>เชื่อม LINE กับโปรไฟล์</CardTitle>
        </div>
        <CardDescription>
          สำหรับทีมงาน/คู่ค้าที่ลงทะเบียนกับระบบไว้แล้ว — กรอกเบอร์โทรหรือเลขผู้เสียภาษีเพื่อผูก LINE ของคุณ
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ql-phone">เบอร์โทร (สำหรับทีมงาน/คู่ค้าทั่วไป)</Label>
            <Input
              id="ql-phone"
              inputMode="tel"
              placeholder="0812345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ql-tax">เลขผู้เสียภาษี (สำหรับคู่ค้าบริษัท)</Label>
            <Input
              id="ql-tax"
              inputMode="numeric"
              placeholder="0123456789012"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>
          {notFound && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">ไม่พบข้อมูลของคุณในระบบ</p>
              <p className="text-muted-foreground mt-1">
                ตรวจสอบเบอร์โทรอีกครั้ง หรือกลับเมนูหลักเพื่อ "ลงทะเบียนใหม่"
              </p>
            </div>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "กำลังเชื่อม..." : "เชื่อม LINE"}
          </Button>
          {!lineUserId && (
            <p className="text-xs text-muted-foreground text-center">
              ⚠️ กรุณาเปิดหน้านี้ผ่านปุ่มใน Rich Menu ของบอท LINE เท่านั้น
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

export default QuickLinkForm;