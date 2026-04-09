import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { GameButton } from './GameButton';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: ConfirmationDialogProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex flex-col items-center p-4 overflow-y-auto"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-parchment border-2 border-black p-8 max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] my-auto"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-100 border-2 border-black">
                <AlertTriangle className="text-amber-600" size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
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
      )}
    </AnimatePresence>
  );
};
