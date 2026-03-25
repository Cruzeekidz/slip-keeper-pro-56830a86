import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Copy, Search, Link2, Check, ExternalLink, AlertCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

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
}

type StatusFilter = "all" | "no_link" | "not_sent" | "sent";

const WhtCertificateList = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [certs, setCerts] = useState<WhtCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // FlowAccount URL dialog
  const [urlDialogCert, setUrlDialogCert] = useState<WhtCert | null>(null);
  const [urlInput, setUrlInput] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading]);

  useEffect(() => {
    if (!user) return;
    fetchCerts();
  }, [user, filterMonth]);

  const fetchCerts = async () => {
    if (!user) return;
    setLoading(true);
    const [year, month] = filterMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("wht_certificates")
      .select("id, doc_number, issue_date, payee_name, total_gross, total_tax, status, pnd_type, created_at, flowaccount_url, sent_to_payee, sent_at")
      .eq("user_id", user!.id)
      .gte("issue_date", startDate)
      .lt("issue_date", endDate)
      .order("issue_date", { ascending: false });

    if (!error) setCerts((data as WhtCert[]) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = certs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.payee_name.toLowerCase().includes(q) ||
        (c.doc_number && c.doc_number.toLowerCase().includes(q))
      );
    }
    if (statusFilter === "no_link") result = result.filter(c => !c.flowaccount_url);
    else if (statusFilter === "not_sent") result = result.filter(c => c.flowaccount_url && !c.sent_to_payee);
    else if (statusFilter === "sent") result = result.filter(c => c.sent_to_payee);
    return result;
  }, [certs, search, statusFilter]);

  const totalGross = filtered.reduce((s, c) => s + c.total_gross, 0);
  const totalTax = filtered.reduce((s, c) => s + c.total_tax, 0);

  // Summary counts
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
    const { error } = await supabase
      .from("wht_certificates")
      .update({ flowaccount_url: urlInput.trim() } as any)
      .eq("id", urlDialogCert.id);
    if (!error) {
      toast({ title: "บันทึกลิงก์สำเร็จ" });
      setUrlDialogCert(null);
      setUrlInput("");
      fetchCerts();
    }
  };

  const copyFlowAccountUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "คัดลอกลิงก์สำเร็จ", description: "พร้อมส่งให้คู่ค้า" });
  };

  const markAsSent = async (certId: string) => {
    const { error } = await supabase
      .from("wht_certificates")
      .update({ sent_to_payee: true, sent_at: new Date().toISOString() } as any)
      .eq("id", certId);
    if (!error) {
      toast({ title: "อัปเดตสถานะสำเร็จ" });
      fetchCerts();
    }
  };

  const getTrackingStatus = (cert: WhtCert) => {
    if (cert.sent_to_payee) return { label: "ส่งแล้ว", variant: "default" as const, icon: Check };
    if (cert.flowaccount_url) return { label: "รอส่ง", variant: "secondary" as const, icon: Link2 };
    return { label: "ยังไม่เปิด", variant: "outline" as const, icon: AlertCircle };
  };

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
      opts.push({ value: val, label });
    }
    return opts;
  }, []);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">ติดตามหัก ณ ที่จ่าย</h1>
            <p className="text-xs text-muted-foreground">ตรวจสอบสถานะเอกสาร FlowAccount</p>
          </div>
          <Button onClick={() => navigate("/wht-certificate")}>
            <Plus className="h-4 w-4 mr-1" /> บันทึกใหม่
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card className={`cursor-pointer transition-colors ${statusFilter === "no_link" ? "border-destructive" : ""}`} onClick={() => setStatusFilter(s => s === "no_link" ? "all" : "no_link")}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-destructive">{noLinkCount}</p>
              <p className="text-xs text-muted-foreground">ยังไม่เปิด FA</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-colors ${statusFilter === "not_sent" ? "border-amber-500" : ""}`} onClick={() => setStatusFilter(s => s === "not_sent" ? "all" : "not_sent")}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-500">{notSentCount}</p>
              <p className="text-xs text-muted-foreground">รอส่งคู่ค้า</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-colors ${statusFilter === "sent" ? "border-primary" : ""}`} onClick={() => setStatusFilter(s => s === "sent" ? "all" : "sent")}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-primary">{sentCount}</p>
              <p className="text-xs text-muted-foreground">ส่งแล้ว</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้รับ / เลขที่..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">วันที่</TableHead>
                    <TableHead className="text-xs">ผู้รับ</TableHead>
                    <TableHead className="text-xs text-right">ยอดจ่าย</TableHead>
                    <TableHead className="text-xs text-right">ภาษีหัก</TableHead>
                    <TableHead className="text-xs text-center">สถานะ</TableHead>
                    <TableHead className="text-xs text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">กำลังโหลด...</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">ไม่มีรายการในเดือนนี้</TableCell>
                    </TableRow>
                  ) : filtered.map(cert => {
                    const trackStatus = getTrackingStatus(cert);
                    return (
                      <TableRow key={cert.id}>
                        <TableCell className="text-sm">{new Date(cert.issue_date).toLocaleDateString("th-TH")}</TableCell>
                        <TableCell className="text-sm font-medium max-w-[200px] truncate">{cert.payee_name}</TableCell>
                        <TableCell className="text-sm text-right">{cert.total_gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-sm text-right text-destructive">{cert.total_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={trackStatus.variant} className="text-xs">
                            <trackStatus.icon className="h-3 w-3 mr-1" />
                            {trackStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {/* Paste FlowAccount URL */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="วางลิงก์ FlowAccount"
                              onClick={() => { setUrlDialogCert(cert); setUrlInput(cert.flowaccount_url || ""); }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                            {/* Copy FlowAccount URL */}
                            {cert.flowaccount_url && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="คัดลอกลิงก์" onClick={() => copyFlowAccountUrl(cert.flowaccount_url!)}>
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {!cert.sent_to_payee && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="ส่งแล้ว" onClick={() => markAsSent(cert.id)}>
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                            {/* Edit */}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/wht-certificate?edit=${cert.id}`)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {/* Delete */}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(cert.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2} className="text-sm text-right">รวม ({filtered.length} รายการ)</TableCell>
                      <TableCell className="text-sm text-right">{totalGross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm text-right text-destructive">{totalTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FlowAccount URL Dialog */}
      <Dialog open={!!urlDialogCert} onOpenChange={() => setUrlDialogCert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลิงก์ FlowAccount</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">วางลิงก์ใบหัก ณ ที่จ่ายจาก FlowAccount สำหรับ <strong>{urlDialogCert?.payee_name}</strong></p>
          <Input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://flowaccount.com/..."
          />
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบรายการนี้หรือไม่?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WhtCertificateList;
