import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DataMigration() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const updateCategoryData = async () => {
    setLoading(true);
    try {
      // Update 'personal' to 'ส่วนตัว'
      const { error: error1 } = await supabase
        .from('expenses')
        .update({ category: 'ส่วนตัว' })
        .eq('category', 'personal');

      if (error1) throw error1;

      // Update 'company' to 'บริษัท'
      const { error: error2 } = await supabase
        .from('expenses')
        .update({ category: 'บริษัท' })
        .eq('category', 'company');

      if (error2) throw error2;

      toast({
        title: "อัพเดทสำเร็จ",
        description: "เปลี่ยนข้อมูลประเภท 'personal' เป็น 'ส่วนตัว' และ 'company' เป็น 'บริษัท' เรียบร้อยแล้ว",
      });

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error updating data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถอัพเดทข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateProjectData = async () => {
    setLoading(true);
    try {
      // Update 'personal' to 'ส่วนตัว' in project field
      const { error: error1 } = await supabase
        .from('expenses')
        .update({ project: 'ส่วนตัว' })
        .eq('project', 'personal');

      if (error1) throw error1;

      // Update 'company' to 'บริษัท' in project field
      const { error: error2 } = await supabase
        .from('expenses')
        .update({ project: 'บริษัท' })
        .eq('project', 'company');

      if (error2) throw error2;

      toast({
        title: "อัพเดทสำเร็จ",
        description: "เปลี่ยนข้อมูลโปรเจค 'personal' เป็น 'ส่วนตัว' และ 'company' เป็น 'บริษัท' เรียบร้อยแล้ว",
      });

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error updating data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถอัพเดทข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateAllData = async () => {
    setLoading(true);
    try {
      // Update category field
      await supabase
        .from('expenses')
        .update({ category: 'ส่วนตัว' })
        .eq('category', 'personal');

      await supabase
        .from('expenses')
        .update({ category: 'บริษัท' })
        .eq('category', 'company');

      // Update project field
      await supabase
        .from('expenses')
        .update({ project: 'ส่วนตัว' })
        .eq('project', 'personal');

      await supabase
        .from('expenses')
        .update({ project: 'บริษัท' })
        .eq('project', 'company');

      // Update subcategory field
      await supabase
        .from('expenses')
        .update({ subcategory: 'ส่วนตัว' })
        .eq('subcategory', 'personal');

      await supabase
        .from('expenses')
        .update({ subcategory: 'บริษัท' })
        .eq('subcategory', 'company');

      toast({
        title: "อัพเดทสำเร็จ",
        description: "เปลี่ยนข้อมูลทั้งหมด 'personal' เป็น 'ส่วนตัว' และ 'company' เป็น 'บริษัท' เรียบร้อยแล้ว",
      });

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error) {
      console.error('Error updating data:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถอัพเดทข้อมูลได้",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold text-foreground">อัพเดทข้อมูล</h1>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold mb-2">เปลี่ยนภาษาข้อมูล</h2>
            <p className="text-muted-foreground mb-4">
              เปลี่ยนข้อมูลจาก 'personal' เป็น 'ส่วนตัว' และ 'company' เป็น 'บริษัท'
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={updateCategoryData}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              อัพเดทข้อมูลประเภท (Category)
            </Button>

            <Button
              onClick={updateProjectData}
              disabled={loading}
              className="w-full"
              variant="secondary"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              อัพเดทข้อมูลโปรเจค (Project)
            </Button>

            <Button
              onClick={updateAllData}
              disabled={loading}
              className="w-full"
              variant="default"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              อัพเดททุกฟิลด์ (Category, Project, Subcategory)
            </Button>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>คำแนะนำ:</strong> กดปุ่ม "อัพเดททุกฟิลด์" เพื่ออัพเดทข้อมูลในทุกคอลัมน์ (ประเภท, โปรเจค, ประเภทย่อย) พร้อมกัน
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
