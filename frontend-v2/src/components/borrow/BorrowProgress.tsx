import React from 'react';

export function BorrowProgress({ currentStep }: { currentStep: string }) {
  const steps = [
    { id: 'select-stream', label: 'Select Stream' },
    { id: 'approve-operator', label: 'Approve' },
    { id: 'review', label: 'Set Amount' },
    { id: 'borrow', label: 'Review' }
  ];
  
  return (
    <div className="flex justify-between items-center mb-6 overflow-x-auto pb-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center space-x-2 shrink-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep === step.id ? 'bg-[#1D9E75] text-white' : 'bg-white/10 text-[#9C9A92]'}`}>
            {i + 1}
          </div>
          <span className={`text-sm pr-2 ${currentStep === step.id ? 'text-[#E8E6DF]' : 'text-[#9C9A92]'}`}>{step.label}</span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-white/10 mx-2" />}
        </div>
      ))}
    </div>
  );
}
