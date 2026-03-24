import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle, SkipForward, Eye, AlertTriangle, RefreshCw, Loader2, PlayCircle, PauseCircle } from "lucide-react";
import {
  TRANSACTION_TYPES, CATEGORY_GROUPS, TransactionType, CategoryGroup,
  getSubcategoriesForType, showProjectTag as shouldShowProjectTag,
} from "@/lib/category-constants";

interface ReviewItem {
  id: string;
  amount: number;
  expense_date: string;
  description: string | null;
  merchant: string | null;
  receipt_url: string | null;
  confidence_score: number | null;
  transaction_type: string | null;
  category_group: string | null;
  subcategory: string | null;
  project_tag: string | null;
  event_name: string | null;
  memo_text: string | null;
}

interface EventOption {
  project_tag: string;
  event_name: string;
  event_date: string | null;
}

export default function ReviewQueue() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);

  // Edit state
  const [transactionType, setTransactionType] = useState<TransactionType | "">("");
  const [categoryGroup, setCategoryGroup] = useState<CategoryGroup | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [projectTag, setProjectTag] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('id, amount, expense_date, description, merchant, receipt_url, confidence_score, transaction_type, category_group, subcategory, project_tag, event_name, memo_text')
      .eq('user_id', user.id)
      .eq('needs_review', true)
      .order('expense_date', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }, [user]);

  const fetchEventOptions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('event_registry')
      .select('project_tag, event_name, event_date')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('event_date', { ascending: false, nullsFirst: false });
    setEventOptions(data || []);
  }, [user]);

  useEffect(() => { fetchItems(); fetchEventOptions(); }, [fetchItems, fetchEventOptions]);

  const current = items[currentIndex];

  useEffect(() => {
    if (!current) { setPreviewUrl(null); return; }
    setTransactionType((current.transaction_type as TransactionType) || "");
    setCategoryGroup((current.category_group as CategoryGroup) || "");
    setSubcategory(current.subcategory || "");
    setProjectTag(current.project_tag || "");
    setAmount(String(current.amount));

    if (current.receipt_url) {
      supabase.storage.from('receipts').createSignedUrl(current.receipt_url, 3600)
        .then(({ data }) => setPreviewUrl(data?.signedUrl || null));
    } else {
      setPreviewUrl(null);
    }
  }, [current]);

  const showGroup = transactionType === 'BUSINESS';
  const showTag = showGroup && shouldShowProjectTag(categoryGroup as CategoryGroup || null);
  const defaultSubcats = getSubcategoriesForType(transactionType || null, categoryGroup || null, 'EXPENSE');

  // Build project tag options from event_registry
  const projectTagOptions = showTag ? eventOptions
    .filter(e => {
      if (categoryGroup === 'EVENT') return e.project_tag.startsWith('EVT-');
      if (categoryGroup === 'ENTITY_BCC_NEXT') return e.project_tag.startsWith('BCCNEXT-');
      if (categoryGroup === 'PROGRAM') return e.project_tag.startsWith('PROG-');
      return true;
    })
    .map(e => {
      const dateStr = e.event_date ? ` (${e.event_date})` : '';
      return { value: e.project_tag, label: `${e.project_tag} — ${e.event_name}${dateStr}` };
    }) : [];

  const handleReanalyze = async () => {
    if (!current?.receipt_url) {
      toast({ title: "ไม่มีรูปสลิป", description: "ไม่สามารถ re-analyze ได้เพราะไม่มีรูปสลิป", variant: "destructive" });
      return;
    }

    setReanalyzing(true);
    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-receipt', {
        body: {
          storagePath: current.receipt_url,
          isPDF: current.receipt_url.endsWith('.pdf'),
          memo: current.memo_text || undefined,
        }
      });

      if (aiError) throw aiError;

      if (aiData?.success && aiData.data) {
        const d = aiData.data;
        // Update local state with new AI results
        setTransactionType((d.transaction_type as TransactionType) || "");
        setCategoryGroup((d.category_group as CategoryGroup) || "");
        setSubcategory(d.subcategory || "");
        setProjectTag(d.project_tag || "");
        if (d.amount) setAmount(String(d.amount));

        toast({
          title: "วิเคราะห์ใหม่สำเร็จ",
          description: `${d.transaction_type || '?'} / ${d.category_group || '?'} / ${d.project_tag || 'ไม่มี tag'} (${d.confidence_score || 0}%)`,
        });
      } else {
        toast({ title: "AI ไม่สามารถวิเคราะห์ได้", variant: "destructive" });
      }
    } catch (error) {
      console.error('Re-analyze error:', error);
      toast({ title: "เกิดข้อผิดพลาด", description: "ลองใหม่อีกครั้ง", variant: "destructive" });
    } finally {
      setReanalyzing(false);
    }
  };

  const handleApprove = async () => {
    if (!current || !transactionType) return;
    setSaving(true);

    const category = transactionType === 'BUSINESS' && categoryGroup ? `${transactionType}/${categoryGroup}` : transactionType;

    const { error } = await supabase.from('expenses').update({
      transaction_type: transactionType,
      category_group: categoryGroup || null,
      category,
      subcategory: subcategory || null,
      project_tag: projectTag || null,
      amount: parseFloat(amount),
      needs_review: false,
      confidence_score: 100,
    }).eq('id', current.id);

    setSaving(false);

    if (error) { toast({ title: "บันทึกไม่สำเร็จ", variant: "destructive" }); return; }

    toast({ title: "ยืนยันแล้ว", description: `${current.amount} บาท — ${category}` });
    setItems(prev => prev.filter((_, i) => i !== currentIndex));
    if (currentIndex >= items.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const handleSkip = () => {
    if (currentIndex < items.length - 1) setCurrentIndex(currentIndex + 1);
    else setCurrentIndex(0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">ตรวจสอบรายการ</h1>
            <p className="text-muted-foreground">
              {items.length > 0
                ? `${items.length} รายการรอตรวจสอบ — กำลังดูรายการที่ ${currentIndex + 1}`
                : 'ไม่มีรายการรอตรวจสอบ 🎉'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-xl font-semibold mb-2">ไม่มีรายการรอตรวจสอบ</h3>
            <p className="text-muted-foreground mb-4">รายการทั้งหมดได้รับการยืนยันแล้ว</p>
            <Button onClick={() => navigate('/')}>กลับหน้าหลัก</Button>
          </Card>
        ) : current && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Receipt Preview */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">สลิป / ใบเสร็จ</span>
                {current.confidence_score != null && (
                  <span className={`ml-auto text-sm font-medium px-2 py-0.5 rounded ${current.confidence_score < 50 ? 'bg-destructive/10 text-destructive' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                    ความมั่นใจ {current.confidence_score}%
                  </span>
                )}
              </div>
              {previewUrl ? (
                <img src={previewUrl} alt="Receipt" className="w-full rounded-lg border max-h-[500px] object-contain bg-muted" />
              ) : (
                <div className="h-64 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                  ไม่มีรูปสลิป
                </div>
              )}
              {current.memo_text && (
                <div className="mt-3 p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Memo จาก LINE:</p>
                  <p className="text-sm">{current.memo_text}</p>
                </div>
              )}
              {current.description && (
                <p className="mt-2 text-sm text-muted-foreground">{current.description}</p>
              )}
            </Card>

            {/* Right: Edit Form */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <span className="font-semibold">ตรวจสอบและแก้ไข</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReanalyze}
                  disabled={reanalyzing || !current.receipt_url}
                >
                  {reanalyzing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  {reanalyzing ? 'กำลังวิเคราะห์...' : 'Re-analyze'}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>จำนวนเงิน (บาท)</Label>
                    <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>วันที่</Label>
                    <Input type="date" value={current.expense_date} disabled />
                  </div>
                </div>

                {current.merchant && (
                  <div className="p-2 bg-muted rounded text-sm">
                    <span className="text-muted-foreground">ร้านค้า:</span> {current.merchant}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>ประเภทธุรกรรม *</Label>
                  <Select value={transactionType} onValueChange={v => { setTransactionType(v as TransactionType); setCategoryGroup(""); setSubcategory(""); setProjectTag(""); }}>
                    <SelectTrigger><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {showGroup && (
                  <div className="space-y-2">
                    <Label>กลุ่ม</Label>
                    <Select value={categoryGroup} onValueChange={v => { setCategoryGroup(v as CategoryGroup); setSubcategory(""); setProjectTag(""); }}>
                      <SelectTrigger><SelectValue placeholder="เลือกกลุ่ม" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {showTag && (
                  <div className="space-y-2">
                    <Label>แท็กโปรเจค (จาก Event Registry)</Label>
                    <Combobox
                      options={projectTagOptions.map(o => o.value)}
                      value={projectTag}
                      onValueChange={setProjectTag}
                      placeholder="เลือกอีเวนท์จากรายการ"
                    />
                    {projectTag && (
                      <p className="text-xs text-muted-foreground">
                        {eventOptions.find(e => e.project_tag === projectTag)?.event_name}
                        {eventOptions.find(e => e.project_tag === projectTag)?.event_date && 
                          ` (${eventOptions.find(e => e.project_tag === projectTag)?.event_date})`}
                      </p>
                    )}
                  </div>
                )}

                {defaultSubcats.length > 0 && (
                  <div className="space-y-2">
                    <Label>ประเภทย่อย</Label>
                    <Combobox options={defaultSubcats} value={subcategory} onValueChange={setSubcategory} placeholder="เลือกประเภทย่อย" />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button onClick={handleApprove} disabled={!transactionType || saving} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                  </Button>
                  <Button variant="outline" onClick={handleSkip}>
                    <SkipForward className="h-4 w-4 mr-2" />ข้าม
                  </Button>
                </div>

                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>รายการที่ {currentIndex + 1} / {items.length}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={currentIndex === 0} onClick={() => setCurrentIndex(currentIndex - 1)}>ก่อนหน้า</Button>
                    <Button variant="ghost" size="sm" disabled={currentIndex >= items.length - 1} onClick={() => setCurrentIndex(currentIndex + 1)}>ถัดไป</Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
