import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

export interface PulsatingButtonProps {
  text: string;
  primary?: boolean;
  onClick?: () => void;
}

export const PulsatingButton: React.FC<PulsatingButtonProps> = ({
  text,
  primary = true,
  onClick,
}) => {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`relative group overflow-hidden rounded-full font-bold transition-all tracking-wide cursor-pointer ${
        primary
          ? 'px-8 py-4 text-white shadow-lg'
          : 'px-6 py-3 text-neutral-300 hover:text-white bg-white/5 border border-white/10'
      }`}
    >
      {primary && (
        <>
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-80 group-hover:opacity-100 transition-opacity duration-300 blur-xl pointer-events-none" />
          <span className="absolute inset-px bg-neutral-950 rounded-full z-0" />
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 rounded-full z-0" />
        </>
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {text}
        {primary && (
          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        )}
      </span>
    </motion.button>
  );
};

export default PulsatingButton;
