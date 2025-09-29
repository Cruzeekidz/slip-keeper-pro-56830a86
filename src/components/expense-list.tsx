import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Search, Filter, Calendar, Store, User, Building } from "lucide-react";

const mockExpenses = [
  {
    id: 1,
    date: "2024-01-15",
    amount: 1250,
    type: "expense",
    category: "company",
    project: "บูธขายของ",
    description: "ค่าอาหารและเครื่องดื่ม",
    hasReceipt: true,
  },
  {
    id: 2,
    date: "2024-01-14", 
    amount: 15000,
    type: "income",
    category: "company",
    project: "ขายออนไลน์",
    description: "ขายสินค้าออนไลน์",
    hasReceipt: true,
  },
  {
    id: 3,
    date: "2024-01-13",
    amount: 800,
    type: "expense", 
    category: "personal",
    project: "-",
    description: "ค่าน้ำมันรถ",
    hasReceipt: true,
  },
  {
    id: 4,
    date: "2024-01-12",
    amount: 5500,
    type: "income",
    category: "company", 
    project: "ขายตั๋วกิจกรรม",
    description: "ขายตั๋วคอนเสิร์ต",
    hasReceipt: false,
  },
];

export function ExpenseList() {
  return (
    <Card className="p-6 bg-gradient-card shadow-card">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">รายการเคลื่อนไหว</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              กรอง
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ค้นหา..." className="pl-10" />
          </div>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="ประเภท" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="income">รายรับ</SelectItem>
              <SelectItem value="expense">รายจ่าย</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="หมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="personal">ส่วนตัว</SelectItem>
              <SelectItem value="company">บริษัท</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="โปรเจ็ค" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="booth">บูธขายของ</SelectItem>
              <SelectItem value="online">ขายออนไลน์</SelectItem>
              <SelectItem value="event">ขายตั๋วกิจกรรม</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Expense List */}
        <div className="space-y-3">
          {mockExpenses.map((expense) => (
            <Card key={expense.id} className="p-4 hover:shadow-card transition-shadow border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    expense.type === "income" 
                      ? "bg-success/20 text-success" 
                      : "bg-expense/20 text-expense"
                  }`}>
                    {expense.hasReceipt ? (
                      <Receipt className="h-5 w-5" />
                    ) : (
                      <Calendar className="h-5 w-5" />
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{expense.description}</h3>
                      <Badge variant={expense.type === "income" ? "default" : "secondary"}>
                        {expense.type === "income" ? "รายรับ" : "รายจ่าย"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {expense.date}
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {expense.category === "personal" ? (
                          <User className="h-3 w-3" />
                        ) : (
                          <Building className="h-3 w-3" />
                        )}
                        {expense.category === "personal" ? "ส่วนตัว" : "บริษัท"}
                      </div>
                      
                      {expense.project !== "-" && (
                        <div className="flex items-center gap-1">
                          <Store className="h-3 w-3" />
                          {expense.project}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className={`text-lg font-semibold ${
                    expense.type === "income" ? "text-success" : "text-expense"
                  }`}>
                    {expense.type === "income" ? "+" : "-"}฿{expense.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Card>
  );
}