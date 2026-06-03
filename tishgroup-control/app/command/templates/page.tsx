import ControlPageHeader from '@/components/control-page-header';
import WhatsAppTemplatesView from '@/components/templates/WhatsAppTemplatesView';
import { requireControlStaff } from '@/lib/control-auth';

export const dynamic = 'force-dynamic';

export default async function CommandTemplatesPage() {
  const staff = await requireControlStaff();

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Commercial rollout"
        title="WhatsApp templates"
        description="Short Ghana-friendly messages for sales, onboarding, billing and support. Copy and paste into WhatsApp."
      />
      <WhatsAppTemplatesView
        defaultVars={{
          agentName: staff.name,
          demoLink: process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/demo`
            : 'https://tillflow.app/demo',
          supportNumber: '0200-000-000',
        }}
      />
    </div>
  );
}
