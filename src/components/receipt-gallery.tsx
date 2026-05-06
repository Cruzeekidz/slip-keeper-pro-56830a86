import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReceiptGalleryProps {
  receipts: Array<{
    id: string;
    receipt_url: string | null;
    description: string | null;
    amount: number;
    expense_date: string;
  }>;
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptGallery({ receipts, initialIndex, open, onOpenChange }: ReceiptGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const imageUrlsRef = useRef<Map<string, string>>(new Map());
  const objectUrlsRef = useRef<string[]>([]);
  const loadingIdsRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  // Filter receipts that have images
  const receiptsWithImages = useMemo(() => receipts.filter(r => r.receipt_url), [receipts]);

  const revokeObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    imageUrlsRef.current = new Map();
    loadingIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    return () => revokeObjectUrls();
  }, [revokeObjectUrls]);

  useEffect(() => {
    if (!open) {
      revokeObjectUrls();
      setImageUrls(new Map());
      setErrorIds(new Set());
      setZoom(1);
      return;
    }

    const safeIndex = Math.min(Math.max(initialIndex, 0), Math.max(receiptsWithImages.length - 1, 0));
    setCurrentIndex(safeIndex);
    setZoom(1);
  }, [initialIndex, open, receiptsWithImages.length, revokeObjectUrls]);

  const loadReceiptBlob = useCallback(async (receipt: typeof receiptsWithImages[number]) => {
    if (!receipt?.receipt_url || imageUrlsRef.current.has(receipt.id) || loadingIdsRef.current.has(receipt.id)) return;
    loadingIdsRef.current.add(receipt.id);
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .download(receipt.receipt_url);
      if (error || !data) throw error;
      const objectUrl = URL.createObjectURL(data);
      objectUrlsRef.current.push(objectUrl);
      setImageUrls((prev) => {
        const next = new Map(prev);
        next.set(receipt.id, objectUrl);
        imageUrlsRef.current = next;
        return next;
      });
    } catch (error) {
      console.error('Image download failed:', error);
      setErrorIds((prev) => {
        const next = new Set(prev);
        next.add(receipt.id);
        return next;
      });
    } finally {
      loadingIdsRef.current.delete(receipt.id);
    }
  }, []);

  // Lazy-load: download blobs for current image + 2 neighbors. This uses the same path as the working download button.
  useEffect(() => {
    if (!open || receiptsWithImages.length === 0) return;
    const total = receiptsWithImages.length;
    const targets = [currentIndex, currentIndex - 1, currentIndex + 1, currentIndex - 2, currentIndex + 2]
      .filter((i) => i >= 0 && i < total);

    targets.forEach((idx) => loadReceiptBlob(receiptsWithImages[idx]));
  }, [open, currentIndex, receiptsWithImages, loadReceiptBlob]);

  const scrollPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setZoom(1);
  }, []);

  const scrollNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, receiptsWithImages.length - 1));
    setZoom(1);
  }, [receiptsWithImages.length]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.5, 0.5));
  };

  const handleDownload = async () => {
    const currentReceipt = receiptsWithImages[currentIndex];
    if (!currentReceipt?.receipt_url) return;

    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .download(currentReceipt.receipt_url);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${currentReceipt.expense_date}_${currentReceipt.amount}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "ดาวน์โหลดสำเร็จ",
        description: "บันทึกไฟล์ภาพแล้ว",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "เกิดข้อผิดพลาด",
        description: "ไม่สามารถดาวน์โหลดไฟล์ได้",
        variant: "destructive",
      });
    }
  };

  const handleRetryCurrent = () => {
    const receipt = receiptsWithImages[currentIndex];
    if (!receipt) return;
    setErrorIds((prev) => {
      const next = new Set(prev);
      next.delete(receipt.id);
      return next;
    });
    loadReceiptBlob(receipt);
  };

  if (receiptsWithImages.length === 0) return null;

  const currentReceipt = receiptsWithImages[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl lg:max-w-4xl w-full h-[90vh] p-0 bg-black/95 overflow-hidden">
        <DialogTitle className="sr-only">ดูสลิป</DialogTitle>
        <DialogDescription className="sr-only">
          แสดงรูปภาพสลิป/ใบเสร็จที่อัปโหลดไว้ พร้อมตัวเลื่อนและปุ่มดาวน์โหลด
        </DialogDescription>
        <div className="relative w-full h-full flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between text-white">
              <div>
                <p className="text-sm opacity-80">
                  {currentIndex + 1} / {receiptsWithImages.length}
                </p>
                <h3 className="font-semibold">
                  {currentReceipt.description || 'ไม่มีรายละเอียด'}
                </h3>
                <p className="text-sm opacity-80">
                  ฿{currentReceipt.amount.toLocaleString()} • {new Date(currentReceipt.expense_date).toLocaleDateString('th-TH')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Main Image Area */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full">
              {receiptsWithImages.map((receipt, index) => {
                const url = imageUrls.get(receipt.id);
                const hasError = errorIds.has(receipt.id);
                return (
                  <div
                    key={receipt.id}
                    className={`${index === currentIndex ? 'flex' : 'hidden'} h-full items-center justify-center px-4 pt-24 pb-32 sm:pb-28`}
                  >
                    {hasError ? (
                      <div className="flex flex-col items-center gap-3 text-white text-center px-6">
                        <p className="text-base">โหลดภาพไม่สำเร็จ</p>
                        <p className="text-xs opacity-70 break-all max-w-md">{receipt.receipt_url}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRetryCurrent}
                          className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                        >
                          โหลดภาพใหม่
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleDownload}
                        >
                          <Download className="h-4 w-4 mr-2" />ดาวน์โหลดไฟล์
                        </Button>
                      </div>
                    ) : url ? (
                      <div className="w-full h-full overflow-auto flex items-center justify-center bg-background rounded-sm">
                        <img
                          key={url}
                          src={url}
                          alt={receipt.description || 'Receipt'}
                          className="block max-w-full max-h-full object-contain select-none animate-fade-in"
                          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s ease-out' }}
                          draggable={false}
                          onError={() => {
                            console.error('Image failed to load:', receipt.receipt_url);
                            setErrorIds((prev) => {
                              const next = new Set(prev);
                              next.add(receipt.id);
                              return next;
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center text-white">
                        <div className="text-center">
                          <p className="text-lg mb-2">กำลังโหลดภาพ...</p>
                          <p className="text-sm opacity-70">กรุณารอสักครู่</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation Arrows */}
          {receiptsWithImages.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollPrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12"
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 h-12 w-12"
                disabled={currentIndex === receiptsWithImages.length - 1}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                className="text-white hover:bg-white/20"
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-5 w-5" />
              </Button>
              <span className="text-white text-sm min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                className="text-white hover:bg-white/20"
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-5 w-5" />
              </Button>
              <div className="w-px h-8 bg-white/20 mx-2" />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDownload}
                className="text-white hover:bg-white/20"
              >
                <Download className="h-5 w-5" />
              </Button>
            </div>

            {/* Thumbnails */}
            {receiptsWithImages.length > 1 && (
              <div className="flex gap-2 mt-4 justify-center overflow-x-auto pb-2">
                {receiptsWithImages.map((receipt, index) => (
                  <button
                    key={receipt.id}
                    onClick={() => { setCurrentIndex(index); setZoom(1); }}
                    className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all ${
                      index === currentIndex
                        ? 'border-primary scale-110'
                        : 'border-white/20 opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={imageUrls.get(receipt.id)}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
