import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { eventOptionLabel, EventTagOption } from "@/lib/event-tags";
import { useEventOptions } from "@/hooks/useEventOptions";

interface EventTagPickerProps {
  value: string;
  onValueChange: (tag: string, option?: EventTagOption) => void;
  placeholder?: string;
  className?: string;
}

/** Select-only event picker. Shows real event names, stores EVT-<CODE>. No free typing. */
export function EventTagPicker({ value, onValueChange, placeholder = "เลือกงาน", className }: EventTagPickerProps) {
  const { options, nearby, loading } = useEventOptions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => options.find((o) => o.tag === value), [options, value]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nearby;
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.tag.toLowerCase().includes(q),
    );
  }, [query, options, nearby]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">
            {selected ? eventOptionLabel(selected) : loading ? "กำลังโหลดรายการงาน..." : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(420px,90vw)] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหางานนอกช่วงวันนี้..."
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {list.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground text-center">ไม่พบงานที่ค้นหา</p>
          )}
          {list.map((o) => (
            <button
              key={o.tag}
              type="button"
              onClick={() => {
                onValueChange(o.tag, o);
                setOpen(false);
                setQuery("");
              }}
              className={cn(
                "w-full flex items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent",
                value === o.tag && "bg-accent",
              )}
            >
              <Check className={cn("h-4 w-4 shrink-0", value === o.tag ? "opacity-100" : "opacity-0")} />
              <span className="flex-1 truncate">{eventOptionLabel(o)}</span>
              {!o.fixed && (
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                  {o.tag}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
