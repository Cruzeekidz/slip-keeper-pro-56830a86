import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Search, FileText, AlertTriangle, MessageCircle } from "lucide-react";

interface Row {
  id: string;
  company_name: string;
  contact_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account: string | null;
  tax_doc_url: string | null;
  id_card_url: string | null;
  line_user_id: string | null;
  is_active: boolean;
}

const CopyField = ({ label, value }: { label: string; value: string | null }) => {
  const { toast } = useToast();
  if (!value) return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-xs text-amber-600">ยังไม่มีข้อมูล</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="truncate font-medium">{value}</span>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => {
          navigator.clipboard.writeText(value);
          toast({ title: `คัดลอก${label}แล้ว`, description: value });
        }}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default function VendorLookup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [q, setQ] = useState("");

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendor-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("id, company_name, contact_name, tax_id, phone, email, address, bank_name, bank_account, tax_doc_url, id_card_url, line_user_id, is_active")
        .order("company_name");
      if (error) throw error;
      return data as Row[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return vendors.slice(0, 30);
    return vendors.filter((v) =>
      (v.company_name || "").toLowerCase().includes(s) ||
      (v.contact_name || "").toLowerCase().includes(s) ||
      (v.tax_id || "").includes(s) ||
      (v.bank_account || "").replace(/[-\s]/g, "").includes(s.replace(/[-\s]/g, "")) ||
      (v.phone || "").includes(s)
    );
  }, [vendors, q]);

  const openDoc = async (path: string | null) => {
    if (!path) return;
    const win = window.open("about:blank", "_blank");
    let signed = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) signed = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (signed.data?.signedUrl) {
      if (win) win.location.href = signed.data.signedUrl;
    } else {
      win?.close();
      toast({ title: "เปิดไฟล์ไม่ได้", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" />กลับ
          </Button>
          <h1 className="text-lg font-semibold">🔎 ค้นข้อมูลคู่ค้า (ก่อนโอนเงิน)</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="ชื่อร้าน / ผู้ติดต่อ / เลขผู้เสียภาษี / เลขบัญชี / เบอร์โทร"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">ไม่พบคู่ค้า</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((v) => {
              const taxOk = (v.tax_id || "").replace(/\D/g, "").length === 13;
              const missing = [
                !taxOk && "เลขผู้เสียภาษี",
                !v.bank_name && "ธนาคาร",
                !v.bank_account && "เลขบัญชี",
                !v.address && "ที่อยู่",
              ].filter(Boolean) as string[];
              return (
                <Card key={v.id}>
                  <CardContent className="pt-4 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{v.company_name}</p>
                      {v.line_user_id
                        ? <Badge variant="secondary" className="text-[10px]"><MessageCircle className="h-3 w-3 mr-1" />ผูก LINE</Badge>
                        : <Badge variant="outline" className="text-[10px]">ยังไม่ผูก LINE</Badge>}
                    </div>
                    <CopyField label="ผู้ติดต่อ" value={v.contact_name} />
                    <CopyField label="เลขผู้เสียภาษี" value={v.tax_id} />
                    <CopyField label="ธนาคาร" value={v.bank_name} />
                    <CopyField label="เลขบัญชี" value={v.bank_account} />
                    <CopyField label="ชื่อบัญชี" value={v.company_name} />
                    <CopyField label="เบอร์โทร" value={v.phone} />
                    <CopyField label="ที่อยู่" value={v.address} />

                    {missing.length > 0 && (
                      <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 mt-2">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>ยังขาด: {missing.join(" · ")} — ขอข้อมูลก่อนโอนเงิน</span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      {v.tax_doc_url && (
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openDoc(v.tax_doc_url)}>
                          <FileText className="h-3 w-3 mr-1" />เอกสารภาษี
                        </Button>
                      )}
                      {v.id_card_url && (
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openDoc(v.id_card_url)}>
                          <FileText className="h-3 w-3 mr-1" />สำเนาบัตร
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
