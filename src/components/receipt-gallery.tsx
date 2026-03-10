import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import useEmblaCarousel from 'embla-carousel-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: initialIndex });
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  // Filter receipts that have images
  const receiptsWithImages = receipts.filter(r => r.receipt_url);

  useEffect(() => {
    if (emblaApi) {
      emblaApi.scrollTo(initialIndex);
      setCurrentIndex(initialIndex);
    }
  }, [emblaApi, initialIndex, open]);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setCurrentIndex(emblaApi.selectedScrollSnap());
      setZoom(1); // Reset zoom when changing slides
    };

    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  // Load image URLs with signed URLs for private bucket
  useEffect(() => {
    const loadImageUrls = async () => {
      const newUrls = new Map<string, string>();
      
      for (const receipt of receiptsWithImages) {
        if (receipt.receipt_url && !imageUrls.has(receipt.id)) {
          try {
            // Use createSignedUrl for private bucket instead of getPublicUrl
            const { data, error } = await supabase.storage
              .from('receipts')
              .createSignedUrl(receipt.receipt_url, 3600); // Valid for 1 hour
            
            if (error) {
              console.error('Error creating signed URL:', error);
              continue;
            }
            
            if (data?.signedUrl) {
              newUrls.set(receipt.id, data.signedUrl);
            }
          } catch (error) {
            console.error('Error loading receipt:', error);
          }
        }
      }
      
      if (newUrls.size > 0) {
        setImageUrls(prev => new Map([...prev, ...newUrls]));
      }
    };

    if (open && receiptsWithImages.length > 0) {
      loadImageUrls();
    }
  }, [open, receiptsWithImages.length]); // เปลี่ยนจาก receiptsWithImages เป็น receiptsWithImages.length

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

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

  if (receiptsWithImages.length === 0) return null;

  const currentReceipt = receiptsWithImages[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 bg-black/95">
        <div className="relative h-full flex flex-col">
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
          <div className="flex-1 overflow-hidden" ref={emblaRef}>
            <div className="flex h-full touch-pan-y">
              {receiptsWithImages.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex-[0_0_100%] min-w-0 flex items-center justify-center p-12"
                >
                  <div 
                    className="relative transition-transform duration-300 ease-out"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    {imageUrls.get(receipt.id) ? (
                      <img
                        src={imageUrls.get(receipt.id)}
                        alt={receipt.description || 'Receipt'}
                        className="max-w-full max-h-full object-contain animate-fade-in"
                        draggable={false}
                        onError={(e) => {
                          console.error('Image failed to load:', receipt.receipt_url);
                          e.currentTarget.src = '';
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center text-white min-h-[200px]">
                        <div className="text-center">
                          <p className="text-lg mb-2">กำลังโหลดภาพ...</p>
                          <p className="text-sm opacity-70">กรุณารอสักครู่</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                    onClick={() => emblaApi?.scrollTo(index)}
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
