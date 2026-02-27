'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WelcomeStep, BusinessStep, ProductsStep, StaffStep, LaunchStep } from './onboarding';

/* ---------- Steps are defined in ./onboarding/ ---------- */
// WelcomeStep   components/onboarding/WelcomeStep.tsx
// BusinessStep  components/onboarding/BusinessStep.tsx
// ProductsStep  components/onboarding/ProductsStep.tsx
// StaffStep     components/onboarding/StaffStep.tsx
// LaunchStep    components/onboarding/LaunchStep.tsx

const STEP_COMPONENTS = [WelcomeStep, BusinessStep, ProductsStep, StaffStep, LaunchStep];

export default function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const isFirst = currentStep === 0;
  const isLast = currentStep === STEP_COMPONENTS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('onboarding-complete', 'true');
      onComplete?.();
      router.push('/pos');
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding-complete', 'true');
    onComplete?.();
    router.push('/pos');
  };

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accentSoft via-white to-accentSoft p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2 flex-1 mr-4">
            {STEP_COMPONENTS.map((_, index) => (
              <div key={index} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent/80 transition-all duration-500"
                  style={{ width: index <= currentStep ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <span className="text-xs font-mono text-black/30">{currentStep + 1}/{STEP_COMPONENTS.length}</span>
        </div>

        {/* Card */}
        <div className="relative rounded-3xl border border-black/5 bg-white/95 p-8 shadow-xl shadow-black/5 backdrop-blur-sm text-center overflow-hidden">
          <StepComponent
            onNext={handleNext}
            onBack={handleBack}
            isFirst={isFirst}
            isLast={isLast}
          />
        </div>

        {/* Skip */}
        <div className="mt-4 text-center">
          <button onClick={handleSkip} className="text-sm text-black/30 hover:text-black/50 transition">
            Skip setup - go to POS
          </button>
        </div>
      </div>
    </div>
  );
}
