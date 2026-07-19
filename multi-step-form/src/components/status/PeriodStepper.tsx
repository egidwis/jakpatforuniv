import { CheckCircle2 } from 'lucide-react';
import type { PeriodStepDef } from './airingPeriods';

/**
 * Stepper telanjang milik satu periode tayang: lingkaran + label saja,
 * tanpa helper text / tanggal / tombol — PeriodActionPanel pemilik tunggal
 * teks "sekarang gimana", tanggal ada di header baris periode.
 * Dipakai seragam untuk periode asli (5 step) maupun perpanjangan (4 step).
 */
export function PeriodStepper({ steps, currentStep }: { steps: PeriodStepDef[]; currentStep: number }) {
    return (
        <>
            {/* Desktop: horizontal. Kolom step sama lebar (flex-1) dan garis
                di-inset 50%/n dari kedua tepi = tepat pusat lingkaran pertama
                & terakhir — garis tidak menembus keluar step ujung. */}
            <div className="hidden md:block py-2">
                <div className="relative">
                    <div
                        className="absolute top-4"
                        style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}
                    >
                        <div className="absolute inset-x-0 top-0 h-px bg-gray-200" />
                        <div
                            className="absolute left-0 top-0 h-[2px] transition-all duration-500 bg-jfu-primary"
                            style={{ width: `${(Math.min(currentStep, steps.length - 1) / (steps.length - 1)) * 100}%` }}
                        />
                    </div>
                    <div className="relative flex">
                        {steps.map((step, index) => {
                            const isCompleted = index < currentStep;
                            const isCurrent = index === currentStep;
                            return (
                                <div key={step.key} className="flex-1 flex flex-col items-center">
                                    {/* Alas bg-white solid: tint completed hanya 12% opacity,
                                        tanpa alas ini garis progress di belakang ikut terlihat
                                        menembus lingkaran. */}
                                    <div className={`w-8 h-8 rounded-full z-10 bg-white ${!isCompleted && !isCurrent ? 'border border-gray-200' : ''}`}>
                                        <div
                                            className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-300 ${isCompleted
                                                ? 'bg-jfu-primary/[0.12] text-jfu-primary'
                                                : isCurrent
                                                    ? 'bg-jfu-primary text-white'
                                                    : 'text-gray-400'
                                                }`}
                                        >
                                            {isCompleted ? (
                                                <CheckCircle2 className="w-4 h-4" />
                                            ) : (
                                                <span className="font-semibold text-xs leading-none">{index + 1}</span>
                                            )}
                                        </div>
                                    </div>
                                    <span
                                        className={`text-xs font-semibold text-center mt-2 max-w-[110px] ${isCompleted || isCurrent ? 'text-[#1a1a1a]' : 'text-gray-400'
                                            }`}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile: vertikal */}
            <div className="md:hidden py-1">
                {steps.map((step, index) => {
                    const isCompleted = index < currentStep;
                    const isCurrent = index === currentStep;
                    const isLast = index === steps.length - 1;
                    return (
                        <div key={step.key} className="relative flex gap-3 items-start">
                            <div className="flex flex-col items-center">
                                <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center z-10 shrink-0 transition-all duration-300 ${isCompleted
                                        ? 'bg-jfu-primary/[0.12] text-jfu-primary'
                                        : isCurrent
                                            ? 'bg-jfu-primary text-white'
                                            : 'bg-white border border-gray-200 text-gray-400'
                                        }`}
                                >
                                    {isCompleted ? (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : (
                                        <span className="font-semibold text-[11px] leading-none">{index + 1}</span>
                                    )}
                                </div>
                                {!isLast && (
                                    <div className={`w-px flex-1 min-h-[14px] ${isCompleted ? 'bg-jfu-primary/40' : 'bg-gray-200'}`} />
                                )}
                            </div>
                            <span
                                className={`text-xs font-semibold pt-1.5 ${isLast ? '' : 'pb-3'} ${isCompleted || isCurrent ? 'text-[#1a1a1a]' : 'text-gray-400'
                                    }`}
                            >
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
