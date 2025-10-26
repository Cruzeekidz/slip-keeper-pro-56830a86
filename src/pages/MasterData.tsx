import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit2, Trash2, Check, X } from "lucide-react";
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

const MasterData = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [subcategories, setSubcategories] = useState<MasterItem[]>([]);
  const [projects, setProjects] = useState<MasterItem[]>([]);

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
        .select('category, subcategory, project')
        .eq('user_id', user.id);

      if (error) throw error;

      // Count categories
      const categoryMap = new Map<string, number>();
      const subcategoryMap = new Map<string, number>();
      const projectMap = new Map<string, number>();

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
      const columnName = type === 'category' ? 'category' : type === 'subcategory' ? 'subcategory' : 'project';
      
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
      const columnName = type === 'category' ? 'category' : type === 'subcategory' ? 'subcategory' : 'project';
      
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('user_id', user.id)
        .eq(columnName, name);

      if (error) throw error;

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="category">ประเภท</TabsTrigger>
            <TabsTrigger value="subcategory">ประเภทย่อย</TabsTrigger>
            <TabsTrigger value="project">โปรเจค</TabsTrigger>
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
