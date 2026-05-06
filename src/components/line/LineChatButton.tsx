import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LineChatButtonProps {
  lineUserId?: string | null;
  recipientName: string;
  context?: string;
  presets?: string[];
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  iconOnly?: boolean;
}

const DEFAULT_PRESETS = [
  "สวัสดีครับ ทางเราได้รับเอกสารเรียบร้อยแล้ว กำลังตรวจสอบและจะแจ้งกลับเร็วๆ นี้",
  "รบกวนส่งใบแจ้งหนี้/บิล มาให้ทางเราด้วยครับ",
  "ขอบคุณที่ส่งเอกสาร เราจะดำเนินการโอนเงินให้ภายใน 1-2 วันทำการ",
];

export function LineChatButton({
  lineUserId,
  recipientName,
  context,
  presets = DEFAULT_PRESETS,
  size = "sm",
  variant = "outline",
  label = "แชท LINE",
  iconOnly = false,
}: LineChatButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const linked = !!lineUserId;

  const send = async () => {
    if (!lineUserId || !message.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-line-message", {
        body: { line_user_id: lineUserId, message: message.trim() },
      });
      if (error) throw error;
      toast({ title: "ส่งข้อความ LINE สำเร็จ", description: `ถึง ${recipientName}` });
      setMessage("");
      setOpen(false);
    } catch (err: any) {
      toast({
        title: "ส่งไม่สำเร็จ",
        description: err.message || "เกิดข้อผิดพลาด",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (!linked) {
    return (
      <Button
        size={size}
        variant="ghost"
        disabled
        title="ยังไม่ได้ผูก LINE"
        className="text-muted-foreground"
      >
        <MessageCircle className="h-4 w-4" />
        {!iconOnly && <span className="ml-1 text-xs">ไม่ได้ผูก LINE</span>}
      </Button>
    );
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          if (context) setMessage(context);
        }}
        className="gap-1"
      >
        <MessageCircle className="h-4 w-4 text-green-500" />
        {!iconOnly && <span>{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-500" />
              ส่งข้อความ LINE
            </DialogTitle>
            <DialogDescription>
              ถึง <span className="font-semibold text-foreground">{recipientName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {presets.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground">ข้อความสำเร็จรูป (กดเพื่อเติม):</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setMessage(p)}
                      className="text-left text-xs bg-muted hover:bg-muted/70 px-2 py-1 rounded border border-border max-w-full"
                    >
                      {p.length > 50 ? `${p.slice(0, 50)}...` : p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="พิมพ์ข้อความที่จะส่งไปยัง LINE..."
              rows={6}
              maxLength={4900}
              autoFocus
            />
            <div className="text-xs text-muted-foreground text-right">{message.length}/4900</div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                ยกเลิก
              </Button>
              <Button onClick={send} disabled={!message.trim() || sending} className="gap-1">
                <Send className="h-4 w-4" />
                {sending ? "กำลังส่ง..." : "ส่งข้อความ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}