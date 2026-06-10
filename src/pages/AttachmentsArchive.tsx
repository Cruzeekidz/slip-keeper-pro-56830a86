import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import JSZip from "jszip";
import { ArrowLeft, ChevronRight, Download, Eye, FileText, FolderOpen, Package, Share2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type SourceKey = "vendor-bills" | "expense-claims" | "substitute-receipts" | "payment-slips";

const SOURCE_LABELS: Record<SourceKey, { label: string; icon: string; color: string }> = {
  "vendor-bills":       { label: "บิลคู่ค้า",            icon: "🧾", color: "bg-blue-500/15 text-blue-700 border-blue-200" },
  "expense-claims":     { label: "ใบเบิกค่าใช้จ่าย",      icon: "💼", color: "bg-emerald-500/15 text-emerald-700 border-emerald-200" },
  "substitute-receipts":{ label: "ใบรับเงินทดแทน",       icon: "📝", color: "bg-amber-500/15 text-amber-700 border-amber-200" },
  "payment-slips":      { label: "สลิปการจ่ายเงิน",       icon: "💸", color: "bg-violet-500/15 text-violet-700 border-violet-200" },
};

const MONTH_NAMES = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

interface FileRow {
  source: SourceKey;
  path: string;
  year: string;
  month: string;
  label: string;
  date: string;
  amount?: number | null;
}

// extract /YYYY/MM/ from any path in receipts bucket
function extractYearMonth(path: string, fallbackDate?: string | null): { year: string; month: string } | null {
  const m = path.match(/\/(\d{4})\/(\d{2})\//);
  if (m) return { year: m[1], month: m[2] };
  if (fallbackDate && /^\d{4}-\d{2}-\d{2}/.test(fallbackDate)) {
    return { year: fallbackDate.slice(0, 4), month: fallbackDate.slice(5, 7) };
  }
  return null;
}

export default function AttachmentsArchive() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selSource, setSelSource] = useState<SourceKey | null>(null);
  const [selYear, setSelYear] = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [copied, setCopied] = useState(false);

  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [vi, ec, si] = await Promise.all([
        supabase
          .from("vendor_invoices")
          .select("id, file_url, payment_slip_url, invoice_date, paid_at, created_at, description, invoice_number, net_amount")
          .eq("user_id", user.id),
        supabase
          .from("staff_expense_claims")
          .select("id, receipt_url, substitute_receipt_url, expense_date, created_at, description, amount")
          .eq("user_id", user.id),
        supabase
          .from("staff_invoices")
          .select("id, payment_slip_url, paid_at, created_at, invoice_number, net_amount")
          .eq("user_id", user.id),
      ]);

      const out: FileRow[] = [];
      const push = (
        source: SourceKey,
        path: string | null | undefined,
        date: string | null | undefined,
        label: string,
        amount?: number | null,
      ) => {
        if (!path) return;
        const ym = extractYearMonth(path, date);
        if (!ym) return;
        out.push({
          source,
          path,
          year: ym.year,
          month: ym.month,
          label,
          date: date || `${ym.year}-${ym.month}-01`,
          amount: amount ?? null,
        });
      };

      (vi.data || []).forEach((r: any) => {
        push("vendor-bills",  r.file_url,         r.invoice_date || r.created_at, r.description || r.invoice_number || "บิลคู่ค้า", r.net_amount);
        push("payment-slips", r.payment_slip_url, r.paid_at || r.invoice_date || r.created_at, `จ่ายบิล ${r.invoice_number || r.description || ""}`.trim(), r.net_amount);
      });
      (ec.data || []).forEach((r: any) => {
        push("expense-claims",      r.receipt_url,            r.expense_date || r.created_at, r.description || "ใบเบิก", r.amount);
        push("substitute-receipts", r.substitute_receipt_url, r.expense_date || r.created_at, r.description || "ใบรับเงินทดแทน", r.amount);
      });
      (si.data || []).forEach((r: any) => {
        push("payment-slips", r.payment_slip_url, r.paid_at || r.created_at, `จ่ายค่าแรง ${r.invoice_number || ""}`.trim(), r.net_amount);
      });

      out.sort((a, b) => b.date.localeCompare(a.date));
      setRows(out);
      setLoading(false);
    })();
  }, [user]);

  const sources = useMemo(() => {
    const map = new Map<SourceKey, number>();
    rows.forEach((r) => map.set(r.source, (map.get(r.source) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const years = useMemo(() => {
    if (!selSource) return [];
    const map = new Map<string, number>();
    rows.filter((r) => r.source === selSource).forEach((r) => map.set(r.year, (map.get(r.year) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, selSource]);

  const months = useMemo(() => {
    if (!selSource || !selYear) return [];
    const map = new Map<string, number>();
    rows.filter((r) => r.source === selSource && r.year === selYear).forEach((r) => map.set(r.month, (map.get(r.month) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows, selSource, selYear]);

  const currentFiles = useMemo(() => {
    if (!selSource || !selYear || !selMonth) return [];
    return rows.filter((r) => r.source === selSource && r.year === selYear && r.month === selMonth);
  }, [rows, selSource, selYear, selMonth]);

  const level: "source" | "year" | "month" | "files" = !selSource
    ? "source" : !selYear ? "year" : !selMonth ? "month" : "files";

  const breadcrumbs = useMemo(() => {
    const items: { label: string; onClick: () => void }[] = [];
    if (selSource) items.push({ label: SOURCE_LABELS[selSource].label, onClick: () => { setSelSource(null); setSelYear(null); setSelMonth(null); } });
    if (selYear)   items.push({ label: selYear, onClick: () => { setSelYear(null); setSelMonth(null); } });
    if (selMonth)  items.push({ label: MONTH_NAMES[parseInt(selMonth)] || selMonth, onClick: () => setSelMonth(null) });
    return items;
  }, [selSource, selYear, selMonth]);

  const openSigned = async (path: string, asPreview = false) => {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 3600);
    if (error || !data) {
      toast({ title: "เปิดไฟล์ไม่สำเร็จ", description: error?.message, variant: "destructive" });
      return null;
    }
    if (asPreview) {
      setPreviewIsPdf(path.toLowerCase().endsWith(".pdf"));
      setPreviewUrl(data.signedUrl);
      setPreviewOpen(true);
    }
    return data.signedUrl;
  };

  const handleDownload = async (f: FileRow) => {
    const url = await openSigned(f.path);
    if (!url) return;
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = f.path.split(".").pop()?.toLowerCase() || "bin";
    const safe = f.label.replace(/[^\u0E00-\u0E7F\w\-]+/g, "_").slice(0, 40);
    const a = document.createElement("a");
    const obj = URL.createObjectURL(blob);
    a.href = obj; a.download = `${f.date}_${safe}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(obj);
  };

  const handleZip = async () => {
    if (currentFiles.length === 0) return;
    setZipProgress({ done: 0, total: currentFiles.length });
    const zip = new JSZip();
    const used = new Map<string, number>();
    let done = 0, fail = 0;
    const CONCURRENCY = 5;
    let cursor = 0;
    const worker = async () => {
      while (cursor < currentFiles.length) {
        const i = cursor++;
        const f = currentFiles[i];
        try {
          const { data, error } = await supabase.storage.from("receipts").createSignedUrl(f.path, 3600);
          if (error || !data) throw error;
          const blob = await (await fetch(data.signedUrl)).blob();
          const ext = f.path.split(".").pop()?.toLowerCase() || "bin";
          const safe = f.label.replace(/[^\u0E00-\u0E7F\w\-]+/g, "_").slice(0, 40);
          let name = `${f.date}_${safe}.${ext}`;
          const c = used.get(name) || 0;
          if (c > 0) name = name.replace(`.${ext}`, `_${c}.${ext}`);
          used.set(name, c + 1);
          zip.file(name, blob);
        } catch { fail++; }
        done++;
        setZipProgress({ done, total: currentFiles.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const folder = [SOURCE_LABELS[selSource!].label, selYear, MONTH_NAMES[parseInt(selMonth!)] || selMonth].filter(Boolean).join("_");
    a.href = url; a.download = `${folder}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setZipProgress(null);
    toast({ title: "ดาวน์โหลด ZIP สำเร็จ", description: `${done - fail}/${currentFiles.length} ไฟล์${fail ? ` (ล้มเหลว ${fail})` : ""}` });
  };

  const handleShareFolder = async () => {
    if (currentFiles.length === 0) return;
    const { data, error } = await supabase.storage.from("receipts").createSignedUrls(currentFiles.map((f) => f.path), 86400);
    if (error) { toast({ title: "สร้างลิงก์ไม่สำเร็จ", variant: "destructive" }); return; }
    const folder = [SOURCE_LABELS[selSource!].label, selYear, MONTH_NAMES[parseInt(selMonth!)] || selMonth].filter(Boolean).join(" > ");
    const text = `📂 ${folder}\n📄 ${(data || []).length} ไฟล์\n⏳ ลิงก์มีอายุ 24 ชม.\n\n${(data || []).map((d, i) => `${i + 1}. ${d.signedUrl}`).join("\n\n")}`;
    setShareText(text); setShareOpen(true);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin-tools")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <FolderOpen className="h-6 w-6" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold">คลังเอกสารแนบ</h1>
            <p className="text-primary-foreground/80 text-sm">
              {rows.length} ไฟล์ • บิลคู่ค้า ใบเบิก สลิปจ่าย แยกตามเดือน
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button onClick={() => { setSelSource(null); setSelYear(null); setSelMonth(null); }} className="text-primary hover:underline font-medium">🏠 คลังเอกสารแนบ</button>
          {breadcrumbs.map((bc, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              {i < breadcrumbs.length - 1
                ? <button onClick={bc.onClick} className="text-primary hover:underline">{bc.label}</button>
                : <span className="text-foreground font-medium">{bc.label}</span>}
            </span>
          ))}
        </div>

        {loading && <p className="text-muted-foreground">กำลังโหลด...</p>}

        {!loading && level === "source" && (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sources.length === 0 && <p className="text-muted-foreground col-span-full">ยังไม่มีไฟล์แนบในระบบ</p>}
            {sources.map(([src, count]) => (
              <Card key={src} className="p-4 cursor-pointer hover:bg-accent/50 transition" onClick={() => setSelSource(src)}>
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{SOURCE_LABELS[src].icon}</div>
                  <div className="flex-1">
                    <div className="font-semibold">{SOURCE_LABELS[src].label}</div>
                    <Badge variant="secondary" className={SOURCE_LABELS[src].color}>{count} ไฟล์</Badge>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && level === "year" && (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {years.map(([y, count]) => (
              <Card key={y} className="p-4 cursor-pointer hover:bg-accent/50 transition" onClick={() => setSelYear(y)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{parseInt(y) + 543}</div>
                    <div className="text-xs text-muted-foreground">ค.ศ. {y}</div>
                  </div>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && level === "month" && (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            {months.map(([m, count]) => (
              <Card key={m} className="p-4 cursor-pointer hover:bg-accent/50 transition" onClick={() => setSelMonth(m)}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{MONTH_NAMES[parseInt(m)]}</div>
                  <Badge variant="secondary">{count} ไฟล์</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && level === "files" && (
          <>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleZip} disabled={!!zipProgress}>
                <Package className="h-4 w-4 mr-1.5" />
                {zipProgress ? `กำลังโหลด ${zipProgress.done}/${zipProgress.total}` : `ดาวน์โหลด ZIP (${currentFiles.length})`}
              </Button>
              <Button size="sm" variant="outline" onClick={handleShareFolder}>
                <Share2 className="h-4 w-4 mr-1.5" /> สร้างลิงก์แชร์ทั้งเดือน
              </Button>
            </div>

            <div className="grid gap-2">
              {currentFiles.map((f) => (
                <Card key={f.path} className="p-3 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{f.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.date}{f.amount != null ? ` • ฿${Number(f.amount).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openSigned(f.path, true)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(f)}><Download className="h-4 w-4" /></Button>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>ดูไฟล์</DialogTitle></DialogHeader>
          {previewUrl && (previewIsPdf
            ? <iframe src={previewUrl} className="w-full h-[75vh]" />
            : <img src={previewUrl} alt="" className="w-full max-h-[75vh] object-contain" />)}
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>ลิงก์แชร์ (อายุ 24 ชม.)</DialogTitle></DialogHeader>
          <Textarea value={shareText} readOnly rows={12} />
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(shareText);
              setCopied(true);
              toast({ title: "คัดลอกแล้ว" });
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} คัดลอกข้อความทั้งหมด
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}