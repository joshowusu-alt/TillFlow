import { redirect } from 'next/navigation';

/** Legacy path — sales reporting lives on dashboard and owner reports. */
export default function ReportsSalesRedirectPage() {
  redirect('/reports/dashboard');
}
