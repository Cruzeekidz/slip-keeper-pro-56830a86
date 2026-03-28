import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, FileText, Download, Printer, Plus, Pencil, Trash2, Copy, Search, Link2, Check, ExternalLink, AlertCircle, Clock, Send } from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface WhtEntry {
  id: string;
  payee_name: string;
  tax_id: string;
  address: string;
  income_type: string;
  gross_amount: number;
  wht_rate: number;
  wht_amount: number;
  paid_date: string;
  source: "staff" | "vendor";
  pnd_type: "3" | "53";
}

interface WhtCert {
  id: string;
  doc_number: string | null;
  issue_date: string;
  payee_name: string;
  total_gross: number;
  total_tax: number;
  status: string;
  pnd_type: string;
  created_at: string;
  flowaccount_url: string | null;
  sent_to_payee: boolean;
  sent_at: string | null;
  payee_source: string | null;
  payee_source_id: string | null;
}

interface WhtExpense {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  staff_name: string | null;
  event_name: string | null;
  project_tag: string | null;
  receiver: string | null;
}

interface MonthGroup {
  key: string;
  label: string;
  items: WhtExpense[];
  total: number;
}

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// ─── Main Component ───────────────────────────────────────

const WhtReport = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear() + 543));

  const years = useMemo(() => {
    const cy = now.getFullYear() + 543;
    return Array.from({ length: 5 }, (_, i) => String(cy - i));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading]);

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-r from-rose-600 to-pink-700 text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <FileText className="h-6 w-6" />
          <h1 className="text-lg font-bold">รายงานภาษีหัก ณ ที่จ่าย</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* Month/Year selector */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">เลือกเดือน/ปี:</span>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS_TH.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => navigate("/wht-certificate")} size="sm" className="ml-auto">
                <Plus className="h-4 w-4 mr-1" /> บันทึกรายการ WHT
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 3-Tab layout */}
        <Tabs defaultValue="report">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="report">📊 รายงาน ภ.ง.ด.</TabsTrigger>
            <TabsTrigger value="certificates">📋 ติดตาม FA</TabsTrigger>
            <TabsTrigger value="remittance">💰 สรุปรอนำส่ง</TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <ReportTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
          </TabsContent>
          <TabsContent value="certificates">
            <CertificatesTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
          </TabsContent>
          <TabsContent value="remittance">
            <RemittanceTab selectedYear={selectedYear} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ─── Tab 1: รายงาน ภ.ง.ด. ──────────────────────────────

