import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Copy, Check, Banknote, Upload, ImageIcon, CreditCard, Building2 } from "lucide-react";
import { buildUploadPath } from "@/lib/storage-path";

interface PaymentItem {
  id: string;
  invoice_number: string;
  event_name: string | null;
  event_id: string | null;
  days_worked: number;
  daily_rate: number;
  gross_amount: number;
  bonus_amount: number;
  wht_rate: number;
  wht_amount: number;
  net_amount: number;
  status: string;
  payment_slip_url: string | null;
  matched_expense_id: string | null;
  staff_profiles: {
    staff_name: string;
    nickname: string | null;
    bank_name: string | null;
    bank_account: string | null;
    tax_id: string | null;
  } | null;
}

const cleanAccountNumber = (account: string | null | undefined): string => {
  if (!account) return "";
  return account.replace(/[-\s]/g, "");
};

const PaymentQueue = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payDialog, setPayDialog] = useState<PaymentItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: pendingInvoices = [], isLoading } = useQuery({
    queryKey: ["payment-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_invoices")
        .select("*, staff_profiles(staff_name, nickname, bank_name, bank_account, tax_id)")
        .in("status", ["submitted", "approved"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as PaymentItem[];
    },
    enabled: !!user,
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ invoiceId, slipFile }: { invoiceId: string; slipFile: File }) => {
      if (!user) throw new Error("Not authenticated");

      const ext = slipFile.name.split(".").pop() || "jpg";
      const path = buildUploadPath("payment-slips", user.id, `${Date.now()}_${invoiceId}.${ext}`);
      const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, slipFile, {
        contentType: slipFile.type,
      });
      if (uploadErr) throw uploadErr;

      // Find the invoice to check WHT
      const inv = pendingInvoices.find((i) => i.id === invoiceId);

      const { error } = await supabase.from("staff_invoices").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_slip_url: path,
      } as any).eq("id", invoiceId);
      if (error) throw error;

      // If WHT > 0, create a paired WHT expense as credit
      if (inv && Number(inv.wht_amount) > 0) {
        let projectTag: string | null = null;
        if (inv.event_id) {
          const { data: evReg } = await supabase
            .from("event_registry")
            .select("project_tag")
            .eq("id", inv.event_id)
            .maybeSingle();
          if (evReg) projectTag = evReg.project_tag;
        }
        await supabase.from("expenses").insert({
          user_id: user.id,
          amount: Number(inv.wht_amount),
          category: "ภาษีหัก ณ ที่จ่าย",
          subcategory: "Staff",
          description: `ภาษีหัก ณ ที่จ่าย 3% - ${inv.staff_profiles?.staff_name || ""} ${inv.event_name || ""}`.trim(),
          expense_date: new Date().toISOString().split("T")[0],
          transaction_direction: "EXPENSE",
          transaction_type: "BUSINESS",
          category_group: "EVENT",
          project_tag: projectTag,
          staff_name: inv.staff_profiles?.staff_name || null,
          event_name: inv.event_name || null,
          receiver: "สรรพากร",
          memo_text: `รอนำส่งสิ้นเดือน - ${inv.invoice_number}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-queue"] });
      queryClient.invalidateQueries({ queryKey: ["staff-invoices"] });
      setPayDialog(null);
      toast({ title: "บันทึกการจ่ายเงินสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const copyAccount = (id: string, account: string) => {
    const clean = cleanAccountNumber(account);
    navigator.clipboard.writeText(clean);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "คัดลอกเลขบัญชีแล้ว", description: clean });
  };

  const totals = pendingInvoices.reduce(
    (acc, inv) => ({
      gross: acc.gross + Number(inv.gross_amount),
      wht: acc.wht + Number(inv.wht_amount),
      net: acc.net + Number(inv.net_amount),
    }),
    { gross: 0, wht: 0, net: 0 }
  );

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payDialog) return;
    setUploading(true);
    markPaidMutation.mutate(
      { invoiceId: payDialog.id, slipFile: file },
      { onSettled: () => setUploading(false) }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 shadow-elevated">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Banknote className="h-6 w-6" />
          <h1 className="text-xl font-bold">รายการรอจ่ายเงิน</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => navigate("/staff-payments")} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <CreditCard className="h-4 w-4 mr-1" />จ่ายเงิน
            </Button>
            <Button onClick={() => navigate("/vendor-management")} size="sm" className="bg-white/20 hover:bg-white/30 text-primary-foreground">
              <Building2 className="h-4 w-4 mr-1" />คู่ค้า
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Summary */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">สรุปรวม</p>
              <Badge variant="secondary">{pendingInvoices.length} รายการ</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">บันทึกค่าใช้จ่าย (Gross)</p>
                <p className="text-sm font-bold">{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3">
                <p className="text-xs text-destructive">หัก ณ ที่จ่าย 3%</p>
                <p className="text-sm font-bold text-destructive">{totals.wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-3">
                <p className="text-xs text-primary">ยอดโอนจริง (Net)</p>
                <p className="text-sm font-bold text-primary">{totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-8">กำลังโหลด...</p>
        ) : pendingInvoices.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">ไม่มีรายการรอจ่ายเงิน</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingInvoices.map((inv) => {
              const grossAmount = Number(inv.gross_amount);
              const whtAmount = Number(inv.wht_amount);
              const netAmount = Number(inv.net_amount);
              const cleanAcct = cleanAccountNumber(inv.staff_profiles?.bank_account);

              return (
                <Card key={inv.id}>
                  <CardContent className="pt-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {inv.staff_profiles?.staff_name}
                          {inv.staff_profiles?.nickname && (
                            <span className="text-muted-foreground font-normal text-sm ml-1">({inv.staff_profiles.nickname})</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {inv.event_name || "ไม่ระบุอีเวนท์"} • {inv.invoice_number}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {inv.matched_expense_id && (
                          <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                            จับคู่อัตโนมัติ
                          </Badge>
                        )}
                        <Badge variant={inv.status === "approved" ? "default" : "secondary"}>
                          {inv.status === "approved" ? "อนุมัติแล้ว" : "รออนุมัติ"}
                        </Badge>
                      </div>
                    </div>

                    {/* Bank account with copy */}
                    {inv.staff_profiles?.bank_name && cleanAcct && (
                      <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{inv.staff_profiles.bank_name}</p>
                          <p className="font-mono text-lg font-bold tracking-wider">{cleanAcct}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyAccount(inv.id, inv.staff_profiles?.bank_account || "")}
                        >
                          {copiedId === inv.id ? (
                            <><Check className="h-4 w-4 mr-1 text-green-500" />คัดลอกแล้ว</>
                          ) : (
                            <><Copy className="h-4 w-4 mr-1" />คัดลอก</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Amount breakdown */}
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{inv.days_worked} วัน × {Number(inv.daily_rate).toLocaleString()}</span>
                        <span>{(Number(inv.days_worked) * Number(inv.daily_rate)).toLocaleString()}</span>
                      </div>
                      {Number(inv.bonus_amount || 0) > 0 && (
                        <div className="flex justify-between text-primary">
                          <span>โบนัส</span>
                          <span>+{Number(inv.bonus_amount).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Gross / WHT / Net breakdown from invoice data */}
                    <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">บันทึกค่าใช้จ่าย (Gross)</span>
                        <span className="font-medium">{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {whtAmount > 0 && (
                        <div className="flex justify-between text-destructive">
                          <span>หัก ณ ที่จ่าย {Number(inv.wht_rate)}%</span>
                          <span>-{whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between items-center">
                        <span className="font-bold">ยอดโอนจริง (Net)</span>
                        <span className="font-bold text-primary">
                          {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          navigator.clipboard.writeText(netAmount.toFixed(2));
                          toast({ title: "คัดลอกยอดโอน", description: `${netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท` });
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />คัดลอกยอดโอน
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setPayDialog(inv)}
                      >
                        <Upload className="h-4 w-4 mr-1" />จ่ายแล้ว + แนบสลิป
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Mark as Paid Dialog */}
        <Dialog open={!!payDialog} onOpenChange={(open) => { if (!open) setPayDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                ยืนยันการจ่ายเงิน
              </DialogTitle>
            </DialogHeader>
            {payDialog && (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium">{payDialog.staff_profiles?.staff_name}</p>
                  <p className="text-muted-foreground">{payDialog.event_name || "ไม่ระบุอีเวนท์"}</p>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between">
                      <span>Gross</span>
                      <span>{Number(payDialog.gross_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Number(payDialog.wht_amount) > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>WHT {Number(payDialog.wht_rate)}%</span>
                        <span>-{Number(payDialog.wht_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-primary border-t pt-1">
                      <span>ยอดโอน</span>
                      <span>{Number(payDialog.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท</span>
                    </div>
                  </div>
                </div>
                {Number(payDialog.wht_amount) > 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                    ⚠️ ระบบจะบันทึกภาษีหัก ณ ที่จ่าย {Number(payDialog.wht_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} บาท เป็นค่าใช้จ่ายเครดิต (รอนำส่งสรรพากร)
                  </p>
                )}
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">แนบสลิปเงินโอน</p>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? "กำลังอัปโหลด..." : "เลือกไฟล์"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default PaymentQueue;
