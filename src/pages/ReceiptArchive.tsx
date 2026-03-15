import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FolderOpen, Image, Download, Share2, ChevronRight, Copy, Check, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FolderLevel = "category" | "year" | "month" | "files";

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface FileItem {
  name: string;
  path: string;
  signedUrl?: string;
  size?: number;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  BUSINESS: { label: "ธุรกิจ", color: "bg-blue-500/15 text-blue-700 border-blue-200" },
  PERSONAL: { label: "ส่วนตัว", color: "bg-orange-500/15 text-orange-700 border-orange-200" },
  TRANSFER: { label: "โอนเงิน", color: "bg-gray-500/15 text-gray-700 border-gray-200" },
};

const MONTH_NAMES = [
  "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const ReceiptArchive = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentPath, setCurrentPath] = useState("");
  const [level, setLevel] = useState<FolderLevel>("category");
  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  // Share dialog
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load folders/files based on current path
  useEffect(() => {
    if (!user) return;
    loadContent();
  }, [user, currentPath]);

  const getLineUserId = async (): Promise<string | null> => {
    if (!user) return null;
    const { data } = await supabase
      .from("line_user_mappings")
      .select("line_user_id")
      .eq("supabase_user_id", user.id)
      .maybeSingle();
    return data?.line_user_id || null;
  };

  const loadContent = async () => {
    if (!user) return;
    setLoadingFiles(true);

    try {
      const lineUserId = await getLineUserId();
      if (!lineUserId) {
        // Fallback: query expenses table for unique categories/dates
        await loadFromExpenses();
        return;
      }

      const basePath = `line/${lineUserId}`;

      if (!currentPath) {
        // Level: category folders
        setLevel("category");
        setBreadcrumbs([]);
        const { data } = await supabase.storage.from("receipts").list(basePath, { limit: 100 });
        const folderNames = (data || [])
          .filter((item) => !item.metadata || item.id === null || item.name === "BUSINESS" || item.name === "PERSONAL" || item.name === "TRANSFER")
          .map((item) => item.name)
          .filter((name) => ["BUSINESS", "PERSONAL", "TRANSFER"].includes(name));
        
        // Also check for legacy files (no subfolder structure)
        const uniqueCategories = [...new Set(folderNames)];
        setFolders(uniqueCategories.length > 0 ? uniqueCategories : ["BUSINESS", "PERSONAL", "TRANSFER"]);
        setFiles([]);
      } else {
        const parts = currentPath.split("/");
        const fullPath = `${basePath}/${currentPath}`;

        if (parts.length === 1) {
          // Level: year folders
          setLevel("year");
          setBreadcrumbs([{ label: CATEGORY_LABELS[parts[0]]?.label || parts[0], path: "" }]);
          const { data } = await supabase.storage.from("receipts").list(fullPath, { limit: 100 });
          const yearFolders = (data || []).map((item) => item.name).filter((n) => /^\d{4}$/.test(n));
          yearFolders.sort((a, b) => b.localeCompare(a));
          setFolders(yearFolders);
          setFiles([]);
        } else if (parts.length === 2) {
          // Level: month folders
          setLevel("month");
          setBreadcrumbs([
            { label: CATEGORY_LABELS[parts[0]]?.label || parts[0], path: "" },
            { label: parts[1], path: parts[0] },
          ]);
          const { data } = await supabase.storage.from("receipts").list(fullPath, { limit: 100 });
          const monthFolders = (data || []).map((item) => item.name).filter((n) => /^\d{2}$/.test(n));
          monthFolders.sort((a, b) => a.localeCompare(b));
          setFolders(monthFolders);
          setFiles([]);
        } else if (parts.length === 3) {
          // Level: actual files
          setLevel("files");
          setBreadcrumbs([
            { label: CATEGORY_LABELS[parts[0]]?.label || parts[0], path: "" },
            { label: parts[1], path: parts[0] },
            { label: MONTH_NAMES[parseInt(parts[2])] || parts[2], path: `${parts[0]}/${parts[1]}` },
          ]);
          const { data } = await supabase.storage.from("receipts").list(fullPath, { limit: 500 });
          const fileItems: FileItem[] = (data || [])
            .filter((item) => item.name && (item.name.endsWith(".jpg") || item.name.endsWith(".pdf") || item.name.endsWith(".png")))
            .map((item) => ({
              name: item.name,
              path: `${fullPath}/${item.name}`,
              size: item.metadata?.size,
            }));
          setFolders([]);
          
          // Load signed URLs for thumbnails
          const filesWithUrls = await Promise.all(
            fileItems.map(async (file) => {
              const { data: signed } = await supabase.storage
                .from("receipts")
                .createSignedUrl(file.path, 3600);
              return { ...file, signedUrl: signed?.signedUrl };
            })
          );
          setFiles(filesWithUrls);
        }
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const loadFromExpenses = async () => {
    // Fallback when no LINE mapping: show categories from expenses
    setLevel("category");
    setFolders(["BUSINESS", "PERSONAL", "TRANSFER"]);
    setFiles([]);
    setLoadingFiles(false);
  };

  const navigateToFolder = (folder: string) => {
    setCurrentPath(currentPath ? `${currentPath}/${folder}` : folder);
  };

  const navigateBack = (targetPath: string) => {
    setCurrentPath(targetPath);
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const { data, error } = await supabase.storage.from("receipts").download(file.path);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: "ดาวน์โหลดสำเร็จ", description: file.name });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถดาวน์โหลดได้", variant: "destructive" });
    }
  };

  const handleDownloadAll = async () => {
    if (files.length === 0) return;
    toast({ title: "กำลังดาวน์โหลด", description: `${files.length} ไฟล์...` });
    for (const file of files) {
      await handleDownload(file);
      // Small delay between downloads
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  const handleShareFolder = async () => {
    if (files.length === 0) {
      toast({ title: "ไม่มีไฟล์", description: "โฟลเดอร์นี้ยังไม่มีสลิป", variant: "destructive" });
      return;
    }

    try {
      // Create signed URLs for all files (valid 24 hours)
      const paths = files.map((f) => f.path);
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrls(paths, 86400);

      if (error) throw error;

      // Build a share text with all links
      const parts = currentPath.split("/");
      const folderLabel = [
        CATEGORY_LABELS[parts[0]]?.label || parts[0],
        parts[1],
        MONTH_NAMES[parseInt(parts[2])] || parts[2],
      ]
        .filter(Boolean)
        .join(" > ");

      const shareText = `📂 สลิป: ${folderLabel}\n${(data || []).length} ไฟล์\n\n${(data || [])
        .map((d, i) => `${i + 1}. ${d.signedUrl}`)
        .join("\n")}`;

      setShareUrl(shareText);
      setShareDialogOpen(true);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถสร้างลิงก์แชร์ได้", variant: "destructive" });
    }
  };

  const handleShareSingle = async (file: FileItem) => {
    try {
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(file.path, 86400);

      if (error) throw error;

      setShareUrl(data?.signedUrl || "");
      setShareDialogOpen(true);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleCopyShare = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "คัดลอกแล้ว", description: "ลิงก์ถูกคัดลอกลง Clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = (file: FileItem) => {
    if (file.signedUrl) {
      setPreviewUrl(file.signedUrl);
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
            <p className="text-primary-foreground/80 text-sm">เรียกดู ดาวน์โหลด และแชร์สลิปตามโฟลเดอร์</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm flex-wrap">
          <button
            onClick={() => setCurrentPath("")}
            className="text-primary hover:underline font-medium"
          >
            🏠 คลังสลิป
          </button>
          {breadcrumbs.map((bc, idx) => (
            <span key={idx} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              {idx < breadcrumbs.length - 1 ? (
                <button
                  onClick={() => navigateBack(bc.path)}
                  className="text-primary hover:underline"
                >
                  {bc.label}
                </button>
              ) : (
                <span className="text-muted-foreground">{bc.label}</span>
              )}
            </span>
          ))}
          {level === "files" && currentPath && (
            <span className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {MONTH_NAMES[parseInt(currentPath.split("/")[2])] || currentPath.split("/")[2]}
              </span>
            </span>
          )}
        </div>

        {/* Action buttons when viewing files */}
        {level === "files" && files.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={handleDownloadAll} variant="outline">
              <Download className="h-4 w-4 mr-1.5" />
              ดาวน์โหลดทั้งหมด ({files.length})
            </Button>
            <Button size="sm" onClick={handleShareFolder} variant="outline">
              <Share2 className="h-4 w-4 mr-1.5" />
              สร้างลิงก์แชร์ทั้งโฟลเดอร์
            </Button>
          </div>
        )}

        {/* Loading */}
        {loadingFiles && (
          <div className="flex justify-center py-12">
            <p className="text-muted-foreground">กำลังโหลด...</p>
          </div>
        )}

        {/* Folders */}
        {!loadingFiles && folders.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((folder) => {
              const catInfo = level === "category" ? CATEGORY_LABELS[folder] : null;
              const displayLabel =
                level === "category"
                  ? catInfo?.label || folder
                  : level === "month"
                  ? MONTH_NAMES[parseInt(folder)] || folder
                  : folder;

              return (
                <Card
                  key={folder}
                  className="p-4 cursor-pointer hover:shadow-card transition-all hover:scale-[1.02] border-border/50"
                  onClick={() => navigateToFolder(folder)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{displayLabel}</p>
                      {catInfo && (
                        <Badge variant="outline" className={`text-xs mt-1 ${catInfo.color}`}>
                          {folder}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Files grid */}
        {!loadingFiles && files.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {files.map((file) => (
              <Card key={file.path} className="overflow-hidden border-border/50">
                {/* Thumbnail */}
                <div
                  className="aspect-[3/4] bg-muted relative cursor-pointer group"
                  onClick={() => handlePreview(file)}
                >
                  {file.signedUrl && file.name.endsWith(".pdf") ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <div className="text-center">
                        <p className="text-2xl">📄</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF</p>
                      </div>
                    </div>
                  ) : file.signedUrl ? (
                    <img
                      src={file.signedUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Eye className="h-6 w-6 text-white" />
                  </div>
                </div>
                {/* Actions */}
                <div className="p-2 flex items-center justify-between gap-1">
                  <p className="text-xs text-muted-foreground truncate flex-1">
                    {file.name.split("_").pop()?.split(".")[0] || file.name}
                  </p>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
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
                        handleShareSingle(file);
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loadingFiles && folders.length === 0 && files.length === 0 && level !== "category" && (
          <div className="text-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">ยังไม่มีสลิปในโฟลเดอร์นี้</p>
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
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 bg-black/95 overflow-hidden">
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
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReceiptArchive;
