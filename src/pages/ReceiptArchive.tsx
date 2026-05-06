import { useState, useEffect, useMemo, useRef } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FolderOpen, Download, Share2, ChevronRight, Copy, Check, Eye, Image, Package } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getEntityFolder } from "@/lib/storage-path";
import { downloadReceiptFile } from "@/lib/receipt-file";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReceiptRow {
  id: string;
  receipt_url: string;
  category: string;
  expense_date: string;
  amount: number;
  description: string | null;
  subcategory: string | null;
  transaction_type: string | null;
  category_group: string | null;
}

const ENTITY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  personal: { label: "ส่วนตัว", color: "bg-orange-500/15 text-orange-700 border-orange-200", icon: "🧑" },
  business: { label: "ธุรกิจหลัก (เม้งซิน)", color: "bg-blue-500/15 text-blue-700 border-blue-200", icon: "🏢" },
  "bcc-next": { label: "BCC Next", color: "bg-purple-500/15 text-purple-700 border-purple-200", icon: "🚀" },
  kukanang: { label: "คู่ขนาน", color: "bg-green-500/15 text-green-700 border-green-200", icon: "🎯" },
  transfer: { label: "โอนเงิน", color: "bg-gray-500/15 text-gray-700 border-gray-200", icon: "💸" },
};

const MONTH_NAMES = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Get entity key from receipt data
function getReceiptEntity(r: ReceiptRow): string {
  return getEntityFolder(r.transaction_type, r.category_group);
}

