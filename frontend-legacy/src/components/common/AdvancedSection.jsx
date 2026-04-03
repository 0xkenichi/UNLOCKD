// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdvancedSection({ title = 'Advanced', children, className = '' }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`advanced-section ${className}`}>
      <button
        type="button"
        className="advanced-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="advanced-trigger-icon" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="advanced-content"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
