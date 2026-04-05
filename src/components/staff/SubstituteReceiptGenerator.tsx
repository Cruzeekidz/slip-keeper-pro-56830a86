import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Download, Upload, CheckCircle } from "lucide-react";
import SignatureCanvas from "./SignatureCanvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultData?: {
    description: string;
    amount: number;
    date: string;
    staffName: string;
    eventName?: string;
  };
  onGenerated?: (pdfUrl: string) => void;
}

const SubstituteReceiptGenerator = ({ open, onClose, defaultData, onGenerated }: Props) => {
  const [form, setForm] = useState({
    description: defaultData?.description || "",
    amount: defaultData?.amount || 0,
    date: defaultData?.date || new Date().toISOString().split("T")[0],
    paidTo: "",
    reason: "ไม่มีใบเสร็จรับเงิน เนื่องจากเป็นค่าใช้จ่ายที่ไม่สามารถออกใบเสร็จได้",
    staffName: defaultData?.staffName || "",
    eventName: defaultData?.eventName || "",
  });

  const [claimantSig, setClaimantSig] = useState("");
  const [approverSig, setApproverSig] = useState("");
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      let y = 20;

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("SUBSTITUTE RECEIPT", w / 2, y, { align: "center" });
      y += 6;
      doc.setFontSize(12);
      doc.text("(Substitute for Official Receipt)", w / 2, y, { align: "center" });
      y += 12;

      // Doc number & date
      const docNo = `SR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Document No: ${docNo}`, 20, y);
      doc.text(`Date: ${form.date}`, w - 20, y, { align: "right" });
      y += 10;

      // Line
      doc.setLineWidth(0.5);
      doc.line(20, y, w - 20, y);
      y += 8;

      // Details
      doc.setFontSize(11);
      const details = [
        ["Event / Project:", form.eventName || "-"],
        ["Description:", form.description],
        ["Paid To:", form.paidTo || "-"],
        ["Amount:", `${form.amount.toLocaleString()} THB`],
        ["Reason for Substitute:", form.reason],
        ["Requested By:", form.staffName],
      ];

      for (const [label, value] of details) {
        doc.setFont("helvetica", "bold");
        doc.text(label, 20, y);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(value, w - 80);
        doc.text(lines, 70, y);
        y += lines.length * 6 + 4;
      }

      y += 10;
      doc.line(20, y, w - 20, y);
      y += 15;

      // Signatures
      const sigW = 60;
      const sigH = 25;

      if (claimantSig) {
        doc.addImage(claimantSig, "PNG", 25, y, sigW, sigH);
      }
      if (approverSig) {
        doc.addImage(approverSig, "PNG", w - 25 - sigW, y, sigW, sigH);
      }

      y += sigH + 3;
      doc.line(25, y, 25 + sigW, y);
      doc.line(w - 25 - sigW, y, w - 25, y);
      y += 5;

      doc.setFontSize(9);
      doc.text("Claimant Signature", 25 + sigW / 2, y, { align: "center" });
      doc.text("Approver Signature", w - 25 - sigW / 2, y, { align: "center" });
      y += 4;
      doc.text(`(${form.staffName})`, 25 + sigW / 2, y, { align: "center" });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(
        "This document serves as a substitute for an official receipt where one cannot be obtained.",
        w / 2,
        280,
        { align: "center" }
      );

      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);

      // Download
      const a = document.createElement("a");
      a.href = url;
      a.download = `substitute-receipt-${docNo}.pdf`;
      a.click();

      onGenerated?.(url);
      onClose();
    } catch (err) {
      console.error("PDF generation error:", err);
    }
    setGenerating(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            สร้างใบแทนใบเสร็จ
          </DialogTitle>
          <DialogDescription>
            สำหรับค่าใช้จ่ายที่ไม่มีใบเสร็จทางการ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">วันที่</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">จำนวนเงิน (บาท)</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label className="text-xs">งาน/อีเวนท์</Label>
            <Input value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} />
          </div>

          <div>
            <Label className="text-xs">รายละเอียดค่าใช้จ่าย *</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="เช่น ค่าทางด่วน กรุงเทพ-ชลบุรี" />
          </div>

          <div>
            <Label className="text-xs">จ่ายให้</Label>
            <Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="ชื่อร้าน/บุคคล" />
          </div>

          <div>
            <Label className="text-xs">เหตุผลที่ไม่มีใบเสร็จ</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} />
          </div>

          <div>
            <Label className="text-xs">ชื่อผู้เบิก</Label>
            <Input value={form.staffName} onChange={(e) => setForm({ ...form, staffName: e.target.value })} />
          </div>

          <SignatureCanvas label="ลายเซ็นผู้เบิก" onSave={setClaimantSig} />
          <SignatureCanvas label="ลายเซ็นผู้อนุมัติ" onSave={setApproverSig} />

          <Button
            className="w-full"
            onClick={generatePDF}
            disabled={generating || !form.description || !form.amount}
          >
            <Download className="h-4 w-4 mr-2" />
            {generating ? "กำลังสร้าง..." : "สร้างและดาวน์โหลด PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubstituteReceiptGenerator;
