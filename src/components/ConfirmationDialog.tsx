import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { GameButton } from './GameButton';

interface ConfirmationDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export const ConfirmationDialog = ({ 
  onClose, 
  onConfirm, 
  title, 
  message 
}: ConfirmationDialogProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="menu-overlay"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="menu-card max-w-md"
      >
          <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-100 border-2 border-black">
                <AlertTriangle className="text-amber-600" size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight">{title}</h3>
                <p className="text-stone-600 font-medium">{message}</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <GameButton 
                onClick={onClose}
                variant="ghost"
                fullWidth
                className="border-2 border-black"
              >
                Cancel
              </GameButton>
              <GameButton 
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                variant="danger"
                fullWidth
                className="border-2 border-black"
              >
                Confirm
              </GameButton>
            </div>
          </motion.div>
      </motion.div>
    );
  };
