import React from 'react';

interface MobileProgressBarProps {
  currentStep: number;
  steps: { number: number; title: string }[];
}

export function MobileProgressBar({ currentStep, steps }: MobileProgressBarProps) {
  return (
    <div className="mobile-progress-bar">
      <div className="progress-steps">
        {steps.map((step, index) => {
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;
          
          return (
            <React.Fragment key={step.number}>
              {/* Connector line before step (except for first step) */}
              {index > 0 && (
                <div 
                  className={`progress-connector ${
                    isActive || isCompleted || steps[index - 1].number < currentStep 
                      ? 'progress-connector-active' 
                      : ''
                  }`}
                />
              )}
              
              {/* Step circle */}
              <div className="progress-step-container">
                <div 
                  className={`progress-step ${
                    isActive 
                      ? 'progress-step-active' 
                      : isCompleted 
                        ? 'progress-step-completed' 
                        : ''
                  }`}
                >
                  {isCompleted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>
                <div 
                  className={`progress-step-title ${
                    isActive 
                      ? 'progress-step-title-active' 
                      : isCompleted 
                        ? 'progress-step-title-completed' 
                        : ''
                  }`}
                >
                  {step.title}
                </div>
              </div>
              
              {/* Connector line after step (except for last step) */}
              {index < steps.length - 1 && (
                <div 
                  className={`progress-connector ${
                    isCompleted ? 'progress-connector-active' : ''
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
