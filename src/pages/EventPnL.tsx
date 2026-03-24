import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, TrendingDown, Users, DollarSign, Package, RefreshCw, BarChart3, FolderPlus, Pencil, Trash2, Layers, Plus, HandCoins, ShoppingBag, FileText, CircleDot, CheckCircle2, AlertCircle, Bell, Calendar, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface ReadyGoEvent {
  id: string;
  title: string;
  short_code: string;
  event_date: string;
  location: string;
}

interface RegistrationStats {
  total_registrations: number;
  completed_count: number;
  sponsored_count: number;
  total_registration_fee: number;
  total_discount: number;
  total_cruzee_discount: number;
  actual_revenue: number;
  oto1_revenue: number;
  oto1_count: number;
  oto2_revenue: number;
  oto2_count: number;
  total_oto_revenue: number;
  category_breakdown: Record<string, number>;
}

interface EventFinancialData {
  event?: ReadyGoEvent;
  events?: ReadyGoEvent[];
  registrationStats: RegistrationStats;
  financials: any[];
  summary: {
    totalExpenses: number;
    totalOtherIncome: number;
    netProfit: number;
  };
}

interface EventGroup {
  id: string;
  group_name: string;
  project_tag: string;
  readygo_event_ids: string[];
}

interface OtherIncome {
  id: string;
  description: string;
  amount: number;
  income_date: string | null;
  event_group_id: string | null;
  event_id: string | null;
}

interface ProductCost {
  id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  event_group_id: string | null;
  event_id: string | null;
}

interface OtherExpense {
  id: string;
  description: string;
  amount: number;
  expense_date: string | null;
  is_refundable: boolean;
  refund_status: string;
  refunded_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
}

interface EventNote {
  id: string;
  note_text: string;
  note_type: string;
  is_resolved: boolean;
  resolved_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
  created_at: string;
}

interface EventReminder {
  id: string;
  reminder_type: string;
  title: string;
  description: string | null;
  amount: number;
  due_date: string;
  remind_before_days: number;
  is_completed: boolean;
  completed_at: string | null;
  notify_line: boolean;
  notify_gcal: boolean;
  line_notified_at: string | null;
  event_group_id: string | null;
  event_id: string | null;
  created_at: string;
}

const REMINDER_TYPES = [
  { value: "billing", label: "📋 วางบิล", color: "text-blue-600" },
  { value: "payment_check", label: "💳 เช็คยอดโอน/รับเช็ค", color: "text-green-600" },
  { value: "deposit_refund", label: "💰 ทวงคืนมัดจำ", color: "text-amber-600" },
  { value: "outstanding", label: "⚠️ ค่าใช้จ่ายค้างจ่าย", color: "text-red-600" },
];

const CHART_COLORS = [
  "hsl(190, 80%, 45%)",   // ค่าสมัคร - ฟ้าเข้ม
  "hsl(30, 90%, 55%)",    // OTO1 - ส้ม
  "hsl(280, 65%, 55%)",   // OTO2 - ม่วง
  "hsl(340, 80%, 55%)",   // รายได้อื่น Ready-go - ชมพูเข้ม
  "hsl(45, 95%, 50%)",    // รายได้อื่น บันทึกเอง - เหลืองทอง
  "hsl(150, 60%, 45%)",   // สำรอง - เขียว
  "hsl(0, 70%, 55%)",     // สำรอง - แดง
  "hsl(210, 70%, 50%)",   // สำรอง - น้ำเงิน
];

const formatNumber = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0 });

