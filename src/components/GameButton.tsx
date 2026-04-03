import React from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { cn } from '../types';

interface GameButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'parchment';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const GameButton: React.FC<GameButtonProps> = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  fullWidth = false,
  disabled,
  icon,
  ...props 
}) => {
  const variants = {
    primary: "bg-black text-white border-black hover:bg-stone-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]",
    secondary: "bg-white text-black border-black hover:bg-stone-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
    danger: "bg-red-600 text-white border-black hover:bg-red-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.4)]",
    parchment: "bg-[#f4e4bc] text-stone-900 border-stone-800 hover:bg-[#ebd8a0] shadow-[4px_4px_0px_0px_rgba(68,44,20,0.4)]",
    ghost: "bg-transparent text-black border-transparent hover:bg-black/5 shadow-none"
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
    icon: "p-2"
  };

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.01 } : {}}
      whileTap={!disabled ? { 
        scale: 0.98,
        x: 2,
        y: 2,
        boxShadow: "0px 0px 0px 0px rgba(0,0,0,0)"
      } : {}}
      disabled={disabled}
      className={cn(
        "border-2 font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 select-none",
        "relative overflow-hidden",
        fullWidth ? "w-full" : "",
        disabled ? "opacity-50 cursor-not-allowed grayscale shadow-none" : "cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {/* Classic Bevel Highlight (Top/Left) */}
      {!disabled && variant !== 'ghost' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/30" />
          <div className="absolute top-0 left-0 bottom-0 w-[1px] bg-white/30" />
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-black/10" />
          <div className="absolute top-0 right-0 bottom-0 w-[1px] bg-black/10" />
        </div>
      )}
      <span className="relative z-10 flex items-center gap-2">
        {icon}
        {children}
      </span>
    </motion.button>
  );
};
