import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit3, Trash2, Plus, Search, Users, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";

interface PayeeGroup {
  id: string;
  payee_pattern: string;
  group_name: string;
  created_at: string;
}

interface PayeeUsage {
  payee: string;
  count: number;
  totalAmount: number;
  group_name: string | null;
}

const PayeeGroupManagement = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [payeeGroups, setPayeeGroups] = useState<PayeeGroup[]>([]);
  const [ungroupedPayees, setUngroupedPayees] = useState<PayeeUsage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState<{ open: boolean; payee: string; groupName: string; id?: string }>({ open: false, payee: "", groupName: "" });
  const [autoSuggestRunning, setAutoSuggestRunning] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [groupsRes, expensesRes] = await Promise.all([
        supabase.from('payee_groups').select('*').order('group_name'),
        supabase.from('expenses').select('merchant, receiver, payee_group, amount'),
      ]);

      setPayeeGroups(groupsRes.data || []);

      // Build payee usage map
      const payeeMap = new Map<string, { count: number; totalAmount: number; group_name: string | null }>();
      (expensesRes.data || []).forEach(exp => {
        const payees = [exp.merchant, exp.receiver].filter(Boolean) as string[];
        payees.forEach(p => {
          const existing = payeeMap.get(p) || { count: 0, totalAmount: 0, group_name: null };
          existing.count++;
          existing.totalAmount += exp.amount;
          if (exp.payee_group) existing.group_name = exp.payee_group;
          payeeMap.set(p, existing);
        });
      });

      // Find ungrouped payees with 2+ occurrences
      const groupPatterns = new Set((groupsRes.data || []).map(g => g.payee_pattern));
      const ungrouped: PayeeUsage[] = [];
      payeeMap.forEach((data, payee) => {
        if (data.count >= 2 && !groupPatterns.has(payee)) {
          ungrouped.push({ payee, ...data });
        }
      });
      ungrouped.sort((a, b) => b.count - a.count);
      setUngroupedPayees(ungrouped);
    } catch (error) {
      console.error('Error fetching payee groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const existingGroupNames = useMemo(() =>
    [...new Set(payeeGroups.map(g => g.group_name))].sort(),
    [payeeGroups]
  );

  const filteredGroups = useMemo(() => {
    if (!searchTerm) return payeeGroups;
    const lower = searchTerm.toLowerCase();
    return payeeGroups.filter(g =>
      g.payee_pattern.toLowerCase().includes(lower) ||
      g.group_name.toLowerCase().includes(lower)
    );
  }, [payeeGroups, searchTerm]);

  const filteredUngrouped = useMemo(() => {
    if (!searchTerm) return ungroupedPayees;
    const lower = searchTerm.toLowerCase();
    return ungroupedPayees.filter(p => p.payee.toLowerCase().includes(lower));
  }, [ungroupedPayees, searchTerm]);

  const handleSave = async () => {
    if (!editDialog.payee || !editDialog.groupName || !user) return;
    try {
      if (editDialog.id) {
        // Update existing
        const { error } = await supabase.from('payee_groups')
          .update({ group_name: editDialog.groupName, payee_pattern: editDialog.payee })
          .eq('id', editDialog.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from('payee_groups')
          .upsert({ user_id: user.id, payee_pattern: editDialog.payee, group_name: editDialog.groupName },
            { onConflict: 'user_id,payee_pattern' });
        if (error) throw error;
      }

      // Update all expenses with this payee
      await supabase.from('expenses')
        .update({ payee_group: editDialog.groupName })
        .or(`merchant.eq.${editDialog.payee},receiver.eq.${editDialog.payee}`)
        .eq('user_id', user.id);

      toast({ title: "บันทึกสำเร็จ" });
      setEditDialog({ open: false, payee: "", groupName: "" });
      fetchData();
    } catch (error) {
      console.error('Error saving payee group:', error);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, payeePattern: string) => {
    if (!confirm(`ลบกลุ่ม "${payeePattern}" ออกจากระบบ?`)) return;
    try {
      const { error } = await supabase.from('payee_groups').delete().eq('id', id);
      if (error) throw error;

      // Clear payee_group on matching expenses
      if (user) {
        await supabase.from('expenses')
          .update({ payee_group: null })
          .or(`merchant.eq.${payeePattern},receiver.eq.${payeePattern}`)
          .eq('user_id', user.id);
      }

      toast({ title: "ลบสำเร็จ" });
      fetchData();
    } catch (error) {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const autoSuggestAll = async () => {
    if (!user || ungroupedPayees.length === 0) return;
    setAutoSuggestRunning(true);
    try {
      let assigned = 0;
      for (const payee of ungroupedPayees) {
        if (payee.group_name) {
          // This payee already has a group on some expenses, save as payee_group
          await supabase.from('payee_groups')
            .upsert({ user_id: user.id, payee_pattern: payee.payee, group_name: payee.group_name },
              { onConflict: 'user_id,payee_pattern' });

          await supabase.from('expenses')
            .update({ payee_group: payee.group_name })
            .or(`merchant.eq.${payee.payee},receiver.eq.${payee.payee}`)
            .eq('user_id', user.id);

          assigned++;
        }
      }
      toast({ title: "Auto-suggest สำเร็จ", description: `จับคู่ได้ ${assigned} รายการ` });
      fetchData();
    } catch (error) {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally {
      setAutoSuggestRunning(false);
    }
  };

  // Group summary
  const groupSummary = useMemo(() => {
    const map = new Map<string, { patterns: string[]; count: number }>();
    payeeGroups.forEach(g => {
      const existing = map.get(g.group_name) || { patterns: [], count: 0 };
      existing.patterns.push(g.payee_pattern);
      existing.count++;
      map.set(g.group_name, existing);
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count);
  }, [payeeGroups]);

  if (authLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">กำลังโหลด...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-4 md:p-6 shadow-elevated">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-primary-foreground hover:bg-white/20">
            <ArrowLeft className="h-4 w-4 mr-2" />กลับ
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Users className="h-5 w-5" />จัดการกลุ่มผู้รับเงิน</h1>
            <p className="text-primary-foreground/80 text-sm">Payee Group Management</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">กลุ่มทั้งหมด</div>
            <div className="text-2xl font-bold text-foreground">{groupSummary.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Payee ที่จับคู่แล้ว</div>
            <div className="text-2xl font-bold text-foreground">{payeeGroups.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Payee ซ้ำยังไม่จัดกลุ่ม</div>
            <div className="text-2xl font-bold text-warning">{ungroupedPayees.length}</div>
          </Card>
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหา payee หรือกลุ่ม..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <Button onClick={() => setEditDialog({ open: true, payee: "", groupName: "" })}>
            <Plus className="h-4 w-4 mr-2" />เพิ่มกลุ่มใหม่
          </Button>
          {ungroupedPayees.length > 0 && (
            <Button variant="outline" onClick={autoSuggestAll} disabled={autoSuggestRunning}>
              <Zap className="h-4 w-4 mr-2" />{autoSuggestRunning ? "กำลัง..." : "Auto-suggest ทั้งหมด"}
            </Button>
          )}
        </div>

        {/* Ungrouped Payees */}
        {filteredUngrouped.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              Payee ซ้ำที่ยังไม่มีกลุ่ม ({filteredUngrouped.length})
            </h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้รับเงิน</TableHead>
                    <TableHead className="text-right">จำนวนครั้ง</TableHead>
                    <TableHead className="text-right">ยอดรวม</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUngrouped.slice(0, 20).map(payee => (
                    <TableRow key={payee.payee}>
                      <TableCell className="font-medium">{payee.payee}</TableCell>
                      <TableCell className="text-right">{payee.count} ครั้ง</TableCell>
                      <TableCell className="text-right text-expense">฿{payee.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setEditDialog({ open: true, payee: payee.payee, groupName: payee.group_name || "" })}>
                          <Plus className="h-3 w-3 mr-1" />จัดกลุ่ม
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Existing Groups */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">กลุ่มที่มีอยู่ ({filteredGroups.length})</h2>
          {filteredGroups.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">ยังไม่มีกลุ่ม — เริ่มจับคู่ payee ซ้ำด้านบน</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้รับเงิน (Payee Pattern)</TableHead>
                    <TableHead>กลุ่ม</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map(g => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.payee_pattern}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{g.group_name}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditDialog({ open: true, payee: g.payee_pattern, groupName: g.group_name, id: g.id })} className="h-8 w-8 p-0">
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(g.id, g.payee_pattern)} className="h-8 w-8 p-0 text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Group Summary */}
        {groupSummary.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground">สรุปตามกลุ่ม</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupSummary.map(g => (
                <Card key={g.name} className="p-3 border">
                  <div className="font-semibold text-foreground">{g.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">{g.count} payee{g.count > 1 ? 's' : ''}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.patterns.slice(0, 3).map(p => (
                      <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                    ))}
                    {g.patterns.length > 3 && <Badge variant="outline" className="text-xs">+{g.patterns.length - 3}</Badge>}
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        )}
      </main>

      {/* Edit/Add Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => { if (!open) setEditDialog({ open: false, payee: "", groupName: "" }); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editDialog.id ? "แก้ไขกลุ่ม" : "เพิ่มกลุ่มผู้รับเงิน"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ผู้รับเงิน (Payee Pattern)</Label>
              <Input value={editDialog.payee} onChange={e => setEditDialog({ ...editDialog, payee: e.target.value })} placeholder="เช่น ลีสซิ่งกสิกรไทย" />
            </div>
            <div>
              <Label>ชื่อกลุ่ม</Label>
              <Combobox
                options={existingGroupNames}
                value={editDialog.groupName}
                onValueChange={v => setEditDialog({ ...editDialog, groupName: v })}
                placeholder="เช่น รถยนต์, บัตรเครดิต"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditDialog({ open: false, payee: "", groupName: "" })}>ยกเลิก</Button>
              <Button onClick={handleSave} disabled={!editDialog.payee || !editDialog.groupName}>บันทึก</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayeeGroupManagement;