const EventPnL = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [events, setEvents] = useState<ReadyGoEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [financialData, setFinancialData] = useState<EventFinancialData | null>(null);
  const [localExpenses, setLocalExpenses] = useState<number>(0);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Group management
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<EventGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupTag, setGroupTag] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  // Other income management
  const [otherIncomes, setOtherIncomes] = useState<OtherIncome[]>([]);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<OtherIncome | null>(null);
  const [incomeDesc, setIncomeDesc] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState("");

  // Product cost management
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductCost | null>(null);
  const [productName, setProductName] = useState("");
  const [productQty, setProductQty] = useState("");
  const [productUnitCost, setProductUnitCost] = useState("");

  // Other expenses management
  const [otherExpenses, setOtherExpenses] = useState<OtherExpense[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OtherExpense | null>(null);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseRefundable, setExpenseRefundable] = useState(false);

  // Event notes management
  const [eventNotes, setEventNotes] = useState<EventNote[]>([]);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [editingNote, setEditingNote] = useState<EventNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("general");

  // Reminders management
  const [reminders, setReminders] = useState<EventReminder[]>([]);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [editingReminder, setEditingReminder] = useState<EventReminder | null>(null);
  const [reminderType, setReminderType] = useState("billing");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDesc, setReminderDesc] = useState("");
  const [reminderAmount, setReminderAmount] = useState("");
  const [reminderDueDate, setReminderDueDate] = useState("");
  const [reminderBeforeDays, setReminderBeforeDays] = useState("1");
  const [reminderNotifyLine, setReminderNotifyLine] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchEvents();
      fetchGroups();
    }
  }, [user]);

  useEffect(() => {
    if ((selectedEventId || selectedGroupId) && financialData) {
      fetchLocalExpenses();
      fetchOtherIncomes();
      fetchProductCosts();
      fetchOtherExpenses();
      fetchEventNotes();
      fetchReminders();
    }
  }, [selectedEventId, selectedGroupId, financialData]);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "list-events" },
      });
      if (error) throw error;
      setEvents(data.events || []);
    } catch (err) {
      console.error(err);
      toast({ title: "ไม่สามารถดึงรายการอีเวนท์ได้", variant: "destructive" });
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchGroups = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("event_groups")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setGroups((data as any[]) || []);
  };

  const fetchFinancials = async (eventId: string) => {
    setLoadingData(true);
    setSelectedGroupId("");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "event-financials", event_id: eventId },
      });
      if (error) throw error;
      setFinancialData(data);
    } catch (err) {
      console.error(err);
      toast({ title: "ไม่สามารถดึงข้อมูลการเงินได้", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  const fetchGroupFinancials = async (group: EventGroup) => {
    setLoadingData(true);
    setSelectedEventId("");
    setSelectedGroupId(group.id);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-readygo-data", {
        body: { action: "multi-event-financials", event_ids: group.readygo_event_ids },
      });
      if (error) throw error;
      setFinancialData(data);
    } catch (err) {
      console.error(err);
      toast({ title: "ไม่สามารถดึงข้อมูลกลุ่มอีเวนท์ได้", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  };

  const fetchLocalExpenses = async () => {
    if (!user) return;
    let searchTerms: string[] = [];

    if (selectedGroupId) {
      const group = groups.find(g => g.id === selectedGroupId);
      if (group) searchTerms = [group.project_tag, group.group_name];
    } else if (financialData?.event) {
      searchTerms = [financialData.event.title];
    }

    if (searchTerms.length === 0) return;

    const orClauses = searchTerms
      .flatMap(t => [`event_name.ilike.%${t}%`, `project.ilike.%${t}%`, `project_tag.ilike.%${t}%`])
      .join(",");

    const { data } = await supabase
      .from("expenses")
      .select("amount")
      .eq("user_id", user.id)
      .or(orClauses);

    const total = (data || []).reduce((s, e) => s + Number(e.amount), 0);
    setLocalExpenses(total);
  };

  // Other Income CRUD
  const fetchOtherIncomes = async () => {
    if (!user) return;
    let query = supabase
      .from("event_other_income" as any)
      .select("*")
      .eq("user_id", user.id);

    if (selectedGroupId) {
      query = query.eq("event_group_id", selectedGroupId);
    } else if (selectedEventId) {
      query = query.eq("event_id", selectedEventId);
    } else {
      setOtherIncomes([]);
      return;
    }

    const { data } = await query.order("created_at", { ascending: false });
    setOtherIncomes((data as any[]) || []);
  };

  const openCreateIncome = () => {
    setEditingIncome(null);
    setIncomeDesc("");
    setIncomeAmount("");
    setIncomeDate("");
    setShowIncomeDialog(true);
  };

  const openEditIncome = (income: OtherIncome) => {
    setEditingIncome(income);
    setIncomeDesc(income.description);
    setIncomeAmount(String(income.amount));
    setIncomeDate(income.income_date || "");
    setShowIncomeDialog(true);
  };

  const saveIncome = async () => {
    if (!user || !incomeDesc.trim() || !incomeAmount) {
      toast({ title: "กรุณากรอกรายละเอียดและจำนวนเงิน", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        description: incomeDesc.trim(),
        amount: Number(incomeAmount),
        income_date: incomeDate || null,
      };
      if (editingIncome) {
        await supabase.from("event_other_income" as any).update(payload).eq("id", editingIncome.id);
        toast({ title: "อัปเดตรายได้อื่นสำเร็จ" });
      } else {
        payload.user_id = user.id;
        payload.event_group_id = selectedGroupId || null;
        payload.event_id = selectedGroupId ? null : selectedEventId || null;
        await supabase.from("event_other_income" as any).insert(payload);
        toast({ title: "เพิ่มรายได้อื่นสำเร็จ" });
      }
      setShowIncomeDialog(false);
      fetchOtherIncomes();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteIncome = async (id: string) => {
    await supabase.from("event_other_income" as any).delete().eq("id", id);
    fetchOtherIncomes();
    toast({ title: "ลบรายได้อื่นสำเร็จ" });
  };

  // Product Cost CRUD
  const fetchProductCosts = async () => {
    if (!user) return;
    let query = supabase.from("event_product_costs" as any).select("*").eq("user_id", user.id);
    if (selectedGroupId) {
      query = query.eq("event_group_id", selectedGroupId);
    } else if (selectedEventId) {
      query = query.eq("event_id", selectedEventId);
    } else {
      setProductCosts([]);
      return;
    }
    const { data } = await query.order("created_at", { ascending: false });
    setProductCosts((data as any[]) || []);
  };

  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductName("");
    setProductQty("");
    setProductUnitCost("");
    setShowProductDialog(true);
  };

  const openEditProduct = (p: ProductCost) => {
    setEditingProduct(p);
    setProductName(p.product_name);
    setProductQty(String(p.quantity));
    setProductUnitCost(String(p.unit_cost));
    setShowProductDialog(true);
  };

  const saveProduct = async () => {
    if (!user || !productName.trim() || !productQty || !productUnitCost) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบ", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        product_name: productName.trim(),
        quantity: Number(productQty),
        unit_cost: Number(productUnitCost),
      };
      if (editingProduct) {
        await supabase.from("event_product_costs" as any).update(payload).eq("id", editingProduct.id);
        toast({ title: "อัปเดตต้นทุนสินค้าสำเร็จ" });
      } else {
        payload.user_id = user.id;
        payload.event_group_id = selectedGroupId || null;
        payload.event_id = selectedGroupId ? null : selectedEventId || null;
        await supabase.from("event_product_costs" as any).insert(payload);
        toast({ title: "เพิ่มต้นทุนสินค้าสำเร็จ" });
      }
      setShowProductDialog(false);
      fetchProductCosts();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteProduct = async (id: string) => {
    await supabase.from("event_product_costs" as any).delete().eq("id", id);
    fetchProductCosts();
    toast({ title: "ลบต้นทุนสินค้าสำเร็จ" });
  };

  // Other Expenses CRUD
  const fetchOtherExpenses = async () => {
    if (!user) return;
    let query = supabase
      .from("event_other_expenses" as any)
      .select("*")
      .eq("user_id", user.id);

    if (selectedGroupId) {
      query = query.eq("event_group_id", selectedGroupId);
    } else if (selectedEventId) {
      query = query.eq("event_id", selectedEventId);
    } else {
      setOtherExpenses([]);
      return;
    }

    const { data } = await query.order("created_at", { ascending: false });
    setOtherExpenses((data as any[]) || []);
  };

  const openCreateExpense = () => {
    setEditingExpense(null);
    setExpenseDesc("");
    setExpenseAmount("");
    setExpenseDate("");
    setExpenseRefundable(false);
    setShowExpenseDialog(true);
  };

  const openEditExpense = (exp: OtherExpense) => {
    setEditingExpense(exp);
    setExpenseDesc(exp.description);
    setExpenseAmount(String(exp.amount));
    setExpenseDate(exp.expense_date || "");
    setExpenseRefundable(exp.is_refundable);
    setShowExpenseDialog(true);
  };

  const saveExpense = async () => {
    if (!user) return;
    try {
      const payload: any = {
        user_id: user.id,
        description: expenseDesc.trim(),
        amount: Number(expenseAmount),
        expense_date: expenseDate || null,
        is_refundable: expenseRefundable,
        refund_status: expenseRefundable ? "pending" : "not_applicable",
      };
      if (editingExpense) {
        await supabase.from("event_other_expenses" as any).update(payload).eq("id", editingExpense.id);
        toast({ title: "อัปเดตค่าใช้จ่ายอื่นสำเร็จ" });
      } else {
        payload.event_group_id = selectedGroupId || null;
        payload.event_id = selectedGroupId ? null : selectedEventId || null;
        await supabase.from("event_other_expenses" as any).insert(payload);
        toast({ title: "เพิ่มค่าใช้จ่ายอื่นสำเร็จ" });
      }
      setShowExpenseDialog(false);
      fetchOtherExpenses();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteExpense = async (id: string) => {
    await supabase.from("event_other_expenses" as any).delete().eq("id", id);
    fetchOtherExpenses();
    toast({ title: "ลบค่าใช้จ่ายอื่นสำเร็จ" });
  };

  const toggleRefundStatus = async (exp: OtherExpense) => {
    const newStatus = exp.refund_status === "refunded" ? "pending" : "refunded";
    await supabase.from("event_other_expenses" as any).update({
      refund_status: newStatus,
      refunded_at: newStatus === "refunded" ? new Date().toISOString() : null,
    }).eq("id", exp.id);
    fetchOtherExpenses();
    toast({ title: newStatus === "refunded" ? "ทำเครื่องหมายว่าได้รับคืนแล้ว" : "ยกเลิกสถานะได้รับคืน" });
  };

  // Event Notes CRUD
  const fetchEventNotes = async () => {
    if (!user) return;
    let query = supabase
      .from("event_notes" as any)
      .select("*")
      .eq("user_id", user.id);

    if (selectedGroupId) {
      query = query.eq("event_group_id", selectedGroupId);
    } else if (selectedEventId) {
      query = query.eq("event_id", selectedEventId);
    } else {
      setEventNotes([]);
      return;
    }

    const { data } = await query.order("created_at", { ascending: false });
    setEventNotes((data as any[]) || []);
  };

  const openCreateNote = () => {
    setEditingNote(null);
    setNoteText("");
    setNoteType("general");
    setShowNoteDialog(true);
  };

  const openEditNote = (note: EventNote) => {
    setEditingNote(note);
    setNoteText(note.note_text);
    setNoteType(note.note_type);
    setShowNoteDialog(true);
  };

  const saveNote = async () => {
    if (!user) return;
    try {
      const payload: any = {
        user_id: user.id,
        note_text: noteText.trim(),
        note_type: noteType,
      };
      if (editingNote) {
        await supabase.from("event_notes" as any).update(payload).eq("id", editingNote.id);
        toast({ title: "อัปเดตหมายเหตุสำเร็จ" });
      } else {
        payload.event_group_id = selectedGroupId || null;
        payload.event_id = selectedGroupId ? null : selectedEventId || null;
        await supabase.from("event_notes" as any).insert(payload);
        toast({ title: "เพิ่มหมายเหตุสำเร็จ" });
      }
      setShowNoteDialog(false);
      fetchEventNotes();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteNote = async (id: string) => {
    await supabase.from("event_notes" as any).delete().eq("id", id);
    fetchEventNotes();
    toast({ title: "ลบหมายเหตุสำเร็จ" });
  };

  const toggleNoteResolved = async (note: EventNote) => {
    const newResolved = !note.is_resolved;
    await supabase.from("event_notes" as any).update({
      is_resolved: newResolved,
      resolved_at: newResolved ? new Date().toISOString() : null,
      note_type: newResolved ? "resolved" : "general",
    }).eq("id", note.id);
    fetchEventNotes();
    toast({ title: newResolved ? "ทำเครื่องหมายว่าเรียบร้อยแล้ว" : "ยกเลิกสถานะเรียบร้อย" });
  };

  // Reminders CRUD
  const fetchReminders = async () => {
    if (!user) return;
    let query = supabase
      .from("event_reminders" as any)
      .select("*")
      .eq("user_id", user.id);

    if (selectedGroupId) {
      query = query.eq("event_group_id", selectedGroupId);
    } else if (selectedEventId) {
      query = query.eq("event_id", selectedEventId);
    } else {
      setReminders([]);
      return;
    }

    const { data } = await query.order("due_date", { ascending: true });
    setReminders((data as any[]) || []);
  };

  const openCreateReminder = (prefillType?: string, prefillTitle?: string, prefillAmount?: number) => {
    setEditingReminder(null);
    setReminderType(prefillType || "billing");
    setReminderTitle(prefillTitle || "");
    setReminderDesc("");
    setReminderAmount(prefillAmount ? String(prefillAmount) : "");
    setReminderDueDate("");
    setReminderBeforeDays("1");
    setReminderNotifyLine(true);
    setShowReminderDialog(true);
  };

  const openEditReminder = (r: EventReminder) => {
    setEditingReminder(r);
    setReminderType(r.reminder_type);
    setReminderTitle(r.title);
    setReminderDesc(r.description || "");
    setReminderAmount(String(r.amount));
    setReminderDueDate(r.due_date);
    setReminderBeforeDays(String(r.remind_before_days));
    setReminderNotifyLine(r.notify_line);
    setShowReminderDialog(true);
  };

  const saveReminder = async () => {
    if (!user || !reminderTitle.trim() || !reminderDueDate) {
      toast({ title: "กรุณากรอกชื่อและวันครบกำหนด", variant: "destructive" });
      return;
    }
    try {
      const payload: any = {
        user_id: user.id,
        reminder_type: reminderType,
        title: reminderTitle.trim(),
        description: reminderDesc.trim() || null,
        amount: Number(reminderAmount) || 0,
        due_date: reminderDueDate,
        remind_before_days: Number(reminderBeforeDays) || 1,
        notify_line: reminderNotifyLine,
      };
      if (editingReminder) {
        await supabase.from("event_reminders" as any).update(payload).eq("id", editingReminder.id);
        toast({ title: "อัปเดตแจ้งเตือนสำเร็จ" });
      } else {
        payload.event_group_id = selectedGroupId || null;
        payload.event_id = selectedGroupId ? null : selectedEventId || null;
        await supabase.from("event_reminders" as any).insert(payload);
        toast({ title: "สร้างแจ้งเตือนสำเร็จ" });
      }
      setShowReminderDialog(false);
      fetchReminders();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteReminder = async (id: string) => {
    await supabase.from("event_reminders" as any).delete().eq("id", id);
    fetchReminders();
    toast({ title: "ลบแจ้งเตือนสำเร็จ" });
  };

  const toggleReminderCompleted = async (r: EventReminder) => {
    const newCompleted = !r.is_completed;
    await supabase.from("event_reminders" as any).update({
      is_completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq("id", r.id);
    fetchReminders();
    toast({ title: newCompleted ? "ทำเครื่องหมายว่าเสร็จแล้ว" : "ยกเลิกสถานะเสร็จ" });
  };

  const sendReminderNow = async (r: EventReminder) => {
    setSendingReminder(r.id);
    try {
      const { error } = await supabase.functions.invoke("send-reminder-line", {
        body: { reminder_id: r.id },
      });
      if (error) throw error;
      toast({ title: "ส่งแจ้งเตือนไปที่ LINE สำเร็จ" });
      fetchReminders();
    } catch (err) {
      console.error(err);
      toast({ title: "ส่งแจ้งเตือนไม่สำเร็จ", variant: "destructive" });
    } finally {
      setSendingReminder(null);
    }
  };


  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    fetchFinancials(eventId);
  };

  // Group CRUD
  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupName("");
    setGroupTag("");
    setSelectedEventIds([]);
    setShowGroupDialog(true);
  };

  const openEditGroup = (group: EventGroup) => {
    setEditingGroup(group);
    setGroupName(group.group_name);
    setGroupTag(group.project_tag);
    setSelectedEventIds(group.readygo_event_ids);
    setShowGroupDialog(true);
  };

  const saveGroup = async () => {
    if (!user || !groupName.trim() || selectedEventIds.length === 0) {
      toast({ title: "กรุณากรอกชื่อกลุ่มและเลือกอีเวนท์อย่างน้อย 1 รายการ", variant: "destructive" });
      return;
    }

    try {
      if (editingGroup) {
        await supabase
          .from("event_groups")
          .update({
            group_name: groupName.trim(),
            project_tag: groupTag.trim() || groupName.trim(),
            readygo_event_ids: selectedEventIds,
          })
          .eq("id", editingGroup.id);
        toast({ title: "อัปเดตกลุ่มสำเร็จ" });
      } else {
        await supabase.from("event_groups").insert({
          user_id: user.id,
          group_name: groupName.trim(),
          project_tag: groupTag.trim() || groupName.trim(),
          readygo_event_ids: selectedEventIds,
        });
        toast({ title: "สร้างกลุ่มสำเร็จ" });
      }
      setShowGroupDialog(false);
      fetchGroups();
    } catch (err) {
      console.error(err);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const deleteGroup = async (groupId: string) => {
    await supabase.from("event_groups").delete().eq("id", groupId);
    if (selectedGroupId === groupId) {
      setSelectedGroupId("");
      setFinancialData(null);
    }
    fetchGroups();
    toast({ title: "ลบกลุ่มสำเร็จ" });
  };

  const toggleEventInGroup = (eventId: string) => {
    setSelectedEventIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  if (authLoading || !user) return null;

  const stats = financialData?.registrationStats;
  const summary = financialData?.summary;

  const localOtherIncomeTotal = otherIncomes.reduce((s, i) => s + Number(i.amount), 0);
  const totalProductCost = productCosts.reduce((s, p) => s + Number(p.total_cost || p.quantity * p.unit_cost), 0);
  const totalOtherExpenses = otherExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const refundableTotal = otherExpenses.filter(e => e.is_refundable && e.refund_status === 'pending').reduce((s, e) => s + Number(e.amount), 0);

  const revenueBreakdown = stats ? [
    { name: "ค่าสมัคร", value: Number(stats.actual_revenue || 0) },
    { name: "OTO1", value: Number(stats.oto1_revenue || 0) },
    { name: "OTO2", value: Number(stats.oto2_revenue || 0) },
    ...(summary?.totalOtherIncome ? [{ name: "รายได้อื่น (Ready-go)", value: Number(summary.totalOtherIncome) }] : []),
    ...(localOtherIncomeTotal > 0 ? [{ name: "รายได้อื่น (บันทึกเอง)", value: localOtherIncomeTotal }] : []),
  ].filter(d => d.value > 0) : [];

  const categoryData = stats?.category_breakdown
    ? Object.entries(stats.category_breakdown).map(([name, value]) => ({ name, value: Number(value) }))
    : [];

  const totalRevenue = Number(stats?.actual_revenue || 0) + Number(stats?.total_oto_revenue || 0) + Number(summary?.totalOtherIncome || 0) + localOtherIncomeTotal;
  const totalCost = Number(localExpenses || 0) + totalProductCost + totalOtherExpenses;
  const combinedProfit = totalRevenue - totalCost;

  const pnlBarData = [
    { name: "รายได้", รายได้: totalRevenue, ค่าใช้จ่าย: 0, กำไร: 0, ขาดทุน: 0 },
    { name: "ค่าใช้จ่าย", รายได้: 0, ค่าใช้จ่าย: totalCost, กำไร: 0, ขาดทุน: 0 },
    { name: "กำไร/ขาดทุน", รายได้: 0, ค่าใช้จ่าย: 0, กำไร: combinedProfit > 0 ? combinedProfit : 0, ขาดทุน: combinedProfit < 0 ? Math.abs(combinedProfit) : 0 },
  ];

  const displayTitle = selectedGroupId
    ? groups.find(g => g.id === selectedGroupId)?.group_name
    : financialData?.event?.title;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">P&L อีเวนท์ (Ready-go.fun)</h1>
            <p className="text-primary-foreground/80 text-sm">รายได้จากค่าสมัคร OTO และค่าใช้จ่ายรวม</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Event Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">เลือกอีเวนท์เดี่ยว</label>
                <Select value={selectedEventId} onValueChange={handleEventSelect} disabled={loadingEvents}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingEvents ? "กำลังโหลด..." : "เลือกอีเวนท์จาก Ready-go.fun"} />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.title} — {ev.event_date ? new Date(ev.event_date).toLocaleDateString("th-TH") : "ไม่มีวันที่"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => {
                if (selectedGroupId) {
                  const g = groups.find(g => g.id === selectedGroupId);
                  if (g) fetchGroupFinancials(g);
                } else if (selectedEventId) {
                  fetchFinancials(selectedEventId);
                }
              }} disabled={(!selectedEventId && !selectedGroupId) || loadingData}>
                <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Festival / Group Section */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5" />
                กลุ่มอีเวนท์ (Festival)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={openCreateGroup} disabled={events.length === 0}>
                <FolderPlus className="h-4 w-4 mr-1" />
                สร้างกลุ่ม
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                ยังไม่มีกลุ่มอีเวนท์ — สร้างกลุ่มเพื่อรวม P&L หลายอีเวนท์เข้าด้วยกัน
              </p>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => {
                  const memberEvents = events.filter(e => group.readygo_event_ids.includes(e.id));
                  const isSelected = selectedGroupId === group.id;
                  return (
                    <div
                      key={group.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                      }`}
                      onClick={() => fetchGroupFinancials(group)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{group.group_name}</span>
                          <Badge variant="secondary" className="text-xs">{group.readygo_event_ids.length} อีเวนท์</Badge>
                          {group.project_tag && (
                            <Badge variant="outline" className="text-xs font-mono">{group.project_tag}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {memberEvents.map(e => e.title).join(", ") || "ยังไม่โหลดรายชื่ออีเวนท์"}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditGroup(group)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteGroup(group.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Group Create/Edit Dialog */}
        <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingGroup ? "แก้ไขกลุ่มอีเวนท์" : "สร้างกลุ่มอีเวนท์ใหม่"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">ชื่อกลุ่ม (Festival)</label>
                <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="เช่น Terminal21 Festival" />
              </div>
              <div>
                <label className="text-sm font-medium">Project Tag (สำหรับจับคู่ค่าใช้จ่าย)</label>
                <Input value={groupTag} onChange={e => setGroupTag(e.target.value)} placeholder="เช่น EVT-Terminal21" />
                <p className="text-xs text-muted-foreground mt-1">ใช้จับคู่กับ project_tag ในรายการค่าใช้จ่าย</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">เลือกอีเวนท์ที่อยู่ในกลุ่ม ({selectedEventIds.length} เลือกแล้ว)</label>
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className={`flex items-center gap-3 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-muted/50 ${
                        selectedEventIds.includes(ev.id) ? "bg-primary/5" : ""
                      }`}
                      onClick={() => toggleEventInGroup(ev.id)}
                    >
                      <Checkbox checked={selectedEventIds.includes(ev.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.event_date ? new Date(ev.event_date).toLocaleDateString("th-TH") : "ไม่มีวันที่"}
                          {ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGroupDialog(false)}>ยกเลิก</Button>
              <Button onClick={saveGroup} disabled={!groupName.trim() || selectedEventIds.length === 0}>
                {editingGroup ? "บันทึก" : "สร้างกลุ่ม"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loadingData && (
          <div className="flex justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {financialData && stats && summary && !loadingData && (
          <>
            {/* Display title */}
            {displayTitle && (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{displayTitle}</h2>
                {selectedGroupId && <Badge variant="secondary">กลุ่มรวม</Badge>}
                {financialData.events && financialData.events.length > 1 && (
                  <span className="text-sm text-muted-foreground">({financialData.events.length} อีเวนท์)</span>
                )}
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ผู้สมัคร</p>
                      <p className="text-xl font-bold">{stats.total_registrations}</p>
                      {stats.sponsored_count > 0 && (
                        <p className="text-xs text-muted-foreground">สปอนเซอร์ {stats.sponsored_count}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">รายได้รวม</p>
                      <p className="text-xl font-bold text-green-600">฿{formatNumber(totalRevenue)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">ค่าใช้จ่ายรวม</p>
                      <p className="text-xl font-bold text-red-600">฿{formatNumber(totalCost)}</p>
                      {localExpenses > 0 && (
                        <p className="text-xs text-muted-foreground">จากสลิป ฿{formatNumber(localExpenses)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`bg-gradient-to-br border-0 ${combinedProfit >= 0 ? "from-green-600/10 to-green-600/5" : "from-red-600/10 to-red-600/5"}`}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${combinedProfit >= 0 ? "bg-green-600/20" : "bg-red-600/20"}`}>
                      <DollarSign className={`h-5 w-5 ${combinedProfit >= 0 ? "text-green-700" : "text-red-700"}`} />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">กำไร/ขาดทุน</p>
                      <p className={`text-xl font-bold ${combinedProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {combinedProfit >= 0 ? "+" : ""}฿{formatNumber(combinedProfit)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue & OTO Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    รายละเอียดรายได้
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm">ค่าสมัคร (ก่อนส่วนลด)</span>
                    <span className="font-medium">฿{formatNumber(stats.total_registration_fee)}</span>
                  </div>
                  {stats.total_discount > 0 && (
                    <div className="flex justify-between py-2 border-b text-red-600">
                      <span className="text-sm">ส่วนลด</span>
                      <span className="font-medium">-฿{formatNumber(stats.total_discount)}</span>
                    </div>
                  )}
                  {stats.total_cruzee_discount > 0 && (
                    <div className="flex justify-between py-2 border-b text-red-600">
                      <span className="text-sm">Cruzee Discount</span>
                      <span className="font-medium">-฿{formatNumber(stats.total_cruzee_discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b font-semibold">
                    <span className="text-sm">ค่าสมัครสุทธิ</span>
                    <span className="text-green-600">฿{formatNumber(stats.actual_revenue)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" /> OTO1
                      <span className="text-xs text-muted-foreground">({stats.oto1_count} ชิ้น)</span>
                    </span>
                    <span className="font-medium">฿{formatNumber(stats.oto1_revenue)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4" /> OTO2
                      <span className="text-xs text-muted-foreground">({stats.oto2_count} ชิ้น)</span>
                    </span>
                    <span className="font-medium">฿{formatNumber(stats.oto2_revenue)}</span>
                  </div>
                  {summary.totalOtherIncome > 0 && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm">รายได้อื่นๆ (Ready-go)</span>
                      <span className="font-medium">฿{formatNumber(summary.totalOtherIncome)}</span>
                    </div>
                  )}
                  {localOtherIncomeTotal > 0 && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-sm">รายได้อื่นๆ (บันทึกเอง)</span>
                      <span className="font-medium">฿{formatNumber(localOtherIncomeTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 font-bold text-lg border-t-2">
                    <span>รายได้รวมทั้งหมด</span>
                    <span className="text-green-600">฿{formatNumber(totalRevenue)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Revenue Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">สัดส่วนรายได้</CardTitle>
                </CardHeader>
                <CardContent>
                  {revenueBreakdown.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          dataKey="value"
                        >
                          {revenueBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => `฿${formatNumber(v)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-12">ไม่มีข้อมูลรายได้</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* P&L Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">กราฟเปรียบเทียบ รายได้ vs ค่าใช้จ่าย</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pnlBarData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `฿${formatNumber(v)}`} />
                    <Legend />
                    <Bar dataKey="รายได้" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ค่าใช้จ่าย" fill="hsl(0, 70%, 55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="กำไร" fill="hsl(150, 70%, 40%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ขาดทุน" fill="hsl(0, 80%, 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Breakdown & Expenses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    ผู้สมัครแยกตามประเภท
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <div className="space-y-2">
                      {categoryData
                        .sort((a, b) => b.value - a.value)
                        .map((cat, i) => (
                          <div key={cat.name} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-sm">{cat.name}</span>
                            </div>
                            <span className="font-medium">{cat.value} คน</span>
                          </div>
                        ))}
                      <div className="flex justify-between pt-3 font-bold border-t-2">
                        <span>รวม</span>
                        <span>{stats.completed_count} คน</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">ไม่มีข้อมูล</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingDown className="h-5 w-5" />
                    ค่าใช้จ่าย
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {summary.totalExpenses > 0 && (
                      <div className="flex justify-between py-2 border-b opacity-50">
                        <span className="text-sm">จาก Ready-go.fun <span className="text-xs">(ไม่นับรวม)</span></span>
                        <span className="font-medium text-muted-foreground line-through">฿{formatNumber(summary.totalExpenses)}</span>
                      </div>
                    )}
                    {localExpenses > 0 && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm">จากสลิป (ระบบนี้)</span>
                        <span className="font-medium text-red-600">฿{formatNumber(localExpenses)}</span>
                      </div>
                    )}
                    {totalProductCost > 0 && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm">ต้นทุนสินค้า</span>
                        <span className="font-medium text-red-600">฿{formatNumber(totalProductCost)}</span>
                      </div>
                    )}
                    {totalOtherExpenses > 0 && (
                      <div className="flex justify-between py-2 border-b">
                        <span className="text-sm">ค่าใช้จ่ายอื่นๆ</span>
                        <span className="font-medium text-red-600">฿{formatNumber(totalOtherExpenses)}</span>
                      </div>
                    )}
                    {refundableTotal > 0 && (
                      <div className="flex justify-between py-1 text-xs">
                        <span className="text-amber-500">⏳ รอทวงคืน (มัดจำ/ประกัน)</span>
                        <span className="text-amber-500">฿{formatNumber(refundableTotal)}</span>
                      </div>
                    )}
                    {(financialData.financials || [])
                      .filter(f => f.category === "expense")
                      .map((f, i) => (
                        <div key={i} className="flex justify-between py-1.5 text-sm text-muted-foreground">
                          <span>{f.description || f.subcategory || "รายจ่าย"}</span>
                          <span>฿{formatNumber(f.amount)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between pt-3 font-bold border-t-2">
                      <span>ค่าใช้จ่ายรวม</span>
                      <span className="text-red-600">฿{formatNumber(totalCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Other Income Management */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HandCoins className="h-5 w-5" />
                    รายได้อื่นๆ (บันทึกเอง)
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={openCreateIncome}>
                    <Plus className="h-4 w-4 mr-1" />
                    เพิ่มรายได้
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {otherIncomes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ยังไม่มีรายได้อื่นๆ เช่น ค่าสปอนเซอร์ ค่าเช่าบูธ ฯลฯ
                  </p>
                ) : (
                  <div className="space-y-2">
                    {otherIncomes.map((income) => (
                      <div key={income.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{income.description}</p>
                          {income.income_date && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(income.income_date).toLocaleDateString("th-TH")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className="font-semibold text-green-600">฿{formatNumber(income.amount)}</span>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditIncome(income)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteIncome(income.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-bold border-t-2">
                      <span>รายได้อื่นรวม</span>
                      <span className="text-green-600">฿{formatNumber(localOtherIncomeTotal)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Product Cost Management */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5" />
                    ต้นทุนสินค้า
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={openCreateProduct}>
                    <Plus className="h-4 w-4 mr-1" />
                    เพิ่มสินค้า
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {productCosts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ยังไม่มีรายการต้นทุนสินค้า เช่น เสื้อ สติกเกอร์ ของที่ระลึก
                  </p>
                ) : (
                  <div className="space-y-2">
                    {productCosts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.quantity} ชิ้น × ฿{formatNumber(p.unit_cost)} = ฿{formatNumber(p.quantity * p.unit_cost)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className="font-semibold text-red-600">฿{formatNumber(p.quantity * p.unit_cost)}</span>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditProduct(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteProduct(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-bold border-t-2">
                      <span>ต้นทุนสินค้ารวม</span>
                      <span className="text-red-600">฿{formatNumber(totalProductCost)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Other Expenses Management */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    ค่าใช้จ่ายอื่นๆ (บันทึกเอง)
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={openCreateExpense}>
                    <Plus className="h-4 w-4 mr-1" />
                    เพิ่มรายจ่าย
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {otherExpenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ยังไม่มีค่าใช้จ่ายอื่นๆ เช่น ค่ามัดจำสถานที่ ค่าประกัน ฯลฯ
                  </p>
                ) : (
                  <div className="space-y-2">
                    {otherExpenses.map((exp) => (
                      <div key={exp.id} className={`flex items-center justify-between p-3 rounded-lg border ${exp.is_refundable && exp.refund_status === 'refunded' ? 'bg-muted/50 opacity-60' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{exp.description}</p>
                            {exp.is_refundable && (
                              <Badge variant={exp.refund_status === 'refunded' ? 'secondary' : 'outline'} className="text-xs">
                                {exp.refund_status === 'refunded' ? '✅ ได้คืนแล้ว' : '⏳ รอทวงคืน'}
                              </Badge>
                            )}
                          </div>
                          {exp.expense_date && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(exp.expense_date).toLocaleDateString("th-TH")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <span className={`font-semibold ${exp.is_refundable && exp.refund_status === 'refunded' ? 'text-muted-foreground line-through' : 'text-red-600'}`}>
                            ฿{formatNumber(exp.amount)}
                          </span>
                          {exp.is_refundable && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleRefundStatus(exp)} title={exp.refund_status === 'refunded' ? 'ยกเลิกสถานะ' : 'ทำเครื่องหมายว่าได้คืน'}>
                              {exp.refund_status === 'refunded' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <CircleDot className="h-3.5 w-3.5 text-amber-500" />}
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditExpense(exp)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteExpense(exp.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-bold border-t-2">
                      <span>ค่าใช้จ่ายอื่นรวม</span>
                      <span className="text-red-600">฿{formatNumber(totalOtherExpenses)}</span>
                    </div>
                    {refundableTotal > 0 && (
                      <div className="flex justify-between text-sm text-amber-500">
                        <span>⏳ รอทวงคืน</span>
                        <span>฿{formatNumber(refundableTotal)}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Event Notes */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    หมายเหตุ
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={openCreateNote}>
                    <Plus className="h-4 w-4 mr-1" />
                    เพิ่มหมายเหตุ
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {eventNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    ยังไม่มีหมายเหตุ เช่น สิ่งที่ต้องติดตาม การทวงคืนมัดจำ ฯลฯ
                  </p>
                ) : (
                  <div className="space-y-2">
                    {eventNotes.map((note) => (
                      <div key={note.id} className={`flex items-start justify-between p-3 rounded-lg border ${note.is_resolved ? 'bg-muted/50 opacity-60' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={note.is_resolved ? 'secondary' : note.note_type === 'deposit' ? 'outline' : note.note_type === 'action_required' ? 'destructive' : 'default'} className="text-xs">
                              {note.is_resolved ? '✅ เรียบร้อย' : note.note_type === 'deposit' ? '💰 มัดจำ/ประกัน' : note.note_type === 'action_required' ? '⚠️ ต้องดำเนินการ' : '📝 ทั่วไป'}
                            </Badge>
                          </div>
                          <p className={`text-sm ${note.is_resolved ? 'line-through text-muted-foreground' : ''}`}>{note.note_text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(note.created_at).toLocaleDateString("th-TH", { day: 'numeric', month: 'short', year: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleNoteResolved(note)} title={note.is_resolved ? 'ยกเลิก' : 'เรียบร้อยแล้ว'}>
                            {note.is_resolved ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <CircleDot className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditNote(note)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteNote(note.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={showIncomeDialog} onOpenChange={setShowIncomeDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingIncome ? "แก้ไขรายได้อื่น" : "เพิ่มรายได้อื่น"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">รายละเอียด</label>
                    <Input value={incomeDesc} onChange={e => setIncomeDesc(e.target.value)} placeholder="เช่น ค่าสปอนเซอร์ บริษัท ABC" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">จำนวนเงิน (บาท)</label>
                    <Input type="number" value={incomeAmount} onChange={e => setIncomeAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">วันที่ (ไม่บังคับ)</label>
                    <Input type="date" value={incomeDate} onChange={e => setIncomeDate(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowIncomeDialog(false)}>ยกเลิก</Button>
                  <Button onClick={saveIncome} disabled={!incomeDesc.trim() || !incomeAmount}>
                    {editingIncome ? "บันทึก" : "เพิ่ม"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Product Cost Dialog */}
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "แก้ไขต้นทุนสินค้า" : "เพิ่มต้นทุนสินค้า"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">ชื่อสินค้า</label>
                    <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="เช่น เสื้อวิ่ง, สติกเกอร์, เหรียญรางวัล" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">จำนวน (ชิ้น)</label>
                    <Input type="number" value={productQty} onChange={e => setProductQty(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">ต้นทุนต่อชิ้น (บาท)</label>
                    <Input type="number" value={productUnitCost} onChange={e => setProductUnitCost(e.target.value)} placeholder="0" />
                  </div>
                  {productQty && productUnitCost && (
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ต้นทุนรวม:</span>
                        <span className="font-bold">฿{formatNumber(Number(productQty) * Number(productUnitCost))}</span>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowProductDialog(false)}>ยกเลิก</Button>
                  <Button onClick={saveProduct} disabled={!productName.trim() || !productQty || !productUnitCost}>
                    {editingProduct ? "บันทึก" : "เพิ่ม"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Other Expense Dialog */}
            <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingExpense ? "แก้ไขค่าใช้จ่ายอื่น" : "เพิ่มค่าใช้จ่ายอื่น"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">รายละเอียด</label>
                    <Input value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} placeholder="เช่น ค่ามัดจำสถานที่ ค่าประกัน" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">จำนวนเงิน (บาท)</label>
                    <Input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">วันที่ (ไม่บังคับ)</label>
                    <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={expenseRefundable}
                      onCheckedChange={(v) => setExpenseRefundable(!!v)}
                    />
                    <label className="text-sm font-medium cursor-pointer" onClick={() => setExpenseRefundable(!expenseRefundable)}>
                      เป็นค่ามัดจำ/ประกัน (ทวงคืนได้)
                    </label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>ยกเลิก</Button>
                  <Button onClick={saveExpense} disabled={!expenseDesc.trim() || !expenseAmount}>
                    {editingExpense ? "บันทึก" : "เพิ่ม"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Event Note Dialog */}
            <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingNote ? "แก้ไขหมายเหตุ" : "เพิ่มหมายเหตุ"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">ประเภท</label>
                    <Select value={noteType} onValueChange={setNoteType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">📝 ทั่วไป</SelectItem>
                        <SelectItem value="deposit">💰 มัดจำ/ประกัน</SelectItem>
                        <SelectItem value="action_required">⚠️ ต้องดำเนินการ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">รายละเอียด</label>
                    <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="เช่น มัดจำสถานที่ 10,000 บาท ทวงคืนหลังจบงาน" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNoteDialog(false)}>ยกเลิก</Button>
                  <Button onClick={saveNote} disabled={!noteText.trim()}>
                    {editingNote ? "บันทึก" : "เพิ่ม"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        {!selectedEventId && !selectedGroupId && !loadingEvents && (
          <Card>
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">เลือกอีเวนท์หรือกลุ่มด้านบนเพื่อดูสรุป P&L</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default EventPnL;
