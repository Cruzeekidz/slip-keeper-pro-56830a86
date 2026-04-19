import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, FileText, Download, ExternalLink, FolderOpen, Users, Building2, Receipt } from "lucide-react";

interface Staff { id: string; staff_name: string; nickname: string | null; tax_id: string | null; id_card_url: string | null; }
interface Vendor { id: string; company_name: string; tax_id: string | null; tax_doc_url: string | null; }
interface WhtCert { id: string; doc_number: string | null; payee_name: string; issue_date: string; total_tax: number; pnd_type: string; status: string; }

const SIGN_TTL = 60 * 60 * 24; // 24 ชม.

export default function DocumentHub() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isAccountant, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [whtCerts, setWhtCerts] = useState<WhtCert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user || roleLoading) return;
    if (!isAdmin && !isAccountant) {
      toast({ title: "ไม่มีสิทธิ์", description: "หน้านี้สำหรับนักบัญชีและแอดมิน", variant: "destructive" });
      navigate("/");
      return;
    }
    fetchData();
  }, [user, isAdmin, isAccountant, roleLoading]);

  const fetchData = async () => {
    setLoading(true);
    const [s, v, w] = await Promise.all([
      supabase.from("staff_profiles").select("id, staff_name, nickname, tax_id, id_card_url").eq("is_active", true).order("staff_name"),
      supabase.from("vendor_profiles").select("id, company_name, tax_id, tax_doc_url").eq("is_active", true).order("company_name"),
      supabase.from("wht_certificates").select("id, doc_number, payee_name, issue_date, total_tax, pnd_type, status").order("issue_date", { ascending: false }).limit(100),
    ]);
    setStaff((s.data || []) as Staff[]);
    setVendors((v.data || []) as Vendor[]);
    setWhtCerts((w.data || []) as WhtCert[]);
    setLoading(false);
  };

  const openSigned = async (path: string) => {
    if (!path) return;
    // path may be full URL or storage path; try to extract storage path
    let storagePath = path;
    const m = path.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(\?|$)/);
    if (m) storagePath = decodeURIComponent(m[1]);
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(storagePath, SIGN_TTL);
    if (error || !data) {
      // fallback: try opening directly
      window.open(path, "_blank");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  if (authLoading || roleLoading || loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">กำลังโหลด...</div>;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
          <FolderOpen className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">คลังเอกสารแชร์บัญชี</h1>
            <p className="text-sm text-muted-foreground">รวมเอกสารทีมงาน คู่ค้า และหนังสือรับรองหัก ณ ที่จ่าย</p>
          </div>
        </div>

        <Tabs defaultValue="staff">
          <TabsList>
            <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1" />ทีมงาน ({staff.length})</TabsTrigger>
            <TabsTrigger value="vendor"><Building2 className="h-4 w-4 mr-1" />คู่ค้า ({vendors.length})</TabsTrigger>
            <TabsTrigger value="wht"><Receipt className="h-4 w-4 mr-1" />หนังสือ WHT ({whtCerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="staff">
            <Card>
              <CardHeader><CardTitle>สำเนาบัตรประชาชนทีมงาน</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อทีมงาน</TableHead>
                      <TableHead>เลขผู้เสียภาษี</TableHead>
                      <TableHead>เอกสาร</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>{s.staff_name} {s.nickname && <span className="text-muted-foreground">({s.nickname})</span>}</TableCell>
                        <TableCell className="font-mono text-xs">{s.tax_id || "-"}</TableCell>
                        <TableCell>
                          {s.id_card_url ? (
                            <Button size="sm" variant="outline" onClick={() => openSigned(s.id_card_url!)}>
                              <ExternalLink className="h-3 w-3 mr-1" />เปิดสำเนาบัตร
                            </Button>
                          ) : <Badge variant="secondary">ยังไม่อัปโหลด</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendor">
            <Card>
              <CardHeader><CardTitle>เอกสารภาษีคู่ค้า (ภพ.20 / หนังสือรับรอง)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชื่อบริษัท / คู่ค้า</TableHead>
                      <TableHead>เลขผู้เสียภาษี</TableHead>
                      <TableHead>เอกสาร</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map(v => (
                      <TableRow key={v.id}>
                        <TableCell>{v.company_name}</TableCell>
                        <TableCell className="font-mono text-xs">{v.tax_id || "-"}</TableCell>
                        <TableCell>
                          {v.tax_doc_url ? (
                            <Button size="sm" variant="outline" onClick={() => openSigned(v.tax_doc_url!)}>
                              <ExternalLink className="h-3 w-3 mr-1" />เปิด ภพ.20
                            </Button>
                          ) : <Badge variant="secondary">ยังไม่อัปโหลด</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wht">
            <Card>
              <CardHeader>
                <CardTitle>หนังสือรับรองหัก ณ ที่จ่าย</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่</TableHead>
                      <TableHead>ผู้รับเงิน</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead>ภงด.</TableHead>
                      <TableHead className="text-right">ภาษี (บาท)</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whtCerts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.doc_number || "-"}</TableCell>
                        <TableCell>{c.payee_name}</TableCell>
                        <TableCell>{new Date(c.issue_date).toLocaleDateString("th-TH")}</TableCell>
                        <TableCell>ภงด.{c.pnd_type}</TableCell>
                        <TableCell className="text-right">{c.total_tax.toLocaleString()}</TableCell>
                        <TableCell><Badge variant={c.status === "completed" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/wht-cert/${c.id}`)}>
                            <FileText className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />วิธีให้นักบัญชีเข้าดูคลังนี้</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>1. ให้นักบัญชี <strong>สมัครบัญชีในระบบ</strong> ผ่านหน้า <code>/auth</code></p>
            <p>2. เข้าไปที่ <strong>จัดการระบบ → ผู้ใช้</strong> เพื่อกำหนด role <code>accountant</code> ให้บัญชีดังกล่าว</p>
            <p>3. นักบัญชีจะ login แล้วเข้าหน้านี้ <code>/document-hub</code> เพื่อดูเอกสารทั้งหมด (อ่านอย่างเดียว)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