function ReportTab({ selectedMonth, selectedYear }: { selectedMonth: string; selectedYear: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WhtEntry[]>([]);

  useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const gregorianYear = Number(selectedYear) - 543;
    const month = Number(selectedMonth);
    const startDate = `${gregorianYear}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12 ? `${gregorianYear + 1}-01-01` : `${gregorianYear}-${String(month + 1).padStart(2, "0")}-01`;

    const [staffRes, vendorRes, staffProfilesRes, vendorProfilesRes] = await Promise.all([
      supabase.from("staff_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("vendor_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("staff_profiles").select("*").eq("user_id", user.id),
      supabase.from("vendor_profiles").select("*").eq("user_id", user.id),
    ]);

    const staffMap = new Map((staffProfilesRes.data || []).map(s => [s.id, s]));
    const vendorMap = new Map((vendorProfilesRes.data || []).map(v => [v.id, v]));
    const result: WhtEntry[] = [];

    for (const inv of staffRes.data || []) {
      if (inv.wht_amount <= 0) continue;
      const staff = staffMap.get(inv.staff_id);
      result.push({
        id: inv.id, payee_name: staff?.staff_name || "ไม่ระบุ", tax_id: staff?.tax_id || "-",
        address: staff?.address || "-", income_type: "ค่าจ้างทำของ (40(2)/ม.40(8))",
        gross_amount: inv.gross_amount + inv.bonus_amount, wht_rate: inv.wht_rate, wht_amount: inv.wht_amount,
        paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "staff", pnd_type: "3",
      });
    }
    for (const inv of vendorRes.data || []) {
      if (inv.wht_amount <= 0) continue;
      const vendor = inv.vendor_id ? vendorMap.get(inv.vendor_id) : null;
      const isCompany = vendor?.vendor_type === "company";
      result.push({
        id: inv.id, payee_name: vendor?.company_name || inv.description || "ไม่ระบุ", tax_id: vendor?.tax_id || "-",
        address: vendor?.address || "-", income_type: isCompany ? "ค่าบริการ (ม.40(8))" : "ค่าจ้างทำของ (40(2)/ม.40(8))",
        gross_amount: inv.amount, wht_rate: inv.amount > 0 ? (inv.wht_amount / inv.amount) * 100 : 3,
        wht_amount: inv.wht_amount, paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "vendor", pnd_type: isCompany ? "53" : "3",
      });
    }
    setEntries(result);
    setLoading(false);
  };

  const pnd3 = entries.filter(e => e.pnd_type === "3");
  const pnd53 = entries.filter(e => e.pnd_type === "53");

  const exportCSV = (pndEntries: WhtEntry[], pndType: string) => {
    const headers = ["ลำดับ","ชื่อผู้ถูกหัก","เลขประจำตัวผู้เสียภาษี","ที่อยู่","ประเภทเงินได้","จำนวนเงินที่จ่าย","อัตราหัก(%)","ภาษีที่หัก","วันที่จ่าย"];
    const rows = pndEntries.map((e, i) => [i + 1, e.payee_name, e.tax_id, e.address, e.income_type, e.gross_amount, e.wht_rate, e.wht_amount, e.paid_date]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ภงด${pndType}_${MONTHS_TH[Number(selectedMonth) - 1]}_${selectedYear}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: `ส่งออก ภ.ง.ด.${pndType} สำเร็จ` });
  };

  const openCertForm = (entry: WhtEntry) => {
    const params = new URLSearchParams({
      payee_name: entry.payee_name, payee_tax_id: entry.tax_id, payee_address: entry.address,
      payee_type: entry.pnd_type === "53" ? "company" : "individual", pnd_type: entry.pnd_type,
      gross_amount: String(entry.gross_amount), wht_amount: String(entry.wht_amount),
      wht_rate: String(entry.wht_rate), paid_date: entry.paid_date,
      source_id: entry.id, source_type: entry.source,
    });
    navigate(`/wht-certificate?${params.toString()}`);
  };

  const renderTable = (pndEntries: WhtEntry[], pndType: string) => {
    const totalGross = pndEntries.reduce((s, e) => s + e.gross_amount, 0);
    const totalWht = pndEntries.reduce((s, e) => s + e.wht_amount, 0);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg">ภ.ง.ด.{pndType}</h3>
            <Badge variant="secondary">{pndEntries.length} รายการ</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportCSV(pndEntries, pndType)} disabled={pndEntries.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
        {pndEntries.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">ไม่มีรายการในเดือนนี้</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-12">ลำดับ</TableHead><TableHead>ชื่อผู้ถูกหัก</TableHead>
                <TableHead>เลขประจำตัว</TableHead><TableHead className="text-right">จำนวนเงิน</TableHead>
                <TableHead className="text-right">อัตรา(%)</TableHead><TableHead className="text-right">ภาษีหัก</TableHead>
                <TableHead>วันที่จ่าย</TableHead><TableHead className="w-10"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pndEntries.map((e, i) => (
                  <TableRow key={e.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{e.payee_name}</TableCell>
                    <TableCell className="font-mono text-xs">{e.tax_id}</TableCell>
                    <TableCell className="text-right">{e.gross_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{e.wht_rate}%</TableCell>
                    <TableCell className="text-right font-semibold">{e.wht_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{e.paid_date}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" title="สร้างหนังสือรับรอง" onClick={() => openCertForm(e)}><Printer className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="text-right">รวมทั้งสิ้น</TableCell>
                  <TableCell className="text-right">{totalGross.toLocaleString()}</TableCell>
                  <TableCell />
                  <TableCell className="text-right text-destructive">{totalWht.toLocaleString()}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">กำลังโหลด...</p>;

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">ภงด.3</p><p className="text-2xl font-bold">{pnd3.length}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">ภงด.3 ภาษีหัก</p><p className="text-2xl font-bold text-destructive">{pnd3.reduce((s, e) => s + e.wht_amount, 0).toLocaleString()} ฿</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">ภงด.53</p><p className="text-2xl font-bold">{pnd53.length}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">ภงด.53 ภาษีหัก</p><p className="text-2xl font-bold text-destructive">{pnd53.reduce((s, e) => s + e.wht_amount, 0).toLocaleString()} ฿</p></CardContent></Card>
      </div>
      <Tabs defaultValue="pnd3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pnd3">ภ.ง.ด.3 ({pnd3.length})</TabsTrigger>
          <TabsTrigger value="pnd53">ภ.ง.ด.53 ({pnd53.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pnd3">{renderTable(pnd3, "3")}</TabsContent>
        <TabsContent value="pnd53">{renderTable(pnd53, "53")}</TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 2: ติดตาม FA (FlowAccount) ─────────────────────

function CertificatesTab({ selectedMonth, selectedYear }: { selectedMonth: string; selectedYear: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [certs, setCerts] = useState<WhtCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "no_link" | "not_sent" | "sent">("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [urlDialogCert, setUrlDialogCert] = useState<WhtCert | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [sendingLine, setSendingLine] = useState<string | null>(null);

  useEffect(() => { fetchCerts(); }, [selectedMonth, selectedYear]);

  const fetchCerts = async () => {
    if (!user) return;
    setLoading(true);
    const gregorianYear = Number(selectedYear) - 543;
    const month = Number(selectedMonth);
    const startDate = `${gregorianYear}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12 ? `${gregorianYear + 1}-01-01` : `${gregorianYear}-${String(month + 1).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("wht_certificates")
      .select("id, doc_number, issue_date, payee_name, total_gross, total_tax, status, pnd_type, created_at, flowaccount_url, sent_to_payee, sent_at, payee_source, payee_source_id")
      .eq("user_id", user.id)
      .gte("issue_date", startDate).lt("issue_date", endDate)
      .order("issue_date", { ascending: false });
    setCerts((data as WhtCert[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = certs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.payee_name.toLowerCase().includes(q) || (c.doc_number?.toLowerCase().includes(q)));
    }
    if (statusFilter === "no_link") result = result.filter(c => !c.flowaccount_url);
    else if (statusFilter === "not_sent") result = result.filter(c => c.flowaccount_url && !c.sent_to_payee);
    else if (statusFilter === "sent") result = result.filter(c => c.sent_to_payee);
    return result;
  }, [certs, search, statusFilter]);

  const noLinkCount = certs.filter(c => !c.flowaccount_url).length;
  const notSentCount = certs.filter(c => c.flowaccount_url && !c.sent_to_payee).length;
  const sentCount = certs.filter(c => c.sent_to_payee).length;

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("wht_certificate_items").delete().eq("certificate_id", deleteId);
    await supabase.from("wht_certificates").delete().eq("id", deleteId);
    toast({ title: "ลบรายการสำเร็จ" });
    setDeleteId(null);
    fetchCerts();
  };

  const saveFlowAccountUrl = async () => {
    if (!urlDialogCert || !urlInput.trim()) return;
    const { error } = await supabase.from("wht_certificates").update({ flowaccount_url: urlInput.trim() } as any).eq("id", urlDialogCert.id);
    if (!error) { toast({ title: "บันทึกลิงก์สำเร็จ" }); setUrlDialogCert(null); setUrlInput(""); fetchCerts(); }
  };

  const markAsSent = async (certId: string) => {
    const { error } = await supabase.from("wht_certificates").update({ sent_to_payee: true, sent_at: new Date().toISOString() } as any).eq("id", certId);
    if (!error) { toast({ title: "อัปเดตสถานะสำเร็จ" }); fetchCerts(); }
  };

  const sendViaLine = async (cert: WhtCert) => {
    if (!cert.flowaccount_url) { toast({ title: "กรุณาใส่ลิงก์ FlowAccount ก่อน", variant: "destructive" }); return; }
    setSendingLine(cert.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-wht-link", {
        body: { cert_id: cert.id },
      });
      if (error) throw error;
      if (data?.sent) {
        toast({ title: "ส่งลิงก์ผ่าน LINE สำเร็จ", description: `ส่งให้ ${cert.payee_name}` });
        fetchCerts();
      } else {
        toast({ title: "ไม่สามารถส่งได้", description: data?.reason || "ไม่พบ LINE ID ของผู้รับ", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSendingLine(null);
    }
  };

  const getTrackingStatus = (cert: WhtCert) => {
    if (cert.sent_to_payee) return { label: "ส่งแล้ว", variant: "default" as const, icon: Check };
    if (cert.flowaccount_url) return { label: "รอส่ง", variant: "secondary" as const, icon: Link2 };
    return { label: "ยังไม่เปิด", variant: "outline" as const, icon: AlertCircle };
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className={`cursor-pointer transition-colors ${statusFilter === "no_link" ? "border-destructive" : ""}`} onClick={() => setStatusFilter(s => s === "no_link" ? "all" : "no_link")}>
          <CardContent className="p-3 text-center"><p className="text-2xl font-bold text-destructive">{noLinkCount}</p><p className="text-xs text-muted-foreground">ยังไม่เปิด FA</p></CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors ${statusFilter === "not_sent" ? "border-amber-500" : ""}`} onClick={() => setStatusFilter(s => s === "not_sent" ? "all" : "not_sent")}>
          <CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-500">{notSentCount}</p><p className="text-xs text-muted-foreground">รอส่งคู่ค้า</p></CardContent>
        </Card>
        <Card className={`cursor-pointer transition-colors ${statusFilter === "sent" ? "border-primary" : ""}`} onClick={() => setStatusFilter(s => s === "sent" ? "all" : "sent")}>
          <CardContent className="p-3 text-center"><p className="text-2xl font-bold text-primary">{sentCount}</p><p className="text-xs text-muted-foreground">ส่งแล้ว</p></CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อผู้รับ / เลขที่..." className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">วันที่</TableHead>
                <TableHead className="text-xs">ผู้รับ</TableHead>
                <TableHead className="text-xs text-right">ยอดจ่าย</TableHead>
                <TableHead className="text-xs text-right">ภาษีหัก</TableHead>
                <TableHead className="text-xs text-center">สถานะ</TableHead>
                <TableHead className="text-xs text-center">จัดการ</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">กำลังโหลด...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">ไม่มีรายการในเดือนนี้</TableCell></TableRow>
                ) : filtered.map(cert => {
                  const ts = getTrackingStatus(cert);
                  return (
                    <TableRow key={cert.id}>
                      <TableCell className="text-sm">{new Date(cert.issue_date).toLocaleDateString("th-TH")}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">{cert.payee_name}</TableCell>
                      <TableCell className="text-sm text-right">{cert.total_gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm text-right text-destructive">{cert.total_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={ts.variant} className="text-xs"><ts.icon className="h-3 w-3 mr-1" />{ts.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="วางลิงก์ FlowAccount" onClick={() => { setUrlDialogCert(cert); setUrlInput(cert.flowaccount_url || ""); }}>
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                          {cert.flowaccount_url && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="คัดลอกลิงก์" onClick={() => { navigator.clipboard.writeText(cert.flowaccount_url!); toast({ title: "คัดลอกลิงก์สำเร็จ" }); }}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="ส่งผ่าน LINE" onClick={() => sendViaLine(cert)} disabled={sendingLine === cert.id}>
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                              {!cert.sent_to_payee && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="ทำเครื่องหมายส่งแล้ว" onClick={() => markAsSent(cert.id)}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/wht-certificate?edit=${cert.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(cert.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* FlowAccount URL Dialog */}
      <Dialog open={!!urlDialogCert} onOpenChange={() => setUrlDialogCert(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ลิงก์ FlowAccount</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">วางลิงก์ใบหัก ณ ที่จ่ายจาก FlowAccount สำหรับ <strong>{urlDialogCert?.payee_name}</strong></p>
          <Input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://flowaccount.com/..." />
          {urlDialogCert?.flowaccount_url && (
            <a href={urlDialogCert.flowaccount_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> เปิดลิงก์ปัจจุบัน
            </a>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUrlDialogCert(null)}>ยกเลิก</Button>
            <Button onClick={saveFlowAccountUrl} disabled={!urlInput.trim()}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle><AlertDialogDescription>ต้องการลบรายการนี้หรือไม่?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">ลบ</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab 3: สรุปรอนำส่ง ──────────────────────────────────

function RemittanceTab({ selectedYear }: { selectedYear: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<WhtExpense[]>([]);

  useEffect(() => { fetchData(); }, [selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const gregorianYear = Number(selectedYear) - 543;
    const { data, error } = await supabase
      .from("expenses")
      .select("id, amount, expense_date, description, staff_name, event_name, project_tag, receiver")
      .eq("user_id", user.id).eq("category", "ภาษีหัก ณ ที่จ่าย")
      .gte("expense_date", `${gregorianYear}-01-01`).lt("expense_date", `${gregorianYear + 1}-01-01`)
      .order("expense_date", { ascending: true });
    if (error) toast({ title: "โหลดข้อมูลไม่สำเร็จ", variant: "destructive" });
    setExpenses(data || []);
    setLoading(false);
  };

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const map = new Map<string, WhtExpense[]>();
    for (const e of expenses) {
      const key = e.expense_date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const groups: MonthGroup[] = [];
    for (const [key, items] of map) {
      const [y, m] = key.split("-").map(Number);
      groups.push({ key, label: `${MONTHS_TH[m - 1]} ${y + 543}`, items, total: items.reduce((s, e) => s + e.amount, 0) });
    }
    return groups.sort((a, b) => a.key.localeCompare(b.key));
  }, [expenses]);

  const grandTotal = monthGroups.reduce((s, g) => s + g.total, 0);

  const exportCSV = () => {
    const headers = ["เดือน", "วันที่", "รายละเอียด", "ทีมงาน", "อีเวนท์", "โปรเจค", "จำนวนเงิน"];
    const rows = expenses.map(e => {
      const [y, m] = e.expense_date.split("-").map(Number);
      return [`${MONTHS_TH[m - 1]} ${y + 543}`, new Date(e.expense_date).toLocaleDateString("th-TH"), e.description || "-", e.staff_name || "-", e.event_name || "-", e.project_tag || "-", e.amount];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ภาษีหัก_ณ_ที่จ่ายรอนำส่ง_${selectedYear}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "ส่งออก CSV สำเร็จ" });
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">กำลังโหลด...</p>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={expenses.length === 0}>
          <Download className="h-4 w-4 mr-1" /> ส่งออก CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">รายการทั้งหมด</p><p className="text-2xl font-bold">{expenses.length}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">ยอดรวมรอนำส่ง</p><p className="text-2xl font-bold text-destructive">{grandTotal.toLocaleString()} ฿</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">จำนวนเดือน</p><p className="text-2xl font-bold">{monthGroups.length}</p></CardContent></Card>
      </div>

      {monthGroups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground"><Clock className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>ไม่มีรายการภาษีหัก ณ ที่จ่ายในปี {selectedYear}</p></CardContent></Card>
      ) : monthGroups.map(group => (
        <Card key={group.key}>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base">{group.label}</h3>
                <Badge variant="secondary">{group.items.length} รายการ</Badge>
              </div>
              <p className="font-bold text-destructive">{group.total.toLocaleString()} ฿</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">#</TableHead><TableHead>วันที่</TableHead>
                  <TableHead>ทีมงาน</TableHead><TableHead>อีเวนท์</TableHead>
                  <TableHead>รายละเอียด</TableHead><TableHead className="text-right">จำนวนเงิน</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {group.items.map((e, i) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm">{new Date(e.expense_date).toLocaleDateString("th-TH")}</TableCell>
                      <TableCell className="font-medium">{e.staff_name || "-"}</TableCell>
                      <TableCell className="text-sm">{e.event_name || e.project_tag || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.description || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{e.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={5} className="text-right">รวม {group.label}</TableCell>
                    <TableCell className="text-right text-destructive">{group.total.toLocaleString()} ฿</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default WhtReport;
