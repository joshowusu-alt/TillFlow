import { getArkeselWhatsAppDiagnostics } from '@/lib/notifications/providers/arkesel-whatsapp';
import { getMetaWhatsAppDiagnostics } from '@/lib/notifications/providers/meta-whatsapp';
import { isValidGhanaPhone } from '@/lib/phone/ghana-phone';

export type MerchantSummaryStatus = {
  smsLine: string;
  smsTone: 'success' | 'pending' | 'neutral';
  whatsappLine: string;
  whatsappTone: 'success' | 'pending' | 'neutral';
  helperLine: string | null;
  whatsappAutomationConnected: boolean;
};

export function getMerchantDailySummaryStatus(input: {
  summaryEnabled: boolean;
  ownerPhone?: string | null;
}) {
  const meta = getMetaWhatsAppDiagnostics();
  const arkesel = getArkeselWhatsAppDiagnostics();
  const whatsappAutomationConnected =
    meta.deliveryMode === 'AUTOMATED_META' || arkesel.arkeselConfigured;

  const hasPhone = isValidGhanaPhone(input.ownerPhone);

  let smsLine = 'SMS scheduled delivery is available for daily owner summaries.';
  let smsTone: MerchantSummaryStatus['smsTone'] = 'neutral';

  if (input.summaryEnabled && hasPhone) {
    smsLine = 'SMS scheduled delivery is active.';
    smsTone = 'success';
  } else if (input.summaryEnabled && !hasPhone) {
    smsLine = 'SMS scheduled delivery is pending setup — add an owner phone number.';
    smsTone = 'pending';
  } else if (!input.summaryEnabled) {
    smsLine = 'SMS scheduled delivery is off until you enable Daily Owner Summary.';
    smsTone = 'neutral';
  }

  let whatsappLine = 'WhatsApp preview and manual follow-up are available.';
  let whatsappTone: MerchantSummaryStatus['whatsappTone'] = 'neutral';

  if (whatsappAutomationConnected) {
    whatsappLine = 'WhatsApp delivery is connected. Preview and manual follow-up are also available.';
    whatsappTone = 'success';
  } else {
    whatsappLine = 'Automated WhatsApp delivery is not fully connected yet.';
    whatsappTone = 'pending';
  }

  const helperLine =
    !input.summaryEnabled || !hasPhone
      ? 'You can save your settings and preview the message. SMS delivery starts once the summary is enabled with a valid owner phone number.'
      : !whatsappAutomationConnected
        ? 'SMS scheduled delivery remains available. WhatsApp preview lets you open the message manually when needed.'
        : null;

  return {
    smsLine,
    smsTone,
    whatsappLine,
    whatsappTone,
    helperLine,
    whatsappAutomationConnected,
  } satisfies MerchantSummaryStatus;
}
