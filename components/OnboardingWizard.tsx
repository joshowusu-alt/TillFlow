'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingStep {
    title: string;
    description: string;
    icon: string;
    action?: { label: string; href: string };
    tip?: string;
}

const steps: OnboardingStep[] = [
    {
        title: 'Welcome to TillFlow',
        description: 'Sales made simple. Your complete point of sale system for managing sales, inventory, and accounting. Let\'s get you set up in minutes!',
        icon: '🎉',
        tip: 'The demo is pre-loaded with 21 products, 5 customers, and 4 suppliers so you can start exploring right away.',
    },
    {
        title: 'Configure Your Business',
        description: 'Set your business name, currency (we support GHS, NGN, KES, and 20+ currencies), and VAT settings.',
        icon: '⚙️',
        action: { label: 'Go to Settings', href: '/settings' },
        tip: 'Switch to Advanced Mode to unlock the full double-entry accounting views.',
    },
    {
        title: 'Add Your Products',
        description: 'Add your top-selling products with barcodes and prices. You can scan barcodes or enter them manually. Multi-unit selling (piece, carton, crate) is built in.',
        icon: '📦',
        action: { label: 'Add Products', href: '/products' },
        tip: 'Try the "Buy X Get Y Free" promo — Indomie Noodles already has one configured!',
    },
    {
        title: 'Create Staff Accounts',
        description: 'Add your cashiers and managers. Each role has different permissions for security.',
        icon: '👥',
        action: { label: 'Manage Users', href: '/users' },
        tip: 'Owners see everything. Cashiers can only access the POS and shifts.',
    },
    {
        title: 'Start Selling!',
        description: 'You\'re ready to go! Head to the POS to start processing sales. Try scanning a barcode, splitting payments, or selling on credit.',
        icon: '🚀',
        action: { label: 'Open POS', href: '/pos' },
        tip: 'TillFlow works offline too — try turning off WiFi and making a sale!',
    },
];

export default function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
    const [currentStep, setCurrentStep] = useState(0);
    const router = useRouter();

    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    const isFirst = currentStep === 0;

    const handleNext = () => {
        if (isLast) {
            // Mark onboarding complete
            localStorage.setItem('onboarding-complete', 'true');
            onComplete?.();
            router.push('/pos');
        } else {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleSkip = () => {
        localStorage.setItem('onboarding-complete', 'true');
        onComplete?.();
        router.push('/pos');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
            <div className="w-full max-w-lg">
                {/* Progress bar */}
                <div className="mb-8 flex gap-2">
                    {steps.map((_, index) => (
                        <div
                            key={index}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${index <= currentStep ? 'bg-emerald-500' : 'bg-white/50'
                                }`}
                        />
                    ))}
                </div>

                {/* Card */}
                <div className="card bg-white p-8 text-center">
                    <div className="text-6xl mb-6">{step.icon}</div>
                    <h1 className="text-2xl font-bold mb-4">{step.title}</h1>
                    <p className="text-black/60 mb-6 leading-relaxed">{step.description}</p>

                    {step.tip && (
                        <div className="mb-6 mx-auto max-w-sm rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                            <span className="font-medium">💡 Tip:</span> {step.tip}
                        </div>
                    )}

                    {step.action && (
                        <a
                            href={step.action.href}
                            className="inline-block mb-6 text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-4"
                        >
                            {step.action.label} →
                        </a>
                    )}

                    <div className="flex gap-3 justify-center">
                        {!isFirst && (
                            <button
                                onClick={() => setCurrentStep(currentStep - 1)}
                                className="btn-ghost px-6"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            className="btn-primary px-8"
                        >
                            {isLast ? 'Get Started' : 'Next'}
                        </button>
                    </div>
                </div>

                {/* Skip link */}
                <div className="mt-6 text-center">
                    <button
                        onClick={handleSkip}
                        className="text-sm text-black/40 hover:text-black/60"
                    >
                        Skip onboarding
                    </button>
                </div>
            </div>
        </div>
    );
}
