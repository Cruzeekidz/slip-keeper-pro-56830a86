import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, FileText, Eye, Copy, CheckCircle, Search, Trash2, Link2, AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface VendorProfile {
  id: string;
  vendor_type: string;
  company_name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account: string | null;
  tax_doc_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface VendorInvoice {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  vat_amount: number;
  wht_amount: number;
  net_amount: number;
  description: string | null;
  file_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "รอตรวจสอบ", variant: "secondary" },
  approved: { label: "อนุมัติแล้ว", variant: "default" },
  paid: { label: "จ่ายแล้ว", variant: "outline" },
};

const VendorManagement = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    fetchData();
  }, [user, authLoading]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const [vendorRes, invoiceRes] = await Promise.all([
      supabase.from("vendor_profiles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("vendor_invoices").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);
    if (vendorRes.data) setVendors(vendorRes.data);
    if (invoiceRes.data) setInvoices(invoiceRes.data);
    setLoading(false);
  };

  // Auto-link unlinked invoices to vendors by matching company name in description
  const autoLinkInvoices = useCallback(async () => {
    if (!user || vendors.length === 0) return;
    const unlinked = invoices.filter((inv) => !inv.vendor_id && inv.description);
    if (unlinked.length === 0) {
      toast({ title: "ไม่มีบิลที่ต้องเชื่อม", description: "บิลทั้งหมดเชื่อมกับคู่ค้าแล้ว" });
      return;
    }

    let linked = 0;
    for (const inv of unlinked) {
      const desc = (inv.description || "").toLowerCase();
      const match = vendors.find((v) =>
        desc.includes(v.company_name.toLowerCase()) ||
        (v.tax_id && desc.includes(v.tax_id))
      );
      if (match) {
        const { error } = await supabase
          .from("vendor_invoices")
          .update({ vendor_id: match.id })
          .eq("id", inv.id);
        if (!error) linked++;
      }
    }

    toast({
      title: `เชื่อมบิลอัตโนมัติสำเร็จ`,
      description: `เชื่อมได้ ${linked} จาก ${unlinked.length} รายการ`,
    });
    if (linked > 0) fetchData();
  }, [invoices, vendors, user]);

  const copyAccount = (account: string) => {
    const clean = account.replace(/[-\s]/g, "");
    navigator.clipboard.writeText(clean);
    toast({ title: "คัดลอกเลขบัญชีแล้ว", description: clean });
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "paid") updates.paid_at = new Date().toISOString();
    const { error } = await supabase.from("vendor_invoices").update(updates).eq("id", id);
    if (error) {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } else {
      toast({ title: `อัปเดตสถานะเป็น "${statusMap[status]?.label}" แล้ว` });
      fetchData();
    }
  };

  const deleteVendor = async (id: string) => {
    const { error } = await supabase.from("vendor_profiles").delete().eq("id", id);
    if (!error) { toast({ title: "ลบคู่ค้าแล้ว" }); fetchData(); }
  };

  const deleteInvoice = async (id: string) => {
    const { error } = await supabase.from("vendor_invoices").delete().eq("id", id);
    if (!error) { toast({ title: "ลบบิลแล้ว" }); fetchData(); }
  };

  const viewFile = async (filePath: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) {
      setPreviewUrl(data.signedUrl);
      setPreviewOpen(true);
    }
  };

  // Compute vendor summaries
  const vendorSummaries = vendors.map((v) => {
    const vInvoices = invoices.filter((inv) => inv.vendor_id === v.id);
    const pending = vInvoices.filter((i) => i.status === "pending");
    const approved = vInvoices.filter((i) => i.status === "approved");
    const paid = vInvoices.filter((i) => i.status === "paid");
    const totalOutstanding = [...pending, ...approved].reduce((s, i) => s + i.net_amount, 0);
    const totalPaid = paid.reduce((s, i) => s + i.net_amount, 0);
    return { vendor: v, invoiceCount: vInvoices.length, pendingCount: pending.length, approvedCount: approved.length, paidCount: paid.length, totalOutstanding, totalPaid };
  });

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
        {/* Unlinked invoices alert */}
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">📊 สรุปรายคู่ค้า</TabsTrigger>
            <TabsTrigger value="vendors">
              <Building2 className="h-4 w-4 mr-1" /> คู่ค้า ({vendors.length})
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-1" /> บิล ({invoices.length})
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-3">
            {vendorSummaries.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">ยังไม่มีคู่ค้า</CardContent></Card>
            ) : (
              vendorSummaries.map(({ vendor, invoiceCount, pendingCount, approvedCount, paidCount, totalOutstanding, totalPaid }) => (
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

            {/* Unlinked invoices summary */}
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

          {/* Vendors Tab */}
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
                                <AlertDialogAction onClick={() => deleteVendor(v.id)}>ลบ</AlertDialogAction>
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

          {/* Invoices Tab */}
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
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {inv.invoice_number && <p>เลขที่: {inv.invoice_number}</p>}
                              {vendor && <p>คู่ค้า: {vendor.company_name}</p>}
                              <p className="text-foreground font-semibold">ยอด: {inv.amount.toLocaleString()} บาท</p>
                              {inv.vat_amount > 0 && <p>VAT: {inv.vat_amount.toLocaleString()} บาท</p>}
                              {inv.wht_amount > 0 && <p>หัก ณ ที่จ่าย: {inv.wht_amount.toLocaleString()} บาท</p>}
                              <p className="text-xs">สร้างเมื่อ: {new Date(inv.created_at).toLocaleDateString("th-TH")}</p>
                            </div>

                            {/* Manual link dropdown for unlinked invoices */}
                            {!inv.vendor_id && vendors.length > 0 && (
                              <div className="mt-2">
                                <Select onValueChange={async (vendorId) => {
                                  const { error } = await supabase.from("vendor_invoices").update({ vendor_id: vendorId }).eq("id", inv.id);
                                  if (!error) { toast({ title: "เชื่อมคู่ค้าสำเร็จ" }); fetchData(); }
                                }}>
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
                              <Button size="sm" onClick={() => updateInvoiceStatus(inv.id, "approved")}>
                                <CheckCircle className="h-4 w-4 mr-1" /> อนุมัติ
                              </Button>
                            )}
                            {inv.status === "approved" && (
                              <Button size="sm" variant="outline" onClick={() => updateInvoiceStatus(inv.id, "paid")}>
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
                                  <AlertDialogAction onClick={() => deleteInvoice(inv.id)}>ลบ</AlertDialogAction>
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
