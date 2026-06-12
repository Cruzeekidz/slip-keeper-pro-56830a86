import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, Pause, Play } from "lucide-react";
import { buildReceiptPath } from "@/lib/storage-path";

interface Rec {
  id: string;
  receipt_url: string | null;
  created_at: string;
  expense_date: string;
  amount: number;
  description: string | null;
  status: 'pending' | 'analyzing' | 'updated' | 'unchanged' | 'failed';
  oldDate?: string;
  newDate?: string;
  oldAmount?: number;
  newAmount?: number;
  oldPath?: string;
  newPath?: string;
  error?: string;
}

const CONCURRENCY = 2;

export default function ReanalyzeRecent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [count, setCount] = useState(30);
  const [records, setRecords] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [stats, setStats] = useState({ updated: 0, unchanged: 0, failed: 0 });
  const isPausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('id, receipt_url, created_at, expense_date, amount, description')
      .eq('user_id', user.id)
      .not('receipt_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(count);
    setLoading(false);
    if (error) {
      toast({ title: "โหลดไม่สำเร็จ", description: error.message, variant: "destructive" });
      return;
    }
    setRecords((data || []).map(r => ({
      id: r.id,
      receipt_url: r.receipt_url,
      created_at: r.created_at,
      expense_date: r.expense_date,
      amount: Number(r.amount),
      description: r.description,
      status: 'pending' as const,
    })));
    setStats({ updated: 0, unchanged: 0, failed: 0 });
    setProcessed(0);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const reanalyzeOne = async (rec: Rec, idx: number, list: Rec[]) => {
    if (!rec.receipt_url || !user) {
      list[idx].status = 'failed';
      list[idx].error = 'ไม่มีไฟล์สลิป';
      setStats(s => ({ ...s, failed: s.failed + 1 }));
      setProcessed(p => p + 1);
      setRecords([...list]);
      return;
    }
    list[idx].status = 'analyzing';
    setRecords([...list]);

    const isPDF = rec.receipt_url.toLowerCase().endsWith('.pdf');
    let aiData: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      while (isPausedRef.current) await sleep(500);
      try {
        const { data, error } = await supabase.functions.invoke('analyze-receipt', {
          body: { storagePath: rec.receipt_url, isPDF, source: 'reanalyze' }
        });
        if (!error && data?.success && data.data) { aiData = data.data; break; }
        lastErr = error;
        if ((error as any)?.status === 429) await sleep(10000);
        else await sleep(3000 * (attempt + 1));
      } catch (e) {
        lastErr = e;
        await sleep(3000 * (attempt + 1));
      }
    }
    if (!aiData) {
      list[idx].status = 'failed';
      list[idx].error = lastErr?.message || 'AI วิเคราะห์ไม่สำเร็จ';
      setStats(s => ({ ...s, failed: s.failed + 1 }));
      setProcessed(p => p + 1);
      setRecords([...list]);
      return;
    }

    const newDate = aiData.date || rec.expense_date;
    const newAmount = aiData.amount ?? rec.amount;

    // Move to correct entity/year/month folder
    let receiptUrl = rec.receipt_url;
    const baseFileName = rec.receipt_url.split('/').pop() || '';
    const correctPath = buildReceiptPath(
      aiData.transaction_type, aiData.category_group,
      user.id, baseFileName, newDate
    );
    if (correctPath !== rec.receipt_url) {
      const { error: copyErr } = await supabase.storage.from('receipts').copy(rec.receipt_url, correctPath);
      if (!copyErr) {
        await supabase.storage.from('receipts').remove([rec.receipt_url]);
        receiptUrl = correctPath;
      }
    }

    const category = aiData.transaction_type === 'BUSINESS' && aiData.category_group
      ? `${aiData.transaction_type}/${aiData.category_group}` : aiData.transaction_type || 'ไม่ระบุ';
    const isLowConfidence = aiData.confidence_score != null && aiData.confidence_score < 75;

    const updatePayload: any = {
      expense_date: newDate,
      amount: newAmount,
      expense_time: aiData.time || null,
      category,
      subcategory: aiData.subcategory || null,
      merchant: aiData.merchant || null,
      sender: aiData.sender || null,
      receiver: aiData.receiver || null,
      transaction_type: aiData.transaction_type || null,
      category_group: aiData.category_group || null,
      project_tag: aiData.project_tag || null,
      confidence_score: aiData.confidence_score ?? null,
      needs_review: isLowConfidence,
      receipt_url: receiptUrl,
    };

    const { error: updErr } = await supabase.from('expenses').update(updatePayload).eq('id', rec.id);
    if (updErr) {
      list[idx].status = 'failed';
      list[idx].error = updErr.message;
      setStats(s => ({ ...s, failed: s.failed + 1 }));
    } else {
      const changed = newDate !== rec.expense_date || Math.abs(newAmount - rec.amount) > 0.01 || receiptUrl !== rec.receipt_url;
      list[idx].status = changed ? 'updated' : 'unchanged';
      list[idx].oldDate = rec.expense_date;
      list[idx].newDate = newDate;
      list[idx].oldAmount = rec.amount;
      list[idx].newAmount = newAmount;
      list[idx].oldPath = rec.receipt_url;
      list[idx].newPath = receiptUrl;
      setStats(s => changed ? { ...s, updated: s.updated + 1 } : { ...s, unchanged: s.unchanged + 1 });
    }
    setProcessed(p => p + 1);
    setRecords([...list]);
  };

  const start = async () => {
    if (!records.length) return;
    setProcessing(true);
    setProcessed(0);
    setStats({ updated: 0, unchanged: 0, failed: 0 });
    isPausedRef.current = false;
    setPaused(false);
    const list = records.map(r => ({ ...r, status: 'pending' as const }));
    setRecords(list);
    const queue = list.map((_, i) => i);
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const idx = queue.shift();
        if (idx === undefined) break;
        await reanalyzeOne(list[idx], idx, list);
      }
    });
    await Promise.all(workers);
    setProcessing(false);
    toast({ title: "วิเคราะห์ใหม่เสร็จสิ้น" });
  };

  const togglePause = () => {
    isPausedRef.current = !isPausedRef.current;
    setPaused(isPausedRef.current);
  };

  const progress = records.length > 0 ? (processed / records.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-2xl font-bold">วิเคราะห์สลิปล่าสุดใหม่ (OCR)</h1>
        </div>

        <Card className="p-4 text-sm text-muted-foreground">
          อ่านสลิปล่าสุดอีกครั้งด้วย AI prompt ใหม่ (รองรับ dd/mm/yy แบบไทย) แล้วอัพเดทวันที่/หมวด/ย้ายโฟลเดอร์ให้ถูกต้อง
          ใช้เมื่อพบว่ามีสลิปจำนวนหนึ่งถูกอ่านวันที่ผิด หรือถูกแยกโฟลเดอร์ผิด
        </Card>

        <Card className="p-4">
          <div className="flex items-end gap-3 flex-wrap mb-4">
            <div>
              <Label htmlFor="count" className="text-xs">จำนวนสลิปล่าสุด</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 30)))}
                disabled={processing}
                className="w-28"
              />
            </div>
            <Button onClick={load} variant="outline" disabled={loading || processing} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> โหลดรายการ
            </Button>
            <Button onClick={start} disabled={processing || !records.length} className="gap-2 ml-auto">
              <RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
              {processing ? 'กำลังวิเคราะห์...' : `วิเคราะห์ใหม่ (${records.length})`}
            </Button>
            {processing && (
              <Button onClick={togglePause} variant="outline" className="gap-2">
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {paused ? 'เริ่มต่อ' : 'หยุดชั่วคราว'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-muted/50 rounded p-3">
              <div className="text-xs text-muted-foreground">ทั้งหมด</div>
              <div className="text-2xl font-bold">{records.length}</div>
            </div>
            <div className="bg-success/10 rounded p-3">
              <div className="text-xs text-muted-foreground">อัพเดท</div>
              <div className="text-2xl font-bold text-success">{stats.updated}</div>
            </div>
            <div className="bg-muted/30 rounded p-3">
              <div className="text-xs text-muted-foreground">ไม่เปลี่ยน</div>
              <div className="text-2xl font-bold">{stats.unchanged}</div>
            </div>
            <div className="bg-destructive/10 rounded p-3">
              <div className="text-xs text-muted-foreground">ล้มเหลว</div>
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            </div>
          </div>

          {processing && (
            <div className="mb-4">
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground text-center">{processed}/{records.length}</p>
            </div>
          )}
        </Card>

        {records.length > 0 && (
          <Card className="p-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              {records.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-2 border-b last:border-0">
                  {r.status === 'pending' && <div className="h-4 w-4 rounded-full bg-muted shrink-0" />}
                  {r.status === 'analyzing' && <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  {r.status === 'updated' && <CheckCircle className="h-4 w-4 text-success shrink-0" />}
                  {r.status === 'unchanged' && <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                  {r.status === 'failed' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{r.description || '(ไม่มีรายละเอียด)'}</div>
                    {r.status === 'updated' ? (
                      <div className="text-muted-foreground space-y-0.5">
                        {r.oldDate !== r.newDate && (
                          <div><span className="line-through text-destructive">{r.oldDate}</span> → <span className="text-success font-medium">{r.newDate}</span></div>
                        )}
                        {r.oldAmount !== r.newAmount && (
                          <div><span className="line-through text-destructive">{r.oldAmount?.toLocaleString()}฿</span> → <span className="text-success font-medium">{r.newAmount?.toLocaleString()}฿</span></div>
                        )}
                        {r.oldPath !== r.newPath && (
                          <div className="truncate"><span className="text-warning">ย้าย:</span> {r.newPath?.split('/').slice(0, 1).join('/')}/.../{r.newPath?.split('/').slice(-2).join('/')}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">{r.expense_date} • {r.amount.toLocaleString()}฿</div>
                    )}
                    {r.error && <div className="text-destructive">{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}