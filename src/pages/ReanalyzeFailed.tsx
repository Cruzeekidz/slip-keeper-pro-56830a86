import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, Trash2, Pause, Play } from "lucide-react";
import { buildReceiptPath } from "@/lib/storage-path";

interface FailedRecord {
  id: string;
  receipt_url: string | null;
  created_at: string;
  status: 'pending' | 'analyzing' | 'success' | 'failed' | 'duplicate';
  error?: string;
  newAmount?: number;
}

const CONCURRENCY = 3;

export default function ReanalyzeFailed() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [records, setRecords] = useState<FailedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [stats, setStats] = useState({ success: 0, failed: 0, duplicate: 0 });
  const isPausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const loadFailed = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('id, receipt_url, created_at')
      .eq('user_id', user.id)
      .eq('amount', 0)
      .is('confidence_score', null)
      .eq('description', 'รอกรอกข้อมูล')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: "โหลดข้อมูลไม่สำเร็จ", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setRecords((data || []).map(r => ({ ...r, status: 'pending' as const })));
    setLoading(false);
  };

  useEffect(() => { loadFailed(); }, [user]);

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const reanalyzeOne = async (rec: FailedRecord, idx: number, list: FailedRecord[]) => {
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

    // Retry up to 3 times with backoff
    let aiData: any = null;
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      while (isPausedRef.current) await sleep(500);
      try {
        const { data, error } = await supabase.functions.invoke('analyze-receipt', {
          body: { storagePath: rec.receipt_url, isPDF, source: 'bulk' }
        });
        if (!error && data?.success && data.data) {
          aiData = data.data;
          break;
        }
        lastErr = error;
        if ((error as any)?.status === 429) await sleep(10000);
        else await sleep(5000 * (attempt + 1));
      } catch (e) {
        lastErr = e;
        await sleep(5000 * (attempt + 1));
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

    // Dedup check
    if (aiData.transaction_id) {
      const { data: dup } = await supabase.from('expenses')
        .select('id').eq('user_id', user.id)
        .eq('transaction_id', aiData.transaction_id)
        .neq('id', rec.id).maybeSingle();
      if (dup) {
        // Soft-delete: move to deleted_expenses then remove
        await supabase.from('expenses').delete().eq('id', rec.id);
        list[idx].status = 'duplicate';
        list[idx].error = `ซ้ำ TXN ${aiData.transaction_id}`;
        setStats(s => ({ ...s, duplicate: s.duplicate + 1 }));
        setProcessed(p => p + 1);
        setRecords([...list]);
        return;
      }
    }
    if (aiData.amount && aiData.date) {
      let q = supabase.from('expenses').select('id')
        .eq('user_id', user.id).eq('amount', aiData.amount)
        .eq('expense_date', aiData.date).neq('id', rec.id);
      if (aiData.time) q = q.eq('expense_time', aiData.time);
      const { data: dup2 } = await q.maybeSingle();
      if (dup2) {
        await supabase.from('expenses').delete().eq('id', rec.id);
        list[idx].status = 'duplicate';
        list[idx].error = `ซ้ำ ${aiData.amount}฿ ${aiData.date}`;
        setStats(s => ({ ...s, duplicate: s.duplicate + 1 }));
        setProcessed(p => p + 1);
        setRecords([...list]);
        return;
      }
    }

    // Move file to correct entity folder
    let receiptUrl = rec.receipt_url;
    const baseFileName = rec.receipt_url.split('/').pop() || '';
    const correctPath = buildReceiptPath(
      aiData.transaction_type, aiData.category_group,
      user.id, baseFileName, aiData.date
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

    const { error: updErr } = await supabase.from('expenses').update({
      amount: aiData.amount || 0,
      expense_date: aiData.date || new Date().toISOString().split('T')[0],
      expense_time: aiData.time || null,
      category, subcategory: aiData.subcategory || null,
      description: aiData.description || 'ไม่มีรายละเอียด',
      merchant: aiData.merchant || null,
      sender: aiData.sender || null, receiver: aiData.receiver || null,
      transaction_id: aiData.transaction_id || null,
      transaction_type: aiData.transaction_type || null,
      category_group: aiData.category_group || null,
      project_tag: aiData.project_tag || null,
      confidence_score: aiData.confidence_score ?? null,
      needs_review: isLowConfidence,
      staff_name: aiData.staff_name || null,
      event_name: aiData.event_name || null,
      receipt_url: receiptUrl,
    }).eq('id', rec.id);

    if (updErr) {
      list[idx].status = 'failed';
      list[idx].error = updErr.message;
      setStats(s => ({ ...s, failed: s.failed + 1 }));
    } else {
      list[idx].status = 'success';
      list[idx].newAmount = aiData.amount || 0;
      setStats(s => ({ ...s, success: s.success + 1 }));
    }
    setProcessed(p => p + 1);
    setRecords([...list]);
  };

  const startReanalyze = async () => {
    if (!records.length) return;
    setProcessing(true);
    setProcessed(0);
    setStats({ success: 0, failed: 0, duplicate: 0 });
    isPausedRef.current = false;
    setPaused(false);

    const list = [...records];
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

  const deleteAllFailed = async () => {
    if (!confirm(`ลบรายการที่วิเคราะห์ไม่สำเร็จทั้งหมด ${records.filter(r => r.status === 'failed' || r.status === 'pending').length} รายการ?\n\n(จะลบทั้ง record และไฟล์ใน storage)`)) return;
    const toDelete = records.filter(r => r.status === 'failed' || r.status === 'pending');
    const ids = toDelete.map(r => r.id);
    const paths = toDelete.map(r => r.receipt_url).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from('receipts').remove(paths);
    if (ids.length) await supabase.from('expenses').delete().in('id', ids);
    toast({ title: `ลบ ${ids.length} รายการแล้ว` });
    loadFailed();
  };

  const progress = records.length > 0 ? (processed / records.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-2xl font-bold">วิเคราะห์รายการที่ตกหล่นใหม่</h1>
        </div>

        <Card className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-warning mt-1" />
            <div className="text-sm text-muted-foreground">
              รายการที่ AI วิเคราะห์ไม่สำเร็จระหว่างอัพโหลดจะมียอด 0 บาท และคำว่า "รอกรอกข้อมูล" — เครื่องมือนี้จะส่งสลิปกลับไปวิเคราะห์ใหม่และอัพเดทข้อมูลให้ถูกต้อง
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">กำลังโหลด...</p>
          ) : records.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
              <p className="text-muted-foreground">ไม่มีรายการที่ต้องวิเคราะห์ใหม่ 🎉</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-muted/50 rounded p-3">
                  <div className="text-xs text-muted-foreground">ทั้งหมด</div>
                  <div className="text-2xl font-bold">{records.length}</div>
                </div>
                <div className="bg-success/10 rounded p-3">
                  <div className="text-xs text-muted-foreground">สำเร็จ</div>
                  <div className="text-2xl font-bold text-success">{stats.success}</div>
                </div>
                <div className="bg-warning/10 rounded p-3">
                  <div className="text-xs text-muted-foreground">ซ้ำ (ลบแล้ว)</div>
                  <div className="text-2xl font-bold text-warning">{stats.duplicate}</div>
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

              <div className="flex gap-2 flex-wrap">
                <Button onClick={startReanalyze} disabled={processing} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`} />
                  {processing ? 'กำลังวิเคราะห์...' : `วิเคราะห์ใหม่ทั้งหมด (${records.length})`}
                </Button>
                {processing && (
                  <Button onClick={togglePause} variant="outline" className="gap-2">
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {paused ? 'เริ่มต่อ' : 'หยุดชั่วคราว'}
                  </Button>
                )}
                <Button onClick={loadFailed} variant="outline" disabled={processing}>รีเฟรช</Button>
                {!processing && (
                  <Button onClick={deleteAllFailed} variant="destructive" className="gap-2 ml-auto">
                    <Trash2 className="h-4 w-4" /> ลบรายการที่ยังล้มเหลว
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>

        {records.length > 0 && (
          <Card className="p-4 max-h-[500px] overflow-y-auto">
            <div className="space-y-1">
              {records.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                  {r.status === 'pending' && <div className="h-4 w-4 rounded-full bg-muted shrink-0" />}
                  {r.status === 'analyzing' && <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  {r.status === 'success' && <CheckCircle className="h-4 w-4 text-success shrink-0" />}
                  {r.status === 'failed' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                  {r.status === 'duplicate' && <AlertTriangle className="h-4 w-4 text-warning shrink-0" />}
                  <span className="truncate flex-1 font-mono text-xs">{r.receipt_url?.split('/').pop()}</span>
                  {r.newAmount !== undefined && <span className="text-success font-medium">+{r.newAmount.toLocaleString()}฿</span>}
                  {r.error && <span className="text-destructive text-xs truncate max-w-[200px]">{r.error}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
