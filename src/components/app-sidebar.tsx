import { Home, Upload, AlertTriangle, Database, Settings, LogOut, Download } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "หน้าหลัก", url: "/", icon: Home },
  { title: "อัพโหลดหลายไฟล์", url: "/bulk-upload", icon: Upload },
  { title: "ตรวจสอบรายการซ้ำ", url: "/duplicate-checker", icon: AlertTriangle },
  { title: "แปลงข้อมูล", url: "/data-migration", icon: Database },
  { title: "จัดการข้อมูลหลัก", url: "/master-data", icon: Settings },
];

export function AppSidebar() {
  const { open } = useSidebar();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleExportCSV = () => {
    // This will be handled by the Index page component
    // We'll emit a custom event that the Index page can listen to
    window.dispatchEvent(new CustomEvent('export-csv'));
  };

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={open ? "" : "sr-only"}>
            เมนูหลัก
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/"}
                      className="hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-semibold"
                    >
                      <item.icon className="h-5 w-5" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={open ? "" : "sr-only"}>
            เครื่องมือ
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleExportCSV} tooltip="ส่งออก CSV">
                  <Download className="h-5 w-5" />
                  {open && <span>ส่งออก CSV</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="ออกจากระบบ">
              <LogOut className="h-5 w-5" />
              {open && <span>ออกจากระบบ</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
