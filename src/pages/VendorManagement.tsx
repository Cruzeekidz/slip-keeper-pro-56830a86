import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  useVendorProfiles,
  useVendorInvoices,
  useVendorSummaries,
  useUpdateInvoiceStatus,
  useLinkInvoiceToVendor,
  useDeleteVendor,
  useDeleteInvoice,
  useAutoLinkInvoices,
} from "@/hooks/useVendorData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, FileText, Eye, Copy, CheckCircle, Search, Trash2, Link2, AlertCircle, Receipt, FileCheck, Download, Folder, Wallet, Upload, Image as ImageIcon, X, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { buildUploadPath } from "@/lib/storage-path";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const docTypeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  invoice: { label: "ใบแจ้งหนี้", variant: "outline" },
  receipt: { label: "ใบเสร็จรับเงิน", variant: "secondary" },
  tax_invoice: { label: "ใบกำกับภาษี", variant: "default" },
  substitute_receipt: { label: "ใบรับรองแทนใบเสร็จ", variant: "destructive" },
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "รอตรวจสอบ", variant: "secondary" },
  approved: { label: "อนุมัติแล้ว", variant: "default" },
  paid: { label: "จ่ายแล้ว", variant: "outline" },
};

const VendorManagement = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewBucket, setPreviewBucket] = useState<string>("documents");

  // Pay dialog state
  const [payInvoice, setPayInvoice] = useState<any | null>(null);
  const [paySlip, setPaySlip] = useState<File | null>(null);
  const [linkSlipExpenseId, setLinkSlipExpenseId] = useState<string>("");
  const [paying, setPaying] = useState(false);
  const [copiedField, setCopiedField] = useState<string>("");
  const slipInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: vendors = [], isLoading: vendorsLoading } = useVendorProfiles();
  const { data: invoices = [], isLoading: invoicesLoading } = useVendorInvoices();
  const vendorSummaries = useVendorSummaries(vendors, invoices);
  const updateStatusMutation = useUpdateInvoiceStatus();
  const linkMutation = useLinkInvoiceToVendor();
  const deleteVendorMutation = useDeleteVendor();
  const deleteInvoiceMutation = useDeleteInvoice();
  const autoLinkInvoices = useAutoLinkInvoices(vendors, invoices);

  const loading = vendorsLoading || invoicesLoading;

  const copyAccount = (account: string) => {
    const clean = account.replace(/[-\s]/g, "");
    navigator.clipboard.writeText(clean);
    toast({ title: "คัดลอกเลขบัญชีแล้ว", description: clean });
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(""), 1500);
      toast({ title: "คัดลอกแล้ว" });
    } catch {}
  };

  const openPayDialog = (inv: any) => {
    setPayInvoice(inv);
    setPaySlip(null);
    setLinkSlipExpenseId("");
  };

  // Slip candidates: recent unmatched expenses with similar amount (e.g. from LINE)
  const payAmount = payInvoice
    ? Number(payInvoice.net_amount || payInvoice.amount) || 0
    : 0;
  const { data: slipCandidates = [] } = useQuery({
    queryKey: ["vendor-pay-slip-candidates", payInvoice?.id, payAmount],
    queryFn: async () => {
      if (!user || !payInvoice || !payAmount) return [];
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const { data, error } = await supabase
        .from("expenses")
        .select("id, expense_date, amount, receiver, receiver_account_name, description, receipt_url")
        .eq("user_id", user.id)
        .eq("transaction_direction", "EXPENSE")
        .gte("amount", payAmount - 0.01)
        .lte("amount", payAmount + 0.01)
        .gte("expense_date", from.toISOString().split("T")[0])
        .not("receipt_url", "is", null)
        .order("expense_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!payInvoice && payAmount > 0,
  });

  const handleConfirmPay = async () => {
    if (!user || !payInvoice) return;
    setPaying(true);
    try {
      const updates: Record<string, unknown> = {
        status: "paid",
        paid_at: new Date().toISOString(),
      };

      if (linkSlipExpenseId) {
        const { data: exp } = await supabase
          .from("expenses")
          .select("id, receipt_url, expense_date")
          .eq("id", linkSlipExpenseId)
          .single();
        if (exp) {
          updates.matched_expense_id = exp.id;
          if (exp.receipt_url) updates.payment_slip_url = exp.receipt_url;
          if (exp.expense_date) updates.paid_at = new Date(exp.expense_date).toISOString();
        }
      } else if (paySlip) {
        const ext = paySlip.name.split(".").pop() || "jpg";
        const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_vendor_${payInvoice.id}.${ext}`);
        const { error: upErr } = await supabase.storage
          .from("receipts")
          .upload(path, paySlip, { contentType: paySlip.type, upsert: false });
        if (upErr) throw upErr;
        updates.payment_slip_url = path;
      }

      const { error } = await supabase.from("vendor_invoices").update(updates).eq("id", payInvoice.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["vendor-invoices"] });
      toast({ title: "บันทึกการจ่ายแล้ว" });
      setPayInvoice(null);
      setPaySlip(null);
      setLinkSlipExpenseId("");
    } catch (e: any) {
      toast({ title: e.message || "บันทึกไม่สำเร็จ", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const copyQuickLinkUrl = () => {
    if (!user) {
      toast({ title: "กรุณาเข้าสู่ระบบใหม่", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/portal?view=quick-link&owner=${user.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "คัดลอกลิงก์เชื่อม LINE แล้ว",
      description: "ส่งให้คู่ค้าทาง LINE — เปิดผ่าน Rich Menu จะดีที่สุด",
    });
  };

  // Files may live in either `documents` or `receipts` bucket depending on
  // upload source (admin attach -> documents, LINE bot / portal -> receipts).
  // Try documents first, fall back to receipts.
  const viewFile = async (filePath: string) => {
    let bucket = "documents";
    let signed = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
    if (!signed.data?.signedUrl) {
      bucket = "receipts";
      signed = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
    }
    if (signed.data?.signedUrl) {
      setPreviewUrl(signed.data.signedUrl);
      setPreviewPath(filePath);
      setPreviewBucket(bucket);
      setPreviewOpen(true);
    } else {
      toast({ title: "เปิดไฟล์ไม่ได้", description: `ไม่พบไฟล์: ${filePath}`, variant: "destructive" });
    }
  };

  const downloadFile = async () => {
    if (!previewUrl || !previewPath) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = previewPath.split("/").pop() || "bill";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyShareLink = () => {
    if (!previewUrl) return;
    navigator.clipboard.writeText(previewUrl);
    toast({ title: "คัดลอกลิงก์แล้ว", description: "ลิงก์มีอายุ 1 ชม. — ส่งให้บัญชีได้ทันที" });
  };

  const copyFilePath = () => {
    if (!previewPath) return;
    navigator.clipboard.writeText(`${previewBucket}/${previewPath}`);
    toast({ title: "คัดลอก path แล้ว", description: `${previewBucket}/${previewPath}` });
  };

  const unlinkedCount = invoices.filter((i) => !i.vendor_id).length;

  const filteredVendors = vendors.filter((v) =>
    v.company_name.toLowerCase().includes(search.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.tax_id?.includes(search)
  );

  const filteredInvoices = invoices.filter((inv) =>
    statusFilter === "all" || inv.status === statusFilter
  );

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-green-600 to-emerald-700 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Building2 className="h-6 w-6" />
          <h1 className="text-lg font-bold">จัดการคู่ค้า & บิล</h1>
          <Badge variant="secondary" className="ml-auto">{vendors.length} คู่ค้า / {invoices.length} บิล</Badge>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {unlinkedCount > 0 && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-medium">มี {unlinkedCount} บิลยังไม่ได้เชื่อมกับคู่ค้า</span>
              </div>
              <Button size="sm" variant="outline" onClick={autoLinkInvoices}>
                <Link2 className="h-4 w-4 mr-1" /> เชื่อมอัตโนมัติ
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="summary">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">📊 สรุป</TabsTrigger>
            <TabsTrigger value="vendors">
              <Building2 className="h-4 w-4 mr-1" /> คู่ค้า
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-1" /> บิล
            </TabsTrigger>
            <TabsTrigger value="documents">
              <Receipt className="h-4 w-4 mr-1" /> เอกสาร
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-3">
            {vendorSummaries.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">ยังไม่มีคู่ค้า</CardContent></Card>
            ) : (
              vendorSummaries.map(({ vendor, invoiceCount, pendingCount, approvedCount, paidCount, totalOutstanding }) => (
                <Card key={vendor.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold">{vendor.company_name}</span>
                          <Badge variant={vendor.vendor_type === "company" ? "default" : "secondary"}>
                            {vendor.vendor_type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}
                          </Badge>
                          <Badge variant="outline">{invoiceCount} บิล</Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">รอตรวจสอบ</p>
                            <p className="font-semibold text-amber-600">{pendingCount}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">อนุมัติแล้ว</p>
                            <p className="font-semibold text-blue-600">{approvedCount}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">จ่ายแล้ว</p>
                            <p className="font-semibold text-green-600">{paidCount}</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground">ยอดค้างจ่าย</p>
                            <p className="font-bold text-destructive">{totalOutstanding.toLocaleString()} ฿</p>
                          </div>
                        </div>
                        {vendor.bank_name && vendor.bank_account && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <span>🏦 {vendor.bank_name}: {vendor.bank_account}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyAccount(vendor.bank_account!)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {unlinkedCount > 0 && (
              <Card className="border-dashed">
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold text-muted-foreground">บิลที่ยังไม่เชื่อมคู่ค้า ({unlinkedCount})</span>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">ยอดค้างจ่ายรวม</p>
                    <p className="font-bold text-destructive">
                      {invoices.filter((i) => !i.vendor_id && i.status !== "paid").reduce((s, i) => s + i.net_amount, 0).toLocaleString()} ฿
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="vendors" className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="ค้นหาชื่อ, เลขภาษี..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            {filteredVendors.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">ยังไม่มีคู่ค้าลงทะเบียน</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {filteredVendors.map((v) => (
                  <Card key={v.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">{v.company_name}</span>
                            <Badge variant={v.vendor_type === "company" ? "default" : "secondary"}>
                              {v.vendor_type === "company" ? "นิติบุคคล" : "บุคคลธรรมดา"}
                            </Badge>
                            {(v as any).line_user_id ? (
                              <Badge className="bg-green-600 hover:bg-green-600 text-white">LINE</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">ยังไม่ผูก LINE</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                            {v.tax_id && <p>เลขภาษี: {v.tax_id}</p>}
                            {v.contact_name && <p>ผู้ติดต่อ: {v.contact_name}</p>}
                            <div className="flex flex-wrap gap-x-4">
                              {v.phone && <span>📞 {v.phone}</span>}
                              {v.email && <span>✉️ {v.email}</span>}
                            </div>
                            {v.bank_name && v.bank_account && (
                              <div className="flex items-center gap-2">
                                <span>🏦 {v.bank_name}: {v.bank_account}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyAccount(v.bank_account!)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!(v as any).line_user_id && (
                            <Button variant="ghost" size="icon" onClick={copyQuickLinkUrl} title="คัดลอกลิงก์เชื่อม LINE">
                              <Link2 className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                          {v.tax_doc_url && (
                            <Button variant="ghost" size="icon" onClick={() => viewFile(v.tax_doc_url!)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>ลบคู่ค้า?</AlertDialogTitle>
                                <AlertDialogDescription>ลบ {v.company_name} ออกจากระบบ</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteVendorMutation.mutate(v.id)}>ลบ</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  <SelectItem value="pending">รอตรวจสอบ</SelectItem>
                  <SelectItem value="approved">อนุมัติแล้ว</SelectItem>
                  <SelectItem value="paid">จ่ายแล้ว</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredInvoices.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">ยังไม่มีบิลเข้า</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((inv) => {
                  const vendor = vendors.find((v) => v.id === inv.vendor_id);
                  const st = statusMap[inv.status] || statusMap.pending;
                  return (
                    <Card key={inv.id}>
                      <CardContent className="py-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold">{inv.description || "บิลจากคู่ค้า"}</span>
                              <Badge variant={st.variant}>{st.label}</Badge>
                              {!inv.vendor_id && <Badge variant="destructive" className="text-xs">ยังไม่เชื่อม</Badge>}
                              {(inv as any).submitted_via_line_user_id && (
                                <Badge variant="secondary" className="text-xs">📱 จาก LINE</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {(() => {
                                const dt = docTypeMap[(inv as any).document_type] || docTypeMap.invoice;
                                return <Badge variant={dt.variant} className="text-xs">{dt.label}</Badge>;
                              })()}
                              {inv.invoice_number && <p>เลขที่: {inv.invoice_number}</p>}
                              {vendor && <p>คู่ค้า: {vendor.company_name}</p>}
                              {(inv as any).submitted_via_line_display_name && (
                                <p>ส่งโดย: {(inv as any).submitted_via_line_display_name}</p>
                              )}
                              <p className="text-foreground font-semibold">ยอด: {inv.amount.toLocaleString()} บาท</p>
                              {inv.vat_amount > 0 && <p>VAT: {inv.vat_amount.toLocaleString()} บาท</p>}
                              {inv.wht_amount > 0 && <p>หัก ณ ที่จ่าย: {inv.wht_amount.toLocaleString()} บาท</p>}
                              <p className="text-xs">สร้างเมื่อ: {new Date(inv.created_at).toLocaleDateString("th-TH")}</p>
                            </div>
                            {!inv.vendor_id && vendors.length > 0 && (
                              <div className="mt-2">
                                <Select onValueChange={(vendorId) => linkMutation.mutate({ invoiceId: inv.id, vendorId })}>
                                  <SelectTrigger className="w-48 h-8 text-xs">
                                    <SelectValue placeholder="เลือกคู่ค้าเพื่อเชื่อม..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {vendors.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-row sm:flex-col gap-1 sm:items-end flex-wrap">
                            {inv.file_url && (
                              <Button variant="outline" size="sm" onClick={() => viewFile(inv.file_url!)}>
                                <Eye className="h-4 w-4 mr-1" /> ดูบิล
                              </Button>
                            )}
                            {inv.status === "pending" && (
                              <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "approved" })}>
                                <CheckCircle className="h-4 w-4 mr-1" /> อนุมัติ
                              </Button>
                            )}
                            {inv.status === "approved" && (
                              <Button size="sm" onClick={() => openPayDialog(inv)}>
                                <Wallet className="h-4 w-4 mr-1" /> จ่ายเงิน
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>ลบบิล?</AlertDialogTitle>
                                  <AlertDialogDescription>ลบบิลนี้ออกจากระบบ</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteInvoiceMutation.mutate(inv.id)}>ลบ</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <div className="flex gap-2">
              <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกประเภท</SelectItem>
                  <SelectItem value="receipt">ใบเสร็จรับเงิน</SelectItem>
                  <SelectItem value="tax_invoice">ใบกำกับภาษี</SelectItem>
                  <SelectItem value="invoice">ใบแจ้งหนี้</SelectItem>
                  <SelectItem value="substitute_receipt">ใบรับรองแทนใบเสร็จ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["receipt", "tax_invoice", "invoice", "substitute_receipt"] as const).map((type) => {
                const dt = docTypeMap[type];
                const count = invoices.filter((i) => (i as any).document_type === type).length;
                return (
                  <Card key={type} className="cursor-pointer hover:ring-2 ring-primary/30 transition-all" onClick={() => setDocTypeFilter(type)}>
                    <CardContent className="py-3 text-center">
                      <p className="text-xs text-muted-foreground">{dt.label}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Linked vs unlinked */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">ผูกกับสลิปแล้ว</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">
                    {invoices.filter((i) => i.matched_expense_id).length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">ยังไม่ผูกสลิป</p>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                    {invoices.filter((i) => !i.matched_expense_id).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Document list */}
            {(() => {
              const docs = invoices.filter((i) => docTypeFilter === "all" || (i as any).document_type === docTypeFilter);
              if (docs.length === 0) {
                return <Card><CardContent className="py-8 text-center text-muted-foreground">ยังไม่มีเอกสารประเภทนี้</CardContent></Card>;
              }
              return (
                <div className="space-y-3">
                  {docs.map((inv) => {
                    const vendor = vendors.find((v) => v.id === inv.vendor_id);
                    const dt = docTypeMap[(inv as any).document_type] || docTypeMap.invoice;
                    const st = statusMap[inv.status] || statusMap.pending;
                    return (
                      <Card key={inv.id}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={dt.variant}>{dt.label}</Badge>
                                <Badge variant={st.variant}>{st.label}</Badge>
                                {(inv as any).is_formal === false && (
                                  <Badge variant="outline" className="text-xs">ไม่เป็นทางการ</Badge>
                                )}
                                {inv.matched_expense_id && (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                    <FileCheck className="h-3 w-3 mr-1" /> ผูกสลิปแล้ว
                                  </Badge>
                                )}
                              </div>
                              <p className="font-bold mt-1">{inv.description || "เอกสาร"}</p>
                              <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                {inv.invoice_number && <p>เลขที่: {inv.invoice_number}</p>}
                                {vendor && <p>คู่ค้า: {vendor.company_name}</p>}
                                {(inv as any).tax_id && <p>เลขผู้เสียภาษี: {(inv as any).tax_id}</p>}
                                <p className="text-foreground font-semibold">ยอด: {inv.amount.toLocaleString()} บาท</p>
                                {inv.vat_amount > 0 && <span className="mr-3">VAT: {inv.vat_amount.toLocaleString()}</span>}
                                {inv.wht_amount > 0 && <span>WHT: {inv.wht_amount.toLocaleString()}</span>}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              {inv.file_url && (
                                <Button variant="outline" size="sm" onClick={() => viewFile(inv.file_url!)}>
                                  <Eye className="h-4 w-4 mr-1" /> ดู
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader><DialogTitle>ตัวอย่างเอกสาร</DialogTitle></DialogHeader>
          {previewPath && (
            <div className="text-xs bg-muted rounded p-2 font-mono break-all flex items-center gap-2">
              <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1">{previewBucket}/{previewPath}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={copyFilePath}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          {previewUrl && (
            (previewPath || previewUrl).toLowerCase().includes(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[60vh]" />
            ) : (
              <img src={previewUrl} alt="Document" className="w-full object-contain max-h-[60vh]" />
            )
          )}
          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button size="sm" variant="outline" onClick={copyShareLink}>
              <Link2 className="h-4 w-4 mr-1" />คัดลอกลิงก์ (1 ชม.)
            </Button>
            <Button size="sm" onClick={downloadFile}>
              <Download className="h-4 w-4 mr-1" />ดาวน์โหลด
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay vendor invoice dialog */}
      <Dialog open={!!payInvoice} onOpenChange={(o) => { if (!o) { setPayInvoice(null); setPaySlip(null); setLinkSlipExpenseId(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> จ่ายบิลคู่ค้า</DialogTitle>
          </DialogHeader>
          {payInvoice && (() => {
            const vendor = vendors.find((v) => v.id === payInvoice.vendor_id);
            const netAmt = Number(payInvoice.net_amount || payInvoice.amount) || 0;
            return (
              <div className="space-y-3">
                <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">คู่ค้า</span>
                    <span className="font-semibold text-right">{vendor?.company_name || "—"}</span>
                  </div>
                  {payInvoice.invoice_number && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">เลขที่บิล</span>
                      <span className="font-mono">{payInvoice.invoice_number}</span>
                    </div>
                  )}
                  {payInvoice.description && (
                    <p className="text-xs text-muted-foreground break-words">{payInvoice.description}</p>
                  )}
                </div>

                {vendor?.bank_account ? (
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
                    <div className="text-xs font-semibold text-primary uppercase">ข้อมูลโอนเงิน</div>
                    <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center text-sm">
                      <span className="text-muted-foreground">ธนาคาร</span>
                      <span className="font-medium">{vendor.bank_name || "-"}</span>
                      <span></span>

                      <span className="text-muted-foreground">ชื่อบัญชี</span>
                      <span className="font-medium truncate">{vendor.company_name}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(vendor.company_name, "name")}>
                        {copiedField === "name" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>

                      <span className="text-muted-foreground">เลขบัญชี</span>
                      <span className="font-mono font-bold text-base break-all">{vendor.bank_account}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(String(vendor.bank_account || "").replace(/\D/g, ""), "acc")}>
                        {copiedField === "acc" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>

                      <span className="text-muted-foreground">ยอดโอน</span>
                      <span className="font-bold text-primary">{netAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(netAmt.toFixed(2), "amt")}>
                        {copiedField === "amt" ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-700">คู่ค้ายังไม่ได้กรอกเลขบัญชี</p>
                      <p className="text-xs text-muted-foreground">เพิ่มเลขบัญชีในแท็บคู่ค้า</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>หลักฐานการโอน</Label>

                  {slipCandidates.length > 0 && (
                    <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2 space-y-2">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> พบสลิปที่ยอดตรงในระบบ ({slipCandidates.length})
                      </p>
                      <Select value={linkSlipExpenseId} onValueChange={(v) => { setLinkSlipExpenseId(v); setPaySlip(null); }}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="เลือกสลิปที่ส่งจาก LINE / ระบบ" /></SelectTrigger>
                        <SelectContent>
                          {slipCandidates.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.expense_date} · {Number(c.amount).toLocaleString()}฿ · {(c.receiver || c.receiver_account_name || c.description || "—").toString().slice(0, 40)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linkSlipExpenseId && (
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <span>จะผูกกับ expense นี้เป็นหลักฐาน</span>
                          <Button size="sm" variant="ghost" className="h-6 ml-auto" onClick={() => setLinkSlipExpenseId("")}>ยกเลิก</Button>
                        </div>
                      )}
                    </div>
                  )}

                  {!linkSlipExpenseId && (
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {paySlip ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ImageIcon className="h-4 w-4 shrink-0" />
                            <span className="text-sm truncate">{paySlip.name}</span>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => setPaySlip(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                          <p className="text-xs text-muted-foreground mb-2">แนบสลิปการโอน (ไม่บังคับ)</p>
                          <Button variant="outline" size="sm" onClick={() => slipInputRef.current?.click()}>เลือกไฟล์</Button>
                          <input
                            ref={slipInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => setPaySlip(e.target.files?.[0] || null)}
                          />
                          <p className="text-[10px] text-muted-foreground mt-2">หรือส่งสลิปทาง LINE แล้วกลับมาเลือกในรายการด้านบน</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayInvoice(null); setPaySlip(null); setLinkSlipExpenseId(""); }}>ยกเลิก</Button>
            <Button onClick={handleConfirmPay} disabled={paying}>
              {paying ? "กำลังบันทึก..." : "ยืนยันจ่ายแล้ว"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorManagement;
