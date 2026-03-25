import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, Download, Printer } from "lucide-react";

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

const MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const numberToThaiText = (num: number): string => {
  const digits = ["ศูนย์","หนึ่ง","สอง","สาม","สี่","ห้า","หก","เจ็ด","แปด","เก้า"];
  const positions = ["","สิบ","ร้อย","พัน","หมื่น","แสน","ล้าน"];
  if (num === 0) return "ศูนย์บาทถ้วน";
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  
  const intToText = (n: number): string => {
    if (n === 0) return "";
    const s = String(n);
    let result = "";
    for (let i = 0; i < s.length; i++) {
      const d = parseInt(s[i]);
      const pos = s.length - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && s.length > 1) { result += "เอ็ด"; continue; }
      if (pos === 1 && d === 1) { result += "สิบ"; continue; }
      if (pos === 1 && d === 2) { result += "ยี่สิบ"; continue; }
      result += digits[d] + positions[pos];
    }
    return result;
  };

  let text = intToText(intPart) + "บาท";
  if (decPart > 0) {
    text += intToText(decPart) + "สตางค์";
  } else {
    text += "ถ้วน";
  }
  return text;
};

const WhtReport = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WhtEntry[]>([]);

  // Payer info (for localStorage persistence)
  const [payerInfo, setPayerInfo] = useState({
    name: "",
    tax_id: "",
    address: "",
  });

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear() + 543));

  // Load saved payer info
  useEffect(() => {
    const saved = localStorage.getItem("wht_payer_info");
    if (saved) setPayerInfo(JSON.parse(saved));
  }, []);

  const years = useMemo(() => {
    const cy = now.getFullYear() + 543;
    return Array.from({ length: 5 }, (_, i) => String(cy - i));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    fetchData();
  }, [user, authLoading, selectedMonth, selectedYear]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const gregorianYear = Number(selectedYear) - 543;
    const month = Number(selectedMonth);
    const startDate = `${gregorianYear}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12
      ? `${gregorianYear + 1}-01-01`
      : `${gregorianYear}-${String(month + 1).padStart(2, "0")}-01`;

    const [staffRes, vendorRes, staffProfilesRes, vendorProfilesRes] = await Promise.all([
      supabase.from("staff_invoices").select("*")
        .eq("user_id", user.id).eq("status", "paid")
        .gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("vendor_invoices").select("*")
        .eq("user_id", user.id).eq("status", "paid")
        .gte("paid_at", startDate).lt("paid_at", endDate),
      supabase.from("staff_profiles").select("*").eq("user_id", user.id),
      supabase.from("vendor_profiles").select("*").eq("user_id", user.id),
    ]);

    const staffMap = new Map((staffProfilesRes.data || []).map((s) => [s.id, s]));
    const vendorMap = new Map((vendorProfilesRes.data || []).map((v) => [v.id, v]));

    const result: WhtEntry[] = [];

    for (const inv of staffRes.data || []) {
      if (inv.wht_amount <= 0) continue;
      const staff = staffMap.get(inv.staff_id);
      result.push({
        id: inv.id,
        payee_name: staff?.staff_name || "ไม่ระบุ",
        tax_id: staff?.tax_id || "-",
        address: staff?.address || "-",
        income_type: "ค่าจ้างทำของ (40(2)/ม.40(8))",
        gross_amount: inv.gross_amount + inv.bonus_amount,
        wht_rate: inv.wht_rate,
        wht_amount: inv.wht_amount,
        paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "staff",
        pnd_type: "3",
      });
    }

    for (const inv of vendorRes.data || []) {
      if (inv.wht_amount <= 0) continue;
      const vendor = inv.vendor_id ? vendorMap.get(inv.vendor_id) : null;
      const isCompany = vendor?.vendor_type === "company";
      result.push({
        id: inv.id,
        payee_name: vendor?.company_name || inv.description || "ไม่ระบุ",
        tax_id: vendor?.tax_id || "-",
        address: vendor?.address || "-",
        income_type: isCompany ? "ค่าบริการ (ม.40(8))" : "ค่าจ้างทำของ (40(2)/ม.40(8))",
        gross_amount: inv.amount,
        wht_rate: inv.amount > 0 ? (inv.wht_amount / inv.amount) * 100 : 3,
        wht_amount: inv.wht_amount,
        paid_date: inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("th-TH") : "-",
        source: "vendor",
        pnd_type: isCompany ? "53" : "3",
      });
    }

    setEntries(result);
    setLoading(false);
  };

  const pnd3Entries = entries.filter((e) => e.pnd_type === "3");
  const pnd53Entries = entries.filter((e) => e.pnd_type === "53");

  const totalPnd3Gross = pnd3Entries.reduce((s, e) => s + e.gross_amount, 0);
  const totalPnd3Wht = pnd3Entries.reduce((s, e) => s + e.wht_amount, 0);
  const totalPnd53Gross = pnd53Entries.reduce((s, e) => s + e.gross_amount, 0);
  const totalPnd53Wht = pnd53Entries.reduce((s, e) => s + e.wht_amount, 0);

  const exportCSV = (pndEntries: WhtEntry[], pndType: string) => {
    const headers = ["ลำดับ","ชื่อผู้ถูกหัก","เลขประจำตัวผู้เสียภาษี","ที่อยู่","ประเภทเงินได้","จำนวนเงินที่จ่าย","อัตราหัก(%)","ภาษีที่หัก","วันที่จ่าย"];
    const rows = pndEntries.map((e, i) => [
      i + 1, e.payee_name, e.tax_id, e.address, e.income_type,
      e.gross_amount, e.wht_rate, e.wht_amount, e.paid_date,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ภงด${pndType}_${MONTHS_TH[Number(selectedMonth) - 1]}_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `ส่งออก ภ.ง.ด.${pndType} สำเร็จ` });
  };

  const openCertForm = (entry: WhtEntry) => {
    // Navigate to WHT certificate form with prefilled data
    const params = new URLSearchParams({
      payee_name: entry.payee_name,
      payee_tax_id: entry.tax_id,
      payee_address: entry.address,
      payee_type: entry.pnd_type === "53" ? "company" : "individual",
      pnd_type: entry.pnd_type,
      gross_amount: String(entry.gross_amount),
      wht_amount: String(entry.wht_amount),
      wht_rate: String(entry.wht_rate),
      paid_date: entry.paid_date,
      source_id: entry.id,
      source_type: entry.source,
    });
    navigate(`/wht-certificate?${params.toString()}`);
  };



  const renderTable = (pndEntries: WhtEntry[], pndType: string, totalGross: number, totalWht: number) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-lg">ภ.ง.ด.{pndType}</h3>
          <Badge variant="secondary">{pndEntries.length} รายการ</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportCSV(pndEntries, pndType)} disabled={pndEntries.length === 0}>
          <Download className="h-4 w-4 mr-1" /> ส่งออก CSV
        </Button>
      </div>

      {pndEntries.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">ไม่มีรายการหัก ณ ที่จ่ายในเดือนนี้</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">ลำดับ</TableHead>
                <TableHead>ชื่อผู้ถูกหัก</TableHead>
                <TableHead>เลขประจำตัว</TableHead>
                <TableHead>ประเภทเงินได้</TableHead>
                <TableHead className="text-right">จำนวนเงิน</TableHead>
                <TableHead className="text-right">อัตรา(%)</TableHead>
                <TableHead className="text-right">ภาษีหัก</TableHead>
                <TableHead>วันที่จ่าย</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pndEntries.map((e, i) => (
                <TableRow key={e.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{e.payee_name}</TableCell>
                  <TableCell className="font-mono text-xs">{e.tax_id}</TableCell>
                  <TableCell className="text-xs">{e.income_type}</TableCell>
                  <TableCell className="text-right">{e.gross_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{e.wht_rate}%</TableCell>
                  <TableCell className="text-right font-semibold">{e.wht_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{e.paid_date}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="สร้างหนังสือรับรอง" onClick={() => openCertForm(e)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold">
                <TableCell colSpan={4} className="text-right">รวมทั้งสิ้น</TableCell>
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

  if (authLoading || loading) {
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
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">เลือกเดือน/ปี:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_TH.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => navigate("/wht-certificate")} size="sm">
                <FileText className="h-4 w-4 mr-1" /> สร้างหนังสือรับรอง
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">ภงด.3 (รายการ)</p>
              <p className="text-2xl font-bold">{pnd3Entries.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">ภงด.3 (ภาษีหัก)</p>
              <p className="text-2xl font-bold text-destructive">{totalPnd3Wht.toLocaleString()} ฿</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">ภงด.53 (รายการ)</p>
              <p className="text-2xl font-bold">{pnd53Entries.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-xs text-muted-foreground">ภงด.53 (ภาษีหัก)</p>
              <p className="text-2xl font-bold text-destructive">{totalPnd53Wht.toLocaleString()} ฿</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pnd3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pnd3">ภ.ง.ด.3 — บุคคลธรรมดา ({pnd3Entries.length})</TabsTrigger>
            <TabsTrigger value="pnd53">ภ.ง.ด.53 — นิติบุคคล ({pnd53Entries.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pnd3">
            {renderTable(pnd3Entries, "3", totalPnd3Gross, totalPnd3Wht)}
          </TabsContent>
          <TabsContent value="pnd53">
            {renderTable(pnd53Entries, "53", totalPnd53Gross, totalPnd53Wht)}
          </TabsContent>
        </Tabs>
      </main>

      {/* Payer Info Dialog before generating certificate */}
      <Dialog open={showPayerDialog} onOpenChange={setShowPayerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ข้อมูลผู้จ่ายเงิน (ผู้หักภาษี)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">กรอกข้อมูลบริษัท/บุคคลที่เป็นผู้จ่ายเงิน (จะจำไว้ครั้งถัดไป)</p>
            {certEntry && (
              <Card className="bg-muted/50">
                <CardContent className="py-3">
                  <p className="text-sm"><strong>ผู้ถูกหัก:</strong> {certEntry.payee_name}</p>
                  <p className="text-sm"><strong>ยอด:</strong> {certEntry.gross_amount.toLocaleString()} บาท | <strong>ภาษี:</strong> {certEntry.wht_amount.toLocaleString()} บาท</p>
                </CardContent>
              </Card>
            )}
            <div>
              <Label>ชื่อผู้จ่ายเงิน / บริษัท</Label>
              <Input value={payerInfo.name} onChange={(e) => setPayerInfo({ ...payerInfo, name: e.target.value })} placeholder="บริษัท ... จำกัด" />
            </div>
            <div>
              <Label>เลขประจำตัวผู้เสียภาษี (13 หลัก)</Label>
              <Input value={payerInfo.tax_id} onChange={(e) => setPayerInfo({ ...payerInfo, tax_id: e.target.value })} placeholder="X-XXXX-XXXXX-XX-X" />
            </div>
            <div>
              <Label>ที่อยู่</Label>
              <Input value={payerInfo.address} onChange={(e) => setPayerInfo({ ...payerInfo, address: e.target.value })} placeholder="ที่อยู่สำหรับใส่ในเอกสาร" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayerDialog(false)}>ยกเลิก</Button>
            <Button onClick={generateWhtCert}>
              <Printer className="h-4 w-4 mr-1" /> สร้างหนังสือรับรอง
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhtReport;
