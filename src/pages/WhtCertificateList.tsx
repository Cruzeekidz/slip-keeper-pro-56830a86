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
import { ArrowLeft, Plus, FileText, Pencil, Trash2, Copy, Printer, Search } from "lucide-react";
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
}

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
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
      .select("id, doc_number, issue_date, payee_name, total_gross, total_tax, status, pnd_type, created_at")
      .eq("user_id", user!.id)
      .gte("issue_date", startDate)
      .lt("issue_date", endDate)
      .order("issue_date", { ascending: false });

    if (!error) setCerts(data || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search) return certs;
    const q = search.toLowerCase();
    return certs.filter(c =>
      c.payee_name.toLowerCase().includes(q) ||
      (c.doc_number && c.doc_number.toLowerCase().includes(q))
    );
  }, [certs, search]);

  const totalGross = filtered.reduce((s, c) => s + c.total_gross, 0);
  const totalTax = filtered.reduce((s, c) => s + c.total_tax, 0);

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("wht_certificate_items").delete().eq("certificate_id", deleteId);
    await supabase.from("wht_certificates").delete().eq("id", deleteId);
    toast({ title: "ลบเอกสารสำเร็จ" });
    setDeleteId(null);
    fetchCerts();
  };

  const copyShareLink = (certId: string) => {
    const url = `${window.location.origin}/portal?view=wht-cert&id=${certId}`;
    navigator.clipboard.writeText(url);
    toast({ title: "คัดลอกลิงก์สำเร็จ", description: "ลิงก์สำหรับแชร์ให้คู่ค้า" });
  };

  // Generate months for filter
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
            <h1 className="text-lg font-bold">หนังสือรับรองหัก ณ ที่จ่าย</h1>
            <p className="text-xs text-muted-foreground">จัดการเอกสาร 50 ทวิ ทั้งหมด</p>
          </div>
          <Button onClick={() => navigate("/wht-certificate")}>
            <Plus className="h-4 w-4 mr-1" /> สร้างใหม่
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
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
                    <TableHead className="text-xs">เลขที่</TableHead>
                    <TableHead className="text-xs">วันที่</TableHead>
                    <TableHead className="text-xs">ผู้รับ</TableHead>
                    <TableHead className="text-xs">แบบ</TableHead>
                    <TableHead className="text-xs text-right">ยอดจ่าย</TableHead>
                    <TableHead className="text-xs text-right">ภาษีหัก</TableHead>
                    <TableHead className="text-xs text-center">สถานะ</TableHead>
                    <TableHead className="text-xs text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">กำลังโหลด...</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">ไม่มีเอกสารในเดือนนี้</TableCell>
                    </TableRow>
                  ) : filtered.map(cert => (
                    <TableRow key={cert.id}>
                      <TableCell className="text-sm font-mono">{cert.doc_number || "-"}</TableCell>
                      <TableCell className="text-sm">{new Date(cert.issue_date).toLocaleDateString("th-TH")}</TableCell>
                      <TableCell className="text-sm font-medium max-w-[200px] truncate">{cert.payee_name}</TableCell>
                      <TableCell className="text-sm">ภ.ง.ด.{cert.pnd_type}</TableCell>
                      <TableCell className="text-sm text-right">{cert.total_gross.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm text-right text-destructive">{cert.total_tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={cert.status === "completed" ? "default" : "secondary"}>
                          {cert.status === "completed" ? "สมบูรณ์" : "ฉบับร่าง"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/wht-certificate?edit=${cert.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {cert.status === "completed" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyShareLink(cert.id)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(cert.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4} className="text-sm text-right">รวมทั้งหมด ({filtered.length} รายการ)</TableCell>
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบเอกสารนี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</AlertDialogDescription>
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
