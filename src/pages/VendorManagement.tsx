import { useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, FileText, Eye, Copy, CheckCircle, Search, Trash2, Link2, AlertCircle, Receipt, FileCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

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

  const viewFile = async (filePath: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewOpen(true);
    }
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
                        <div className="flex items-start justify-between gap-3">
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
                          <div className="flex flex-col gap-1 items-end">
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
                              <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: inv.id, status: "paid" })}>
                                <CheckCircle className="h-4 w-4 mr-1" /> จ่ายแล้ว
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
          {previewUrl && (
            previewUrl.includes(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[70vh]" />
            ) : (
              <img src={previewUrl} alt="Document" className="w-full object-contain max-h-[70vh]" />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorManagement;