const ReceiptArchive = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [allReceipts, setAllReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Signed URLs cache
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [failedPaths, setFailedPaths] = useState<Set<string>>(new Set());
  const objectUrlsRef = useRef<string[]>([]);

  // Zip download progress
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  // Share dialog
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load all receipts once
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("expenses")
        .select("id, receipt_url, category, expense_date, amount, description, subcategory, transaction_type, category_group")
        .eq("user_id", user.id)
        .not("receipt_url", "is", null)
        .order("expense_date", { ascending: false });

      if (!error && data) {
        setAllReceipts(data as ReceiptRow[]);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Derived: entities
  const entities = useMemo(() => {
    const ents = new Set<string>();
    allReceipts.forEach((r) => ents.add(getReceiptEntity(r)));
    return Array.from(ents).sort();
  }, [allReceipts]);

  // Derived: years for selected category
  const years = useMemo(() => {
    if (!selectedEntity) return [];
    const yrs = new Set<string>();
    allReceipts
      .filter((r) => getReceiptEntity(r) === selectedEntity)
      .forEach((r) => yrs.add(r.expense_date.substring(0, 4)));
    return Array.from(yrs).sort((a, b) => b.localeCompare(a));
  }, [allReceipts, selectedEntity]);

  // Derived: months for selected year
  const months = useMemo(() => {
    if (!selectedEntity || !selectedYear) return [];
    const mos = new Set<string>();
    allReceipts
      .filter(
        (r) =>
          getReceiptEntity(r) === selectedEntity &&
          r.expense_date.substring(0, 4) === selectedYear
      )
      .forEach((r) => mos.add(r.expense_date.substring(5, 7)));
    return Array.from(mos).sort();
  }, [allReceipts, selectedEntity, selectedYear]);

  // Derived: files for selected month
  const currentFiles = useMemo(() => {
    if (!selectedEntity || !selectedYear || !selectedMonth) return [];
    return allReceipts.filter(
      (r) =>
        getReceiptEntity(r) === selectedEntity &&
        r.expense_date.substring(0, 4) === selectedYear &&
        r.expense_date.substring(5, 7) === selectedMonth
    );
  }, [allReceipts, selectedEntity, selectedYear, selectedMonth]);

  // Cleanup blob URLs on unmount/change
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  // Load images when files change — use blob download (more reliable than signed URLs)
  useEffect(() => {
    if (currentFiles.length === 0) return;
    let cancelled = false;
    // Reset state for new folder
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
    setSignedUrls(new Map());
    setFailedPaths(new Set());

    const loadUrls = async () => {
      setLoadingUrls(true);
      const map = new Map<string, string>();
      const failed = new Set<string>();
      // Concurrency-limited blob downloads (same path as the working "download" button)
      const CONCURRENCY = 6;
      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < currentFiles.length) {
          const i = cursor++;
          const f = currentFiles[i];
          // skip PDFs from preview thumbnails (handled separately)
          if (f.receipt_url.endsWith(".pdf")) continue;
          let success = false;
          for (let attempt = 0; attempt < 3 && !success && !cancelled; attempt++) {
            try {
              const data = await downloadReceiptFile(f.receipt_url);
              const objUrl = URL.createObjectURL(data);
              objectUrlsRef.current.push(objUrl);
              map.set(f.receipt_url, objUrl);
              if (i % 8 === 0) setSignedUrls(new Map(map));
              success = true;
            } catch (e) {
              if (attempt === 2) {
                failed.add(f.receipt_url);
                console.warn("Image load failed:", f.receipt_url, e);
              } else {
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
              }
            }
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      if (cancelled) return;
      setSignedUrls(new Map(map));
      setFailedPaths(failed);
      setLoadingUrls(false);
    };
    loadUrls();
    return () => {
      cancelled = true;
    };
  }, [currentFiles]);

  // Determine current level
  const level = !selectedEntity
    ? "entity"
    : !selectedYear
    ? "year"
    : !selectedMonth
    ? "month"
    : "files";

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const items: { label: string; onClick: () => void }[] = [];
    if (selectedEntity) {
      items.push({
        label: ENTITY_LABELS[selectedEntity]?.label || selectedEntity,
        onClick: () => {
          setSelectedEntity(null);
          setSelectedYear(null);
          setSelectedMonth(null);
        },
      });
    }
    if (selectedYear) {
      items.push({
        label: selectedYear,
        onClick: () => {
          setSelectedYear(null);
          setSelectedMonth(null);
        },
      });
    }
    if (selectedMonth) {
      items.push({
        label: MONTH_NAMES[parseInt(selectedMonth)] || selectedMonth,
        onClick: () => setSelectedMonth(null),
      });
    }
    return items;
  }, [selectedEntity, selectedYear, selectedMonth]);

  const handleDownload = async (receipt: ReceiptRow) => {
    try {
      const data = await downloadReceiptFile(receipt.receipt_url);
      const url = URL.createObjectURL(data);
      const ext = receipt.receipt_url.endsWith(".pdf") ? "pdf" : "jpg";
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${receipt.expense_date}_${receipt.amount}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: "ดาวน์โหลดสำเร็จ" });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถดาวน์โหลดได้", variant: "destructive" });
    }
  };

  const handleDownloadAll = async () => {
    if (currentFiles.length === 0) return;
    const total = currentFiles.length;
    setZipProgress({ done: 0, total });
    toast({ title: "กำลังเตรียมไฟล์ ZIP", description: `${total} ไฟล์...` });

    const zip = new JSZip();
    const used = new Map<string, number>();
    let done = 0;
    let failures = 0;

    const CONCURRENCY = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < currentFiles.length) {
        const i = cursor++;
        const f = currentFiles[i];
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            const data = await downloadReceiptFile(f.receipt_url);
            const ext = f.receipt_url.toLowerCase().endsWith(".pdf") ? "pdf" : "jpg";
            const safeDesc = (f.description || "slip").replace(/[^\u0E00-\u0E7F\w\-]+/g, "_").slice(0, 40);
            let baseName = `${f.expense_date}_${Math.round(f.amount)}_${safeDesc}.${ext}`;
            const count = used.get(baseName) || 0;
            if (count > 0) baseName = baseName.replace(`.${ext}`, `_${count}.${ext}`);
            used.set(baseName, count + 1);
            zip.file(baseName, data);
            ok = true;
          } catch (e) {
            if (attempt === 2) failures++;
            else await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        done++;
        setZipProgress({ done, total });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    try {
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const folderLabel = [
        ENTITY_LABELS[selectedEntity || ""]?.label || selectedEntity,
        selectedYear,
        MONTH_NAMES[parseInt(selectedMonth || "0")] || selectedMonth,
      ].filter(Boolean).join("_");
      link.href = url;
      link.download = `slips_${folderLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "ดาวน์โหลด ZIP สำเร็จ",
        description: `${done - failures}/${total} ไฟล์${failures ? ` (โหลดไม่สำเร็จ ${failures} ไฟล์)` : ""}`,
      });
    } catch (e) {
      toast({ title: "สร้าง ZIP ไม่สำเร็จ", variant: "destructive" });
    }
    setZipProgress(null);
  };

  const handleShareFolder = async () => {
    if (currentFiles.length === 0) return;
    try {
      const paths = currentFiles.map((f) => f.receipt_url);
      const { data, error } = await supabase.storage.from("receipts").createSignedUrls(paths, 86400);
      if (error) throw error;

      const folderLabel = [
        ENTITY_LABELS[selectedEntity || ""]?.label || selectedEntity,
        selectedYear,
        MONTH_NAMES[parseInt(selectedMonth || "0")] || selectedMonth,
      ]
        .filter(Boolean)
        .join(" > ");

      const shareText = `📂 สลิป: ${folderLabel}\n📄 ${(data || []).length} ไฟล์\n⏳ ลิงก์มีอายุ 24 ชั่วโมง\n\n${(data || [])
        .map((d, i) => `${i + 1}. ${d.signedUrl}`)
        .join("\n\n")}`;

      setShareUrl(shareText);
      setShareDialogOpen(true);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleShareSingle = async (receipt: ReceiptRow) => {
    try {
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(receipt.receipt_url, 86400);
      if (error) throw error;

      const shareText = `📎 สลิป: ${receipt.description || "-"}\n💰 ฿${receipt.amount.toLocaleString()}\n📅 ${receipt.expense_date}\n⏳ ลิงก์มีอายุ 24 ชม.\n\n${data?.signedUrl}`;
      setShareUrl(shareText);
      setShareDialogOpen(true);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleCopyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "คัดลอกแล้ว" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = (receipt: ReceiptRow) => {
    const url = signedUrls.get(receipt.receipt_url);
    if (url) {
      setPreviewUrl(url);
      setPreviewOpen(true);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="text-primary-foreground hover:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">คลังสลิป</h1>
            <p className="text-primary-foreground/80 text-sm">
              {allReceipts.length} สลิป • เรียกดู ดาวน์โหลด และแชร์
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button
            onClick={() => {
              setSelectedEntity(null);
              setSelectedYear(null);
              setSelectedMonth(null);
            }}
            className="text-primary hover:underline font-medium"
          >
            🏠 คลังสลิป
          </button>
          {breadcrumbs.map((bc, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              {idx < breadcrumbs.length - 1 ? (
                <button onClick={bc.onClick} className="text-primary hover:underline">
                  {bc.label}
                </button>
              ) : (
                <span className="text-foreground font-medium">{bc.label}</span>
              )}
            </span>
          ))}
        </div>

        {/* Action buttons when viewing files */}
        {level === "files" && currentFiles.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleDownloadAll} variant="outline" disabled={!!zipProgress}>
              <Package className="h-4 w-4 mr-1.5" />
              {zipProgress
                ? `กำลังโหลด ${zipProgress.done}/${zipProgress.total}...`
                : `ดาวน์โหลด ZIP ทั้งหมด (${currentFiles.length})`}
            </Button>
            <Button size="sm" onClick={handleShareFolder} variant="outline">
              <Share2 className="h-4 w-4 mr-1.5" />
              สร้างลิงก์แชร์ทั้งโฟลเดอร์
            </Button>
            {failedPaths.size > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                โหลดภาพไม่สำเร็จ {failedPaths.size} ไฟล์ (ZIP จะลองโหลดใหม่)
              </Badge>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <p className="text-muted-foreground">กำลังโหลด...</p>
          </div>
        )}

        {/* Entity level */}
        {!loading && level === "entity" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(entities.length > 0 ? entities : ["personal", "business", "bcc-next", "kukanang", "transfer"]).map((ent) => {
              const info = ENTITY_LABELS[ent];
              const count = allReceipts.filter((r) => getReceiptEntity(r) === ent).length;
              return (
                <Card
                  key={ent}
                  className={`p-4 cursor-pointer hover:shadow-card transition-all hover:scale-[1.02] border-border/50 ${count === 0 ? "opacity-50" : ""}`}
                  onClick={() => count > 0 && setSelectedEntity(ent)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                      {info?.icon || "📁"}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{info?.label || ent}</p>
                      <Badge variant="outline" className={`text-xs mt-1 ${info?.color || ""}`}>
                        {count} สลิป
                      </Badge>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Year level */}
        {!loading && level === "year" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {years.map((yr) => {
              const count = allReceipts.filter(
                (r) => getReceiptEntity(r) === selectedEntity && r.expense_date.substring(0, 4) === yr
              ).length;
              return (
                <Card
                  key={yr}
                  className="p-4 cursor-pointer hover:shadow-card transition-all hover:scale-[1.02] border-border/50"
                  onClick={() => setSelectedYear(yr)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{yr}</p>
                      <p className="text-xs text-muted-foreground">{count} สลิป</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Month level */}
        {!loading && level === "month" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {months.map((mo) => {
              const count = allReceipts.filter(
                (r) =>
                  getReceiptEntity(r) === selectedEntity &&
                  r.expense_date.substring(0, 4) === selectedYear &&
                  r.expense_date.substring(5, 7) === mo
              ).length;
              return (
                <Card
                  key={mo}
                  className="p-4 cursor-pointer hover:shadow-card transition-all hover:scale-[1.02] border-border/50"
                  onClick={() => setSelectedMonth(mo)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{MONTH_NAMES[parseInt(mo)]}</p>
                      <p className="text-xs text-muted-foreground">{count} สลิป</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Files grid */}
        {!loading && level === "files" && (
          <>
            {loadingUrls && (
              <p className="text-sm text-muted-foreground">กำลังโหลดภาพ...</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {currentFiles.map((receipt) => {
                const url = signedUrls.get(receipt.receipt_url);
                const isPdf = receipt.receipt_url.endsWith(".pdf");

                return (
                  <Card key={receipt.id} className="overflow-hidden border-border/50">
                    {/* Thumbnail */}
                    <div
                      className="aspect-[3/4] bg-muted relative cursor-pointer group"
                      onClick={() => handlePreview(receipt)}
                    >
                      {isPdf ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
                            <p className="text-2xl">📄</p>
                            <p className="text-xs text-muted-foreground mt-1">PDF</p>
                          </div>
                        </div>
                      ) : url ? (
                        <img
                          src={url}
                          alt={receipt.description || "สลิป"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={async (e) => {
                            const img = e.currentTarget;
                            if (img.dataset.retried) return;
                            img.dataset.retried = "1";
                            try {
                              const { data } = await supabase.storage
                                .from("receipts")
                                .download(receipt.receipt_url);
                              if (data) img.src = URL.createObjectURL(data);
                            } catch {
                              /* ignore */
                            }
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Eye className="h-6 w-6 text-white" />
                      </div>
                    </div>

                    {/* Info + Actions */}
                    <div className="p-2 space-y-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        ฿{receipt.amount.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {receipt.expense_date} • {receipt.description || "-"}
                      </p>
                      <div className="flex gap-0.5 pt-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(receipt);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShareSingle(receipt);
                          }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && allReceipts.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">ยังไม่มีสลิปในระบบ</p>
            <p className="text-sm text-muted-foreground mt-1">ส่งสลิปผ่าน LINE เพื่อเริ่มเก็บข้อมูล</p>
          </div>
        )}
      </main>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              ลิงก์แชร์สลิป
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ลิงก์นี้มีอายุ 24 ชั่วโมง สามารถส่งให้สำนักบัญชีเพื่อดูสลิปได้
            </p>
            <div className="bg-muted rounded-lg p-3 max-h-[300px] overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap break-all">{shareUrl}</pre>
            </div>
            <Button onClick={handleCopyShare} className="w-full">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  คัดลอกแล้ว
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  คัดลอกลิงก์
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-1 bg-black/95 overflow-auto">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreviewOpen(false)}
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/20"
            >
              ✕
            </Button>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-auto object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceiptArchive;
