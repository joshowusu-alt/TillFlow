export interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  isFirst: boolean;
  isLast: boolean;
}
