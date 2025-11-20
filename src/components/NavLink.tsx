import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CustomNavLinkProps extends NavLinkProps {
  activeClassName?: string;
}

export function NavLink({ 
  className, 
  activeClassName = "bg-primary/10 text-primary font-semibold",
  ...props 
}: CustomNavLinkProps) {
  return (
    <RouterNavLink
      className={({ isActive, isPending, isTransitioning }) =>
        cn(
          typeof className === "function" 
            ? className({ isActive, isPending, isTransitioning }) 
            : className,
          isActive && activeClassName
        )
      }
      {...props}
    />
  );
}
