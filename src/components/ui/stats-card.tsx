import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  variant?: "income" | "expense" | "default";
  className?: string;
}

export function StatsCard({ 
  title, 
  value, 
  icon, 
  trend, 
  trendUp, 
  variant = "default",
  className 
}: StatsCardProps) {
  return (
    <Card className={cn(
      "p-6 bg-gradient-card shadow-card hover:shadow-elevated transition-all duration-300 border-0",
      variant === "income" && "bg-gradient-success",
      variant === "expense" && "bg-expense/5 border-expense/20",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn(
            "text-2xl font-bold",
            variant === "income" && "text-success-foreground",
            variant === "expense" && "text-expense",
            variant === "default" && "text-foreground"
          )}>
            {value}
          </p>
          {trend && (
            <p className={cn(
              "text-xs flex items-center gap-1",
              trendUp ? "text-success" : "text-expense"
            )}>
              <span>{trendUp ? "↗" : "↘"}</span>
              {trend}
            </p>
          )}
        </div>
        <div className={cn(
          "h-12 w-12 rounded-lg flex items-center justify-center",
          variant === "income" && "bg-success-foreground/20 text-success-foreground",
          variant === "expense" && "bg-expense/20 text-expense",
          variant === "default" && "bg-primary/20 text-primary"
        )}>
          {icon}
        </div>
      </div>
    </Card>
  );
}