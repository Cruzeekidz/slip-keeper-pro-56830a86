import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, FileText, Download, Link2, Check, ExternalLink, Send, Copy, Clock, CheckCircle, FileCheck } from "lucide-react";

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
  flowaccount_url?: string | null;
}

interface RemittanceBatch {
  id: string;
  batch_month: string;
  pnd_type: string;
  total_tax: number;
  status: string;
  filed_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  items?: RemittanceItem[];
}

interface RemittanceItem {
  id: string;
  batch_id: string;
  source_type: string;
  source_id: string;
  payee_name: string;
  gross_amount: number;
  wht_amount: number;
  flowaccount_url: string | null;
}

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// ─── Main Component ───────────────────────────────────────

const WhtReport = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

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
            </div>
          </CardContent>
        </Card>

        {/* 2-Tab layout */}
        <Tabs defaultValue="report">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="report">📊 รายงาน ภ.ง.ด.</TabsTrigger>
            <TabsTrigger value="remittance">💰 นำส่งสรรพากร</TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <ReportTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
          </TabsContent>
          <TabsContent value="remittance">
            <RemittanceTab selectedMonth={selectedMonth} selectedYear={selectedYear} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ─── Tab 1: รายงาน ภ.ง.ด. (with inline FA link) ─────────

function ReportTab({ selectedMonth, selectedYear }: { selectedMonth: string; selectedYear: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WhtEntry[]>([]);
  const [urlDialogEntry, setUrlDialogEntry] = useState<WhtEntry | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [sendingLine, setSendingLine] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const gregorianYear = Number(selectedYear) - 543;
    const month = Number(selectedMonth);
    const startDate = `${gregorianYear}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12 ? `${gregorianYear + 1}-01-01` : `${gregorianYear}-${String(month + 1).padStart(2, "0")}-01`;

    const [staffRes, vendorRes, staffProfilesRes, vendorProfilesRes, certsRes] = await Promise.all([
      supabase.from("staff_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("vendor_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("staff_profiles").select("*").eq("user_id", user.id),
      supabase.from("vendor_profiles").select("*").eq("user_id", user.id),
      supabase.from("wht_certificates").select("source_invoice_id, flowaccount_url").eq("user_id", user.id),
    ]);

    const staffMap = new Map((staffProfilesRes.data || []).map(s => [s.id, s]));
    const vendorMap = new Map((vendorProfilesRes.data || []).map(v => [v.id, v]));
    // Map FA URLs from wht_certificates by source_invoice_id
    const faUrlMap = new Map((certsRes.data || []).filter(c => c.source_invoice_id && c.flowaccount_url).map(c => [c.source_invoice_id, c.flowaccount_url]));

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
        flowaccount_url: faUrlMap.get(inv.id) || null,
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
        flowaccount_url: faUrlMap.get(inv.id) || null,
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

  const saveFlowAccountUrl = async () => {
    if (!urlDialogEntry || !urlInput.trim()) return;
    // Save FA URL to wht_certificates (upsert by source_invoice_id)
    const { data: existing } = await supabase.from("wht_certificates").select("id").eq("source_invoice_id", urlDialogEntry.id).maybeSingle();
    if (existing) {
      await supabase.from("wht_certificates").update({ flowaccount_url: urlInput.trim() } as any).eq("id", existing.id);
    } else {
      await supabase.from("wht_certificates").insert({
        user_id: user!.id,
        payee_name: urlDialogEntry.payee_name,
        total_gross: urlDialogEntry.gross_amount,
        total_tax: urlDialogEntry.wht_amount,
        pnd_type: urlDialogEntry.pnd_type,
        source_invoice_id: urlDialogEntry.id,
        source_type: urlDialogEntry.source === "staff" ? "staff_invoice" : "vendor_invoice",
        flowaccount_url: urlInput.trim(),
        status: "completed",
      });
    }
    toast({ title: "บันทึกลิงก์ FA สำเร็จ" });
    setUrlDialogEntry(null);
    setUrlInput("");
    fetchData();
  };

  const sendViaLine = async (entry: WhtEntry) => {
    if (!entry.flowaccount_url) { toast({ title: "กรุณาใส่ลิงก์ FA ก่อน", variant: "destructive" }); return; }
    setSendingLine(entry.id);
    try {
      // Find cert with this source_invoice_id
      const { data: cert } = await supabase.from("wht_certificates").select("id").eq("source_invoice_id", entry.id).maybeSingle();
      if (!cert) { toast({ title: "ไม่พบรายการ cert", variant: "destructive" }); return; }
      const { data, error } = await supabase.functions.invoke("send-wht-link", { body: { cert_id: cert.id } });
      if (error) throw error;
      if (data?.sent) {
        toast({ title: "ส่งลิงก์ผ่าน LINE สำเร็จ", description: `ส่งให้ ${entry.payee_name}` });
        fetchData();
      } else {
        toast({ title: "ไม่สามารถส่งได้", description: data?.reason || "ไม่พบ LINE ID ของผู้รับ", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSendingLine(null);
    }
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
                <TableHead>วันที่จ่าย</TableHead><TableHead className="text-center">FA</TableHead>
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
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {e.flowaccount_url ? (
                          <>
                            <a href={e.flowaccount_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="เปิดลิงก์ FA">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="คัดลอกลิงก์" onClick={() => { navigator.clipboard.writeText(e.flowaccount_url!); toast({ title: "คัดลอกแล้ว" }); }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="ส่งผ่าน LINE" onClick={() => sendViaLine(e)} disabled={sendingLine === e.id}>
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="วางลิงก์ FA" onClick={() => { setUrlDialogEntry(e); setUrlInput(e.flowaccount_url || ""); }}>
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
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

      {/* FlowAccount URL Dialog */}
      <Dialog open={!!urlDialogEntry} onOpenChange={() => setUrlDialogEntry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ลิงก์ FlowAccount</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">วางลิงก์ใบหัก ณ ที่จ่ายจาก FlowAccount สำหรับ <strong>{urlDialogEntry?.payee_name}</strong></p>
          <Input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://flowaccount.com/..." />
          {urlDialogEntry?.flowaccount_url && (
            <a href={urlDialogEntry.flowaccount_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> เปิดลิงก์ปัจจุบัน
            </a>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUrlDialogEntry(null)}>ยกเลิก</Button>
            <Button onClick={saveFlowAccountUrl} disabled={!urlInput.trim()}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 2: นำส่งสรรพากร (Batch Management) ──────────────

function RemittanceTab({ selectedMonth, selectedYear }: { selectedMonth: string; selectedYear: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<RemittanceBatch[]>([]);
  const [unbatchedEntries, setUnbatchedEntries] = useState<WhtEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [confirmPay, setConfirmPay] = useState<RemittanceBatch | null>(null);

  const batchMonth = useMemo(() => {
    const gregorianYear = Number(selectedYear) - 543;
    return `${gregorianYear}-${String(Number(selectedMonth)).padStart(2, "0")}`;
  }, [selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    const gregorianYear = Number(selectedYear) - 543;
    const month = Number(selectedMonth);
    const startDate = `${gregorianYear}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12 ? `${gregorianYear + 1}-01-01` : `${gregorianYear}-${String(month + 1).padStart(2, "0")}-01`;

    // Fetch batches for this month
    const { data: batchData } = await supabase
      .from("wht_remittance_batches")
      .select("*")
      .eq("user_id", user.id)
      .eq("batch_month", batchMonth)
      .order("created_at", { ascending: false });

    const batchList = (batchData || []) as RemittanceBatch[];

    // Fetch items for each batch
    for (const batch of batchList) {
      const { data: items } = await supabase
        .from("wht_remittance_items")
        .select("*")
        .eq("batch_id", batch.id);
      batch.items = (items || []) as RemittanceItem[];
    }
    setBatches(batchList);

    // Fetch paid invoices not yet in any batch
    const batchedSourceIds = new Set(batchList.flatMap(b => (b.items || []).map(i => i.source_id)));

    const [staffRes, vendorRes, staffProfilesRes, vendorProfilesRes] = await Promise.all([
      supabase.from("staff_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("vendor_invoices").select("*").eq("user_id", user.id).eq("status", "paid").gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("staff_profiles").select("id, staff_name, tax_id, address").eq("user_id", user.id),
      supabase.from("vendor_profiles").select("id, company_name, tax_id, address, vendor_type").eq("user_id", user.id),
    ]);

    const staffMap = new Map((staffProfilesRes.data || []).map(s => [s.id, s]));
    const vendorMap = new Map((vendorProfilesRes.data || []).map(v => [v.id, v]));
    const unbatched: WhtEntry[] = [];

    for (const inv of staffRes.data || []) {
      if (inv.wht_amount <= 0 || batchedSourceIds.has(inv.id)) continue;
      const staff = staffMap.get(inv.staff_id);
      unbatched.push({
        id: inv.id, payee_name: staff?.staff_name || "ไม่ระบุ", tax_id: staff?.tax_id || "-",
        address: staff?.address || "-", income_type: "ค่าจ้างทำของ",
        gross_amount: inv.gross_amount + inv.bonus_amount, wht_rate: inv.wht_rate, wht_amount: inv.wht_amount,
        paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "staff", pnd_type: "3",
      });
    }
    for (const inv of vendorRes.data || []) {
      if (inv.wht_amount <= 0 || batchedSourceIds.has(inv.id)) continue;
      const vendor = inv.vendor_id ? vendorMap.get(inv.vendor_id) : null;
      const isCompany = vendor?.vendor_type === "company";
      unbatched.push({
        id: inv.id, payee_name: vendor?.company_name || inv.description || "ไม่ระบุ", tax_id: vendor?.tax_id || "-",
        address: vendor?.address || "-", income_type: isCompany ? "ค่าบริการ" : "ค่าจ้างทำของ",
        gross_amount: inv.amount, wht_rate: inv.amount > 0 ? (inv.wht_amount / inv.amount) * 100 : 3,
        wht_amount: inv.wht_amount, paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "vendor", pnd_type: isCompany ? "53" : "3",
      });
    }
    setUnbatchedEntries(unbatched);
    setSelectedIds(new Set());
    setLoading(false);
  };

  const createBatch = async () => {
    if (!user || selectedIds.size === 0) return;
    setCreatingBatch(true);
    const selected = unbatchedEntries.filter(e => selectedIds.has(e.id));
    const totalTax = selected.reduce((s, e) => s + e.wht_amount, 0);
    // Determine pnd_type: if mixed, use "3"
    const pndTypes = new Set(selected.map(e => e.pnd_type));
    const pndType = pndTypes.size === 1 ? [...pndTypes][0] : "3";

    const { data: batch, error: batchErr } = await supabase.from("wht_remittance_batches").insert({
      user_id: user.id, batch_month: batchMonth, pnd_type: pndType, total_tax: totalTax, status: "draft",
    }).select().single();

    if (batchErr || !batch) { toast({ title: "สร้างใบนำส่งไม่สำเร็จ", variant: "destructive" }); setCreatingBatch(false); return; }

    const items = selected.map(e => ({
      batch_id: batch.id, source_type: e.source === "staff" ? "staff_invoice" : "vendor_invoice",
      source_id: e.id, payee_name: e.payee_name, gross_amount: e.gross_amount, wht_amount: e.wht_amount,
    }));

    await supabase.from("wht_remittance_items").insert(items);
    toast({ title: "สร้างใบนำส่งสำเร็จ", description: `${selected.length} รายการ ยอดรวม ${totalTax.toLocaleString()} ฿` });
    setCreatingBatch(false);
    fetchData();
  };

  const markFiled = async (batch: RemittanceBatch) => {
    await supabase.from("wht_remittance_batches").update({ status: "filed", filed_at: new Date().toISOString() } as any).eq("id", batch.id);
    toast({ title: "บันทึกสถานะ: ยื่นแบบแล้ว" });
    fetchData();
  };

  const markPaid = async () => {
    if (!confirmPay || !user) return;
    const batch = confirmPay;
    const monthLabel = `${MONTHS_TH[Number(selectedMonth) - 1]} ${selectedYear}`;

    // 1. Create settlement expense (cash outflow)
    const { data: newExpense, error: expErr } = await supabase.from("expenses").insert({
      user_id: user.id,
      amount: batch.total_tax,
      category: "โอนเงิน",
      subcategory: "นำส่งภาษี",
      description: `นำส่งภาษีหัก ณ ที่จ่าย ภ.ง.ด.${batch.pnd_type} เดือน ${monthLabel}`,
      expense_date: new Date().toISOString().split("T")[0],
      transaction_type: "BUSINESS",
      category_group: "TAX",
      transaction_direction: "EXPENSE",
      receiver: "สรรพากร",
    }).select().single();

    if (expErr || !newExpense) { toast({ title: "บันทึกเงินจ่ายไม่สำเร็จ", variant: "destructive" }); return; }

    // 2. Mark WHT expenses as settled
    const items = batch.items || [];
    for (const item of items) {
      // Find matching WHT expense by source
      const descSearch = item.payee_name;
      const { data: whtExpenses } = await supabase.from("expenses")
        .select("id")
        .eq("user_id", user.id)
        .eq("category", "ภาษีหัก ณ ที่จ่าย")
        .is("settled_batch_id", null)
        .ilike("description", `%${descSearch}%`)
        .limit(1);
      if (whtExpenses && whtExpenses.length > 0) {
        await supabase.from("expenses").update({ settled_batch_id: batch.id } as any).eq("id", whtExpenses[0].id);
      }
    }

    // 3. Update batch status
    await supabase.from("wht_remittance_batches").update({
      status: "paid", paid_at: new Date().toISOString(), paid_expense_id: newExpense.id,
    } as any).eq("id", batch.id);

    toast({ title: "บันทึกการจ่ายเงินสำเร็จ", description: `จ่ายนำส่งสรรพากร ${batch.total_tax.toLocaleString()} ฿` });
    setConfirmPay(null);
    fetchData();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === unbatchedEntries.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(unbatchedEntries.map(e => e.id)));
  };

  const selectedTotal = unbatchedEntries.filter(e => selectedIds.has(e.id)).reduce((s, e) => s + e.wht_amount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />ฉบับร่าง</Badge>;
      case "filed": return <Badge variant="secondary"><FileCheck className="h-3 w-3 mr-1" />ยื่นแบบแล้ว</Badge>;
      case "paid": return <Badge className="bg-emerald-600"><CheckCircle className="h-3 w-3 mr-1" />จ่ายแล้ว</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) return <p className="text-center text-muted-foreground py-8">กำลังโหลด...</p>;

  return (
    <div className="space-y-6 mt-4">
      {/* Unbatched entries */}
      {unbatchedEntries.length > 0 && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">รายการรอจัดกลุ่มนำส่ง</h3>
              <Button size="sm" onClick={createBatch} disabled={selectedIds.size === 0 || creatingBatch}>
                {creatingBatch ? "กำลังสร้าง..." : `สร้างใบนำส่ง (${selectedIds.size} รายการ · ${selectedTotal.toLocaleString()} ฿)`}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedIds.size === unbatchedEntries.length && unbatchedEntries.length > 0} onCheckedChange={selectAll} />
                  </TableHead>
                  <TableHead>ชื่อผู้ถูกหัก</TableHead>
                  <TableHead>ภ.ง.ด.</TableHead>
                  <TableHead className="text-right">ยอดจ่าย</TableHead>
                  <TableHead className="text-right">ภาษีหัก</TableHead>
                  <TableHead>วันที่จ่าย</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {unbatchedEntries.map(e => (
                    <TableRow key={e.id} className={selectedIds.has(e.id) ? "bg-primary/5" : ""}>
                      <TableCell><Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} /></TableCell>
                      <TableCell className="font-medium">{e.payee_name}</TableCell>
                      <TableCell><Badge variant="outline">{e.pnd_type}</Badge></TableCell>
                      <TableCell className="text-right">{e.gross_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{e.wht_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{e.paid_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {unbatchedEntries.length === 0 && batches.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>ไม่มีรายการภาษีหัก ณ ที่จ่ายในเดือนนี้</p>
        </CardContent></Card>
      )}

      {/* Existing batches */}
      {batches.map(batch => (
        <Card key={batch.id} className={batch.status === "paid" ? "border-emerald-200 dark:border-emerald-800" : ""}>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold">ใบนำส่ง ภ.ง.ด.{batch.pnd_type}</h3>
                {getStatusBadge(batch.status)}
                <span className="text-sm text-muted-foreground">{(batch.items || []).length} รายการ</span>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-destructive text-lg">{batch.total_tax.toLocaleString()} ฿</p>
                {batch.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => markFiled(batch)}>
                    <FileCheck className="h-4 w-4 mr-1" /> ยื่นแบบแล้ว
                  </Button>
                )}
                {batch.status === "filed" && (
                  <Button size="sm" onClick={() => setConfirmPay(batch)}>
                    <Check className="h-4 w-4 mr-1" /> จ่ายเงินแล้ว
                  </Button>
                )}
              </div>
            </div>
            {batch.filed_at && <p className="text-xs text-muted-foreground">ยื่นแบบวันที่: {new Date(batch.filed_at).toLocaleDateString("th-TH")}</p>}
            {batch.paid_at && <p className="text-xs text-emerald-600">จ่ายเงินวันที่: {new Date(batch.paid_at).toLocaleDateString("th-TH")}</p>}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-10">#</TableHead><TableHead>ชื่อผู้ถูกหัก</TableHead>
                  <TableHead className="text-right">ยอดจ่าย</TableHead><TableHead className="text-right">ภาษีหัก</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(batch.items || []).map((item, i) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.payee_name}</TableCell>
                      <TableCell className="text-right">{item.gross_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{item.wht_amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Confirm payment dialog */}
      <AlertDialog open={!!confirmPay} onOpenChange={() => setConfirmPay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการจ่ายเงินนำส่งสรรพากร</AlertDialogTitle>
            <AlertDialogDescription>
              ระบบจะบันทึกรายจ่ายเงินสด {confirmPay?.total_tax.toLocaleString()} ฿ ให้สรรพากร และหักลบยอดเครดิตภาษี WHT ที่ค้างอยู่ ต้องการดำเนินการหรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={markPaid}>ยืนยันจ่ายเงิน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default WhtReport;
