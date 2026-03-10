import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit2, Trash2, Check, X, Send, UserCheck, Store, Search, Filter, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MasterItem {
  name: string;
  count: number;
}

interface TransactionParty {
  name: string;
  count: number;
  missingCount: number;
}

const MasterData = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [subcategories, setSubcategories] = useState<MasterItem[]>([]);
  const [projects, setProjects] = useState<MasterItem[]>([]);
  const [events, setEvents] = useState<MasterItem[]>([]);
  const [receivers, setReceivers] = useState<TransactionParty[]>([]);
  const [merchants, setMerchants] = useState<TransactionParty[]>([]);
  const [senders, setSenders] = useState<TransactionParty[]>([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const [editingItem, setEditingItem] = useState<{ type: string; oldName: string; newName: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: string; name: string; count: number } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    } else if (user) {
      fetchMasterData();
    }
  }, [user, loading, navigate]);

  const fetchMasterData = async () => {
    if (!user) return;

    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('category, subcategory, project, event_name, receiver, merchant, sender')
        .eq('user_id', user.id);

      if (error) throw error;

      // Count categories
      const categoryMap = new Map<string, number>();
      const subcategoryMap = new Map<string, number>();
      const projectMap = new Map<string, number>();
      const eventMap = new Map<string, number>();
      const receiverMap = new Map<string, { count: number; missingCount: number }>();
      const merchantMap = new Map<string, { count: number; missingCount: number }>();
      const senderMap = new Map<string, { count: number; missingCount: number }>();
      
      let missingReceiverCount = 0;
      let missingMerchantCount = 0;
      let missingSenderCount = 0;

      expenses?.forEach((exp) => {
        if (exp.category) {
          categoryMap.set(exp.category, (categoryMap.get(exp.category) || 0) + 1);
        }
        if (exp.subcategory) {
          subcategoryMap.set(exp.subcategory, (subcategoryMap.get(exp.subcategory) || 0) + 1);
        }
        if (exp.project) {
          projectMap.set(exp.project, (projectMap.get(exp.project) || 0) + 1);
        }
        if (exp.event_name) {
          eventMap.set(exp.event_name, (eventMap.get(exp.event_name) || 0) + 1);
        }
        
        // Count receivers
        if (exp.receiver) {
          const current = receiverMap.get(exp.receiver) || { count: 0, missingCount: 0 };
          receiverMap.set(exp.receiver, { ...current, count: current.count + 1 });
        } else {
          missingReceiverCount++;
        }
        
        // Count merchants
        if (exp.merchant) {
          const current = merchantMap.get(exp.merchant) || { count: 0, missingCount: 0 };
          merchantMap.set(exp.merchant, { ...current, count: current.count + 1 });
        } else {
          missingMerchantCount++;
        }
        
        // Count senders
        if (exp.sender) {
          const current = senderMap.get(exp.sender) || { count: 0, missingCount: 0 };
          senderMap.set(exp.sender, { ...current, count: current.count + 1 });
        } else {
          missingSenderCount++;
        }
      });

      setCategories(
        Array.from(categoryMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      );

      setSubcategories(
        Array.from(subcategoryMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      );

      setProjects(
        Array.from(projectMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      );

      setEvents(
        Array.from(eventMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      );
      
      setReceivers([
        { name: '(ไม่ระบุ)', count: 0, missingCount: missingReceiverCount },
        ...Array.from(receiverMap.entries())
          .map(([name, data]) => ({ name, count: data.count, missingCount: 0 }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      ]);
      
      setMerchants([
        { name: '(ไม่ระบุ)', count: 0, missingCount: missingMerchantCount },
        ...Array.from(merchantMap.entries())
          .map(([name, data]) => ({ name, count: data.count, missingCount: 0 }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      ]);
      
      setSenders([
        { name: '(ไม่ระบุ)', count: 0, missingCount: missingSenderCount },
        ...Array.from(senderMap.entries())
          .map(([name, data]) => ({ name, count: data.count, missingCount: 0 }))
          .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      ]);

    } catch (error) {
      console.error('Error fetching master data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถโหลดข้อมูลได้",
        variant: "destructive",
      });
    }
  };

  const handleRename = async () => {
    if (!editingItem || !user) return;

    const { type, oldName, newName } = editingItem;
    
    if (!newName.trim() || newName === oldName) {
      setEditingItem(null);
      return;
    }

    try {
      if (type === 'receiver' && oldName === '(ไม่ระบุ)') {
        const { error } = await supabase
          .from('expenses')
          .update({ receiver: newName.trim() })
          .eq('user_id', user.id)
          .is('receiver', null);
        
        if (error) throw error;
        
        toast({
          title: "อัปเดตสำเร็จ",
          description: `เพิ่มชื่อผู้รับ "${newName}" เรียบร้อย`,
        });
        
        setEditingItem(null);
        fetchMasterData();
        return;
      }
      
      if (type === 'merchant' && oldName === '(ไม่ระบุ)') {
        const { error } = await supabase
          .from('expenses')
          .update({ merchant: newName.trim() })
          .eq('user_id', user.id)
          .is('merchant', null);
        
        if (error) throw error;
        
        toast({
          title: "อัปเดตสำเร็จ",
          description: `เพิ่มชื่อร้านค้า "${newName}" เรียบร้อย`,
        });
        
        setEditingItem(null);
        fetchMasterData();
        return;
      }
      
      if (type === 'sender' && oldName === '(ไม่ระบุ)') {
        const { error } = await supabase
          .from('expenses')
          .update({ sender: newName.trim() })
          .eq('user_id', user.id)
          .is('sender', null);
        
        if (error) throw error;
        
        toast({
          title: "อัปเดตสำเร็จ",
          description: `เพิ่มชื่อผู้โอน "${newName}" เรียบร้อย`,
        });
        
        setEditingItem(null);
        fetchMasterData();
        return;
      }
      
      const columnName = 
        type === 'category' ? 'category' : 
        type === 'subcategory' ? 'subcategory' : 
        type === 'project' ? 'project' :
        type === 'receiver' ? 'receiver' :
        type === 'merchant' ? 'merchant' :
        type === 'sender' ? 'sender' : '';
      
      if (!columnName) return;
      
      const { error } = await supabase
        .from('expenses')
        .update({ [columnName]: newName.trim() })
        .eq('user_id', user.id)
        .eq(columnName, oldName);

      if (error) throw error;

      toast({
        title: "เปลี่ยนชื่อสำเร็จ",
        description: `เปลี่ยนชื่อจาก "${oldName}" เป็น "${newName}" เรียบร้อย`,
      });

      setEditingItem(null);
      fetchMasterData();
    } catch (error) {
      console.error('Error renaming:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถเปลี่ยนชื่อได้",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem || !user) return;

    const { type, name } = deletingItem;

    try {
      const columnMap: Record<string, string> = {
        'category': 'category',
        'subcategory': 'subcategory',
        'project': 'project',
        'receiver': 'receiver',
        'merchant': 'merchant',
        'sender': 'sender'
      };
      
      const columnName = columnMap[type];
      if (!columnName) return;
      
      let deleteError = null;
      
      if (name === '(ไม่ระบุ)') {
        // @ts-ignore - Type inference issue with dynamic column names
        const result = await supabase
          .from('expenses')
          .delete()
          .eq('user_id', user.id)
          .is(columnName, null);
        deleteError = result.error;
      } else {
        // @ts-ignore - Type inference issue with dynamic column names
        const result = await supabase
          .from('expenses')
          .delete()
          .eq('user_id', user.id)
          .eq(columnName, name);
        deleteError = result.error;
      }
      
      if (deleteError) throw deleteError;

      toast({
        title: "ลบสำเร็จ",
        description: `ลบ "${name}" และรายการทั้งหมดที่เกี่ยวข้องเรียบร้อย`,
      });

      setDeletingItem(null);
      fetchMasterData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถลบได้",
        variant: "destructive",
      });
    }
  };

  const renderTransactionPartyList = (items: TransactionParty[], type: string, title: string) => {
    const filteredItems = items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMissing = !showMissingOnly || item.name === '(ไม่ระบุ)';
      return matchesSearch && matchesMissing;
    });
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>จำนวนทั้งหมด: {items.length} รายการ</CardDescription>
          <div className="flex gap-2 mt-4">
            <Input
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button
              variant={showMissingOnly ? "default" : "outline"}
              onClick={() => setShowMissingOnly(!showMissingOnly)}
            >
              {showMissingOnly ? "แสดงทั้งหมด" : "ที่ขาดข้อมูล"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredItems.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  {editingItem?.type === type && editingItem?.oldName === item.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingItem.newName}
                        onChange={(e) => setEditingItem({ ...editingItem, newName: e.target.value })}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename();
                          if (e.key === 'Escape') setEditingItem(null);
                        }}
                      />
                      <Button size="sm" onClick={handleRename} variant="ghost">
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button size="sm" onClick={() => setEditingItem(null)} variant="ghost">
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.name === '(ไม่ระบุ)' 
                            ? `${item.missingCount} รายการที่ขาดข้อมูล` 
                            : `ใช้งาน ${item.count} รายการ`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItem({ type, oldName: item.name, newName: item.name === '(ไม่ระบุ)' ? '' : item.name })}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {item.name !== '(ไม่ระบุ)' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingItem({ type, name: item.name, count: item.count })}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderItemList = (items: MasterItem[], type: string, title: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>จำนวนทั้งหมด: {items.length} รายการ</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">ไม่มีข้อมูล</p>
          ) : (
            items.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                {editingItem?.type === type && editingItem?.oldName === item.name ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editingItem.newName}
                      onChange={(e) => setEditingItem({ ...editingItem, newName: e.target.value })}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename();
                        if (e.key === 'Escape') setEditingItem(null);
                      }}
                    />
                    <Button size="sm" onClick={handleRename} variant="ghost">
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button size="sm" onClick={() => setEditingItem(null)} variant="ghost">
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">ใช้งาน {item.count} รายการ</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingItem({ type, oldName: item.name, newName: item.name })}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingItem({ type, name: item.name, count: item.count })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <p className="text-muted-foreground">กำลังโหลด...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary text-primary-foreground p-6 shadow-elevated">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              กลับ
            </Button>
            <div>
              <h1 className="text-2xl font-bold">จัดการข้อมูลหลัก</h1>
              <p className="text-primary-foreground/80 mt-1">
                จัดการประเภท ประเภทย่อย และโปรเจค
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <Tabs defaultValue="category" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="category">ประเภท</TabsTrigger>
            <TabsTrigger value="subcategory">ประเภทย่อย</TabsTrigger>
            <TabsTrigger value="project">โปรเจค</TabsTrigger>
            <TabsTrigger value="receivers">
              <UserCheck className="h-4 w-4 mr-2" />
              ผู้รับ
            </TabsTrigger>
            <TabsTrigger value="merchants">
              <Store className="h-4 w-4 mr-2" />
              ร้านค้า
            </TabsTrigger>
            <TabsTrigger value="senders">
              <Send className="h-4 w-4 mr-2" />
              ผู้โอน
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="category" className="mt-6">
            {renderItemList(categories, 'category', 'รายการประเภททั้งหมด')}
          </TabsContent>
          
          <TabsContent value="subcategory" className="mt-6">
            {renderItemList(subcategories, 'subcategory', 'รายการประเภทย่อยทั้งหมด')}
          </TabsContent>
          
          <TabsContent value="project" className="mt-6">
            {renderItemList(projects, 'project', 'รายการโปรเจคทั้งหมด')}
          </TabsContent>

          <TabsContent value="receivers" className="mt-6">
            {renderTransactionPartyList(receivers, 'receiver', 'รายการผู้รับทั้งหมด')}
          </TabsContent>

          <TabsContent value="merchants" className="mt-6">
            {renderTransactionPartyList(merchants, 'merchant', 'รายการร้านค้าทั้งหมด')}
          </TabsContent>

          <TabsContent value="senders" className="mt-6">
            {renderTransactionPartyList(senders, 'sender', 'รายการผู้โอนทั้งหมด')}
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบ "{deletingItem?.name}" หรือไม่?
              <br />
              <span className="text-destructive font-semibold">
                การลบจะทำให้รายการค่าใช้จ่ายทั้งหมด {deletingItem?.count} รายการที่เกี่ยวข้องถูกลบด้วย
              </span>
              <br />
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MasterData;
